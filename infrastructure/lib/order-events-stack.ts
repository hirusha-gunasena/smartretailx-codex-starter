import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface OrderEventsStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly projectName: string;
}

const findRepositoryRoot = (startPath: string): string => {
  let currentPath = startPath;

  while (!existsSync(join(currentPath, 'package-lock.json'))) {
    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      throw new Error('Unable to find the repository root package-lock.json.');
    }
    currentPath = parentPath;
  }

  return currentPath;
};

export class OrderEventsStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly ordersTable: dynamodb.TableV2;
  public readonly orderEventRelayFunction: nodejs.NodejsFunction;

  public constructor(scope: Construct, id: string, props: OrderEventsStackProps) {
    super(scope, id, props);

    const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
    const resourcePrefix = props.projectName.toLowerCase();
    const relayFunctionName = `${resourcePrefix}-order-event-relay-${props.environmentName}`;

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    this.ordersTable = new dynamodb.TableV2(this, 'OrdersTable', {
      tableName: `${resourcePrefix}-orders-${props.environmentName}`,
      partitionKey: {
        name: 'orderId',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD,
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      deletionProtection: false,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'customerId-createdAt-index',
      partitionKey: {
        name: 'customerId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    const ordersTable = this.ordersTable;
    const ordersTableStreamArn = ordersTable.tableStreamArn;
    if (ordersTableStreamArn === undefined) {
      throw new Error('The Orders table must expose a DynamoDB stream ARN.');
    }

    this.eventBus = new events.EventBus(this, 'OrderEventBus', {
      eventBusName: `${resourcePrefix}-order-events-${props.environmentName}`,
      description: 'SmartRetailX order domain events',
    });

    const relayFailureDeadLetterQueue = new sqs.Queue(this, 'RelayFailureDeadLetterQueue', {
      queueName: `${resourcePrefix}-order-relay-failures-dlq-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const relayFailureQueue = new sqs.Queue(this, 'RelayFailureQueue', {
      queueName: `${resourcePrefix}-order-relay-failures-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: relayFailureDeadLetterQueue,
        maxReceiveCount: 3,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const relayLogGroup = new logs.LogGroup(this, 'OrderEventRelayLogGroup', {
      logGroupName: `/aws/lambda/${relayFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const relayFunction = new nodejs.NodejsFunction(this, 'OrderEventRelayFunction', {
      functionName: relayFunctionName,
      description: 'SmartRetailX OrderCreated DynamoDB Stream Relay',
      entry: join(repositoryRoot, 'domains', 'order', 'service', 'src', 'order-event-relay.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        ORDER_EVENT_BUS_NAME: this.eventBus.eventBusName,
      },
      logGroup: relayLogGroup,
      projectRoot: repositoryRoot,
      depsLockFilePath: join(repositoryRoot, 'package-lock.json'),
      bundling: {
        bundleAwsSDK: true,
        externalModules: [],
        minify: false,
        sourceMap: true,
        target: 'node22',
        esbuildArgs: {
          '--alias:@smartretailx/api-contracts': join(
            repositoryRoot,
            'core',
            'api-contracts',
            'src',
            'index.ts',
          ),
          '--alias:@smartretailx/event-contracts': join(
            repositoryRoot,
            'core',
            'event-contracts',
            'src',
            'index.ts',
          ),
        },
      },
    });
    this.orderEventRelayFunction = relayFunction;

    this.eventBus.grantPutEventsTo(relayFunction);
    ordersTable.grantStreamRead(relayFunction);
    new lambda.EventSourceMapping(this, 'OrdersStreamEventSourceMapping', {
      target: relayFunction,
      eventSourceArn: ordersTableStreamArn,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(0),
      reportBatchItemFailures: true,
      retryAttempts: 3,
      bisectBatchOnError: true,
      maxRecordAge: cdk.Duration.hours(1),
      onFailure: new eventSources.SqsDlq(relayFailureQueue),
    });

    new cdk.CfnOutput(this, 'OrdersTableName', {
      value: ordersTable.tableName,
    });
    new cdk.CfnOutput(this, 'OrdersTableStreamArn', {
      value: ordersTableStreamArn,
    });
    new cdk.CfnOutput(this, 'OrderEventBusName', {
      value: this.eventBus.eventBusName,
    });
    new cdk.CfnOutput(this, 'OrderEventBusArn', {
      value: this.eventBus.eventBusArn,
    });
    new cdk.CfnOutput(this, 'OrderEventRelayFunctionName', {
      value: relayFunction.functionName,
    });
    new cdk.CfnOutput(this, 'OrderRelayFailureQueueName', {
      value: relayFailureQueue.queueName,
    });
  }
}
