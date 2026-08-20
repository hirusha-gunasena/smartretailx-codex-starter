#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack.js';
import { CatalogueStack } from '../lib/catalogue-stack.js';
import {
  getOrderImageConfiguration,
  getWebAuthenticationConfiguration,
} from '../lib/environment-configuration.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { InventoryStack } from '../lib/inventory-stack.js';
import { OrderEventsStack } from '../lib/order-events-stack.js';
import { OrderRegistryStack } from '../lib/order-registry-stack.js';
import { OrderServiceStack } from '../lib/order-service-stack.js';
import { OrderWorkflowStack } from '../lib/order-workflow-stack.js';
import { ObservabilityStack } from '../lib/observability-stack.js';

import { FrontendStack } from '../lib/frontend-stack.js';

const app = new cdk.App();
const projectName = app.node.tryGetContext('projectName') ?? 'SmartRetailX';
const environment = app.node.tryGetContext('environment') ?? 'dev';
const webAuthentication = getWebAuthenticationConfiguration(environment);
const orderImage = getOrderImageConfiguration(app.node.tryGetContext('orderImageTag'));

const frontendStack = new FrontendStack(app, `${projectName}-${environment}-Frontend`, {
  description: 'SmartRetailX Frontend hosting infrastructure',
  projectName,
  environmentName: environment,
});

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
  cloudFrontDomain: frontendStack.cloudFrontDomain,
});

const catalogueStack = new CatalogueStack(app, `${projectName}-${environment}-Catalogue`, {
  description: 'SmartRetailX Product Catalogue infrastructure',
  projectName,
  environmentName: environment,
  userPoolIssuer: authStack.issuer,
  userPoolClientId: authStack.userPoolClientId,
  webApplicationUrls: [
    webAuthentication.applicationUrl,
    `https://${frontendStack.cloudFrontDomain}`,
  ],
});

const orderEventsStack = new OrderEventsStack(app, `${projectName}-${environment}-OrderEvents`, {
  description: 'SmartRetailX OrderCreated event relay infrastructure',
  projectName,
  environmentName: environment,
});

const orderRegistryStack = new OrderRegistryStack(
  app,
  `${projectName}-${environment}-OrderRegistry`,
  {
    description: 'SmartRetailX private Order service ECR registry',
    projectName,
    environmentName: environment,
  },
);

const orderServiceStack = new OrderServiceStack(app, `${projectName}-${environment}-OrderService`, {
  description: 'SmartRetailX authenticated private Order ECS Fargate service',
  projectName,
  environmentName: environment,
  imageTag: orderImage.imageTag,
  repository: orderRegistryStack.repository,
  userPoolIssuer: authStack.issuer,
  userPoolClientId: authStack.userPoolClientId,
  webApplicationUrls: [
    webAuthentication.applicationUrl,
    `https://${frontendStack.cloudFrontDomain}`,
  ],
});

const inventoryStack = new InventoryStack(app, `${projectName}-${environment}-Inventory`, {
  description: 'SmartRetailX Inventory consumer and outcome relay infrastructure',
  projectName,
  environmentName: environment,
  orderEventBus: orderEventsStack.eventBus,
  userPoolIssuer: authStack.issuer,
  userPoolClientId: authStack.userPoolClientId,
  webApplicationUrls: [
    webAuthentication.applicationUrl,
    `https://${frontendStack.cloudFrontDomain}`,
  ],
});

const orderWorkflowStack = new OrderWorkflowStack(
  app,
  `${projectName}-${environment}-OrderWorkflow`,
  {
    description: 'SmartRetailX Order inventory-outcome Saga consumer infrastructure',
    projectName,
    environmentName: environment,
    eventBus: orderEventsStack.eventBus,
    ordersTable: orderEventsStack.ordersTable,
  },
);

new ObservabilityStack(app, `${projectName}-${environment}-Observability`, {
  description: 'SmartRetailX System-wide CloudWatch Dashboard',
  projectName,
  environmentName: environment,
  catalogueStack,
  inventoryStack,
  orderEventsStack,
  orderServiceStack,
  orderWorkflowStack,
});
