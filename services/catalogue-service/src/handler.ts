import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createDynamoDbDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
import { DynamoDbProductRepository } from './adapters/dynamodb/dynamodb-product-repository.js';
import { composeCatalogueHandler } from './composition/catalogue-composition.js';
import { getProductsTableName } from './composition/configuration.js';
import { RandomUuidGenerator, SystemClock } from './runtime/system-dependencies.js';

const documentClient = createDynamoDbDocumentClient();
const repository = new DynamoDbProductRepository(documentClient, getProductsTableName());
const catalogueHandler = composeCatalogueHandler(
  repository,
  new RandomUuidGenerator(),
  new SystemClock(),
);

export const handler: APIGatewayProxyHandlerV2 = async (event) => catalogueHandler(event);
