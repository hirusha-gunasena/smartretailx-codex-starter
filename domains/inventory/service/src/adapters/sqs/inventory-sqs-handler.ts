import type { OrderCreatedEvent } from '@smartretailx/event-contracts';
import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { InventoryReservationResult } from '../../application/ports/inventory-reservation-repository.js';
import type {
  SagaInvocationContext,
  SagaTelemetry,
} from '../../application/ports/saga-telemetry.js';
import { INVENTORY_RESERVATION_OUTCOME } from '../../domain/inventory-reservation.js';
import { parseOrderCreatedMessage } from './order-created-message-parser.js';

const noOpSagaTelemetry: SagaTelemetry = { recordSuccess: () => undefined };

export interface OrderCreatedProcessor {
  execute(event: OrderCreatedEvent): Promise<InventoryReservationResult>;
}

export type InventorySqsHandler = (
  event: SQSEvent,
  context?: SagaInvocationContext,
) => Promise<SQSBatchResponse>;
export type OrderCreatedMessageParser = (body: string) => OrderCreatedEvent;

export const createInventorySqsHandler =
  (
    processor: OrderCreatedProcessor,
    telemetry: SagaTelemetry = noOpSagaTelemetry,
    parseMessage: OrderCreatedMessageParser = parseOrderCreatedMessage,
  ): InventorySqsHandler =>
  async (event: SQSEvent, context?: SagaInvocationContext): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        const orderCreated = parseMessage(record.body);
        const result = await processor.execute(orderCreated);
        telemetry.recordSuccess({
          event: 'saga.success',
          stage: 'INVENTORY_RESERVATION',
          outcome: result.idempotent
            ? 'DUPLICATE'
            : result.reservation.outcome === INVENTORY_RESERVATION_OUTCOME.RESERVED
              ? 'RESERVED'
              : 'REJECTED',
          requestId: context?.awsRequestId ?? 'unavailable',
          eventId: orderCreated.eventId,
          eventType: orderCreated.eventType,
          eventVersion: orderCreated.eventVersion,
          occurredAt: orderCreated.occurredAt,
          correlationId: orderCreated.correlationId,
          orderId: orderCreated.data.orderId,
        });
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
