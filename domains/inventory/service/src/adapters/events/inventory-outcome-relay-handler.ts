import type {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import type { InventoryOutcomeEventPublisher } from '../../application/ports/inventory-outcome-event-publisher.js';
import type {
  SagaInvocationContext,
  SagaTelemetry,
} from '../../application/ports/saga-telemetry.js';
import { mapInventoryOutcomeStreamRecord } from './inventory-outcome-stream-mapper.js';
import type { InventoryOutcomeEvent } from './inventory-outcome-stream-mapper.js';

const noOpSagaTelemetry: SagaTelemetry = { recordSuccess: () => undefined };

export type InventoryOutcomeRelayHandler = (
  event: DynamoDBStreamEvent,
  context?: SagaInvocationContext,
) => Promise<DynamoDBBatchResponse>;

export class UnreportableStreamRecordFailureError extends Error {
  public readonly code = 'UNREPORTABLE_STREAM_RECORD_FAILURE';

  public constructor(public readonly recordIndexes: readonly number[]) {
    super(
      `Failed stream records at batch indexes ${recordIndexes.join(', ')} have no sequence number.`,
    );
    this.name = new.target.name;
  }
}

export const processInventoryOutcomeRecord = async (
  record: DynamoDBRecord,
  publisher: InventoryOutcomeEventPublisher,
): Promise<InventoryOutcomeEvent | null> => {
  const event = mapInventoryOutcomeStreamRecord(record);

  if (event !== null) {
    await publisher.publish(event);
  }

  return event;
};

export const createInventoryOutcomeRelayHandler = (
  publisher: InventoryOutcomeEventPublisher,
  telemetry: SagaTelemetry = noOpSagaTelemetry,
): InventoryOutcomeRelayHandler =>
  async function inventoryOutcomeRelayHandler(
    event: DynamoDBStreamEvent,
    context?: SagaInvocationContext,
  ): Promise<DynamoDBBatchResponse> {
    const batchItemFailures: DynamoDBBatchItemFailure[] = [];
    const unreportableRecordIndexes: number[] = [];

    for (const [index, record] of event.Records.entries()) {
      try {
        const inventoryOutcome = await processInventoryOutcomeRecord(record, publisher);
        if (inventoryOutcome !== null) {
          telemetry.recordSuccess({
            event: 'saga.success',
            stage: 'INVENTORY_OUTCOME_RELAY',
            outcome: 'PUBLISHED',
            requestId: context?.awsRequestId ?? 'unavailable',
            eventId: inventoryOutcome.eventId,
            eventType: inventoryOutcome.eventType,
            eventVersion: inventoryOutcome.eventVersion,
            occurredAt: inventoryOutcome.occurredAt,
            correlationId: inventoryOutcome.correlationId,
            orderId: inventoryOutcome.data.orderId,
          });
        }
      } catch {
        const sequenceNumber = record.dynamodb?.SequenceNumber?.trim();

        if (sequenceNumber === undefined || sequenceNumber.length === 0) {
          unreportableRecordIndexes.push(index);
        } else {
          batchItemFailures.push({ itemIdentifier: sequenceNumber });
        }
      }
    }

    if (unreportableRecordIndexes.length > 0) {
      throw new UnreportableStreamRecordFailureError(unreportableRecordIndexes);
    }

    return { batchItemFailures };
  };
