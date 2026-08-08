import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export interface CatalogueStackProps extends cdk.StackProps {
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

export class CatalogueStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: CatalogueStackProps) {
    super(scope, id, props);

    const repositoryRoot = findRepositoryRoot(dirname(fileURLToPath(import.meta.url)));
    const resourcePrefix = props.projectName.toLowerCase();
    const functionName = `${resourcePrefix}-catalogue-${props.environmentName}`;

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    const productsTable = new dynamodb.TableV2(this, 'ProductsTable', {
      tableName: `${resourcePrefix}-products-${props.environmentName}`,
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

    const catalogueLogGroup = new logs.LogGroup(this, 'CatalogueLogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catalogueFunction = new nodejs.NodejsFunction(this, 'CatalogueFunction', {
      functionName,
      description: 'SmartRetailX Product Catalogue API',
      entry: join(repositoryRoot, 'services', 'catalogue-service', 'src', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        PRODUCTS_TABLE_NAME: productsTable.tableName,
      },
      logGroup: catalogueLogGroup,
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
        },
      },
    });

    catalogueFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Scan',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [productsTable.tableArn],
      }),
    );

    const catalogueIntegration = new integrations.HttpLambdaIntegration(
      'CatalogueIntegration',
      catalogueFunction,
      {
        payloadFormatVersion: apigatewayv2.PayloadFormatVersion.VERSION_2_0,
      },
    );

    const catalogueApi = new apigatewayv2.HttpApi(this, 'CatalogueApi', {
      apiName: `${functionName}-http-api`,
      description: 'SmartRetailX Product Catalogue HTTP API',
      corsPreflight: {
        allowOrigins: ['http://localhost:5173'],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PATCH,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
      },
    });

    catalogueApi.addRoutes({
      path: '/api/v1/products',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration: catalogueIntegration,
    });
    catalogueApi.addRoutes({
      path: '/api/v1/products/{productId}',
      methods: [
        apigatewayv2.HttpMethod.GET,
        apigatewayv2.HttpMethod.PATCH,
        apigatewayv2.HttpMethod.DELETE,
      ],
      integration: catalogueIntegration,
    });

    new cdk.CfnOutput(this, 'CatalogueApiUrl', {
      value: catalogueApi.apiEndpoint,
    });
    new cdk.CfnOutput(this, 'ProductsTableName', {
      value: productsTable.tableName,
    });
    new cdk.CfnOutput(this, 'CatalogueFunctionName', {
      value: catalogueFunction.functionName,
    });
  }
}
