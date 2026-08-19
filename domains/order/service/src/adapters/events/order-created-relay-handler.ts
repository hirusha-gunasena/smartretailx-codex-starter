import type {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import type { EventPublisher } from '../../application/ports/event-publisher.js';
import { mapOrderStreamRecord } from './dynamodb-order-stream-mapper.js';
import type { OrderLifecycleEvent } from './dynamodb-order-stream-mapper.js';

export type OrderLifecycleRelayHandler = (
  event: DynamoDBStreamEvent,
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
): Promise<void> => {
  const event = mapOrderStreamRecord(record);

  if (event !== null) {
    await publisher.publish(event);
  }
};

export const createOrderLifecycleRelayHandler =
  (publisher: EventPublisher<OrderLifecycleEvent>): OrderLifecycleRelayHandler =>
  async (event: DynamoDBStreamEvent): Promise<DynamoDBBatchResponse> => {
    const batchItemFailures: DynamoDBBatchItemFailure[] = [];
    const unreportableRecordIndexes: number[] = [];

    for (const [index, record] of event.Records.entries()) {
      try {
        await processOrderStreamRecord(record, publisher);
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
