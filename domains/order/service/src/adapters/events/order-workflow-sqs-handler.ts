import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { InventoryOutcomeEvent } from '../../application/process-inventory-outcome.js';
import type { OrderWorkflowTransitionResult } from '../../application/ports/order-workflow-repository.js';
import type {
  SagaInvocationContext,
  SagaTelemetry,
} from '../../application/ports/saga-telemetry.js';
import { parseInventoryOutcomeMessage } from './inventory-outcome-message-parser.js';

const noOpSagaTelemetry: SagaTelemetry = { recordSuccess: () => undefined };

export interface InventoryOutcomeProcessor {
  execute(event: InventoryOutcomeEvent): Promise<OrderWorkflowTransitionResult>;
}

export type InventoryOutcomeMessageParser = (body: string) => InventoryOutcomeEvent;
export type OrderWorkflowSqsHandler = (
  event: SQSEvent,
  context?: SagaInvocationContext,
) => Promise<SQSBatchResponse>;

export const createOrderWorkflowSqsHandler =
  (
    processor: InventoryOutcomeProcessor,
    telemetry: SagaTelemetry = noOpSagaTelemetry,
    parseMessage: InventoryOutcomeMessageParser = parseInventoryOutcomeMessage,
  ): OrderWorkflowSqsHandler =>
  async (event: SQSEvent, context?: SagaInvocationContext): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        const inventoryOutcome = parseMessage(record.body);
        const outcome = await processor.execute(inventoryOutcome);
        telemetry.recordSuccess({
          event: 'saga.success',
          stage: 'ORDER_WORKFLOW',
          outcome,
          requestId: context?.awsRequestId ?? 'unavailable',
          eventId: inventoryOutcome.eventId,
          eventType: inventoryOutcome.eventType,
          eventVersion: inventoryOutcome.eventVersion,
          occurredAt: inventoryOutcome.occurredAt,
          correlationId: inventoryOutcome.correlationId,
          orderId: inventoryOutcome.data.orderId,
        });
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
