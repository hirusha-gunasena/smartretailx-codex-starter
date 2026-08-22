import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBInventoryReservationRepository } from '../adapters/dynamodb/dynamodb-inventory-reservation-repository.js';
import { createInventorySqsHandler } from '../adapters/sqs/inventory-sqs-handler.js';
import type { InventorySqsHandler } from '../adapters/sqs/inventory-sqs-handler.js';
import { ConsoleSagaTelemetry } from '../adapters/telemetry/console-saga-telemetry.js';
import type { Clock } from '../application/ports/clock.js';
import { ProcessOrderCreated } from '../application/process-order-created.js';
import type { InventoryServiceConfiguration } from './configuration.js';

export class SystemClock implements Clock {
  public now(): string {
    return new Date().toISOString();
  }
}

export const createProductionInventoryHandler = (
  configuration: InventoryServiceConfiguration,
  documentClient: DynamoDBDocumentClient,
  clock: Clock = new SystemClock(),
): InventorySqsHandler => {
  const repository = new DynamoDBInventoryReservationRepository(
    documentClient,
    configuration.inventoryTableName,
    configuration.reservationsTableName,
  );
  const processor = new ProcessOrderCreated(repository, clock);

  return createInventorySqsHandler(processor, new ConsoleSagaTelemetry());
};
