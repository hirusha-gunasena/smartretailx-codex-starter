import { app } from './app.js';
import { readConfiguration } from './composition/configuration.js';
import { startOrderHttpServer } from './composition/http-server.js';

const configuration = readConfiguration();

startOrderHttpServer(app, configuration, 'Order service started');
