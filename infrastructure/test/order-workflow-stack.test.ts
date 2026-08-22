import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { OrderEventsStack } from '../lib/order-events-stack.js';
import { OrderWorkflowStack } from '../lib/order-workflow-stack.js';

let orderEventsTemplate: Template;
let workflowTemplate: Template;

beforeAll(() => {
  const app = new cdk.App();
  const orderEventsStack = new OrderEventsStack(app, 'TestOrderEventsStackForWorkflow', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
  });
  const workflowStack = new OrderWorkflowStack(app, 'TestOrderWorkflowStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
    eventBus: orderEventsStack.eventBus,
    ordersTable: orderEventsStack.ordersTable,
  });

  orderEventsTemplate = Template.fromStack(orderEventsStack);
  workflowTemplate = Template.fromStack(workflowStack);
});

const propertiesOf = (resource: Record<string, unknown>): Record<string, unknown> =>
  resource.Properties as Record<string, unknown>;

const resourceEntry = (
  type: string,
  predicate: (resource: Record<string, unknown>) => boolean,
): [string, Record<string, unknown>] => {
  const entry = Object.entries(workflowTemplate.findResources(type)).find(([, resource]) =>
    predicate(resource as Record<string, unknown>),
  );
  if (entry === undefined) {
    throw new Error(`Unable to find expected ${type} resource.`);
  }
  return entry as [string, Record<string, unknown>];
};

const actionsFor = (statement: Record<string, unknown>): string[] => {
  const action = statement.Action;
  if (typeof action === 'string') {
    return [action];
  }
  return Array.isArray(action)
    ? action.filter((value): value is string => typeof value === 'string')
    : [];
};

const workflowFunctionEntry = (): [string, Record<string, unknown>] =>
  resourceEntry(
    'AWS::Lambda::Function',
    (resource) => propertiesOf(resource).FunctionName === 'smartretailx-order-workflow-dev',
  );

const workflowPolicyStatements = (): Array<Record<string, unknown>> => {
  const [, functionResource] = workflowFunctionEntry();
  const roleReference = propertiesOf(functionResource).Role as { 'Fn::GetAtt'?: unknown };
  const getAtt = roleReference['Fn::GetAtt'];
  if (!Array.isArray(getAtt) || typeof getAtt[0] !== 'string') {
    throw new Error('Unable to resolve the Order Workflow execution role.');
  }
  const roleLogicalId = getAtt[0];

  return Object.values(workflowTemplate.findResources('AWS::IAM::Policy')).flatMap((policy) => {
    const properties = policy.Properties as {
      PolicyDocument?: { Statement?: Array<Record<string, unknown>> };
      Roles?: Array<{ Ref?: unknown }>;
    };
    const belongsToFunction = properties.Roles?.some((role) => role.Ref === roleLogicalId) ?? false;
    return belongsToFunction ? (properties.PolicyDocument?.Statement ?? []) : [];
  });
};

test('reuses the existing EventBridge bus and Orders table through cross-stack references', () => {
  orderEventsTemplate.resourceCountIs('AWS::Events::EventBus', 1);
  orderEventsTemplate.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
  workflowTemplate.resourceCountIs('AWS::Events::EventBus', 0);
  workflowTemplate.resourceCountIs('AWS::DynamoDB::GlobalTable', 0);

  workflowTemplate.hasResourceProperties('AWS::Events::Rule', {
    EventBusName: {
      'Fn::ImportValue': Match.stringLikeRegexp('.*OrderEventBus.*'),
    },
  });
  workflowTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Environment: {
      Variables: {
        ORDERS_TABLE_NAME: {
          'Fn::ImportValue': Match.stringLikeRegexp('.*OrdersTable.*'),
        },
      },
    },
  });
});

test('creates encrypted Standard source and terminal queues with bounded redrive', () => {
  const [deadLetterQueueLogicalId, deadLetterQueue] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dlq-dev',
  );
  const [, sourceQueue] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dev',
  );

  workflowTemplate.resourceCountIs('AWS::SQS::Queue', 2);
  expect(propertiesOf(sourceQueue)).toMatchObject({
    MessageRetentionPeriod: 345_600,
    QueueName: 'smartretailx-order-workflow-dev',
    RedrivePolicy: {
      deadLetterTargetArn: { 'Fn::GetAtt': [deadLetterQueueLogicalId, 'Arn'] },
      maxReceiveCount: 5,
    },
    SqsManagedSseEnabled: true,
    VisibilityTimeout: 120,
  });
  expect(propertiesOf(sourceQueue).FifoQueue).not.toBe(true);
  expect(sourceQueue.DeletionPolicy).toBe('Delete');

  expect(propertiesOf(deadLetterQueue)).toMatchObject({
    MessageRetentionPeriod: 1_209_600,
    QueueName: 'smartretailx-order-workflow-dlq-dev',
    SqsManagedSseEnabled: true,
  });
  expect(propertiesOf(deadLetterQueue)).not.toHaveProperty('RedrivePolicy');
  expect(propertiesOf(deadLetterQueue).FifoQueue).not.toBe(true);
  expect(deadLetterQueue.DeletionPolicy).toBe('Delete');
});

test('routes exactly the two namespaced Inventory outcome events to the source queue', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dev',
  );

  workflowTemplate.resourceCountIs('AWS::Events::Rule', 1);
  workflowTemplate.hasResourceProperties('AWS::Events::Rule', {
    EventPattern: {
      source: ['smartretailx.inventory-service'],
      'detail-type': ['InventoryReserved', 'InventoryRejected'],
    },
    Name: 'smartretailx-inventory-outcome-to-order-dev',
    Targets: [
      Match.objectLike({
        Arn: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
      }),
    ],
  });
});

test('preserves the full EventBridge envelope without input transformation', () => {
  const [, rule] = resourceEntry(
    'AWS::Events::Rule',
    (resource) => propertiesOf(resource).Name === 'smartretailx-inventory-outcome-to-order-dev',
  );
  const targets = propertiesOf(rule).Targets as Array<Record<string, unknown>>;

  expect(targets).toHaveLength(1);
  expect(targets[0]).not.toHaveProperty('Input');
  expect(targets[0]).not.toHaveProperty('InputPath');
  expect(targets[0]).not.toHaveProperty('InputTransformer');
});

test('allows EventBridge to send only to the source queue from the routing rule', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dev',
  );
  const ruleLogicalId = Object.keys(workflowTemplate.findResources('AWS::Events::Rule'))[0];
  expect(ruleLogicalId).toBeDefined();

  workflowTemplate.resourceCountIs('AWS::SQS::QueuePolicy', 1);
  workflowTemplate.hasResourceProperties('AWS::SQS::QueuePolicy', {
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

  expect(JSON.stringify(workflowTemplate.findResources('AWS::SQS::QueuePolicy'))).not.toContain(
    'sqs:*',
  );
});

test('creates the Node.js 22 Order Workflow Lambda outside a VPC', () => {
  workflowTemplate.resourceCountIs('AWS::Lambda::Function', 1);
  workflowTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Code: Match.objectLike({
      S3Bucket: Match.anyValue(),
      S3Key: Match.anyValue(),
    }),
    Description: 'SmartRetailX Order Inventory Outcome Saga Consumer',
    Environment: {
      Variables: {
        ORDERS_TABLE_NAME: {
          'Fn::ImportValue': Match.stringLikeRegexp('.*OrdersTable.*'),
        },
      },
    },
    FunctionName: 'smartretailx-order-workflow-dev',
    MemorySize: 256,
    Runtime: 'nodejs22.x',
    Timeout: 15,
    TracingConfig: { Mode: 'Active' },
  });

  const [, workflowFunction] = workflowFunctionEntry();
  const properties = propertiesOf(workflowFunction);
  expect(properties).not.toHaveProperty('VpcConfig');
  expect(properties).not.toHaveProperty('ReservedConcurrentExecutions');
  expect(properties).not.toHaveProperty('DeadLetterConfig');
  expect(properties.Environment).toEqual({
    Variables: {
      ORDERS_TABLE_NAME: {
        'Fn::ImportValue': expect.stringMatching(/OrdersTable/u),
      },
    },
  });
});

test('retains dedicated workflow logs for seven days in development', () => {
  workflowTemplate.resourceCountIs('AWS::Logs::LogGroup', 1);
  workflowTemplate.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/smartretailx-order-workflow-dev',
    RetentionInDays: 7,
  });
  const logGroup = Object.values(workflowTemplate.findResources('AWS::Logs::LogGroup'))[0];
  expect(logGroup?.DeletionPolicy).toBe('Delete');
});

test('grants only GetItem and UpdateItem on the existing Orders table', () => {
  const statements = workflowPolicyStatements();
  const dynamodbStatements = statements.filter((statement) =>
    actionsFor(statement).some((action) => action.startsWith('dynamodb:')),
  );

  expect(dynamodbStatements).toEqual([
    {
      Action: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
      Effect: 'Allow',
      Resource: {
        'Fn::ImportValue': expect.stringMatching(/OrdersTable.*Arn/u),
      },
    },
  ]);

  const actions = dynamodbStatements.flatMap(actionsFor);
  expect(actions).not.toEqual(
    expect.arrayContaining([
      'dynamodb:*',
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:Scan',
      'dynamodb:Query',
      'dynamodb:BatchWriteItem',
      'dynamodb:BatchGetItem',
    ]),
  );
  expect(JSON.stringify(dynamodbStatements)).not.toMatch(/inventory|catalogue/iu);
});

test('grants queue consumption without SendMessage or terminal-DLQ access', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dev',
  );
  const [deadLetterQueueLogicalId] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dlq-dev',
  );
  const sqsStatements = workflowPolicyStatements().filter((statement) =>
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

test('maps the source queue to the Lambda with partial batch reporting', () => {
  const [sourceQueueLogicalId] = resourceEntry(
    'AWS::SQS::Queue',
    (resource) => propertiesOf(resource).QueueName === 'smartretailx-order-workflow-dev',
  );
  const [functionLogicalId] = workflowFunctionEntry();

  workflowTemplate.resourceCountIs('AWS::Lambda::EventSourceMapping', 1);
  workflowTemplate.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
    BatchSize: 10,
    EventSourceArn: { 'Fn::GetAtt': [sourceQueueLogicalId, 'Arn'] },
    FunctionName: { Ref: functionLogicalId },
    FunctionResponseTypes: ['ReportBatchItemFailures'],
    MaximumBatchingWindowInSeconds: 0,
  });
});

test('does not grant EventBridge publication or configure Lambda async failure handling', () => {
  const actions = workflowPolicyStatements().flatMap(actionsFor);
  expect(actions).not.toEqual(expect.arrayContaining(['events:PutEvents', 'events:*']));
  workflowTemplate.resourceCountIs('AWS::Lambda::EventInvokeConfig', 0);
  expect(JSON.stringify(workflowTemplate.toJSON())).not.toMatch(
    /OrderConfirmed|OrderRejected|ORDER_EVENT_BUS_NAME/iu,
  );
});

test('applies required tags and creates only safe workflow outputs', () => {
  workflowTemplate.hasResourceProperties('AWS::Lambda::Function', {
    Tags: Match.arrayWith([
      { Key: 'Environment', Value: 'dev' },
      { Key: 'Module', Value: 'COMP60010' },
      { Key: 'Project', Value: 'SmartRetailX' },
    ]),
  });

  for (const outputName of [
    'OrderWorkflowQueueName',
    'OrderWorkflowQueueUrl',
    'OrderWorkflowDlqName',
    'OrderWorkflowFunctionName',
    'InventoryOutcomeOrderRuleName',
  ]) {
    workflowTemplate.hasOutput(outputName, {});
  }
  expect(workflowTemplate.toJSON().Outputs).not.toHaveProperty('OrdersTableName');
  expect(workflowTemplate.toJSON().Outputs).not.toHaveProperty('EventBusName');
});

test('does not create excluded networking, compute, database, or delivery resources', () => {
  for (const resourceType of [
    'AWS::DynamoDB::GlobalTable',
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
    workflowTemplate.resourceCountIs(resourceType, 0);
  }
});
