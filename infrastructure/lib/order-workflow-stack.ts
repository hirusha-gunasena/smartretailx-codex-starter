import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface OrderWorkflowStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly eventBus: events.EventBus;
  readonly ordersTable: dynamodb.TableV2;
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

export class OrderWorkflowStack extends cdk.Stack {
  public readonly workflowQueue: sqs.Queue;
  public readonly orderWorkflowFunction: nodejs.NodejsFunction;

  public constructor(scope: Construct, id: string, props: OrderWorkflowStackProps) {
    super(scope, id, props);

    const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
    const resourcePrefix = props.projectName.toLowerCase();
    const workflowFunctionName = `${resourcePrefix}-order-workflow-${props.environmentName}`;

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    const workflowDeadLetterQueue = new sqs.Queue(this, 'OrderWorkflowDeadLetterQueue', {
      queueName: `${resourcePrefix}-order-workflow-dlq-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const workflowQueue = new sqs.Queue(this, 'OrderWorkflowQueue', {
      queueName: `${resourcePrefix}-order-workflow-${props.environmentName}`,
      visibilityTimeout: cdk.Duration.seconds(120),
      retentionPeriod: cdk.Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: workflowDeadLetterQueue,
        maxReceiveCount: 5,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.workflowQueue = workflowQueue;

    const workflowLogGroup = new logs.LogGroup(this, 'OrderWorkflowLogGroup', {
      logGroupName: `/aws/lambda/${workflowFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const workflowFunction = new nodejs.NodejsFunction(this, 'OrderWorkflowFunction', {
      functionName: workflowFunctionName,
      description: 'SmartRetailX Order Inventory Outcome Saga Consumer',
      entry: join(
        repositoryRoot,
        'domains',
        'order',
        'service',
        'src',
        'order-workflow-handler.ts',
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      environment: {
        ORDERS_TABLE_NAME: props.ordersTable.tableName,
      },
      logGroup: workflowLogGroup,
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
    this.orderWorkflowFunction = workflowFunction;

    workflowFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
        resources: [props.ordersTable.tableArn],
      }),
    );
    workflowFunction.addEventSource(
      new eventSources.SqsEventSource(workflowQueue, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(0),
        reportBatchItemFailures: true,
      }),
    );

    const inventoryOutcomeRule = new events.Rule(this, 'InventoryOutcomeToOrderRule', {
      ruleName: `${resourcePrefix}-inventory-outcome-to-order-${props.environmentName}`,
      description: 'Routes SmartRetailX inventory outcomes to the Order workflow queue',
      eventBus: props.eventBus,
      eventPattern: {
        source: ['smartretailx.inventory-service'],
        detailType: ['InventoryReserved', 'InventoryRejected'],
      },
    });
    inventoryOutcomeRule.addTarget(new eventTargets.SqsQueue(workflowQueue));

    new cdk.CfnOutput(this, 'OrderWorkflowQueueName', {
      value: workflowQueue.queueName,
    });
    new cdk.CfnOutput(this, 'OrderWorkflowQueueUrl', {
      value: workflowQueue.queueUrl,
    });
    new cdk.CfnOutput(this, 'OrderWorkflowDlqName', {
      value: workflowDeadLetterQueue.queueName,
    });
    new cdk.CfnOutput(this, 'OrderWorkflowFunctionName', {
      value: workflowFunction.functionName,
    });
    new cdk.CfnOutput(this, 'InventoryOutcomeOrderRuleName', {
      value: inventoryOutcomeRule.ruleName,
    });
  }
}
