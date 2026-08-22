import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  ORDER_IMAGE_TAG_PLACEHOLDER,
  getOrderImageConfiguration,
} from '../lib/environment-configuration.js';
import { OrderRegistryStack } from '../lib/order-registry-stack.js';
import { OrderServiceStack } from '../lib/order-service-stack.js';

let template: Template;

const resourcesOfType = (resourceType: string): Record<string, unknown>[] =>
  Object.values(template.findResources(resourceType)) as Record<string, unknown>[];

const propertyObject = (resource: Record<string, unknown>): Record<string, unknown> =>
  resource.Properties as Record<string, unknown>;

const policyActions = (policy: Record<string, unknown>): string[] => {
  const properties = propertyObject(policy);
  const document = properties.PolicyDocument as { Statement: { Action: string | string[] }[] };
  return document.Statement.flatMap((statement) =>
    typeof statement.Action === 'string' ? [statement.Action] : statement.Action,
  );
};

beforeAll(() => {
  const app = new cdk.App();
  const registryStack = new OrderRegistryStack(app, 'TestOrderRegistryStackForService', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
  });
  const stack = new OrderServiceStack(app, 'TestOrderServiceStack', {
    projectName: 'SmartRetailX',
    environmentName: 'dev',
    imageTag: 'abc123def456',
    repository: registryStack.repository,
    userPoolIssuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example',
    userPoolClientId: 'example-spa-client-id',
    webApplicationUrls: ['http://localhost:5173', 'https://d123456789.cloudfront.net'],
  });
  template = Template.fromStack(stack);
});

test('requires an immutable non-latest image tag and exposes a synth-only placeholder', () => {
  expect(getOrderImageConfiguration(undefined)).toEqual({
    imageTag: ORDER_IMAGE_TAG_PLACEHOLDER,
    usesPlaceholder: true,
  });
  expect(getOrderImageConfiguration('abc123def456')).toEqual({
    imageTag: 'abc123def456',
    usesPlaceholder: false,
  });
  expect(() => getOrderImageConfiguration('latest')).toThrow(/cannot be 'latest'/u);
  expect(() => getOrderImageConfiguration('invalid tag')).toThrow(/valid non-empty/u);
});

test('creates a two-AZ public-subnet VPC with no NAT Gateway', () => {
  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.hasResourceProperties('AWS::EC2::VPC', {
    CidrBlock: '10.24.0.0/16',
    EnableDnsHostnames: true,
    EnableDnsSupport: true,
  });
  template.resourceCountIs('AWS::EC2::Subnet', 2);
  for (const subnet of resourcesOfType('AWS::EC2::Subnet')) {
    expect(propertyObject(subnet).MapPublicIpOnLaunch).toBe(true);
  }
  template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
});

test('creates dedicated VPC Link, ALB, and task security groups', () => {
  template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
  for (const groupName of [
    'smartretailx-order-dev-vpc-link-sg',
    'smartretailx-order-dev-alb-sg',
    'smartretailx-order-dev-task-sg',
  ]) {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', { GroupName: groupName });
  }
});

test('restricts the trust chain to VPC Link port 80 then ALB port 3000', () => {
  const groups = template.findResources('AWS::EC2::SecurityGroup');
  const groupIdFor = (name: string): string => {
    const entry = Object.entries(groups).find(([, group]) => group.Properties.GroupName === name);
    expect(entry).toBeDefined();
    return entry![0];
  };
  const vpcLinkGroupId = groupIdFor('smartretailx-order-dev-vpc-link-sg');
  const albGroupId = groupIdFor('smartretailx-order-dev-alb-sg');
  const taskGroupId = groupIdFor('smartretailx-order-dev-task-sg');

  template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    GroupId: { 'Fn::GetAtt': [albGroupId, 'GroupId'] },
    SourceSecurityGroupId: { 'Fn::GetAtt': [vpcLinkGroupId, 'GroupId'] },
    FromPort: 80,
    ToPort: 80,
  });
  template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    GroupId: { 'Fn::GetAtt': [taskGroupId, 'GroupId'] },
    SourceSecurityGroupId: { 'Fn::GetAtt': [albGroupId, 'GroupId'] },
    FromPort: 3000,
    ToPort: 3000,
  });
  template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
    GroupId: { 'Fn::GetAtt': [vpcLinkGroupId, 'GroupId'] },
    DestinationSecurityGroupId: { 'Fn::GetAtt': [albGroupId, 'GroupId'] },
    FromPort: 80,
    ToPort: 80,
  });
  template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
    GroupId: { 'Fn::GetAtt': [albGroupId, 'GroupId'] },
    DestinationSecurityGroupId: { 'Fn::GetAtt': [taskGroupId, 'GroupId'] },
    FromPort: 3000,
    ToPort: 3000,
  });

  const allIngress = JSON.stringify(template.findResources('AWS::EC2::SecurityGroupIngress'));
  expect(allIngress).not.toContain('0.0.0.0/0');
});

test('creates a Fargate-only cluster without enhanced Container Insights', () => {
  template.resourceCountIs('AWS::ECS::Cluster', 1);
  template.hasResourceProperties('AWS::ECS::Cluster', {
    ClusterName: 'smartretailx-order-dev',
    ClusterSettings: [{ Name: 'containerInsights', Value: 'disabled' }],
  });
  template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 0);
  template.resourceCountIs('AWS::ECS::CapacityProvider', 0);
});

test('defines one hardened Linux x86 Fargate task with separate roles', () => {
  template.resourceCountIs('AWS::ECS::TaskDefinition', 1);
  template.resourceCountIs('AWS::IAM::Role', 2);
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    Cpu: '256',
    Memory: '512',
    NetworkMode: 'awsvpc',
    RequiresCompatibilities: ['FARGATE'],
    RuntimePlatform: {
      CpuArchitecture: 'X86_64',
      OperatingSystemFamily: 'LINUX',
    },
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Name: 'order-service',
        Essential: true,
        Privileged: false,
        ReadonlyRootFilesystem: true,
        StopTimeout: 30,
        User: 'node',
        LinuxParameters: {
          Capabilities: { Drop: ['ALL'] },
          InitProcessEnabled: true,
        },
        PortMappings: [Match.objectLike({ ContainerPort: 3000, HostPort: 3000 })],
      }),
    ]),
  });
});

test('uses only non-secret production application configuration and awslogs', () => {
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: Match.arrayWith([
      Match.objectLike({
        Environment: Match.arrayWith([
          { Name: 'COGNITO_USER_POOL_CLIENT_ID', Value: 'example-spa-client-id' },
          {
            Name: 'COGNITO_USER_POOL_ISSUER',
            Value: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example',
          },
          { Name: 'NODE_ENV', Value: 'production' },
          {
            Name: 'NODE_OPTIONS',
            Value: '--require @opentelemetry/auto-instrumentations-node/register',
          },
          { Name: 'NODE_PATH', Value: '/workspace/domains/order/service/node_modules' },
          {
            Name: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
            Value: 'http://127.0.0.1:4318/v1/traces',
          },
          { Name: 'OTEL_TRACES_EXPORTER', Value: 'otlp' },
          { Name: 'OTEL_TRACES_SAMPLER', Value: 'parentbased_traceidratio' },
          { Name: 'OTEL_TRACES_SAMPLER_ARG', Value: '0.1' },
          { Name: 'ORDERS_TABLE_NAME', Value: 'smartretailx-orders-dev' },
          { Name: 'PORT', Value: '3000' },
        ]),
        LogConfiguration: Match.objectLike({
          LogDriver: 'awslogs',
          Options: Match.objectLike({ 'awslogs-stream-prefix': 'order-service' }),
        }),
      }),
    ]),
  });
  const taskDefinition = JSON.stringify(resourcesOfType('AWS::ECS::TaskDefinition'));
  expect(taskDefinition).not.toMatch(/AWS_ACCESS_KEY|AWS_SECRET|PASSWORD|TOKEN/iu);
});

test('runs a pinned healthy ADOT collector sidecar before the Order application', () => {
  const taskDefinition = propertyObject(resourcesOfType('AWS::ECS::TaskDefinition')[0]!);
  const containers = taskDefinition.ContainerDefinitions as Array<Record<string, unknown>>;
  const application = containers.find((container) => container.Name === 'order-service');
  const collector = containers.find((container) => container.Name === 'aws-otel-collector');

  expect(containers).toHaveLength(2);
  expect(collector).toEqual(
    expect.objectContaining({
      Command: ['--config=/etc/ecs/ecs-default-config.yaml'],
      Cpu: 64,
      Essential: true,
      Image:
        'public.ecr.aws/aws-observability/aws-otel-collector@sha256:d2bdfff2c377c3d71d78bd5d9ce9862fd535b12134a5739d87a07801297cf9fd',
      MemoryReservation: 128,
      HealthCheck: {
        Command: ['CMD', '/healthcheck'],
        Interval: 10,
        Retries: 3,
        StartPeriod: 5,
        Timeout: 5,
      },
      LogConfiguration: expect.objectContaining({
        LogDriver: 'awslogs',
        Options: expect.objectContaining({ 'awslogs-stream-prefix': 'otel-collector' }),
      }),
    }),
  );
  expect(collector?.Environment).toEqual(
    expect.arrayContaining([
      { Name: 'AWS_DEFAULT_REGION', Value: { Ref: 'AWS::Region' } },
      { Name: 'AWS_REGION', Value: { Ref: 'AWS::Region' } },
    ]),
  );
  expect(application).toEqual(
    expect.objectContaining({
      Cpu: 192,
      DependsOn: [{ Condition: 'HEALTHY', ContainerName: 'aws-otel-collector' }],
      MemoryReservation: 256,
    }),
  );
});

test('creates seven-day container and API access log groups', () => {
  template.resourceCountIs('AWS::Logs::LogGroup', 2);
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/ecs/smartretailx-order-dev',
    RetentionInDays: 7,
  });
  template.hasResourceProperties('AWS::Logs::LogGroup', {
    LogGroupName: '/aws/apigateway/smartretailx-order-dev',
    RetentionInDays: 7,
  });
});

test('grants the execution role only ECR pull and container log writes', () => {
  const policies = resourcesOfType('AWS::IAM::Policy');
  const executionPolicy = policies.find((policy) =>
    String(propertyObject(policy).PolicyName).includes('OrderTaskExecutionRole'),
  );
  expect(executionPolicy).toBeDefined();
  expect(policyActions(executionPolicy!).sort()).toEqual(
    [
      'ecr:BatchCheckLayerAvailability',
      'ecr:BatchGetImage',
      'ecr:GetAuthorizationToken',
      'ecr:GetDownloadUrlForLayer',
      'logs:CreateLogStream',
      'logs:PutLogEvents',
    ].sort(),
  );
  expect(policyActions(executionPolicy!)).not.toEqual(expect.arrayContaining(['dynamodb:GetItem']));
});

test('grants the application task role only repository and X-Ray export actions', () => {
  const policies = resourcesOfType('AWS::IAM::Policy');
  const applicationPolicy = policies.find((policy) =>
    String(propertyObject(policy).PolicyName).includes('OrderApplicationTaskRole'),
  );
  expect(applicationPolicy).toBeDefined();
  expect(policyActions(applicationPolicy!).sort()).toEqual(
    [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:Scan',
      'xray:PutTelemetryRecords',
      'xray:PutTraceSegments',
    ].sort(),
  );

  const serializedPolicy = JSON.stringify(applicationPolicy);
  expect(serializedPolicy).toContain(':table/smartretailx-orders-dev');
  expect(serializedPolicy).toContain('/index/customerId-createdAt-index');
  expect(serializedPolicy).not.toMatch(
    /events:PutEvents|sqs:|sns:|cognito-idp:Admin|iam:|secretsmanager:|dynamodb:\*|xray:\*/u,
  );
});

test('scopes X-Ray telemetry export to the API actions that require wildcard resources', () => {
  const policies = resourcesOfType('AWS::IAM::Policy');
  const applicationPolicy = policies.find((policy) =>
    String(propertyObject(policy).PolicyName).includes('OrderApplicationTaskRole'),
  );
  const document = propertyObject(applicationPolicy!).PolicyDocument as {
    Statement: { Action: string | string[]; Resource: unknown }[];
  };
  const xrayStatement = document.Statement.find((statement) =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).some((action) =>
      action.startsWith('xray:'),
    ),
  );

  expect(xrayStatement).toEqual({
    Action: ['xray:PutTelemetryRecords', 'xray:PutTraceSegments'],
    Effect: 'Allow',
    Resource: '*',
  });
});

test('scopes DynamoDB Query to only the customer orders GSI ARN', () => {
  const policies = resourcesOfType('AWS::IAM::Policy');
  const applicationPolicy = policies.find((policy) =>
    String(propertyObject(policy).PolicyName).includes('OrderApplicationTaskRole'),
  );
  const document = propertyObject(applicationPolicy!).PolicyDocument as {
    Statement: { Action: string | string[]; Resource: unknown }[];
  };
  const queryStatement = document.Statement.find((statement) =>
    (Array.isArray(statement.Action) ? statement.Action : [statement.Action]).includes(
      'dynamodb:Query',
    ),
  );

  expect(queryStatement).toEqual(
    expect.objectContaining({
      Action: 'dynamodb:Query',
      Effect: 'Allow',
    }),
  );
  expect(JSON.stringify(queryStatement?.Resource)).toContain(
    'smartretailx-orders-dev/index/customerId-createdAt-index',
  );
  expect(JSON.stringify(queryStatement?.Resource)).not.toMatch(/\/index\/\*/u);
});

test('runs one public-IP Fargate task with rollback circuit breaker', () => {
  template.resourceCountIs('AWS::ECS::Service', 1);
  template.hasResourceProperties('AWS::ECS::Service', {
    DesiredCount: 1,
    LaunchType: 'FARGATE',
    EnableExecuteCommand: false,
    HealthCheckGracePeriodSeconds: 60,
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      MinimumHealthyPercent: 100,
      MaximumPercent: 200,
    }),
    NetworkConfiguration: {
      AwsvpcConfiguration: Match.objectLike({
        AssignPublicIp: 'ENABLED',
      }),
    },
  });
  const service = propertyObject(resourcesOfType('AWS::ECS::Service')[0]!);
  const networkConfiguration = service.NetworkConfiguration as {
    AwsvpcConfiguration: { Subnets: unknown[] };
  };
  expect(networkConfiguration.AwsvpcConfiguration.Subnets).toHaveLength(2);
});

test('bounds CPU target tracking between one and two tasks', () => {
  template.resourceCountIs('AWS::ApplicationAutoScaling::ScalableTarget', 1);
  template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalableTarget', {
    MinCapacity: 1,
    MaxCapacity: 2,
    ScalableDimension: 'ecs:service:DesiredCount',
    ServiceNamespace: 'ecs',
  });
  template.resourceCountIs('AWS::ApplicationAutoScaling::ScalingPolicy', 1);
  template.hasResourceProperties('AWS::ApplicationAutoScaling::ScalingPolicy', {
    PolicyType: 'TargetTrackingScaling',
    TargetTrackingScalingPolicyConfiguration: {
      PredefinedMetricSpecification: {
        PredefinedMetricType: 'ECSServiceAverageCPUUtilization',
      },
      ScaleInCooldown: 60,
      ScaleOutCooldown: 60,
      TargetValue: 60,
    },
  });
});

test('uses one internal ALB, an HTTP listener, and an IP target group', () => {
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
    Scheme: 'internal',
    Type: 'application',
  });
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 80,
    Protocol: 'HTTP',
  });
  template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    Port: 3000,
    Protocol: 'HTTP',
    TargetType: 'ip',
    HealthCheckPath: '/health',
    HealthCheckPort: 'traffic-port',
    HealthCheckProtocol: 'HTTP',
    Matcher: { HttpCode: '200' },
  });
});

test('creates a VPC Link private ALB integration with stage-free path mapping', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::VpcLink', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::VpcLink', {
    Name: 'smartretailx-order-dev-vpc-link',
  });
  const vpcLink = propertyObject(resourcesOfType('AWS::ApiGatewayV2::VpcLink')[0]!);
  expect(vpcLink.SecurityGroupIds).toHaveLength(1);
  expect(vpcLink.SubnetIds).toHaveLength(2);
  template.resourceCountIs('AWS::ApiGatewayV2::Integration', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Integration', {
    ConnectionType: 'VPC_LINK',
    IntegrationMethod: 'ANY',
    IntegrationType: 'HTTP_PROXY',
    PayloadFormatVersion: '1.0',
    RequestParameters: { 'overwrite:path': '$request.path' },
  });
});

test('creates an HTTP API with configured CORS and one Cognito JWT authorizer', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Name: 'smartretailx-order-api-dev',
    ProtocolType: 'HTTP',
    CorsConfiguration: {
      AllowHeaders: ['Authorization', 'Content-Type'],
      AllowMethods: ['GET', 'POST', 'OPTIONS'],
      AllowOrigins: ['http://localhost:5173', 'https://d123456789.cloudfront.net'],
    },
  });
  template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
  template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
    AuthorizerType: 'JWT',
    IdentitySource: ['$request.header.Authorization'],
    JwtConfiguration: {
      Audience: ['example-spa-client-id'],
      Issuer: 'https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_example',
    },
  });
});

test('protects every external Order route with JWT and openid and excludes health', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Route', 3);
  const routes = resourcesOfType('AWS::ApiGatewayV2::Route').map(propertyObject);
  expect(routes.map((route) => route.RouteKey).sort()).toEqual(
    ['GET /api/v1/orders', 'GET /api/v1/orders/{orderId}', 'POST /api/v1/orders'].sort(),
  );
  for (const route of routes) {
    expect(route.AuthorizationType).toBe('JWT');
    expect(route.AuthorizationScopes).toEqual(['openid']);
    expect(String(route.RouteKey)).not.toContain('/health');
  }
  expect(JSON.stringify(routes)).not.toContain('"AuthorizationType":"NONE"');
});

test('writes structured safe HTTP API access logs without credentials or bodies', () => {
  template.resourceCountIs('AWS::ApiGatewayV2::Stage', 1);
  const stage = propertyObject(resourcesOfType('AWS::ApiGatewayV2::Stage')[0]!);
  const accessLogs = stage.AccessLogSettings as { Format: string };
  expect(accessLogs.Format).toContain('$context.requestId');
  expect(accessLogs.Format).toContain('$context.routeKey');
  expect(accessLogs.Format).toContain('$context.status');
  expect(accessLogs.Format).toContain('$context.integrationLatency');
  expect(accessLogs.Format).not.toMatch(/authorization|jwt|token|requestBody/iu);
});

test('creates no new business table, event publisher, queue, Cognito, secret, or KMS key', () => {
  for (const resourceType of [
    'AWS::DynamoDB::Table',
    'AWS::DynamoDB::GlobalTable',
    'AWS::Events::EventBus',
    'AWS::Events::Rule',
    'AWS::SQS::Queue',
    'AWS::Lambda::Function',
    'AWS::Cognito::UserPool',
    'AWS::SecretsManager::Secret',
    'AWS::KMS::Key',
  ]) {
    template.resourceCountIs(resourceType, 0);
  }
});

test('creates all intended non-secret operator outputs', () => {
  for (const outputName of [
    'OrderApiUrl',
    'OrderApiId',
    'OrderClusterName',
    'OrderServiceName',
    'OrderTaskDefinitionFamily',
    'OrderInternalAlbDnsName',
    'OrderVpcId',
    'OrderContainerLogGroupName',
    'OrderApiAccessLogGroupName',
    'OrderImageTag',
  ]) {
    template.hasOutput(outputName, {});
  }
});
