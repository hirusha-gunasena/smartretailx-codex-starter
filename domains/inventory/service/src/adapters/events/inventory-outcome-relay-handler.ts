import type {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import type { InventoryOutcomeEventPublisher } from '../../application/ports/inventory-outcome-event-publisher.js';
import { mapInventoryOutcomeStreamRecord } from './inventory-outcome-stream-mapper.js';

export type InventoryOutcomeRelayHandler = (
  event: DynamoDBStreamEvent,
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
): Promise<void> => {
  const event = mapInventoryOutcomeStreamRecord(record);

  if (event !== null) {
    await publisher.publish(event);
  }
};

export const createInventoryOutcomeRelayHandler = (
  publisher: InventoryOutcomeEventPublisher,
): InventoryOutcomeRelayHandler =>
  async function inventoryOutcomeRelayHandler(
    event: DynamoDBStreamEvent,
  ): Promise<DynamoDBBatchResponse> {
    const batchItemFailures: DynamoDBBatchItemFailure[] = [];
    const unreportableRecordIndexes: number[] = [];

    for (const [index, record] of event.Records.entries()) {
      try {
        await processInventoryOutcomeRecord(record, publisher);
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
