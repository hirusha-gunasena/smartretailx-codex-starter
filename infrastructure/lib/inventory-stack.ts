import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface InventoryStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly orderEventBus: events.EventBus;
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

export class InventoryStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: InventoryStackProps) {
    super(scope, id, props);

    const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
    const resourcePrefix = props.projectName.toLowerCase();
    const consumerFunctionName = `${resourcePrefix}-inventory-consumer-${props.environmentName}`;

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    const inventoryTable = new dynamodb.TableV2(this, 'InventoryTable', {
      tableName: `${resourcePrefix}-inventory-${props.environmentName}`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD,
      deletionProtection: false,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const reservationsTable = new dynamodb.TableV2(this, 'InventoryReservationsTable', {
      tableName: `${resourcePrefix}-inventory-reservations-${props.environmentName}`,
      partitionKey: {
        name: 'eventId',
        type: dynamodb.AttributeType.STRING,
      },
      billing: dynamodb.Billing.onDemand(),
      tableClass: dynamodb.TableClass.STANDARD,
      deletionProtection: false,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const inventoryDeadLetterQueue = new sqs.Queue(this, 'InventoryDeadLetterQueue', {
      queueName: `${resourcePrefix}-inventory-orders-dlq-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const inventoryQueue = new sqs.Queue(this, 'InventoryQueue', {
      queueName: `${resourcePrefix}-inventory-orders-${props.environmentName}`,
      visibilityTimeout: cdk.Duration.seconds(120),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: inventoryDeadLetterQueue,
        maxReceiveCount: 5,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const consumerLogGroup = new logs.LogGroup(this, 'InventoryConsumerLogGroup', {
      logGroupName: `/aws/lambda/${consumerFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const inventoryConsumer = new nodejs.NodejsFunction(this, 'InventoryConsumerFunction', {
      functionName: consumerFunctionName,
      description: 'SmartRetailX Inventory Order Consumer',
      entry: join(repositoryRoot, 'services', 'inventory-service', 'src', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        INVENTORY_TABLE_NAME: inventoryTable.tableName,
        INVENTORY_RESERVATIONS_TABLE_NAME: reservationsTable.tableName,
      },
      logGroup: consumerLogGroup,
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
            'packages',
            'api-contracts',
            'src',
            'index.ts',
          ),
          '--alias:@smartretailx/event-contracts': join(
            repositoryRoot,
            'packages',
            'event-contracts',
            'src',
            'index.ts',
          ),
        },
      },
    });

    inventoryConsumer.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem'],
        resources: [inventoryTable.tableArn],
      }),
    );
    inventoryConsumer.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [reservationsTable.tableArn],
      }),
    );
    inventoryConsumer.addEventSource(
      new eventSources.SqsEventSource(inventoryQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(0),
        reportBatchItemFailures: true,
      }),
    );

    const orderCreatedRule = new events.Rule(this, 'OrderCreatedToInventoryRule', {
      ruleName: `${resourcePrefix}-order-created-to-inventory-${props.environmentName}`,
      description: 'Routes SmartRetailX OrderCreated events to the Inventory consumer queue',
      eventBus: props.orderEventBus,
      eventPattern: {
        source: ['smartretailx.order-service'],
        detailType: ['OrderCreated'],
      },
    });
    orderCreatedRule.addTarget(new eventTargets.SqsQueue(inventoryQueue));

    new cdk.CfnOutput(this, 'InventoryTableName', {
      value: inventoryTable.tableName,
    });
    new cdk.CfnOutput(this, 'InventoryReservationsTableName', {
      value: reservationsTable.tableName,
    });
    new cdk.CfnOutput(this, 'InventoryQueueName', {
      value: inventoryQueue.queueName,
    });
    new cdk.CfnOutput(this, 'InventoryQueueUrl', {
      value: inventoryQueue.queueUrl,
    });
    new cdk.CfnOutput(this, 'InventoryDlqName', {
      value: inventoryDeadLetterQueue.queueName,
    });
    new cdk.CfnOutput(this, 'InventoryConsumerFunctionName', {
      value: inventoryConsumer.functionName,
    });
    new cdk.CfnOutput(this, 'InventoryOrderCreatedRuleName', {
      value: orderCreatedRule.ruleName,
    });
  }
}
