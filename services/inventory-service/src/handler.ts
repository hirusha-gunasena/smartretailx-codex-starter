import { createDynamoDBDocumentClient } from './adapters/dynamodb/dynamodb-client.js';
import { readInventoryConfiguration } from './composition/configuration.js';
import { createProductionInventoryHandler } from './composition/production-composition.js';

const configuration = readInventoryConfiguration();
const documentClient = createDynamoDBDocumentClient();

export const handler = createProductionInventoryHandler(configuration, documentClient);
