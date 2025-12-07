import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';
import { CoreStack } from './core-stack';
import { AuthStack } from './auth-stack';
import { BackendStack } from './backend-stack';

/**
 * Props for ObservabilityStack
 */
export interface ObservabilityStackProps extends BaseStackProps {
  coreStack: CoreStack;
  authStack?: AuthStack;
  backendStack?: BackendStack;
  // frontendStack?: FrontendStack;
}

/**
 * Observability Stack for Everyone Cook Infrastructure
 *
 * Phase 7: This stack contains DNS, monitoring, and observability infrastructure:
 * - Route 53 Hosted Zone and DNS records
 * - ACM SSL certificates (wildcard + root) - MOVED FROM CoreStack
 * - CloudFront custom domain configuration
 * - API Gateway custom domain configuration
 * - Amplify custom domain configuration
 * - CloudWatch dashboards and aggregated alarms
 *
 * This is the LAST stack to deploy after all other stacks are ready.
 * It depends on resources from CoreStack, AuthStack, BackendStack, and FrontendStack.
 *
 * @see .kiro/specs/project-restructure/requirements.md - Req 5 (Domain Configuration)
 * @see .kiro/specs/project-restructure/design.md - Observability section
 */
export class ObservabilityStack extends BaseStack {
  public readonly alarmTopic: sns.Topic;
  public readonly compositeAlarm: cloudwatch.CompositeAlarm;
  public readonly coreDashboard: cloudwatch.Dashboard;
  public readonly authDashboard: cloudwatch.Dashboard;
  public readonly backendDashboard: cloudwatch.Dashboard;
  public readonly overviewDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    // Add stack-specific tags
    cdk.Tags.of(this).add('StackType', 'Observability');
    cdk.Tags.of(this).add('Layer', 'Monitoring');
    cdk.Tags.of(this).add('CostCenter', `Observability-${this.config.environment}`);

    // Create SNS Topic for Alarms (Task 7.4.2 - Step 1)
    this.alarmTopic = this.createAlarmTopic();

    // Create CloudWatch Alarms (Task 7.4.2 - Steps 3-9)
    const alarms = this.createAlarms(props);

    // Create Composite Alarm for overall system health (Task 7.4.2 - Step 2)
    this.compositeAlarm = this.createCompositeAlarm(alarms);

    // Create CloudWatch Dashboards (Task 7.4.1)
    this.coreDashboard = this.createCoreDashboard(props);
    this.authDashboard = this.createAuthDashboard(props);
    this.backendDashboard = this.createBackendDashboard(props);
    this.overviewDashboard = this.createOverviewDashboard(props);

    // Outputs
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch Alarms',
      exportName: `${this.stackName}-AlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'CompositeAlarmName', {
      value: this.compositeAlarm.alarmName,
      description: 'Composite Alarm for overall system health',
      exportName: `${this.stackName}-CompositeAlarmName`,
    });

    new cdk.CfnOutput(this, 'CoreDashboardName', {
      value: this.coreDashboard.dashboardName,
      description: 'CloudWatch Dashboard for Core Stack',
      exportName: `${this.stackName}-CoreDashboardName`,
    });

    new cdk.CfnOutput(this, 'AuthDashboardName', {
      value: this.authDashboard.dashboardName,
      description: 'CloudWatch Dashboard for Auth Stack',
      exportName: `${this.stackName}-AuthDashboardName`,
    });

    new cdk.CfnOutput(this, 'BackendDashboardName', {
      value: this.backendDashboard.dashboardName,
      description: 'CloudWatch Dashboard for Backend Stack',
      exportName: `${this.stackName}-BackendDashboardName`,
    });

    new cdk.CfnOutput(this, 'OverviewDashboardName', {
      value: this.overviewDashboard.dashboardName,
      description: 'CloudWatch Dashboard for System Overview',
      exportName: `${this.stackName}-OverviewDashboardName`,
    });

    // TODO: Phase 7 tasks will implement:
    // - Task 7.1: Create Route 53 Hosted Zone
    // - Task 7.2: Request ACM certificates (moved from CoreStack Task 2.3)
    // - Task 7.3: Configure CloudFront custom domain
    // - Task 7.4: Configure API Gateway custom domain
    // - Task 7.5: Configure Amplify custom domain
  }

  /**
   * Create SNS Topic for CloudWatch Alarms
   * Task 7.4.2 - Step 1
   */
  private createAlarmTopic(): sns.Topic {
    const topic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `EveryoneCook-${this.config.environment}-Alarms`,
      displayName: 'Everyone Cook CloudWatch Alarms',
    });

    // Add email subscription for alarm notifications
    topic.addSubscription(
      new sns_subscriptions.EmailSubscription(this.config.contact.email)
    );

    return topic;
  }

  /**
   * Create CloudWatch Alarms for all services
   * Task 7.4.2 - Steps 3-9
   */
  private createAlarms(props: ObservabilityStackProps): cloudwatch.IAlarm[] {
    const alarms: cloudwatch.IAlarm[] = [];
    const alarmAction = new cloudwatch_actions.SnsAction(this.alarmTopic);

    // Step 3: API Gateway Alarms
    if (props.backendStack) {
      const apiName = props.backendStack.api.restApiName;

      // API Gateway: High 5XX Error Rate (Critical)
      const api5xxAlarm = new cloudwatch.Alarm(this, 'API-5XX-Critical', {
        alarmName: `EveryoneCook-${this.config.environment}-API-5XX-Critical`,
        alarmDescription: 'API Gateway 5XX error rate > 5% in 5 minutes',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5XXError',
          dimensionsMap: { ApiName: apiName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      api5xxAlarm.addAlarmAction(alarmAction);
      alarms.push(api5xxAlarm);

      // API Gateway: High 4XX Error Rate (Warning)
      const api4xxAlarm = new cloudwatch.Alarm(this, 'API-4XX-Warning', {
        alarmName: `EveryoneCook-${this.config.environment}-API-4XX-Warning`,
        alarmDescription: 'API Gateway 4XX error rate > 20% in 5 minutes',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '4XXError',
          dimensionsMap: { ApiName: apiName },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 20,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      api4xxAlarm.addAlarmAction(alarmAction);
      alarms.push(api4xxAlarm);

      // API Gateway: High Latency (Warning)
      const apiLatencyAlarm = new cloudwatch.Alarm(this, 'API-Latency-High', {
        alarmName: `EveryoneCook-${this.config.environment}-API-Latency-High`,
        alarmDescription: 'API Gateway P99 latency > 3s in 5 minutes',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: { ApiName: apiName },
          statistic: 'p99',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 3000, // 3 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      apiLatencyAlarm.addAlarmAction(alarmAction);
      alarms.push(apiLatencyAlarm);
    }

    // Step 4: Lambda Alarms (Aggregate across all functions)
    // Lambda: High Error Rate (Critical)
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'Lambda-Error-Rate', {
      alarmName: `EveryoneCook-${this.config.environment}-Lambda-Error-Rate`,
      alarmDescription: 'Lambda error rate > 5% in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaErrorAlarm.addAlarmAction(alarmAction);
    alarms.push(lambdaErrorAlarm);

    // Lambda: Throttles (Critical)
    const lambdaThrottleAlarm = new cloudwatch.Alarm(this, 'Lambda-Throttle', {
      alarmName: `EveryoneCook-${this.config.environment}-Lambda-Throttle`,
      alarmDescription: 'Lambda throttles > 10 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Throttles',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaThrottleAlarm.addAlarmAction(alarmAction);
    alarms.push(lambdaThrottleAlarm);

    // Lambda: High Duration (Warning)
    const lambdaDurationAlarm = new cloudwatch.Alarm(this, 'Lambda-Duration-High', {
      alarmName: `EveryoneCook-${this.config.environment}-Lambda-Duration-High`,
      alarmDescription: 'Lambda P99 duration > 10s in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Duration',
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10000, // 10 seconds in milliseconds
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    lambdaDurationAlarm.addAlarmAction(alarmAction);
    alarms.push(lambdaDurationAlarm);

    // Step 5: DynamoDB Alarms
    const dynamoTableName = props.coreStack.table.tableName;

    // DynamoDB: Read Throttles (Critical)
    const dynamoReadThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoDB-Read-Throttle', {
      alarmName: `EveryoneCook-${this.config.environment}-DynamoDB-Read-Throttle`,
      alarmDescription: 'DynamoDB read throttles > 10 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ReadThrottleEvents',
        dimensionsMap: { TableName: dynamoTableName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dynamoReadThrottleAlarm.addAlarmAction(alarmAction);
    alarms.push(dynamoReadThrottleAlarm);

    // DynamoDB: Write Throttles (Critical)
    const dynamoWriteThrottleAlarm = new cloudwatch.Alarm(this, 'DynamoDB-Write-Throttle', {
      alarmName: `EveryoneCook-${this.config.environment}-DynamoDB-Write-Throttle`,
      alarmDescription: 'DynamoDB write throttles > 10 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'WriteThrottleEvents',
        dimensionsMap: { TableName: dynamoTableName },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dynamoWriteThrottleAlarm.addAlarmAction(alarmAction);
    alarms.push(dynamoWriteThrottleAlarm);

    // DynamoDB: High Latency (Warning)
    const dynamoLatencyAlarm = new cloudwatch.Alarm(this, 'DynamoDB-Latency-High', {
      alarmName: `EveryoneCook-${this.config.environment}-DynamoDB-Latency-High`,
      alarmDescription: 'DynamoDB P99 latency > 100ms in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'SuccessfulRequestLatency',
        dimensionsMap: {
          TableName: dynamoTableName,
          Operation: 'Query',
        },
        statistic: 'p99',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100, // 100ms
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dynamoLatencyAlarm.addAlarmAction(alarmAction);
    alarms.push(dynamoLatencyAlarm);

    // Step 6: S3 Alarms
    const contentBucketName = props.coreStack.contentBucket.bucketName;

    // S3: High 4XX Error Rate (Warning)
    const s34xxAlarm = new cloudwatch.Alarm(this, 'S3-4XX-Warning', {
      alarmName: `EveryoneCook-${this.config.environment}-S3-4XX-Warning`,
      alarmDescription: 'S3 4XX error rate > 5% in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '4xxErrors',
        dimensionsMap: {
          BucketName: contentBucketName,
          FilterId: 'EntireBucket',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    s34xxAlarm.addAlarmAction(alarmAction);
    alarms.push(s34xxAlarm);

    // S3: Any 5XX Errors (Critical)
    const s35xxAlarm = new cloudwatch.Alarm(this, 'S3-5XX-Critical', {
      alarmName: `EveryoneCook-${this.config.environment}-S3-5XX-Critical`,
      alarmDescription: 'S3 5XX errors > 0 in 5 minutes',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '5xxErrors',
        dimensionsMap: {
          BucketName: contentBucketName,
          FilterId: 'EntireBucket',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    s35xxAlarm.addAlarmAction(alarmAction);
    alarms.push(s35xxAlarm);

    // Step 7: Cost Alarms
    // Cost: Daily Warning ($50/day)
    const costWarningAlarm = new cloudwatch.Alarm(this, 'Cost-Warning', {
      alarmName: `EveryoneCook-${this.config.environment}-Cost-Warning`,
      alarmDescription: 'Daily cost > $50',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.hours(24),
      }),
      threshold: 50,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    costWarningAlarm.addAlarmAction(alarmAction);
    alarms.push(costWarningAlarm);

    // Cost: Daily Critical ($100/day)
    const costCriticalAlarm = new cloudwatch.Alarm(this, 'Cost-Critical', {
      alarmName: `EveryoneCook-${this.config.environment}-Cost-Critical`,
      alarmDescription: 'Daily cost > $100',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: { Currency: 'USD' },
        statistic: 'Maximum',
        period: cdk.Duration.hours(24),
      }),
      threshold: 100,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    costCriticalAlarm.addAlarmAction(alarmAction);
    alarms.push(costCriticalAlarm);

    // Step 8: SQS Alarms (if BackendStack has queues)
    if (props.backendStack) {
      // SQS: DLQ Messages (Critical)
      const sqsDLQAlarm = new cloudwatch.Alarm(this, 'SQS-DLQ-Messages', {
        alarmName: `EveryoneCook-${this.config.environment}-SQS-DLQ-Messages`,
        alarmDescription: 'Messages in Dead Letter Queue > 0',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateNumberOfMessagesVisible',
          statistic: 'Maximum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      sqsDLQAlarm.addAlarmAction(alarmAction);
      alarms.push(sqsDLQAlarm);

      // SQS: Queue Age (Warning)
      const sqsAgeAlarm = new cloudwatch.Alarm(this, 'SQS-Queue-Age', {
        alarmName: `EveryoneCook-${this.config.environment}-SQS-Queue-Age`,
        alarmDescription: 'Oldest message age > 5 minutes',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/SQS',
          metricName: 'ApproximateAgeOfOldestMessage',
          statistic: 'Maximum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 300, // 5 minutes in seconds
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      sqsAgeAlarm.addAlarmAction(alarmAction);
      alarms.push(sqsAgeAlarm);
    }

    return alarms;
  }

  /**
   * Create Composite Alarm for overall system health
   * Task 7.4.2 - Step 2
   */
  private createCompositeAlarm(alarms: cloudwatch.IAlarm[]): cloudwatch.CompositeAlarm {
    // Filter critical alarms only
    const criticalAlarms = alarms.filter(
      (alarm) => alarm.alarmName.includes('Critical') || alarm.alarmName.includes('Throttle')
    );

    // If no critical alarms, use all alarms
    const alarmsToUse = criticalAlarms.length > 0 ? criticalAlarms : alarms;

    const compositeAlarm = new cloudwatch.CompositeAlarm(this, 'SystemHealth', {
      compositeAlarmName: `EveryoneCook-${this.config.environment}-SystemHealth`,
      alarmDescription: 'Overall system health - triggers if any critical alarm fires',
      alarmRule:
        alarmsToUse.length > 0
          ? cloudwatch.AlarmRule.anyOf(
              ...alarmsToUse.map((alarm) =>
                cloudwatch.AlarmRule.fromAlarm(alarm, cloudwatch.AlarmState.ALARM)
              )
            )
          : cloudwatch.AlarmRule.fromBoolean(false), // Fallback if no alarms
    });

    compositeAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(this.alarmTopic));

    return compositeAlarm;
  }

  /**
   * Create Core Dashboard (DynamoDB, S3, CloudFront)
   * Task 7.4.1 - Step 1
   */
  private createCoreDashboard(props: ObservabilityStackProps): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'CoreDashboard', {
      dashboardName: `EveryoneCook-${this.config.environment}-Core`,
    });

    const dynamoTableName = props.coreStack.table.tableName;
    const contentBucketName = props.coreStack.contentBucket.bucketName;
    const distributionId = props.coreStack.distribution.distributionId;

    // DynamoDB Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Read/Write Capacity',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedReadCapacityUnits',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ConsumedWriteCapacityUnits',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Throttles',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'WriteThrottleEvents',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'DynamoDB - Latency (P99)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'SuccessfulRequestLatency',
            dimensionsMap: {
              TableName: dynamoTableName,
              Operation: 'Query',
            },
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'SuccessfulRequestLatency',
            dimensionsMap: {
              TableName: dynamoTableName,
              Operation: 'GetItem',
            },
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'DynamoDB - Table Size',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'TableSize',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Average',
            period: cdk.Duration.hours(1),
          }),
        ],
        width: 12,
      })
    );

    // S3 Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'S3 - Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'AllRequests',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'S3 - Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: '4xxErrors',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: '5xxErrors',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // CloudFront Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'CloudFront - Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: 'Requests',
            dimensionsMap: { DistributionId: distributionId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'CloudFront - Error Rate',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '4xxErrorRate',
            dimensionsMap: { DistributionId: distributionId },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '5xxErrorRate',
            dimensionsMap: { DistributionId: distributionId },
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'CloudFront - Bytes Downloaded',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: 'BytesDownloaded',
            dimensionsMap: { DistributionId: distributionId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 24,
      })
    );

    return dashboard;
  }

  /**
   * Create Auth Dashboard (Cognito)
   * Task 7.4.1 - Step 2
   */
  private createAuthDashboard(props: ObservabilityStackProps): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'AuthDashboard', {
      dashboardName: `EveryoneCook-${this.config.environment}-Auth`,
    });

    if (!props.authStack) {
      // Add placeholder text if AuthStack not provided
      dashboard.addWidgets(
        new cloudwatch.TextWidget({
          markdown: '# Auth Dashboard\n\nAuthStack not yet deployed.',
          width: 24,
          height: 2,
        })
      );
      return dashboard;
    }

    const userPoolId = props.authStack.userPool.userPoolId;

    // Cognito Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cognito - Sign-ups',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Cognito',
            metricName: 'UserSignUp',
            dimensionsMap: { UserPool: userPoolId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cognito - Sign-ins',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Cognito',
            metricName: 'UserAuthentication',
            dimensionsMap: { UserPool: userPoolId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Cognito - Failed Authentications',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Cognito',
            metricName: 'UserAuthenticationFailed',
            dimensionsMap: { UserPool: userPoolId },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 24,
      })
    );

    return dashboard;
  }

  /**
   * Create Backend Dashboard (API Gateway, Lambda, SQS)
   * Task 7.4.1 - Step 3
   */
  private createBackendDashboard(props: ObservabilityStackProps): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'BackendDashboard', {
      dashboardName: `EveryoneCook-${this.config.environment}-Backend`,
    });

    if (!props.backendStack) {
      // Add placeholder text if BackendStack not provided
      dashboard.addWidgets(
        new cloudwatch.TextWidget({
          markdown: '# Backend Dashboard\n\nBackendStack not yet deployed.',
          width: 24,
          height: 2,
        })
      );
      return dashboard;
    }

    const apiName = props.backendStack.api.restApiName;

    // API Gateway Metrics
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Count',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Latency (P50, P95, P99)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p50',
            period: cdk.Duration.minutes(5),
            label: 'P50',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p95',
            period: cdk.Duration.minutes(5),
            label: 'P95',
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: 'Latency',
            dimensionsMap: { ApiName: apiName },
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
            label: 'P99',
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - 4XX Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '4XXError',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - 5XX Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/ApiGateway',
            metricName: '5XXError',
            dimensionsMap: { ApiName: apiName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // Lambda Metrics (Aggregate)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Invocations',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Invocations',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Duration (P99)',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            statistic: 'p99',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda - Errors',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda - Throttles',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Throttles',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    // SQS Metrics (Aggregate)
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SQS - Messages Sent',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'NumberOfMessagesSent',
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'SQS - Messages Visible',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateNumberOfMessagesVisible',
            statistic: 'Average',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 12,
      })
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'SQS - Oldest Message Age',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/SQS',
            metricName: 'ApproximateAgeOfOldestMessage',
            statistic: 'Maximum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 24,
      })
    );

    return dashboard;
  }

  /**
   * Create Overview Dashboard (Aggregated view)
   * Task 7.4.1 - Step 5
   */
  private createOverviewDashboard(props: ObservabilityStackProps): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'OverviewDashboard', {
      dashboardName: `EveryoneCook-${this.config.environment}-Overview`,
    });

    // System Health Header
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: `# Everyone Cook - System Overview\n\n**Environment:** ${this.config.environment}\n\n**Region:** ${this.region}`,
        width: 24,
        height: 2,
      })
    );

    // Key Metrics Row 1: API & Lambda
    if (props.backendStack) {
      const apiName = props.backendStack.api.restApiName;

      dashboard.addWidgets(
        new cloudwatch.SingleValueWidget({
          title: 'API Requests (5m)',
          metrics: [
            new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: 'Count',
              dimensionsMap: { ApiName: apiName },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          ],
          width: 6,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'API P99 Latency',
          metrics: [
            new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: 'Latency',
              dimensionsMap: { ApiName: apiName },
              statistic: 'p99',
              period: cdk.Duration.minutes(5),
            }),
          ],
          width: 6,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'Lambda Invocations (5m)',
          metrics: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Invocations',
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          ],
          width: 6,
        }),
        new cloudwatch.SingleValueWidget({
          title: 'Lambda Errors (5m)',
          metrics: [
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Errors',
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
            }),
          ],
          width: 6,
        })
      );
    }

    // Key Metrics Row 2: DynamoDB & S3
    const dynamoTableName = props.coreStack.table.tableName;
    const contentBucketName = props.coreStack.contentBucket.bucketName;

    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'DynamoDB Read Throttles',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'ReadThrottleEvents',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'DynamoDB Write Throttles',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/DynamoDB',
            metricName: 'WriteThrottleEvents',
            dimensionsMap: { TableName: dynamoTableName },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'S3 Requests (5m)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: 'AllRequests',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'S3 Errors (5m)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: '4xxErrors',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/S3',
            metricName: '5xxErrors',
            dimensionsMap: {
              BucketName: contentBucketName,
              FilterId: 'EntireBucket',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
        ],
        width: 6,
      })
    );

    // Error Rate Trends
    if (props.backendStack) {
      const apiName = props.backendStack.api.restApiName;

      dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: 'Error Rates - Last Hour',
          left: [
            new cloudwatch.Metric({
              namespace: 'AWS/ApiGateway',
              metricName: '5XXError',
              dimensionsMap: { ApiName: apiName },
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
              label: 'API 5XX',
            }),
            new cloudwatch.Metric({
              namespace: 'AWS/Lambda',
              metricName: 'Errors',
              statistic: 'Sum',
              period: cdk.Duration.minutes(5),
              label: 'Lambda Errors',
            }),
          ],
          width: 24,
        })
      );
    }

    // Cost Tracking
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Estimated Daily Cost',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: { Currency: 'USD' },
            statistic: 'Maximum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Cost Trend - Last 7 Days',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: { Currency: 'USD' },
            statistic: 'Maximum',
            period: cdk.Duration.hours(24),
          }),
        ],
        width: 12,
      })
    );

    // Alarm Status
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: 'Alarm Status',
        alarms: [this.compositeAlarm],
        width: 24,
      })
    );

    return dashboard;
  }
}
