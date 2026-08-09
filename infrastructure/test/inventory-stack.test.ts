import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InventoryStack } from '../lib/inventory-stack.js';
import { OrderEventsStack } from '../lib/order-events-stack.js';

let orderEventsTemplate: Template;
let inventoryTemplate: Template;

beforeAll(() => {
  const app = new cdk.App();
  const orderEventsStack = new OrderEventsStack(app, 'TestOrderEventsStackForInventory', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
  });
  const inventoryStack = new InventoryStack(app, 'TestInventoryStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
    orderEventBus: orderEventsStack.eventBus,
  });

  orderEventsTemplate = Template.fromStack(orderEventsStack);
  inventoryTemplate = Template.fromStack(inventoryStack);
});

const resourceEntry = (
  template: Template,
  type: string,
  predicate: (resource: Record<string, unknown>) => boolean,
): [string, Record<string, unknown>] => {
  const entry = Object.entries(template.findResources(type)).find(([, resource]) =>
    predicate(resource as Record<string, unknown>),
  );
  if (entry === undefined) {
    throw new Error(`Unable to find expected ${type} resource.`);
  }
  return entry as [string, Record<string, unknown>];
};

const propertiesOf = (resource: Record<string, unknown>): Record<string, unknown> =>
  resource.Properties as Record<string, unknown>;

const policyStatements = (): Array<Record<string, unknown>> =>
  Object.values(inventoryTemplate.findResources('AWS::IAM::Policy')).flatMap((policy) => {
    const policyDocument = policy.Properties.PolicyDocument as {
      Statement?: Array<Record<string, unknown>>;
    };
    return policyDocument.Statement ?? [];
  });

const actionsFor = (statement: Record<string, unknown>): string[] => {
  const action = statement.Action;
  if (typeof action === 'string') {
    return [action];
  }
  return Array.isArray(action)
    ? action.filter((value): value is string => typeof value === 'string')
    : [];
};

test('reuses the OrderEventsStack bus through a cross-stack reference', () => {
  orderEventsTemplate.resourceCountIs('AWS::Events::EventBus', 1);
  inventoryTemplate.resourceCountIs('AWS::Events::EventBus', 0);
  inventoryTemplate.hasResourceProperties('AWS::Events::Rule', {
    EventBusName: {
      'Fn::ImportValue': Match.stringLikeRegexp('.*OrderEventBus.*'),
    },
  });
});

test('creates the two development tables without indexes, streams, or additional replicas', () => {
  inventoryTemplate.resourceCountIs('AWS::DynamoDB::GlobalTable', 2);

  for (const [tableName, partitionKey] of [
    ['smartretailx-inventory-dev', 'productId'],
    ['smartretailx-inventory-reservations-dev', 'eventId'],
  ] as const) {
    inventoryTemplate.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      AttributeDefinitions: [{ AttributeName: partitionKey, AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: partitionKey, KeyType: 'HASH' }],
      Replicas: [
        Match.objectLike({
          DeletionProtectionEnabled: false,
          PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: false },
          Region: { Ref: 'AWS::Region' },
          TableClass: 'STANDARD',
        }),
      ],
      SSESpecification: { SSEEnabled: false },
      TableName: tableName,
    });
  }

  for (const table of Object.values(
    inventoryTemplate.findResources('AWS::DynamoDB::GlobalTable'),
  )) {
    expect(table.Properties.Replicas).toHaveLength(1);
    expect(table.Properties).not.toHaveProperty('GlobalSecondaryIndexes');
    expect(table.Properties).not.toHaveProperty('LocalSecondaryIndexes');
    expect(table.Properties).not.toHaveProperty('StreamSpecification');
    expect(table.DeletionPolicy).toBe('Delete');
  }
});

test('creates encrypted standard source and dead-letter queues with bounded redrive', () => {
  const [deadLetterQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dlq-dev',
  );

  inventoryTemplate.resourceCountIs('AWS::SQS::Queue', 2);
  inventoryTemplate.hasResourceProperties('AWS::SQS::Queue', {
    MessageRetentionPeriod: 345_600,
    QueueName: 'smartretailx-inventory-orders-dev',
    RedrivePolicy: {
      deadLetterTargetArn: { 'Fn::GetAtt': [deadLetterQueueLogicalId, 'Arn'] },
      maxReceiveCount: 5,
    },
    SqsManagedSseEnabled: true,
    VisibilityTimeout: 120,
  });
  inventoryTemplate.hasResourceProperties('AWS::SQS::Queue', {
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-inventory-orders-dlq-dev',
    SqsManagedSseEnabled: true,
  });

  for (const queue of Object.values(inventoryTemplate.findResources('AWS::SQS::Queue'))) {
    expect(queue.Properties.FifoQueue).not.toBe(true);
    expect(queue.DeletionPolicy).toBe('Delete');
  }
});

test('routes only namespaced OrderCreated events to the Inventory source queue', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dev',
  );

  inventoryTemplate.resourceCountIs('AWS::Events::Rule', 1);
  inventoryTemplate.hasResourceProperties('AWS::Events::Rule', {
    EventPattern: {
      source: ['smartretailx.order-service'],
      'detail-type': ['OrderCreated'],
    },
    Name: 'smartretailx-order-created-to-inventory-dev',
    Targets: [
      Match.objectLike({
        Arn: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
      }),
    ],
  });

  const rule = Object.values(inventoryTemplate.findResources('AWS::Events::Rule'))[0];
  expect(rule).toBeDefined();
  const targets = rule?.Properties.Targets as Array<Record<string, unknown>>;
  expect(targets).toHaveLength(1);
  expect(targets[0]).not.toHaveProperty('Input');
  expect(targets[0]).not.toHaveProperty('InputPath');
  expect(targets[0]).not.toHaveProperty('InputTransformer');
});

test('allows EventBridge to send only to the source queue from the routing rule', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dev',
  );
  const ruleLogicalId = Object.keys(inventoryTemplate.findResources('AWS::Events::Rule'))[0];
  expect(ruleLogicalId).toBeDefined();

  inventoryTemplate.resourceCountIs('AWS::SQS::QueuePolicy', 1);
  inventoryTemplate.hasResourceProperties('AWS::SQS::QueuePolicy', {
    PolicyDocument: {
      Statement: [
        {
          Action: ['sqs:SendMessage', 'sqs:GetQueueAttributes', 'sqs:GetQueueUrl'],
          Condition: {
            ArnEquals: {
              'aws:SourceArn': { 'Fn::GetAtt': [ruleLogicalId, 'Arn'] },
            },
          },
          Effect: 'Allow',
          Principal: { Service: 'events.amazonaws.com' },
          Resource: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
        },
      ],
      Version: '2012-10-17',
    },
    Queues: [{ Ref: sourceQueueLogicalId }],
  });

  const queuePolicy = Object.values(inventoryTemplate.findResources('AWS::SQS::QueuePolicy'))[0];
  expect(JSON.stringify(queuePolicy)).not.toContain('sqs:*');
});

test('creates the Node.js 22 Inventory consumer outside a VPC', () => {
  inventoryTemplate.resourceCountIs('AWS::Lambda::Function', 1);
  inventoryTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Code: Match.objectLike({
      S3Bucket: Match.anyValue(),
      S3Key: Match.anyValue(),
    }),
    Description: 'SmartRetailX Inventory Order Consumer',
    Environment: {
      Variables: {
        INVENTORY_RESERVATIONS_TABLE_NAME: {
          Ref: Match.stringLikeRegexp('^InventoryReservationsTable'),
        },
        INVENTORY_TABLE_NAME: {
          Ref: Match.stringLikeRegexp('^InventoryTable'),
        },
      },
    },
    FunctionName: 'smartretailx-inventory-consumer-dev',
    MemorySize: 256,
    Runtime: 'nodejs22.x',
    Timeout: 15,
  });

  const inventoryFunction = Object.values(
    inventoryTemplate.findResources('AWS::Lambda::Function'),
  )[0];
  expect(inventoryFunction).toBeDefined();
  expect(inventoryFunction?.Properties).not.toHaveProperty('VpcConfig');
  expect(inventoryFunction?.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
  expect(inventoryFunction?.Properties).not.toHaveProperty('DeadLetterConfig');
});

test('retains dedicated Inventory consumer logs for seven days in development', () => {
  inventoryTemplate.resourceCountIs('AWS::Logs::LogGroup', 1);
  inventoryTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/smartretailx-inventory-consumer-dev',
    RetentionInDays: 7,
  });
});

test('grants exact table-scoped DynamoDB permissions without broad access', () => {
  const [inventoryTableLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-dev',
  );
  const [reservationsTableLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-reservations-dev',
  );
  const statements = policyStatements();

  expect(statements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        Action: 'dynamodb:UpdateItem',
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [inventoryTableLogicalId, 'Arn'] },
      }),
      expect.objectContaining({
        Action: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        Effect: 'Allow',
        Resource: { 'Fn::GetAtt': [reservationsTableLogicalId, 'Arn'] },
      }),
    ]),
  );

  const actions = statements.flatMap(actionsFor);
  expect(actions).not.toEqual(
    expect.arrayContaining([
      'dynamodb:*',
      'dynamodb:Scan',
      'dynamodb:Query',
      'dynamodb:DeleteItem',
      'dynamodb:BatchWriteItem',
    ]),
  );
  const synthesizedTemplate = JSON.stringify(inventoryTemplate.toJSON());
  expect(synthesizedTemplate).not.toContain('AdministratorAccess');
  expect(synthesizedTemplate).not.toContain('AmazonDynamoDBFullAccess');
});

test('grants queue consumption without source-queue send or DLQ application access', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dev',
  );
  const [deadLetterQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dlq-dev',
  );
  const statements = policyStatements();
  const sqsStatements = statements.filter((statement) =>
    actionsFor(statement).some((action) => action.startsWith('sqs:')),
  );

  expect(sqsStatements).toEqual([
    expect.objectContaining({
      Action: expect.arrayContaining([
        'sqs:ReceiveMessage',
        'sqs:ChangeMessageVisibility',
        'sqs:GetQueueUrl',
        'sqs:DeleteMessage',
        'sqs:GetQueueAttributes',
      ]),
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
    }),
  ]);
  const actions = sqsStatements.flatMap(actionsFor);
  expect(actions).not.toContain('sqs:SendMessage');
  expect(actions).not.toContain('sqs:*');
  expect(JSON.stringify(sqsStatements)).not.toContain(deadLetterQueueLogicalId);
});

test('maps the source queue to the consumer with partial batch reporting', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dev',
  );
  const functionLogicalId = Object.keys(
    inventoryTemplate.findResources('AWS::Lambda::Function'),
  )[0];
  expect(functionLogicalId).toBeDefined();

  inventoryTemplate.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);
  inventoryTemplate.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    EventSourceArn: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
    FunctionName: { Ref: functionLogicalId },
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    MaximumBatchingWindowInSeconds: 0,
  });
});

test('creates intended tags and safe outputs without unrelated resources', () => {
  inventoryTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Tags: Match.arrayWith([
      { Key: 'Environment', Value: 'dev' },
      { Key: 'Module', Value: 'COMP60010' },
      { Key: 'Project', Value: 'SmartRetailX' },
    ]),
  });

  for (const outputName of [
    'InventoryTableName',
    'InventoryReservationsTableName',
    'InventoryQueueName',
    'InventoryQueueUrl',
    'InventoryDlqName',
    'InventoryConsumerFunctionName',
    'InventoryOrderCreatedRuleName',
  ]) {
    inventoryTemplate.hasOutput(outputName, {});
  }

  for (const resourceType of [
    'AWS::Events::EventBus',
    'AWS::EC2::VPC',
    'AWS::EC2::NatGateway',
    'AWS::EC2::Instance',
    'AWS::ECS::Service',
    'AWS::ElasticLoadBalancingV2::LoadBalancer',
    'AWS::RDS::DBInstance',
    'AWS::RDS::DBCluster',
    'AWS::CloudFront::Distribution',
    'AWS::KMS::Key',
  ]) {
    inventoryTemplate.resourceCountIs(resourceType, 0);
  }
});
