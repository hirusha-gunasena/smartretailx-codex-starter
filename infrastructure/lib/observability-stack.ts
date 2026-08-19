import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type { Construct } from 'constructs';
import type { CatalogueStack } from './catalogue-stack.js';
import type { InventoryStack } from './inventory-stack.js';
import type { OrderEventsStack } from './order-events-stack.js';
import type { OrderServiceStack } from './order-service-stack.js';
import type { OrderWorkflowStack } from './order-workflow-stack.js';

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly projectName: string;
  readonly catalogueStack: CatalogueStack;
  readonly inventoryStack: InventoryStack;
  readonly orderEventsStack: OrderEventsStack;
  readonly orderServiceStack: OrderServiceStack;
  readonly orderWorkflowStack: OrderWorkflowStack;
}

export class ObservabilityStack extends cdk.Stack {
  public constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    const { projectName, environmentName } = props;

    cdk.Tags.of(this).add('Project', projectName);
    cdk.Tags.of(this).add('Environment', environmentName);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    const dashboardName = `${projectName}-${environmentName}-SystemDashboard`;
    const dashboard = new cloudwatch.Dashboard(this, 'SystemDashboard', {
      dashboardName,
      defaultInterval: cdk.Duration.hours(1),
    });

    // -----------------------------------------------------------
    // 1. SYSTEM OVERVIEW WIDGETS
    // -----------------------------------------------------------

    const allLambdaErrorsWidget = new cloudwatch.GraphWidget({
      title: 'Total Lambda Errors',
      width: 12,
      left: [
        new cloudwatch.MathExpression({
          expression: `SEARCH('{AWS/Lambda,FunctionName} FunctionName="${projectName.toLowerCase()}-" MetricName="Errors"', 'Sum', 300)`,
          label: 'Errors',
          period: cdk.Duration.minutes(5),
        }),
      ],
    });

    const allLambdaInvocationsWidget = new cloudwatch.GraphWidget({
      title: 'Total Lambda Invocations',
      width: 12,
      left: [
        new cloudwatch.MathExpression({
          expression: `SEARCH('{AWS/Lambda,FunctionName} FunctionName="${projectName.toLowerCase()}-" MetricName="Invocations"', 'Sum', 300)`,
          label: 'Invocations',
          period: cdk.Duration.minutes(5),
        }),
      ],
    });

    dashboard.addWidgets(allLambdaErrorsWidget as cloudwatch.IWidget, allLambdaInvocationsWidget as cloudwatch.IWidget);

    // -----------------------------------------------------------
    // 2. COMPUTE / LAMBDA METRICS
    // -----------------------------------------------------------

    const getLambdaMetrics = (fn: cdk.aws_lambda.IFunction, labelPrefix: string) => {
      return [
        fn.metricInvocations({ label: `${labelPrefix} Invs`, statistic: 'Sum' }),
        fn.metricErrors({ label: `${labelPrefix} Errs`, statistic: 'Sum' }),
        fn.metricDuration({ label: `${labelPrefix} Dur`, statistic: 'Average' }),
      ];
    };

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Catalogue Service',
        width: 8,
        left: getLambdaMetrics(props.catalogueStack.catalogueFunction, 'Catalogue'),
      }) as cloudwatch.IWidget,
      new cloudwatch.GraphWidget({
        title: 'Inventory Service',
        width: 8,
        left: [
          ...getLambdaMetrics(props.inventoryStack.inventoryApiFunction, 'InvAPI'),
          ...getLambdaMetrics(props.inventoryStack.inventoryConsumerFunction, 'InvCons'),
          ...getLambdaMetrics(props.inventoryStack.inventoryOutcomeRelayFunction, 'InvRelay'),
        ],
      }) as cloudwatch.IWidget,
      new cloudwatch.GraphWidget({
        title: 'Order Events & Workflow',
        width: 8,
        left: [
          ...getLambdaMetrics(props.orderEventsStack.orderEventRelayFunction, 'OrdRelay'),
          ...getLambdaMetrics(props.orderWorkflowStack.orderWorkflowFunction, 'OrdWork'),
        ],
      }) as cloudwatch.IWidget,
    );

    // -----------------------------------------------------------
    // 3. ECS FARGATE (ORDER SERVICE) METRICS
    // -----------------------------------------------------------

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Order Service ECS Utilization',
        width: 24,
        left: [
          props.orderServiceStack.orderService.metricCpuUtilization({ label: 'CPU Utilization' }),
          props.orderServiceStack.orderService.metricMemoryUtilization({ label: 'Memory Utilization' }),
        ],
      }) as cloudwatch.IWidget,
    );

    // -----------------------------------------------------------
    // 4. SQS QUEUE METRICS
    // -----------------------------------------------------------

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Inventory Queue Backlog',
        width: 12,
        left: [
          props.inventoryStack.inventoryQueue.metricApproximateNumberOfMessagesVisible({ label: 'Visible Messages' }),
        ],
        right: [
          props.inventoryStack.inventoryQueue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age (s)' }),
        ],
      }) as cloudwatch.IWidget,
      new cloudwatch.GraphWidget({
        title: 'Order Workflow Queue Backlog',
        width: 12,
        left: [
          props.orderWorkflowStack.workflowQueue.metricApproximateNumberOfMessagesVisible({ label: 'Visible Messages' }),
        ],
        right: [
          props.orderWorkflowStack.workflowQueue.metricApproximateAgeOfOldestMessage({ label: 'Oldest Message Age (s)' }),
        ],
      }) as cloudwatch.IWidget,
    );

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboardName,
    });
  }
}
