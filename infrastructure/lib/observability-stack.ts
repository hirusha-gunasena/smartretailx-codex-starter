import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
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

    const alarmsTopic = new sns.Topic(this, 'SystemAlarmsTopic', {
      displayName: `${projectName} ${environmentName} System Alarms`,
    });
    const alarmAction = new cw_actions.SnsAction(alarmsTopic);
    const allAlarms: cloudwatch.IAlarm[] = [];

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

    dashboard.addWidgets(
      allLambdaErrorsWidget as cloudwatch.IWidget,
      allLambdaInvocationsWidget as cloudwatch.IWidget,
    );

    // -----------------------------------------------------------
    // 2. COMPUTE / LAMBDA METRICS
    // -----------------------------------------------------------

    const getLambdaMetrics = (fn: cdk.aws_lambda.IFunction, labelPrefix: string) => {
      const errMetric = fn.metricErrors({ label: `${labelPrefix} Errs`, statistic: 'Sum' });
      const alarm = errMetric.createAlarm(this, `${labelPrefix}ErrorsAlarm`, {
        alarmName: `${projectName}-${environmentName}-${labelPrefix}-Errors`,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
      allAlarms.push(alarm);

      return [
        fn.metricInvocations({ label: `${labelPrefix} Invs`, statistic: 'Sum' }),
        errMetric,
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

    const ecsCpuMetric = props.orderServiceStack.orderService.metricCpuUtilization({
      label: 'CPU Utilization',
    });
    const ecsMemMetric = props.orderServiceStack.orderService.metricMemoryUtilization({
      label: 'Memory Utilization',
    });

    const ecsCpuAlarm = ecsCpuMetric.createAlarm(this, 'OrderServiceCpuAlarm', {
      alarmName: `${projectName}-${environmentName}-OrderService-CPU`,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    ecsCpuAlarm.addAlarmAction(alarmAction);
    allAlarms.push(ecsCpuAlarm);

    const ecsMemAlarm = ecsMemMetric.createAlarm(this, 'OrderServiceMemoryAlarm', {
      alarmName: `${projectName}-${environmentName}-OrderService-Memory`,
      threshold: 80,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    ecsMemAlarm.addAlarmAction(alarmAction);
    allAlarms.push(ecsMemAlarm);

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Order Service ECS Utilization',
        width: 24,
        left: [ecsCpuMetric, ecsMemMetric],
      }) as cloudwatch.IWidget,
    );

    // -----------------------------------------------------------
    // 4. SQS QUEUE METRICS
    // -----------------------------------------------------------

    const invQueueAgeMetric =
      props.inventoryStack.inventoryQueue.metricApproximateAgeOfOldestMessage({
        label: 'Oldest Message Age (s)',
      });
    const invQueueAlarm = invQueueAgeMetric.createAlarm(this, 'InventoryQueueAgeAlarm', {
      alarmName: `${projectName}-${environmentName}-InventoryQueue-Age`,
      threshold: 300,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    invQueueAlarm.addAlarmAction(alarmAction);
    allAlarms.push(invQueueAlarm);

    const wfQueueAgeMetric =
      props.orderWorkflowStack.workflowQueue.metricApproximateAgeOfOldestMessage({
        label: 'Oldest Message Age (s)',
      });
    const wfQueueAlarm = wfQueueAgeMetric.createAlarm(this, 'WorkflowQueueAgeAlarm', {
      alarmName: `${projectName}-${environmentName}-WorkflowQueue-Age`,
      threshold: 300,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    wfQueueAlarm.addAlarmAction(alarmAction);
    allAlarms.push(wfQueueAlarm);

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Inventory Queue Backlog',
        width: 12,
        left: [
          props.inventoryStack.inventoryQueue.metricApproximateNumberOfMessagesVisible({
            label: 'Visible Messages',
          }),
        ],
        right: [invQueueAgeMetric],
      }) as cloudwatch.IWidget,
      new cloudwatch.GraphWidget({
        title: 'Order Workflow Queue Backlog',
        width: 12,
        left: [
          props.orderWorkflowStack.workflowQueue.metricApproximateNumberOfMessagesVisible({
            label: 'Visible Messages',
          }),
        ],
        right: [wfQueueAgeMetric],
      }) as cloudwatch.IWidget,
    );

    // -----------------------------------------------------------
    // 5. ALARM STATUS WIDGET
    // -----------------------------------------------------------

    const alarmWidget = new cloudwatch.AlarmStatusWidget({
      alarms: allAlarms,
      title: 'System Alarms Status',
      width: 24,
    });

    // Add to the top of the dashboard
    dashboard.addWidgets(alarmWidget as cloudwatch.IWidget);

    new cdk.CfnOutput(this, 'DashboardName', {
      value: dashboardName,
    });
  }
}
