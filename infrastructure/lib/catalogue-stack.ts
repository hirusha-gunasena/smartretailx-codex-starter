import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export interface CatalogueStackProps extends cdk.StackProps {
  readonly environmentName: string;
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

export class CatalogueStack extends cdk.Stack {
  public readonly catalogueFunction: nodejs.NodejsFunction;
  public readonly catalogueApi: apigatewayv2.HttpApi;

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

    // Public-read S3 bucket for product images
    const imagesBucket = new s3.Bucket(this, 'ProductImagesBucket', {
      bucketName: `${resourcePrefix}-images-${props.environmentName}-${cdk.Aws.ACCOUNT_ID}`,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
      publicReadAccess: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: props.webApplicationUrls,
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const catalogueLogGroup = new logs.LogGroup(this, 'CatalogueLogGroup', {
      logGroupName: `/aws/lambda/${functionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const catalogueFunction = new nodejs.NodejsFunction(this, 'CatalogueFunction', {
      functionName,
      description: 'SmartRetailX Product Catalogue API',
      entry: join(repositoryRoot, 'domains', 'catalogue', 'service', 'src', 'handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        PRODUCTS_TABLE_NAME: productsTable.tableName,
        PRODUCT_IMAGES_BUCKET_NAME: imagesBucket.bucketName,
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
            'core',
            'api-contracts',
            'src',
            'index.ts',
          ),
        },
      },
    });
    this.catalogueFunction = catalogueFunction;

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
    imagesBucket.grantPut(catalogueFunction);

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
        allowOrigins: props.webApplicationUrls,
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
    this.catalogueApi = catalogueApi;

    const catalogueAuthorizer = new HttpJwtAuthorizer(
      'CatalogueJwtAuthorizer',
      props.userPoolIssuer,
      {
        authorizerName: `${functionName}-jwt-authorizer`,
        jwtAudience: [props.userPoolClientId],
      },
    );

    catalogueApi.addRoutes({
      path: '/api/v1/products',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: catalogueIntegration,
      authorizer: new apigatewayv2.HttpNoneAuthorizer(),
    });
    catalogueApi.addRoutes({
      path: '/api/v1/products',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: catalogueIntegration,
      authorizer: catalogueAuthorizer,
      authorizationScopes: ['openid'],
    });
    catalogueApi.addRoutes({
      path: '/api/v1/products/upload-url',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: catalogueIntegration,
      authorizer: catalogueAuthorizer,
      authorizationScopes: ['openid'],
    });
    catalogueApi.addRoutes({
      path: '/api/v1/products/{productId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: catalogueIntegration,
      authorizer: new apigatewayv2.HttpNoneAuthorizer(),
    });
    catalogueApi.addRoutes({
      path: '/api/v1/products/{productId}',
      methods: [apigatewayv2.HttpMethod.PATCH, apigatewayv2.HttpMethod.DELETE],
      integration: catalogueIntegration,
      authorizer: catalogueAuthorizer,
      authorizationScopes: ['openid'],
    });

    new cdk.CfnOutput(this, 'CatalogueApiUrl', {
      value: catalogueApi.apiEndpoint,
    });
    new cdk.CfnOutput(this, 'ProductsTableName', {
      value: productsTable.tableName,
    });
    new cdk.CfnOutput(this, 'ProductImagesBucketName', {
      value: imagesBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'CatalogueFunctionName', {
      value: catalogueFunction.functionName,
    });
  }
}
