#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { CatalogueStack } from '../lib/catalogue-stack.js';
import { getWebAuthenticationConfiguration } from '../lib/environment-configuration.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { InventoryStack } from '../lib/inventory-stack.js';
import { OrderEventsStack } from '../lib/order-events-stack.js';
import { OrderWorkflowStack } from '../lib/order-workflow-stack.js';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'SmartRetailX';
const environment = app.node.tryGetContext('environment') ?? 'dev';
const webAuthentication = getWebAuthenticationConfiguration(environment);

new FoundationStack(app, `${projectName}-${environment}-Foundation`, {
  description: 'SmartRetailX foundational placeholder stack',
  tags: {
    Project: projectName,
    Environment: environment,
    ManagedBy: 'CDK',
  },
});

const authStack = new AuthStack(app, `${projectName}-${environment}-Auth`, {
  description: 'SmartRetailX Cognito authentication and authorization foundation',
  projectName,
  environmentName: environment,
  webAuthentication,
});

new CatalogueStack(app, `${projectName}-${environment}-Catalogue`, {
  description: 'SmartRetailX Product Catalogue infrastructure',
  projectName,
  environmentName: environment,
  userPoolIssuer: authStack.issuer,
  userPoolClientId: authStack.userPoolClientId,
  webApplicationUrl: webAuthentication.applicationUrl,
});

const orderEventsStack = new OrderEventsStack(app, `${projectName}-${environment}-OrderEvents`, {
  description: 'SmartRetailX OrderCreated event relay infrastructure',
  projectName,
  environmentName: environment,
});

new InventoryStack(app, `${projectName}-${environment}-Inventory`, {
  description: 'SmartRetailX Inventory consumer and outcome relay infrastructure',
  projectName,
  environmentName: environment,
  orderEventBus: orderEventsStack.eventBus,
});

new OrderWorkflowStack(app, `${projectName}-${environment}-OrderWorkflow`, {
  description: 'SmartRetailX Order inventory-outcome Saga consumer infrastructure',
  projectName,
  environmentName: environment,
  eventBus: orderEventsStack.eventBus,
  ordersTable: orderEventsStack.ordersTable,
});
