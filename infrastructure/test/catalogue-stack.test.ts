import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CatalogueStack } from '../lib/catalogue-stack.js';

const dynamoDbActions = [
  'dynamodb:GetItem',
  'dynamodb:Scan',
  'dynamodb:PutItem',
  'dynamodb:UpdateItem',
  'dynamodb:DeleteItem',
];

let template: Template;

beforeAll(() => {
  const app = new cdk.App();
  const stack = new CatalogueStack(app, 'TestCatalogueStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
    userPoolIssuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_testpool',
    userPoolClientId: 'test-client-id',
    webApplicationUrl: 'http://localhost:5173',
  });
  template = Template.fromStack(stack);
});

test('creates the development Products table without indexes or streams', () => {
  template.resourceCountIs('AWS::DynamoDB::GlobalTable', 1);
  template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
    AttributeDefinitions: [{ AttributeName: 'productId', AttributeType: 'S' }],
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'productId', KeyType: 'HASH' }],
    Replicas: [
      Match.objectLike({
        DeletionProtectionEnabled: false,
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: false,
        },
        TableClass: 'STANDARD',
      }),
    ],
    SSESpecification: { SSEEnabled: false },
    TableName: 'smartretailx-products-dev',
  });

  const tables = template.findResources('AWS::DynamoDB::GlobalTable');
  const table = Object.values(tables)[0];
  expect(table).toBeDefined();
  expect(table?.Properties).not.toHaveProperty('GlobalSecondaryIndexes');
  expect(table?.Properties).not.toHaveProperty('LocalSecondaryIndexes');
  expect(table?.Properties).not.toHaveProperty('StreamSpecification');
  expect(table?.DeletionPolicy).toBe('Delete');
});

test('creates the configured Catalogue Lambda outside a VPC', () => {
  template.resourceCountIs('AWS::Lambda::Function', 1);
  template.hasResourceProperties('AWS::Lambda::Function', {
    Description: 'SmartRetailX Product Catalogue API',
    Environment: {
      Variables: {
        PRODUCTS_TABLE_NAME: {
          Ref: Match.stringLikeRegexp('^ProductsTable'),
        },
      },
    },
    FunctionName: 'smartretailx-catalogue-dev',
    MemorySize: 256,
    Runtime: 'nodejs22.x',
    Timeout: 10,
  });

  const functions = template.findResources('AWS::Lambda::Function');
  const catalogueFunction = Object.values(functions)[0];
  expect(catalogueFunction).toBeDefined();
  expect(catalogueFunction?.Properties).not.toHaveProperty('VpcConfig');
  expect(catalogueFunction?.Properties).not.toHaveProperty('ReservedConcurrentExecutions');
});

test('retains Catalogue Lambda logs for seven days in development', () => {
  template.resourceCountIs('AWS::Logs::LogGroup', 1);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/lambda/smartretailx-catalogue-dev',
    RetentionInDays: 7,
  });
});

test('grants only required DynamoDB actions on the Products table', () => {
  template.hasResourceProperties('AWS::IAM::Role', {
    ManagedPolicyArns: [
      {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
          ],
        ],
      },
    ],
  });

  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: dynamoDbActions,
          Effect: 'Allow',
          Resource: {
            'Fn::GetAtt': [Match.stringLikeRegexp('^ProductsTable'), 'Arn'],
          },
        },
      ],
    },
  });

  const synthesizedTemplate = JSON.stringify(template.toJSON());
  expect(synthesizedTemplate).not.toContain('AdministratorAccess');
  expect(synthesizedTemplate).not.toContain('AmazonDynamoDBFullAccess');
  expect(synthesizedTemplate).not.toContain('dynamodb:*');
});

test('applies the required non-identifying development tags', () => {
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Tags: Match.objectLike({
      Project: 'SmartRetailX',
      Module: 'COMP60010',
      Environment: 'dev',
    }),
  });
});

test('creates one HTTP API and one Lambda proxy integration with development CORS', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    CorsConfiguration: {
      AllowHeaders: ['Content-Type', 'Authorization'],
      AllowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      AllowOrigins: ['http://localhost:5173'],
    },
    ProtocolType: 'HTTP',
  });

  template.resourceCountIs('AWS::ApiGatewayV2::Integration', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
    IntegrationType: 'AWS_PROXY',
    IntegrationUri: {
      'Fn::GetAtt': [Match.stringLikeRegexp('^CatalogueFunction'), 'Arn'],
    },
    PayloadFormatVersion: '2.0',
  });
});

test('creates a Cognito JWT authorizer for the configured issuer and client', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
    AuthorizerType: 'JWT',
    IdentitySource: ['$request.header.Authorization'],
    JwtConfiguration: {
      Audience: ['test-client-id'],
      Issuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_testpool',
    },
    Name: 'smartretailx-catalogue-dev-jwt-authorizer',
  });
});

test('protects all Catalogue routes with the shared JWT authorizer and openid scope', () => {
  const integrations = template.findResources('AWS::ApiGatewayV2::Integration');
  const integrationLogicalId = Object.keys(integrations)[0];
  expect(integrationLogicalId).toBeDefined();

  const routes = Object.values(template.findResources('AWS::ApiGatewayV2::Route'));
  expect(routes).toHaveLength(5);
  expect(routes.map((route) => route.Properties.RouteKey).sort()).toEqual(
    [
      'DELETE /api/v1/products/{productId}',
      'GET /api/v1/products',
      'GET /api/v1/products/{productId}',
      'PATCH /api/v1/products/{productId}',
      'POST /api/v1/products',
    ].sort(),
  );

  const authorizers = template.findResources('AWS::ApiGatewayV2::Authorizer');
  const authorizerLogicalId = Object.keys(authorizers)[0];
  expect(authorizerLogicalId).toBeDefined();

  for (const route of routes) {
    expect(route.Properties.AuthorizationType).toBe('JWT');
    expect(route.Properties.AuthorizationScopes).toEqual(['openid']);
    expect(route.Properties.AuthorizerId).toEqual({ Ref: authorizerLogicalId });
    expect(route.Properties.Target).toEqual({
      'Fn::Join': ['', ['integrations/', { Ref: integrationLogicalId }]],
    });
  }
});

test('creates the required non-sensitive outputs', () => {
  template.hasOutput('CatalogueApiUrl', {});
  template.hasOutput('ProductsTableName', {});
  template.hasOutput('CatalogueFunctionName', {});
});

test('does not create networking or unrelated chargeable services', () => {
  for (const resourceType of [
    'AWS::EC2::VPC',
    'AWS::EC2::NatGateway',
    'AWS::EC2::Instance',
    'AWS::ECS::Service',
    'AWS::RDS::DBInstance',
    'AWS::OpenSearchService::Domain',
    'AWS::MSK::Cluster',
    'AWS::CloudFront::Distribution',
    'AWS::KMS::Key',
  ]) {
    template.resourceCountIs(resourceType, 0);
  }
});
