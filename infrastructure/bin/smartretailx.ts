#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CatalogueStack } from '../lib/catalogue-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { OrderEventsStack } from '../lib/order-events-stack.js';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'SmartRetailX';
const environment = app.node.tryGetContext('environment') ?? 'dev';

new FoundationStack(app, `${projectName}-${environment}-Foundation`, {
  description: 'SmartRetailX foundational placeholder stack',
  tags: {
    Project: projectName,
    Environment: environment,
    ManagedBy: 'CDK',
  },
});

new CatalogueStack(app, `${projectName}-${environment}-Catalogue`, {
  description: 'SmartRetailX Product Catalogue infrastructure',
  projectName,
  environmentName: environment,
});

new OrderEventsStack(app, `${projectName}-${environment}-OrderEvents`, {
  description: 'SmartRetailX OrderCreated event relay infrastructure',
  projectName,
  environmentName: environment,
});
