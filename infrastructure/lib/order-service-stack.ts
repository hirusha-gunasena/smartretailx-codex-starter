import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpAlbIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { IRepository } from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { ORDER_IMAGE_TAG_PLACEHOLDER } from './environment-configuration.js';

export interface OrderServiceStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly imageTag: string;
  readonly projectName: string;
  readonly repository: IRepository;
  readonly userPoolClientId: string;
  readonly userPoolIssuer: string;
  readonly webApplicationUrls: string[];
}

const ORDER_CONTAINER_PORT = 3_000;
const ALB_LISTENER_PORT = 80;
const ORDER_HEALTH_PATH = '/health';
const ORDER_VPC_CIDR = '10.24.0.0/16';
const CUSTOMER_ORDERS_INDEX_NAME = 'customerId-createdAt-index';

export class OrderServiceStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: OrderServiceStackProps) {
    super(scope, id, props);

    const resourcePrefix = props.projectName.toLowerCase();
    const orderServiceName = `${resourcePrefix}-order-${props.environmentName}`;
    const ordersTableName = `${resourcePrefix}-orders-${props.environmentName}`;

    cdk.Tags.of(this).add('Project', props.projectName);
    cdk.Tags.of(this).add('Module', 'COMP60010');
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Owner', props.projectName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    if (props.imageTag === ORDER_IMAGE_TAG_PLACEHOLDER) {
      cdk.Annotations.of(this).addWarning(
        `OrderService uses the non-deployable '${ORDER_IMAGE_TAG_PLACEHOLDER}' image tag. ` +
          'Supply -c orderImageTag=<immutable-source-version> before deployment review.',
      );
    }

    const vpc = new ec2.Vpc(this, 'OrderVpc', {
      vpcName: `${orderServiceName}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr(ORDER_VPC_CIDR),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });
    const vpcReference = vpc as ec2.IVpc;

    const vpcLinkSecurityGroup = new ec2.SecurityGroup(this, 'VpcLinkSecurityGroup', {
      vpc: vpcReference,
      securityGroupName: `${orderServiceName}-vpc-link-sg`,
      description: 'Allows the Order API Gateway VPC Link to reach only the internal ALB listener',
      allowAllOutbound: false,
    });
    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc: vpcReference,
      securityGroupName: `${orderServiceName}-alb-sg`,
      description: 'Allows only API Gateway VPC Link traffic to the internal Order ALB',
      allowAllOutbound: false,
    });
    const taskSecurityGroup = new ec2.SecurityGroup(this, 'TaskSecurityGroup', {
      vpc: vpcReference,
      securityGroupName: `${orderServiceName}-task-sg`,
      description: 'Allows only internal Order ALB traffic to Fargate tasks',
      allowAllOutbound: true,
    });

    vpcLinkSecurityGroup.addEgressRule(
      albSecurityGroup,
      ec2.Port.tcp(ALB_LISTENER_PORT),
      'VPC Link to internal Order ALB listener',
    );
    albSecurityGroup.addIngressRule(
      vpcLinkSecurityGroup,
      ec2.Port.tcp(ALB_LISTENER_PORT),
      'Order API VPC Link only',
    );
    albSecurityGroup.addEgressRule(
      taskSecurityGroup,
      ec2.Port.tcp(ORDER_CONTAINER_PORT),
      'Internal Order ALB to Fargate tasks',
    );
    taskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(ORDER_CONTAINER_PORT),
      'Internal Order ALB only',
    );

    const cluster = new ecs.Cluster(this, 'OrderCluster', {
      vpc: vpcReference,
      clusterName: orderServiceName,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const containerLogGroup = new logs.LogGroup(this, 'OrderContainerLogGroup', {
      logGroupName: `/ecs/${orderServiceName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const executionRole = new iam.Role(this, 'OrderTaskExecutionRole', {
      roleName: `${orderServiceName}-execution-role`,
      description: 'Pulls the Order image from ECR and writes ECS container logs',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });
    props.repository.grantPull(executionRole);
    containerLogGroup.grantWrite(executionRole);

    const taskRole = new iam.Role(this, 'OrderApplicationTaskRole', {
      roleName: `${orderServiceName}-task-role`,
      description: 'Least-privilege DynamoDB role for the Order REST application',
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    const ordersTable = dynamodb.Table.fromTableName(this, 'ExistingOrdersTable', ordersTableName);
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Scan'],
        resources: [ordersTable.tableArn],
      }),
    );
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:Query'],
        resources: [`${ordersTable.tableArn}/index/${CUSTOMER_ORDERS_INDEX_NAME}`],
      }),
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'OrderTaskDefinition', {
      family: orderServiceName,
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
    const linuxParameters = new ecs.LinuxParameters(this, 'OrderLinuxParameters', {
      initProcessEnabled: true,
    });
    linuxParameters.dropCapabilities(ecs.Capability.ALL);

    const container = taskDefinition.addContainer('OrderContainer', {
      containerName: 'order-service',
      image: ecs.ContainerImage.fromEcrRepository(props.repository, props.imageTag),
      essential: true,
      environment: {
        COGNITO_USER_POOL_CLIENT_ID: props.userPoolClientId,
        COGNITO_USER_POOL_ISSUER: props.userPoolIssuer,
        NODE_ENV: 'production',
        ORDERS_TABLE_NAME: ordersTableName,
        PORT: String(ORDER_CONTAINER_PORT),
      },
      linuxParameters,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: containerLogGroup,
        streamPrefix: 'order-service',
      }),
      privileged: false,
      readonlyRootFilesystem: true,
      stopTimeout: cdk.Duration.seconds(30),
      user: 'node',
    });
    container.addPortMappings({
      containerPort: ORDER_CONTAINER_PORT,
      hostPort: ORDER_CONTAINER_PORT,
      protocol: ecs.Protocol.TCP,
      name: 'http',
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'OrderLoadBalancer', {
      vpc: vpcReference,
      loadBalancerName: `${orderServiceName}-alb`,
      internetFacing: false,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'OrderTargetGroup', {
      vpc: vpcReference,
      targetGroupName: `${orderServiceName}-tg`,
      port: ORDER_CONTAINER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: cdk.Duration.seconds(30),
      healthCheck: {
        path: ORDER_HEALTH_PATH,
        port: 'traffic-port',
        protocol: elbv2.Protocol.HTTP,
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });
    const listener = loadBalancer.addListener('OrderHttpListener', {
      port: ALB_LISTENER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: false,
      defaultTargetGroups: [targetGroup],
    });

    const service = new ecs.FargateService(this, 'OrderFargateService', {
      serviceName: orderServiceName,
      cluster: cluster as ecs.ICluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [taskSecurityGroup],
      circuitBreaker: { rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      enableExecuteCommand: false,
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });
    service.attachToApplicationTargetGroup(targetGroup);

    const scalableTaskCount = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 2,
    });
    scalableTaskCount.scaleOnCpuUtilization('OrderCpuTargetTracking', {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    const vpcLink = new apigatewayv2.VpcLink(this, 'OrderVpcLink', {
      vpc: vpcReference,
      vpcLinkName: `${orderServiceName}-vpc-link`,
      subnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroups: [vpcLinkSecurityGroup],
    });
    const integration = new HttpAlbIntegration('OrderAlbIntegration', listener, {
      vpcLink,
      parameterMapping: new apigatewayv2.ParameterMapping().overwritePath(
        apigatewayv2.MappingValue.requestPath(),
      ),
      timeout: cdk.Duration.seconds(29),
    });

    const accessLogGroup = new logs.LogGroup(this, 'OrderApiAccessLogGroup', {
      logGroupName: `/aws/apigateway/${orderServiceName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    const httpApi = new apigatewayv2.HttpApi(this, 'OrderHttpApi', {
      apiName: `${resourcePrefix}-order-api-${props.environmentName}`,
      description: 'SmartRetailX authenticated Order HTTP API',
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: props.webApplicationUrls,
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
      },
    });
    const authorizer = new HttpJwtAuthorizer('OrderJwtAuthorizer', props.userPoolIssuer, {
      authorizerName: `${orderServiceName}-jwt-authorizer`,
      jwtAudience: [props.userPoolClientId],
    });

    httpApi.addRoutes({
      path: '/api/v1/orders',
      methods: [apigatewayv2.HttpMethod.GET, apigatewayv2.HttpMethod.POST],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });
    httpApi.addRoutes({
      path: '/api/v1/orders/{orderId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer,
      authorizationScopes: ['openid'],
    });

    const stage = new apigatewayv2.HttpStage(this, 'OrderDefaultStage', {
      httpApi,
      stageName: '$default',
      autoDeploy: true,
      accessLogSettings: {
        destination: new apigatewayv2.LogGroupLogDestination(accessLogGroup),
        format: apigateway.AccessLogFormat.custom(
          JSON.stringify({
            integrationErrorMessage: '$context.integrationErrorMessage',
            integrationLatency: '$context.integrationLatency',
            requestId: '$context.requestId',
            requestTime: '$context.requestTime',
            responseLength: '$context.responseLength',
            routeKey: '$context.routeKey',
            sourceIp: '$context.identity.sourceIp',
            status: '$context.status',
          }),
        ),
      },
    });

    new cdk.CfnOutput(this, 'OrderApiUrl', {
      value: stage.url,
    });
    new cdk.CfnOutput(this, 'OrderApiId', {
      value: httpApi.apiId,
    });
    new cdk.CfnOutput(this, 'OrderClusterName', {
      value: cluster.clusterName,
    });
    new cdk.CfnOutput(this, 'OrderServiceName', {
      value: service.serviceName,
    });
    new cdk.CfnOutput(this, 'OrderTaskDefinitionFamily', {
      value: taskDefinition.family,
    });
    new cdk.CfnOutput(this, 'OrderInternalAlbDnsName', {
      description: 'Internal operator-only ALB DNS name; this is not the public API URL.',
      value: loadBalancer.loadBalancerDnsName,
    });
    new cdk.CfnOutput(this, 'OrderVpcId', {
      value: vpc.vpcId,
    });
    new cdk.CfnOutput(this, 'OrderContainerLogGroupName', {
      value: containerLogGroup.logGroupName,
    });
    new cdk.CfnOutput(this, 'OrderApiAccessLogGroupName', {
      value: accessLogGroup.logGroupName,
    });
    new cdk.CfnOutput(this, 'OrderImageTag', {
      value: props.imageTag,
    });
  }
}
