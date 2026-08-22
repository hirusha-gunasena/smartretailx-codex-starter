import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { createDynamoDBDocumentClient } from '../adapters/dynamodb/dynamodb-client.js';
import { DynamoDBOrderWorkflowRepository } from '../adapters/dynamodb/dynamodb-order-workflow-repository.js';
import { createOrderWorkflowSqsHandler } from '../adapters/events/order-workflow-sqs-handler.js';
import type { OrderWorkflowSqsHandler } from '../adapters/events/order-workflow-sqs-handler.js';
import { ConsoleSagaTelemetry } from '../adapters/telemetry/console-saga-telemetry.js';
import { ProcessInventoryOutcome } from '../application/process-inventory-outcome.js';
import {
  readOrderWorkflowConfiguration,
  type OrderWorkflowConfiguration,
} from './order-workflow-configuration.js';

export const createOrderWorkflowHandler = (
  configuration: OrderWorkflowConfiguration,
  documentClient: DynamoDBDocumentClient = createDynamoDBDocumentClient(),
): OrderWorkflowSqsHandler => {
  const repository = new DynamoDBOrderWorkflowRepository(
    documentClient,
    configuration.ordersTableName,
  );
  const processor = new ProcessInventoryOutcome(repository);

  return createOrderWorkflowSqsHandler(processor, new ConsoleSagaTelemetry());
};

export const createOrderWorkflowHandlerFromEnvironment = (): OrderWorkflowSqsHandler =>
  createOrderWorkflowHandler(readOrderWorkflowConfiguration());
