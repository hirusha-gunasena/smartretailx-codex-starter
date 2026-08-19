import type { SQSBatchItemFailure, SQSBatchResponse, SQSEvent } from 'aws-lambda';
import type { InventoryOutcomeEvent } from '../../application/process-inventory-outcome.js';
import type { OrderWorkflowTransitionResult } from '../../application/ports/order-workflow-repository.js';
import { parseInventoryOutcomeMessage } from './inventory-outcome-message-parser.js';

export interface InventoryOutcomeProcessor {
  execute(event: InventoryOutcomeEvent): Promise<OrderWorkflowTransitionResult>;
}

export type InventoryOutcomeMessageParser = (body: string) => InventoryOutcomeEvent;
export type OrderWorkflowSqsHandler = (event: SQSEvent) => Promise<SQSBatchResponse>;

export const createOrderWorkflowSqsHandler =
  (
    processor: InventoryOutcomeProcessor,
    parseMessage: InventoryOutcomeMessageParser = parseInventoryOutcomeMessage,
  ): OrderWorkflowSqsHandler =>
  async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchItemFailure[] = [];

    for (const record of event.Records) {
      try {
        await processor.execute(parseMessage(record.body));
      } catch {
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }

    return { batchItemFailures };
  };
