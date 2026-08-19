import { readProductionConfiguration } from './composition/configuration.js';
import { startOrderHttpServer } from './composition/http-server.js';
import { createProductionApp } from './composition/production-composition.js';

const configuration = readProductionConfiguration();
const app = createProductionApp(configuration);

startOrderHttpServer(app, configuration, 'Order service started with DynamoDB persistence');
