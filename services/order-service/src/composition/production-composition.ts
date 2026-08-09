import type { Express } from 'express';
import { createDynamoDBDocumentClient } from '../adapters/dynamodb/dynamodb-client.js';
import { DynamoDBOrderRepository } from '../adapters/dynamodb/dynamodb-order-repository.js';
import { createApp } from './create-app.js';
import type { ProductionOrderServiceConfiguration } from './configuration.js';
import { RandomUuidGenerator, SystemClock } from './system-dependencies.js';

export const createProductionApp = (
  configuration: ProductionOrderServiceConfiguration,
): Express => {
  const documentClient = createDynamoDBDocumentClient();
  const repository = new DynamoDBOrderRepository(documentClient, configuration.ordersTableName);

  return createApp({
    repository,
    idGenerator: new RandomUuidGenerator(),
    clock: new SystemClock(),
  });
};
