import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { InventoryReservationResult } from '../../application/ports/inventory-reservation-repository.js';
import { parseOrderCreatedMessage } from './order-created-message-parser.js';

export interface OrderCreatedProcessor {
  execute(event: OrderCreatedEvent): Promise<InventoryReservationResult>;
}

export type InventorySqsHandler = (event: SQSEvent) => Promise<SQSBatchResponse>;
export type OrderCreatedMessageParser = (body: string) => OrderCreatedEvent;

export const createInventorySqsHandler =
  (
    processor: OrderCreatedProcessor,
    parseMessage: OrderCreatedMessageParser = parseOrderCreatedMessage,
  ): InventorySqsHandler =>
  async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        const orderCreated = parseMessage(record.body);
        await processor.execute(orderCreated);
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
