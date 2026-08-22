import type {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import type { EventPublisher } from '../../application/ports/event-publisher.js';
import type {
  SagaInvocationContext,
  SagaTelemetry,
} from '../../application/ports/saga-telemetry.js';
import { mapOrderStreamRecord } from './dynamodb-order-stream-mapper.js';
import type { OrderLifecycleEvent } from './dynamodb-order-stream-mapper.js';

const noOpSagaTelemetry: SagaTelemetry = { recordSuccess: () => undefined };

export type OrderLifecycleRelayHandler = (
  event: DynamoDBStreamEvent,
  context?: SagaInvocationContext,
) => Promise<DynamoDBBatchResponse>;

/** Retained for existing Task 008 imports; the handler now relays the full Order lifecycle. */
export type OrderCreatedRelayHandler = OrderLifecycleRelayHandler;

export class UnreportableStreamRecordFailureError extends Error {
  public readonly code = 'UNREPORTABLE_STREAM_RECORD_FAILURE';

  public constructor(public readonly recordIndexes: readonly number[]) {
    super(
      `Failed stream records at batch indexes ${recordIndexes.join(', ')} have no sequence number.`,
    );
    this.name = new.target.name;
  }
}

export const processOrderStreamRecord = async (
  record: DynamoDBRecord,
  publisher: EventPublisher<OrderLifecycleEvent>,
): Promise<OrderLifecycleEvent | null> => {
  const event = mapOrderStreamRecord(record);

  if (event !== null) {
    await publisher.publish(event);
  }

  return event;
};

export const createOrderLifecycleRelayHandler =
  (
    publisher: EventPublisher<OrderLifecycleEvent>,
    telemetry: SagaTelemetry = noOpSagaTelemetry,
  ): OrderLifecycleRelayHandler =>
  async (
    event: DynamoDBStreamEvent,
    context?: SagaInvocationContext,
  ): Promise<DynamoDBBatchResponse> => {
    const batchItemFailures: DynamoDBBatchItemFailure[] = [];
    const unreportableRecordIndexes: number[] = [];

    for (const [index, record] of event.Records.entries()) {
      try {
        const lifecycleEvent = await processOrderStreamRecord(record, publisher);
        if (lifecycleEvent !== null) {
          telemetry.recordSuccess({
            event: 'saga.success',
            stage: 'ORDER_LIFECYCLE_RELAY',
            outcome: 'PUBLISHED',
            requestId: context?.awsRequestId ?? 'unavailable',
            eventId: lifecycleEvent.eventId,
            eventType: lifecycleEvent.eventType,
            eventVersion: lifecycleEvent.eventVersion,
            occurredAt: lifecycleEvent.occurredAt,
            correlationId: lifecycleEvent.correlationId,
            orderId: lifecycleEvent.data.orderId,
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

/** Retained for existing Task 008 imports; no second relay handler is created. */
export const createOrderCreatedRelayHandler = createOrderLifecycleRelayHandler;
