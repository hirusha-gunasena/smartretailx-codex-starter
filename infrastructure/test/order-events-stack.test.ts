import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { OrderEventsStack } from '../lib/order-events-stack.js';

const streamReadActions = [
  'dynamodb:DescribeStream',
  'dynamodb:GetRecords',
  'dynamodb:GetShardIterator',
  'dynamodb:ListStreams',
];

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new OrderEventsStack(app, 'TestOrderEventsStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
  });
  template = Template.fromStack(stack);
});

const policyStatements = (): Array<Record<string, unknown>> =>
  Object.values(template.findResources('AWS::IAM::Policy')).flatMap((policy) => {
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

test('creates one development Orders table with NEW_AND_OLD_IMAGES stream and no indexes', () => {
  template.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
  template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
    AttributeDefinitions: [{ AttributeName: 'orderId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'orderId', KeyType: 'HASH' }],
    Replicas: [
      Match.objectLike({
        DeletionProtectionEnabled: false,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
        TableClass: 'STANDARD',
      }),
    ],
    StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
    TableName: 'smartretailx-orders-dev',
  });

  const table = Object.values(template.findResources('AWS::DynamoDB::GlobalTable'))[0];
  expect(table).toBeDefined();
  expect(table?.Properties.Replicas).toHaveLength(1);
  expect(table?.Properties).not.toHaveProperty('GlobalSecondaryIndexes');
  expect(table?.Properties).not.toHaveProperty('LocalSecondaryIndexes');
  expect(table?.DeletionPolicy).toBe('Delete');
});

test('creates one Node.js 22 unified relay Lambda outside a VPC', () => {
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Code: Match.objectLike({
      S3Bucket: Match.anyValue(),
      S3Key: Match.anyValue(),
    }),
    Description: 'SmartRetailX OrderCreated DynamoDB Stream Relay',
    Environment: {
      Variables: {
        ORDER_EVENT_BUS_NAME: {
          Ref: Match.stringLikeRegexp('^OrderEventBus'),
        },
      },
    },
    FunctionName: 'smartretailx-order-event-relay-dev',
    MemorySize: 256,
    Runtime: 'nodejs22.x',
    Timeout: 10,
  });

  const relayFunction = Object.values(template.findResources('AWS::Lambda::Function'))[0];
  expect(relayFunction).toBeDefined();
  expect(relayFunction?.Properties).not.toHaveProperty('VpcConfig');
  expect(relayFunction?.Properties.Environment.Variables).not.toHaveProperty('ORDERS_TABLE_NAME');
  expect(relayFunction?.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
});

test('retains dedicated relay logs for seven days in development', () => {
  template.resourceCountIs('AWS::Logs::LogGroup', 1);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/smartretailx-order-event-relay-dev',
    RetentionInDays: 7,
  });
});

test('creates one named custom EventBridge bus without policies or rules', () => {
  template.resourceCountIs('AWS::Events::EventBus', 1);
  template.hasResourceProperties('AWS::Events::EventBus', {
    Name: 'smartretailx-order-events-dev',
  });
  template.resourceCountIs('AWS::Events::EventBusPolicy', 0);
  template.resourceCountIs('AWS::Events::Rule', 0);
});

test('grants events PutEvents only on the custom event bus', () => {
  const eventBusLogicalId = Object.keys(template.findResources('AWS::Events::EventBus'))[0];
  expect(eventBusLogicalId).toBeDefined();

  const eventBridgeStatement = policyStatements().find((statement) =>
    actionsFor(statement).includes('events:PutEvents'),
  );
  expect(eventBridgeStatement).toEqual(
    expect.objectContaining({
      Action: 'events:PutEvents',
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [eventBusLogicalId, 'Arn'] },
    }),
  );
});

test('grants read-only access to the Orders stream without table mutation permissions', () => {
  const ordersTableLogicalId = Object.keys(template.findResources('AWS::DynamoDB::GlobalTable'))[0];
  const actions = policyStatements().flatMap(actionsFor);
  const streamArnActions = streamReadActions.filter((action) => action !== 'dynamodb:ListStreams');
  const streamReadStatement = policyStatements().find((statement) =>
    streamArnActions.every((action) => actionsFor(statement).includes(action)),
  );
  const listStreamsStatement = policyStatements().find((statement) =>
    actionsFor(statement).includes('dynamodb:ListStreams'),
  );

  expect(ordersTableLogicalId).toBeDefined();
  expect(streamReadStatement).toEqual(
    expect.objectContaining({
      Action: expect.arrayContaining(streamArnActions),
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [ordersTableLogicalId, 'StreamArn'] },
    }),
  );
  expect(listStreamsStatement).toEqual(
    expect.objectContaining({
      Action: 'dynamodb:ListStreams',
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [ordersTableLogicalId, 'StreamArn'] },
    }),
  );
  expect(actions).toEqual(expect.arrayContaining(streamReadActions));
  expect(actions).not.toEqual(
    expect.arrayContaining([
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
      'dynamodb:Scan',
      'dynamodb:Query',
      'dynamodb:*',
      'events:*',
      'sqs:*',
    ]),
  );
  expect(actions.some((action) => action.endsWith(':*'))).toBe(false);

  const synthesizedTemplate = JSON.stringify(template.toJSON());
  expect(synthesizedTemplate).not.toContain('AdministratorAccess');
  expect(synthesizedTemplate).not.toContain('AmazonDynamoDBFullAccess');
  expect(synthesizedTemplate).not.toContain('AmazonEventBridgeFullAccess');
});

test('configures bounded stream processing and partial batch failure reporting', () => {
  const ordersTableLogicalId = Object.keys(template.findResources('AWS::DynamoDB::GlobalTable'))[0];
  const relayFunctionLogicalId = Object.keys(template.findResources('AWS::Lambda::Function'))[0];
  const relayFailureQueueLogicalId = Object.entries(template.findResources('AWS::SQS::Queue')).find(
    ([, queue]) => queue.Properties.QueueName === 'smartretailx-order-relay-failures-dev',
  )?.[0];

  expect(ordersTableLogicalId).toBeDefined();
  expect(relayFunctionLogicalId).toBeDefined();
  expect(relayFailureQueueLogicalId).toBeDefined();
  template.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);
  template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    BisectBatchOnFunctionError: true,
    DestinationConfig: {
      OnFailure: {
        Destination: {
          'Fn::GetAtt': [relayFailureQueueLogicalId, 'Arn'],
        },
      },
    },
    EventSourceArn: {
      'Fn::GetAtt': [ordersTableLogicalId, 'StreamArn'],
    },
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    FunctionName: { Ref: relayFunctionLogicalId },
    MaximumBatchingWindowInSeconds: 0,
    MaximumRecordAgeInSeconds: 3600,
    MaximumRetryAttempts: 3,
    StartingPosition: 'TRIM_HORIZON',
  });
});

test('grants failure-destination SendMessage only on the existing relay failure queue', () => {
  const relayFailureQueueLogicalId = Object.entries(template.findResources('AWS::SQS::Queue')).find(
    ([, queue]) => queue.Properties.QueueName === 'smartretailx-order-relay-failures-dev',
  )?.[0];
  const failureDestinationStatement = policyStatements().find((statement) =>
    actionsFor(statement).includes('sqs:SendMessage'),
  );

  expect(relayFailureQueueLogicalId).toBeDefined();
  expect(failureDestinationStatement).toEqual(
    expect.objectContaining({
      Action: expect.arrayContaining(['sqs:SendMessage']),
      Effect: 'Allow',
      Resource: { 'Fn::GetAtt': [relayFailureQueueLogicalId, 'Arn'] },
    }),
  );
});

test('creates encrypted failure and dead-letter queues with long retention', () => {
  template.resourceCountIs('AWS::SQS::Queue', 2);
  template.hasResourceProperties('AWS::SQS::Queue', {
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-order-relay-failures-dev',
    RedrivePolicy: Match.objectLike({
      maxReceiveCount: 3,
    }),
    SqsManagedSseEnabled: true,
  });
  template.hasResourceProperties('AWS::SQS::Queue', {
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-order-relay-failures-dlq-dev',
    SqsManagedSseEnabled: true,
  });

  for (const queue of Object.values(template.findResources('AWS::SQS::Queue'))) {
    expect(queue.Properties.FifoQueue).not.toBe(true);
    expect(queue.DeletionPolicy).toBe('Delete');
  }
  expect(JSON.stringify(template.findResources('AWS::SQS::Queue'))).not.toMatch(/inventory/iu);
});

test('applies the required development tags', () => {
  template.hasResourceProperties('AWS::Lambda::Function', {
    Tags: Match.arrayWith([
      { Key: 'Environment', Value: 'dev' },
      { Key: 'Module', Value: 'COMP60010' },
      { Key: 'Project', Value: 'SmartRetailX' },
    ]),
  });
});

test('creates all intended non-sensitive outputs', () => {
  for (const outputName of [
    'OrdersTableName',
    'OrdersTableStreamArn',
    'OrderEventBusName',
    'OrderEventBusArn',
    'OrderEventRelayFunctionName',
    'OrderRelayFailureQueueName',
  ]) {
    template.hasOutput(outputName, {});
  }
});

test('does not create networking, compute, database, or delivery resources outside scope', () => {
  for (const resourceType of [
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
    template.resourceCountIs(resourceType, 0);
  }
});
