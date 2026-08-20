import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
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
  readonly userPoolClientId: string;
  readonly userPoolIssuer: string;
  readonly webApplicationUrls: string[];
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
  public readonly inventoryConsumerFunction: nodejs.NodejsFunction;
  public readonly inventoryOutcomeRelayFunction: nodejs.NodejsFunction;
  public readonly inventoryApiFunction: nodejs.NodejsFunction;
  public readonly inventoryQueue: sqs.Queue;

  public constructor(scope: Construct, id: string, props: InventoryStackProps) {
    super(scope, id, props);

    const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
    const resourcePrefix = props.projectName.toLowerCase();
    const consumerFunctionName = `${resourcePrefix}-inventory-consumer-${props.environmentName}`;
    const outcomeRelayFunctionName = `${resourcePrefix}-inventory-outcome-relay-${props.environmentName}`;
    const apiFunctionName = `${resourcePrefix}-inventory-api-${props.environmentName}`;

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
      dynamoStream: dynamodb.StreamViewType.NEW_IMAGE,
      deletionProtection: false,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: false,
      },
      encryption: dynamodb.TableEncryptionV2.dynamoOwnedKey(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const reservationsTableStreamArn = reservationsTable.tableStreamArn;
    if (reservationsTableStreamArn === undefined) {
      throw new Error('The Inventory Reservations table must expose a DynamoDB stream ARN.');
    }

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
    this.inventoryQueue = inventoryQueue;

    const outcomeRelayFailureDeadLetterQueue = new sqs.Queue(
      this,
      'InventoryOutcomeRelayFailureDeadLetterQueue',
      {
        queueName: `${resourcePrefix}-inventory-outcome-relay-failures-dlq-${props.environmentName}`,
        retentionPeriod: cdk.Duration.days(14),
        encryption: sqs.QueueEncryption.SQS_MANAGED,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
    );

    const outcomeRelayFailureQueue = new sqs.Queue(this, 'InventoryOutcomeRelayFailureQueue', {
      queueName: `${resourcePrefix}-inventory-outcome-relay-failures-${props.environmentName}`,
      retentionPeriod: cdk.Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      deadLetterQueue: {
        queue: outcomeRelayFailureDeadLetterQueue,
        maxReceiveCount: 5,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const consumerLogGroup = new logs.LogGroup(this, 'InventoryConsumerLogGroup', {
      logGroupName: `/aws/lambda/${consumerFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const outcomeRelayLogGroup = new logs.LogGroup(this, 'InventoryOutcomeRelayLogGroup', {
      logGroupName: `/aws/lambda/${outcomeRelayFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const inventoryConsumer = new nodejs.NodejsFunction(this, 'InventoryConsumerFunction', {
      functionName: consumerFunctionName,
      description: 'SmartRetailX Inventory Order Consumer',
      entry: join(repositoryRoot, 'domains', 'inventory', 'service', 'src', 'handler.ts'),
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
    this.inventoryConsumerFunction = inventoryConsumer;

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

    const inventoryOutcomeRelay = new nodejs.NodejsFunction(this, 'InventoryOutcomeRelayFunction', {
      functionName: outcomeRelayFunctionName,
      description: 'SmartRetailX Inventory Outcome Event Relay',
      entry: join(
        repositoryRoot,
        'domains',
        'inventory',
        'service',
        'src',
        'inventory-outcome-relay.ts',
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        INVENTORY_EVENT_BUS_NAME: props.orderEventBus.eventBusName,
      },
      logGroup: outcomeRelayLogGroup,
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
    this.inventoryOutcomeRelayFunction = inventoryOutcomeRelay;

    props.orderEventBus.grantPutEventsTo(inventoryOutcomeRelay);
    reservationsTable.grantStreamRead(inventoryOutcomeRelay);
    inventoryOutcomeRelay.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [outcomeRelayFailureQueue.queueArn],
      }),
    );
    new lambda.EventSourceMapping(this, 'InventoryReservationsStreamEventSourceMapping', {
      target: inventoryOutcomeRelay,
      eventSourceArn: reservationsTableStreamArn,
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.seconds(0),
      reportBatchItemFailures: true,
      retryAttempts: 3,
      bisectBatchOnError: true,
      maxRecordAge: cdk.Duration.hours(1),
      onFailure: {
        bind: () => ({ destination: outcomeRelayFailureQueue.queueArn }),
      },
    });

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

    const inventoryApiFunction = new nodejs.NodejsFunction(this, 'InventoryApiFunction', {
      functionName: apiFunctionName,
      description: 'SmartRetailX Inventory HTTP API',
      entry: join(
        repositoryRoot,
        'domains',
        'inventory',
        'service',
        'src',
        'adapters',
        'http',
        'inventory-api-handler.ts',
      ),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        INVENTORY_TABLE_NAME: inventoryTable.tableName,
      },
      projectRoot: repositoryRoot,
      depsLockFilePath: join(repositoryRoot, 'package-lock.json'),
      bundling: {
        bundleAwsSDK: true,
        minify: false,
        sourceMap: true,
        target: 'node22',
      },
    });
    this.inventoryApiFunction = inventoryApiFunction;

    inventoryApiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [inventoryTable.tableArn],
      }),
    );

    const inventoryIntegration = new integrations.HttpLambdaIntegration(
      'InventoryIntegration',
      inventoryApiFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      },
    );

    const inventoryApi = new apigatewayv2.HttpApi(this, 'InventoryApi', {
      apiName: `${apiFunctionName}-http-api`,
      description: 'SmartRetailX Inventory HTTP API',
      corsPreflight: {
        allowOrigins: props.webApplicationUrls,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
      },
    });

    const inventoryAuthorizer = new HttpJwtAuthorizer(
      'InventoryJwtAuthorizer',
      props.userPoolIssuer,
      {
        authorizerName: `${apiFunctionName}-jwt-authorizer`,
        jwtAudience: [props.userPoolClientId],
      },
    );

    inventoryApi.addRoutes({
      path: '/api/v1/inventory/{productId}',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.PATCH],
      integration: inventoryIntegration,
      authorizer: inventoryAuthorizer,
      authorizationScopes: ['openid'],
    });

    new cdk.CfnOutput(this, 'InventoryApiUrl', {
      value: inventoryApi.apiEndpoint,
    });
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
    new cdk.CfnOutput(this, 'InventoryReservationsStreamArn', {
      value: reservationsTableStreamArn,
    });
    new cdk.CfnOutput(this, 'InventoryOutcomeRelayFunctionName', {
      value: inventoryOutcomeRelay.functionName,
    });
    new cdk.CfnOutput(this, 'InventoryOutcomeRelayFailureQueueName', {
      value: outcomeRelayFailureQueue.queueName,
    });
    new cdk.CfnOutput(this, 'InventoryOutcomeRelayFailureDlqName', {
      value: outcomeRelayFailureDeadLetterQueue.queueName,
    });
  }
}
