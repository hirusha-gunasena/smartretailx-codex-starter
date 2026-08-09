import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { InventoryStack } from '../lib/inventory-stack.js';
import { OrderEventsStack } from '../lib/order-events-stack.js';

const streamReadActions = [
  'dynamodb:DescribeStream',
  'dynamodb:GetRecords',
  'dynamodb:GetShardIterator',
  'dynamodb:ListStreams',
];

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

const actionsFor = (statement: Record<string, unknown>): string[] => {
  const action = statement.Action;
  if (typeof action === 'string') {
    return [action];
  }
  return Array.isArray(action)
    ? action.filter((value): value is string => typeof value === 'string')
    : [];
};

const functionEntry = (functionName: string): [string, Record<string, unknown>] =>
  resourceEntry(
    inventoryTemplate,
    'AWS::Lambda::Function',
    (resource) => propertiesOf(resource).FunctionName === functionName,
  );

const roleLogicalIdForFunction = (functionName: string): string => {
  const [, functionResource] = functionEntry(functionName);
  const roleReference = propertiesOf(functionResource).Role as { 'Fn::GetAtt'?: unknown };
  const getAtt = roleReference['Fn::GetAtt'];

  if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') {
    throw new Error(`Unable to resolve the execution role for ${functionName}.`);
  }
  return getAtt[0];
};

const policyStatementsForFunction = (functionName: string): Array<Record<string, unknown>> => {
  const roleLogicalId = roleLogicalIdForFunction(functionName);

  return Object.values(inventoryTemplate.findResources('AWS::IAM::Policy')).flatMap((policy) => {
    const properties = policy.Properties as {
      PolicyDocument?: { Statement?: Array<Record<string, unknown>> };
      Roles?: Array<{ Ref?: unknown }>;
    };
    const belongsToFunction = properties.Roles?.some((role) => role.Ref === roleLogicalId) ?? false;
    return belongsToFunction ? (properties.PolicyDocument?.Statement ?? []) : [];
  });
};

test('reuses the OrderEventsStack bus through a cross-stack reference', () => {
  orderEventsTemplate.resourceCountIs('AWS::Events::EventBus', 1);
  inventoryTemplate.resourceCountIs('AWS::Events::EventBus', 0);
  inventoryTemplate.hasResourceProperties('AWS::Events::Rule', {
    EventBusName: {
      'Fn::ImportValue': Match.stringLikeRegexp('.*OrderEventBus.*'),
    },
  });
  inventoryTemplate.hasResourceProperties('AWS::Lambda::Function', {
    FunctionName: 'smartretailx-inventory-outcome-relay-dev',
    Environment: {
      Variables: {
        INVENTORY_EVENT_BUS_NAME: {
          'Fn::ImportValue': Match.stringLikeRegexp('.*OrderEventBus.*'),
        },
      },
    },
  });
});

test('keeps both development tables and enables NEW_IMAGE only on Reservations', () => {
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
    expect(table.DeletionPolicy).toBe('Delete');
  }

  const [, inventoryTable] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-dev',
  );
  const [, reservationsTable] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-reservations-dev',
  );

  expect(propertiesOf(inventoryTable)).not.toHaveProperty('StreamSpecification');
  expect(propertiesOf(reservationsTable).StreamSpecification).toEqual({
    StreamViewType: 'NEW_IMAGE',
  });
});

test('creates encrypted standard source and dead-letter queues with bounded redrive', () => {
  const [deadLetterQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-inventory-orders-dlq-dev',
  );

  inventoryTemplate.resourceCountIs('AWS::SQS::Queue', 4);
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
  inventoryTemplate.resourceCountIs('AWS::Lambda::Function', 2);
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

  const [, inventoryFunction] = functionEntry('smartretailx-inventory-consumer-dev');
  expect(propertiesOf(inventoryFunction)).not.toHaveProperty('VpcConfig');
  expect(propertiesOf(inventoryFunction)).not.toHaveProperty('ReservedConcurrentExecutions');
  expect(propertiesOf(inventoryFunction)).not.toHaveProperty('DeadLetterConfig');
});

test('retains dedicated Inventory consumer logs for seven days in development', () => {
  inventoryTemplate.resourceCountIs('AWS::Logs::LogGroup', 2);
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
  const statements = policyStatementsForFunction('smartretailx-inventory-consumer-dev');

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
  const statements = policyStatementsForFunction('smartretailx-inventory-consumer-dev');
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
  const [functionLogicalId] = functionEntry('smartretailx-inventory-consumer-dev');

  inventoryTemplate.resourceCountIs('AWS::Lambda::EventSourceMapping', 2);
  inventoryTemplate.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    EventSourceArn: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
    FunctionName: { Ref: functionLogicalId },
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    MaximumBatchingWindowInSeconds: 0,
  });
});

test('creates the Node.js 22 Inventory outcome relay outside a VPC', () => {
  inventoryTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Code: Match.objectLike({
      S3Bucket: Match.anyValue(),
      S3Key: Match.anyValue(),
    }),
    Description: 'SmartRetailX Inventory Outcome Event Relay',
    Environment: {
      Variables: {
        INVENTORY_EVENT_BUS_NAME: {
          'Fn::ImportValue': Match.stringLikeRegexp('.*OrderEventBus.*'),
        },
      },
    },
    FunctionName: 'smartretailx-inventory-outcome-relay-dev',
    MemorySize: 256,
    Runtime: 'nodejs22.x',
    Timeout: 10,
  });

  const [, relayFunction] = functionEntry('smartretailx-inventory-outcome-relay-dev');
  const relayProperties = propertiesOf(relayFunction);
  expect(relayProperties).not.toHaveProperty('VpcConfig');
  expect(relayProperties).not.toHaveProperty('ReservedConcurrentExecutions');
  expect(relayProperties).not.toHaveProperty('DeadLetterConfig');
  expect(relayProperties.Environment).toEqual({
    Variables: {
      INVENTORY_EVENT_BUS_NAME: {
        'Fn::ImportValue': expect.stringMatching(/OrderEventBus/u),
      },
    },
  });
});

test('retains dedicated Inventory outcome relay logs for seven days in development', () => {
  inventoryTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/smartretailx-inventory-outcome-relay-dev',
    RetentionInDays: 7,
  });
});

test('grants the outcome relay PutEvents only on the existing custom bus', () => {
  const statements = policyStatementsForFunction('smartretailx-inventory-outcome-relay-dev');
  const eventBridgeStatements = statements.filter((statement) =>
    actionsFor(statement).some((action) => action.startsWith('events:')),
  );

  expect(eventBridgeStatements).toEqual([
    {
      Action: 'events:PutEvents',
      Effect: 'Allow',
      Resource: {
        'Fn::ImportValue': expect.stringMatching(/OrderEventBus.*Arn/u),
      },
    },
  ]);
  expect(JSON.stringify(inventoryTemplate.toJSON())).not.toContain('AmazonEventBridgeFullAccess');
});

test('grants the outcome relay read-only access to the Reservations stream', () => {
  const [reservationsTableLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-reservations-dev',
  );
  const statements = policyStatementsForFunction('smartretailx-inventory-outcome-relay-dev');
  const actions = statements.flatMap(actionsFor);
  const streamStatements = statements.filter((statement) =>
    actionsFor(statement).some((action) => action.startsWith('dynamodb:')),
  );

  expect(actions).toEqual(expect.arrayContaining(streamReadActions));
  expect(streamStatements).not.toHaveLength(0);
  for (const statement of streamStatements) {
    expect(statement.Resource).toEqual({
      'Fn::GetAtt': [reservationsTableLogicalId, 'StreamArn'],
    });
  }
  expect(actions).not.toEqual(
    expect.arrayContaining([
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
      'dynamodb:Scan',
      'dynamodb:Query',
      'dynamodb:*',
    ]),
  );
  expect(actions.some((action) => action.endsWith(':*'))).toBe(false);
  expect(JSON.stringify(inventoryTemplate.toJSON())).not.toContain('AmazonDynamoDBFullAccess');
});

test('maps the Reservations stream to the outcome relay with bounded failure handling', () => {
  const [reservationsTableLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::DynamoDB::GlobalTable',
    (resource) => propertiesOf(resource).TableName === 'smartretailx-inventory-reservations-dev',
  );
  const [failureQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) =>
      propertiesOf(resource).QueueName === 'smartretailx-inventory-outcome-relay-failures-dev',
  );
  const [relayFunctionLogicalId] = functionEntry('smartretailx-inventory-outcome-relay-dev');

  inventoryTemplate.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    BisectBatchOnFunctionError: true,
    DestinationConfig: {
      OnFailure: {
        Destination: { 'Fn::GetAtt': [failureQueueLogicalId, 'Arn'] },
      },
    },
    EventSourceArn: { 'Fn::GetAtt': [reservationsTableLogicalId, 'StreamArn'] },
    FunctionName: { Ref: relayFunctionLogicalId },
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    MaximumBatchingWindowInSeconds: 0,
    MaximumRecordAgeInSeconds: 3600,
    MaximumRetryAttempts: 3,
    StartingPosition: 'TRIM_HORIZON',
  });
});

test('creates encrypted Standard outcome-relay failure queues with terminal redrive', () => {
  const [failureDlqLogicalId, failureDlq] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) =>
      propertiesOf(resource).QueueName === 'smartretailx-inventory-outcome-relay-failures-dlq-dev',
  );
  const [, failureQueue] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) =>
      propertiesOf(resource).QueueName === 'smartretailx-inventory-outcome-relay-failures-dev',
  );

  expect(propertiesOf(failureQueue)).toMatchObject({
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-inventory-outcome-relay-failures-dev',
    RedrivePolicy: {
      deadLetterTargetArn: { 'Fn::GetAtt': [failureDlqLogicalId, 'Arn'] },
      maxReceiveCount: 5,
    },
    SqsManagedSseEnabled: true,
  });
  expect(propertiesOf(failureQueue).FifoQueue).not.toBe(true);
  expect(failureQueue.DeletionPolicy).toBe('Delete');
  expect(propertiesOf(failureDlq)).toMatchObject({
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-inventory-outcome-relay-failures-dlq-dev',
    SqsManagedSseEnabled: true,
  });
  expect(propertiesOf(failureDlq)).not.toHaveProperty('RedrivePolicy');
  expect(propertiesOf(failureDlq).FifoQueue).not.toBe(true);
  expect(failureDlq.DeletionPolicy).toBe('Delete');
});

test('grants the outcome relay SendMessage only to its failure destination', () => {
  const [failureQueueLogicalId] = resourceEntry(
    inventoryTemplate,
    'AWS::SQS::Queue',
    (resource) =>
      propertiesOf(resource).QueueName === 'smartretailx-inventory-outcome-relay-failures-dev',
  );
  const statements = policyStatementsForFunction('smartretailx-inventory-outcome-relay-dev');
  const sqsStatements = statements.filter((statement) =>
    actionsFor(statement).some((action) => action.startsWith('sqs:')),
  );

  expect(sqsStatements).toEqual([
    {
      Action: 'sqs:SendMessage',
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [failureQueueLogicalId, 'Arn'] },
    },
  ]);
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
    'InventoryReservationsStreamArn',
    'InventoryOutcomeRelayFunctionName',
    'InventoryOutcomeRelayFailureQueueName',
    'InventoryOutcomeRelayFailureDlqName',
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
    'AWS::OpenSearchService::Domain',
    'AWS::MSK::Cluster',
    'AWS::CloudFront::Distribution',
    'AWS::Route53::HostedZone',
    'AWS::KMS::Key',
  ]) {
    inventoryTemplate.resourceCountIs(resourceType, 0);
  }
});
