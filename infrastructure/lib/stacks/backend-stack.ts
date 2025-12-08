import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';
import * as path from 'path';

// Task 5.1.7: Import Route 53 for custom domain DNS configuration
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

// Import Shared Dependencies Layer
import { SharedDependenciesLayer } from '../constructs/shared-layer';

/**
 * Backend Stack Props
 * Extends BaseStackProps with dependencies from CoreStack and AuthStack
 */
export interface BackendStackProps extends BaseStackProps {
  /**
   * DynamoDB table from CoreStack
   * Required for Lambda functions to access data
   */
  dynamoTable: cdk.aws_dynamodb.ITable;

  /**
   * S3 content bucket from CoreStack
   * Required for file upload operations
   */
  contentBucket: cdk.aws_s3.IBucket;

  /**
   * CloudFront Distribution from CoreStack
   * Required for WAF WebACL association
   */
  distribution: cdk.aws_cloudfront.IDistribution;

  /**
   * Cognito User Pool from AuthStack
   * Required for API Gateway Cognito Authorizer
   */
  userPool: cdk.aws_cognito.IUserPool;

  /**
   * Cognito User Pool Client from AuthStack
   * Required for API Gateway configuration
   */
  userPoolClient: cdk.aws_cognito.IUserPoolClient;
}

/**
 * Backend Stack for Everyone Cook Infrastructure
 *
 * This stack contains the application layer infrastructure:
 * - API Gateway REST API with Cognito Authorizer
 * - Lambda Functions (5 modules: auth, social, recipe, ai, admin)
 * - SQS Queues (6 queues for async processing)
 * - Worker Lambdas (6 workers for event processing)
 * - WAF WebACLs (API Gateway + CloudFront protection)
 *
 * This is the third stack to deploy (after CoreStack and AuthStack).
 * It consolidates the original EventStack and SecurityStack for better manageability.
 *
 * Stack Consolidation (5-Stack Architecture):
 * - Application Layer: API Gateway, Lambda Functions
 * - Event Layer: SQS Queues, Worker Lambdas
 * - Security Layer: WAF WebACLs
 *
 * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy - Backend Stack)
 * @see .kiro/specs/project-restructure/event-driven-architecture.md - SQS/SNS architecture
 * @see .kiro/specs/project-restructure/security-architecture.md - WAF configuration
 * @see .kiro/specs/project-restructure/design.md - Backend Stack structure
 */
export class BackendStack extends BaseStack {
  // Lambda Layer
  public readonly sharedLayer: SharedDependenciesLayer;

  // API Gateway
  public readonly api: cdk.aws_apigateway.RestApi;
  public readonly cognitoAuthorizer: cdk.aws_apigateway.CognitoUserPoolsAuthorizer;
  public readonly apiDomainName: cdk.aws_apigateway.DomainName;

  // Request Validators
  public readonly bodyValidator: cdk.aws_apigateway.RequestValidator;
  public readonly paramsValidator: cdk.aws_apigateway.RequestValidator;
  public readonly fullValidator: cdk.aws_apigateway.RequestValidator;

  // Lambda Functions (5 modules)
  public readonly apiRouterFunction: cdk.aws_lambda.Function;
  public readonly authUserFunction: cdk.aws_lambda.Function;
  public readonly socialFunction: cdk.aws_lambda.Function;
  public readonly recipeAIFunction: cdk.aws_lambda.Function;
  public readonly adminFunction: cdk.aws_lambda.Function;
  public readonly uploadFunction: cdk.aws_lambda.Function;

  // SQS Queues (4 queues)
  public readonly aiQueue: cdk.aws_sqs.Queue;
  public readonly imageProcessingQueue: cdk.aws_sqs.Queue;
  public readonly analyticsQueue: cdk.aws_sqs.Queue;
  public readonly notificationQueue: cdk.aws_sqs.Queue;

  // Dead Letter Queues
  public readonly aiDLQ: cdk.aws_sqs.Queue;
  public readonly imageDLQ: cdk.aws_sqs.Queue;
  public readonly analyticsDLQ: cdk.aws_sqs.Queue;
  public readonly notificationDLQ: cdk.aws_sqs.Queue;

  // Worker Lambdas
  public readonly aiWorker: cdk.aws_lambda.Function;
  public readonly imageWorker?: cdk.aws_lambda.Function;
  public readonly analyticsWorker?: cdk.aws_lambda.Function;
  public readonly notificationWorker?: cdk.aws_lambda.Function;

  // WAF WebACLs
  public readonly apiGatewayWebAcl?: cdk.aws_wafv2.CfnWebACL;
  // Note: CloudFront WAF removed for cost optimization (Shield Standard provides DDoS protection)

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Add stack-specific tags for cost tracking
    cdk.Tags.of(this).add('StackType', 'Backend');
    cdk.Tags.of(this).add('Layer', 'Application');
    cdk.Tags.of(this).add('CostCenter', `Backend-${this.config.environment}`);

    // Create Shared Dependencies Lambda Layer
    // This layer contains common dependencies used across all Lambda functions:
    // - AWS SDK v3 clients (DynamoDB, Lambda, Cognito, S3, SQS, Bedrock)
    // - uuid, jsonwebtoken, jwks-rsa
    // Benefits: 90% reduction in deployment size (8MB → 200KB per Lambda)
    this.sharedLayer = new SharedDependenciesLayer(this, 'SharedDependenciesLayer');

    // Task 5.1.2: Create SQS Queues and DLQs (Event Layer)
    // Create Dead Letter Queues first
    this.aiDLQ = this.createDeadLetterQueue('AI');
    this.imageDLQ = this.createDeadLetterQueue('ImageProcessing');
    this.analyticsDLQ = this.createDeadLetterQueue('Analytics');
    this.notificationDLQ = this.createDeadLetterQueue('Notification');

    // Create main queues with DLQ configuration
    this.aiQueue = this.createAIQueue();
    this.imageProcessingQueue = this.createImageProcessingQueue();
    this.analyticsQueue = this.createAnalyticsQueue();
    this.notificationQueue = this.createNotificationQueue();

    // Task 5.1.2: Create API Gateway REST API (Application Layer)
    this.api = this.createAPIGateway();
    this.cognitoAuthorizer = this.createCognitoAuthorizer(this.api, props.userPool);

    // Task 5.1.5: Create Request Validators
    this.bodyValidator = this.createBodyValidator(this.api);
    this.paramsValidator = this.createParamsValidator(this.api);
    this.fullValidator = this.createFullValidator(this.api);

    // Task 5.1.7: Configure API Gateway custom domain
    // Creates ACM certificate in ap-southeast-1 for API Gateway Regional endpoint
    // Certificate validation takes 5-10 minutes via Route 53 DNS
    this.apiDomainName = this.createApiCustomDomain(this.api);

    // Task 5.3.6: Create Auth & User Lambda Function (must be created before API Router)
    this.authUserFunction = this.createAuthUserLambda(props);

    // Task 5.4.8: Create Social Lambda Function
    this.socialFunction = this.createSocialLambda(props);

    // Task 5.5.9: Create Recipe & AI Lambda Function
    this.recipeAIFunction = this.createRecipeAILambda(props);

    // Task 5.6.5: Create Admin Lambda Function
    this.adminFunction = this.createAdminLambda(props);

    // Task 5.7.5: Create Upload Lambda Function
    this.uploadFunction = this.createUploadLambda(props);

    // Task 5.2.3: Create API Router Lambda Function (must be created after target Lambdas)
    this.apiRouterFunction = this.createApiRouterLambda(props);

    // Task 5.1.3: Create Worker Lambda Functions (Event Layer)
    this.aiWorker = this.createAIWorker(props);
    this.imageWorker = this.createImageWorker(props);
    // NOTE: Email/Notification workers integrated into existing modules:
    // - Email sending: Admin Module (ban user, delete post notifications)
    // - In-app notifications: Social Module (like, comment, friend request)
    // TODO: Implement analytics worker when needed
    // this.analyticsWorker = this.createAnalyticsWorker(props);

    // Task 5.8: Create WAF WebACLs (Security Layer)
    // Task 5.8.1: Create WAF Web ACL for API Gateway (REGIONAL scope)
    this.apiGatewayWebAcl = this.createApiGatewayWebAcl();
    this.associateWafWithApiGateway();
    this.createWafCloudWatchAlarms();
    // Task 5.8.2: CloudFront WAF removed for cost optimization (Shield Standard provides DDoS protection)
    // Task 5.8.3: Configure WAF logging and monitoring
    this.configureWafLogging();

    // Export stack outputs for cross-stack references
    this.exportOutputs();
  }

  /**
   * Create Dead Letter Queue for failed message handling
   *
   * Features:
   * - 14-day message retention (maximum allowed)
   * - Encryption at rest with AWS managed keys
   * - CloudWatch alarms for DLQ message count
   *
   * @param queueName - Name of the queue (e.g., 'AI', 'Email')
   * @returns Dead Letter Queue
   */
  private createDeadLetterQueue(queueName: string): cdk.aws_sqs.Queue {
    const dlq = new cdk.aws_sqs.Queue(this, `${queueName}DLQ`, {
      queueName: `everyonecook-${this.config.environment}-${queueName.toLowerCase()}-dlq`,
      retentionPeriod: cdk.Duration.days(14), // Maximum retention for investigation
      encryption: cdk.aws_sqs.QueueEncryption.KMS_MANAGED,
    });

    // Add tags
    cdk.Tags.of(dlq).add('Component', 'EventProcessing');
    cdk.Tags.of(dlq).add('QueueType', 'DeadLetter');
    cdk.Tags.of(dlq).add('Purpose', `${queueName}-DLQ`);

    // Create CloudWatch alarm for DLQ messages
    if (this.config.cloudwatch.alarms.enabled) {
      new cdk.aws_cloudwatch.Alarm(this, `${queueName}DLQAlarm`, {
        alarmName: `EveryoneCook-${this.config.environment}-${queueName}-DLQ-Messages`,
        alarmDescription: `Alert when ${queueName} DLQ receives messages`,
        metric: dlq.metricApproximateNumberOfMessagesVisible(),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return dlq;
  }

  /**
   * Create AI Queue for Bedrock AI requests
   *
   * Features:
   * - 2-minute visibility timeout (AI processing time)
   * - 4-day message retention
   * - Dead letter queue with 3 max receive count
   * - Encryption at rest with AWS managed keys
   *
   * @see .kiro/specs/project-restructure/event-driven-architecture.md - AI Queue configuration
   * @returns AI Queue
   */
  private createAIQueue(): cdk.aws_sqs.Queue {
    const queue = new cdk.aws_sqs.Queue(this, 'AIQueue', {
      queueName: `everyonecook-${this.config.environment}-ai-queue`,
      visibilityTimeout: cdk.Duration.seconds(120), // 2 minutes for AI processing
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.aiDLQ,
        maxReceiveCount: 3,
      },
      encryption: cdk.aws_sqs.QueueEncryption.KMS_MANAGED,
    });

    // Add tags
    cdk.Tags.of(queue).add('Component', 'EventProcessing');
    cdk.Tags.of(queue).add('QueueType', 'Main');
    cdk.Tags.of(queue).add('Purpose', 'AI-Processing');

    // Create CloudWatch alarm for queue depth
    if (this.config.cloudwatch.alarms.enabled) {
      new cdk.aws_cloudwatch.Alarm(this, 'AIQueueDepthAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-AI-Queue-Depth`,
        alarmDescription: 'Alert when AI Queue depth exceeds threshold (potential backlog)',
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        threshold: 100, // Alert if more than 100 messages waiting
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return queue;
  }

  /**
   * Create Image Processing Queue for S3 image operations
   *
   * Features:
   * - 60-second visibility timeout (image processing time)
   * - 4-day message retention
   * - Dead letter queue with 3 max receive count
   * - Encryption at rest with AWS managed keys
   *
   * @see .kiro/specs/project-restructure/event-driven-architecture.md - Image Queue configuration
   * @returns Image Processing Queue
   */
  private createImageProcessingQueue(): cdk.aws_sqs.Queue {
    const queue = new cdk.aws_sqs.Queue(this, 'ImageProcessingQueue', {
      queueName: `everyonecook-${this.config.environment}-image-queue`,
      visibilityTimeout: cdk.Duration.seconds(60),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.imageDLQ,
        maxReceiveCount: 3,
      },
      encryption: cdk.aws_sqs.QueueEncryption.KMS_MANAGED,
    });

    // Add tags
    cdk.Tags.of(queue).add('Component', 'EventProcessing');
    cdk.Tags.of(queue).add('QueueType', 'Main');
    cdk.Tags.of(queue).add('Purpose', 'Image-Processing');

    // Create CloudWatch alarm for queue depth
    if (this.config.cloudwatch.alarms.enabled) {
      new cdk.aws_cloudwatch.Alarm(this, 'ImageQueueDepthAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Image-Queue-Depth`,
        alarmDescription: 'Alert when Image Queue depth exceeds threshold',
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        threshold: 50, // Alert if more than 50 images waiting
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return queue;
  }

  /**
   * Create Analytics Queue for batch analytics writes
   *
   * Features:
   * - 30-second visibility timeout (batch write time)
   * - 4-day message retention
   * - Dead letter queue with 3 max receive count
   * - Encryption at rest with AWS managed keys
   *
   * @see .kiro/specs/project-restructure/event-driven-architecture.md - Analytics Queue configuration
   * @returns Analytics Queue
   */
  private createAnalyticsQueue(): cdk.aws_sqs.Queue {
    const queue = new cdk.aws_sqs.Queue(this, 'AnalyticsQueue', {
      queueName: `everyonecook-${this.config.environment}-analytics-queue`,
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.analyticsDLQ,
        maxReceiveCount: 3,
      },
      encryption: cdk.aws_sqs.QueueEncryption.KMS_MANAGED,
    });

    // Add tags
    cdk.Tags.of(queue).add('Component', 'EventProcessing');
    cdk.Tags.of(queue).add('QueueType', 'Main');
    cdk.Tags.of(queue).add('Purpose', 'Analytics-Batch');

    // Create CloudWatch alarm for queue depth
    if (this.config.cloudwatch.alarms.enabled) {
      new cdk.aws_cloudwatch.Alarm(this, 'AnalyticsQueueDepthAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Analytics-Queue-Depth`,
        alarmDescription: 'Alert when Analytics Queue depth exceeds threshold',
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        threshold: 200, // Alert if more than 200 analytics events waiting
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return queue;
  }

  /**
   * Create Notification Queue for SNS push notifications
   *
   * Features:
   * - 30-second visibility timeout (notification sending time)
   * - 4-day message retention
   * - Dead letter queue with 3 max receive count
   * - Encryption at rest with AWS managed keys
   *
   * @see .kiro/specs/project-restructure/event-driven-architecture.md - Notification Queue configuration
   * @returns Notification Queue
   */
  private createNotificationQueue(): cdk.aws_sqs.Queue {
    const queue = new cdk.aws_sqs.Queue(this, 'NotificationQueue', {
      queueName: `everyonecook-${this.config.environment}-notification-queue`,
      visibilityTimeout: cdk.Duration.seconds(30),
      retentionPeriod: cdk.Duration.days(4),
      deadLetterQueue: {
        queue: this.notificationDLQ,
        maxReceiveCount: 3,
      },
      encryption: cdk.aws_sqs.QueueEncryption.KMS_MANAGED,
    });

    // Add tags
    cdk.Tags.of(queue).add('Component', 'EventProcessing');
    cdk.Tags.of(queue).add('QueueType', 'Main');
    cdk.Tags.of(queue).add('Purpose', 'Notification-Sending');

    // Create CloudWatch alarm for queue depth
    if (this.config.cloudwatch.alarms.enabled) {
      new cdk.aws_cloudwatch.Alarm(this, 'NotificationQueueDepthAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Notification-Queue-Depth`,
        alarmDescription: 'Alert when Notification Queue depth exceeds threshold',
        metric: queue.metricApproximateNumberOfMessagesVisible(),
        threshold: 500, // Alert if more than 500 notifications waiting
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return queue;
  }

  /**
   * Create API Gateway REST API with production settings
   *
   * Features:
   * - Stage: v1
   * - CORS enabled for everyonecook.cloud
   * - Throttling: 10K req/sec, burst 5K
   * - CloudWatch logging enabled
   * - Request/response logging
   * - Caching enabled for production (0.5GB cache, 5-minute TTL)
   * - Cache data encryption enabled
   * - Compression enabled (responses >1KB)
   *
   * Caching Strategy (Production Only):
   * - Cache cluster size: 0.5GB (~$14.60/month)
   * - Cache TTL: 300 seconds (5 minutes)
   * - Cache key parameters: Authorization header, query strings
   * - Cache invalidation: Automatic on PUT/POST/DELETE/PATCH methods
   * - Target cache hit rate: >70%
   * - Cost benefit: Reduces Lambda invocations by 70% = ~$0.14/month savings
   * - UX benefit: Response time <50ms (vs 200ms without cache)
   *
   * Compression Strategy (Task 5.1.6):
   * - Minimum compression size: 1024 bytes (1KB)
   * - Compression algorithms: gzip, deflate
   * - Content-Encoding header: Automatically added by API Gateway
   * - Cost benefit: 70% data transfer reduction
   * - UX benefit: Faster response times, reduced bandwidth
   *
   * @see .kiro/specs/project-restructure/design.md - API Gateway Layer section
   * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy), Req 11 (Cost Optimization)
   * @see .kiro/specs/project-restructure/tasks.md - Task 5.1.4 (API Gateway caching), Task 5.1.6 (API Gateway compression)
   * @returns API Gateway REST API
   */
  private createAPIGateway(): cdk.aws_apigateway.RestApi {
    // Determine if caching should be enabled based on environment config
    const cachingEnabled = this.config.apiGateway.caching.enabled;

    // Task 5.1.6: Determine if compression should be enabled based on environment config
    const compressionEnabled = this.config.apiGateway.compression;

    const api = new cdk.aws_apigateway.RestApi(this, 'EveryoneCookAPI', {
      restApiName: `EveryoneCook-API-${this.config.environment}`,
      description: `Everyone Cook REST API - ${this.config.environment}`,

      // Task 5.1.6 Step 1: Enable compression for responses >1KB
      // Step 2: Configure minimum compression size: 1024 bytes
      minCompressionSize: compressionEnabled ? cdk.Size.kibibytes(1) : undefined,

      // Deploy options
      deployOptions: {
        stageName: 'api',

        // Task 5.1.4: Caching configuration (production only)
        // Step 1: Enable caching for production stage
        cachingEnabled: cachingEnabled,
        cacheClusterEnabled: cachingEnabled,

        // Step 2: Configure cache cluster size: 0.5GB
        cacheClusterSize: cachingEnabled ? this.config.apiGateway.caching.cacheSize : undefined,

        // Step 3: Set cache TTL: 300 seconds (5 minutes)
        cacheTtl: cachingEnabled
          ? cdk.Duration.seconds(this.config.apiGateway.caching.ttl)
          : undefined,

        // Step 4: Enable cache data encryption
        cacheDataEncrypted: cachingEnabled,

        // Throttling settings
        throttlingRateLimit: this.config.apiGateway.throttling.rateLimit,
        throttlingBurstLimit: this.config.apiGateway.throttling.burstLimit,

        // X-Ray Tracing - Disabled
        // CloudWatch Logs is sufficient for debugging Lambda and API Gateway
        // X-Ray adds ~$5-50/month cost without significant benefit for this project
        tracingEnabled: false,

        // Logging configuration
        loggingLevel: cdk.aws_apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: this.config.environment !== 'prod', // Disable in prod for cost
        metricsEnabled: true,

        // Access logging
        accessLogDestination: new cdk.aws_apigateway.LogGroupLogDestination(
          new cdk.aws_logs.LogGroup(this, 'APIGatewayAccessLogs', {
            logGroupName: `/aws/apigateway/everyonecook-${this.config.environment}`,
            retention: this.config.cloudwatch.logRetentionDays,
            removalPolicy:
              this.config.environment === 'prod'
                ? cdk.RemovalPolicy.RETAIN
                : cdk.RemovalPolicy.DESTROY,
          })
        ),
        accessLogFormat: cdk.aws_apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
      },

      // CORS configuration
      defaultCorsPreflightOptions: {
        allowOrigins: [
          `https://${this.config.domains.frontend}`,
          `https://www.${this.config.domains.frontend}`,
          `https://everyonecook.cloud`,
          `https://www.everyonecook.cloud`,
          ...(this.config.environment !== 'prod' ? ['http://localhost:3000'] : []),
        ],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Correlation-Id',
          'Cache-Control', // Task 5.1.4 Step 6: Add Cache-Control header support
          'Accept-Encoding', // Task 5.1.6 Step 3: Add Accept-Encoding header for compression
        ],
        allowCredentials: false, // Not needed - auth via Bearer token header, not cookies
        maxAge: cdk.Duration.hours(1),
      },

      // Default 4XX and 5XX responses with CORS headers
      defaultMethodOptions: {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '400',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '401',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '403',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '404',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
          {
            statusCode: '500',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true,
            },
          },
        ],
      },

      // CloudWatch role for logging
      cloudWatchRole: true,

      // Endpoint configuration
      endpointConfiguration: {
        types: [cdk.aws_apigateway.EndpointType.REGIONAL],
      },

      // Binary media types
      binaryMediaTypes: ['image/*', 'application/octet-stream'],
    });

    // Add Gateway Responses with CORS headers for error responses
    // This ensures CORS headers are present even when Lambda is not invoked
    // Note: Using '*' for origin without credentials since Gateway Responses can't dynamically
    // set origin based on request. For actual API responses, Lambda handlers set specific origins.
    const corsHeaders = {
      'gatewayresponse.header.Access-Control-Allow-Origin': "'*'",
      'gatewayresponse.header.Access-Control-Allow-Headers':
        "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token,X-Correlation-Id'",
      'gatewayresponse.header.Access-Control-Allow-Methods': "'GET,POST,PUT,DELETE,PATCH,OPTIONS'",
    };

    // Add CORS headers to common error responses
    api.addGatewayResponse('Unauthorized', {
      type: cdk.aws_apigateway.ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: corsHeaders,
    });

    api.addGatewayResponse('AccessDenied', {
      type: cdk.aws_apigateway.ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: corsHeaders,
    });

    api.addGatewayResponse('Default4XX', {
      type: cdk.aws_apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsHeaders,
    });

    api.addGatewayResponse('Default5XX', {
      type: cdk.aws_apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsHeaders,
    });

    // Add tags
    cdk.Tags.of(api).add('Component', 'API');
    cdk.Tags.of(api).add('Layer', 'Application');
    cdk.Tags.of(api).add('Purpose', 'REST-API');

    // Task 5.1.4 Step 8: Create CloudWatch alarm for cache hit rate monitoring
    if (cachingEnabled && this.config.cloudwatch.alarms.enabled) {
      // Cache hit rate metric (target >70%)
      const cacheHitMetric = new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'CacheHitCount',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'v1',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      });

      const cacheMissMetric = new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'CacheMissCount',
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: 'v1',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      });

      // Calculate cache hit rate: hits / (hits + misses) * 100
      const cacheHitRate = new cdk.aws_cloudwatch.MathExpression({
        expression: '(hits / (hits + misses)) * 100',
        usingMetrics: {
          hits: cacheHitMetric,
          misses: cacheMissMetric,
        },
        period: cdk.Duration.minutes(5),
      });

      // Alarm when cache hit rate drops below 70%
      new cdk.aws_cloudwatch.Alarm(this, 'CacheHitRateAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-API-CacheHitRate-Low`,
        alarmDescription: 'Alert when API Gateway cache hit rate drops below 70% (target >70%)',
        metric: cacheHitRate,
        threshold: 70,
        evaluationPeriods: 2,
        comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return api;
  }

  /**
   * Create Cognito User Pools Authorizer for API Gateway
   *
   * Features:
   * - Validates JWT tokens from Cognito User Pool
   * - Caches authorization decisions for 5 minutes
   * - Extracts user identity from Authorization header
   *
   * @param api - API Gateway REST API
   * @param userPool - Cognito User Pool from AuthStack
   * @see .kiro/specs/project-restructure/security-architecture.md - Authentication section
   * @returns Cognito User Pools Authorizer
   */
  private createCognitoAuthorizer(
    api: cdk.aws_apigateway.RestApi,
    userPool: cdk.aws_cognito.IUserPool
  ): cdk.aws_apigateway.CognitoUserPoolsAuthorizer {
    const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
        authorizerName: `EveryoneCook-Authorizer-${this.config.environment}`,
        identitySource: 'method.request.header.Authorization',
        resultsCacheTtl: cdk.Duration.minutes(5), // Cache authorization decisions
      }
    );

    // Attach authorizer to API
    authorizer._attachToApi(api);

    return authorizer;
  }

  /**
   * Configure method-level caching for API Gateway
   *
   * This helper method configures caching behavior for individual API methods.
   * It should be called when adding methods to API resources.
   *
   * Task 5.1.4 Implementation:
   * - Step 5: Configure cache key parameters (Authorization header, query strings)
   * - Step 6: Add Cache-Control headers to responses
   * - Step 7: Setup cache invalidation on PUT/POST/DELETE/PATCH methods
   *
   * Features:
   * - GET methods: Enable caching with Authorization header as cache key
   * - POST/PUT/DELETE/PATCH methods: Disable caching (always fresh data)
   * - Cache-Control headers: Added to all responses
   * - Query string parameters: Included in cache key
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param requiresAuth - Whether the method requires authentication
   * @returns Method options for API Gateway method configuration
   *
   * @example
   * ```typescript
   * const getUserMethod = usersResource.addMethod(
   *   'GET',
   *   userIntegration,
   *   this.getMethodCachingOptions('GET', true)
   * );
   * ```
   *
   * @see .kiro/specs/project-restructure/tasks.md - Task 5.1.4
   * @see .kiro/specs/project-restructure/requirements.md - Req 11 (Cost Optimization)
   */
  public getMethodCachingOptions(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    requiresAuth: boolean = true
  ): Partial<cdk.aws_apigateway.MethodOptions> {
    const cachingEnabled = this.config.apiGateway.caching.enabled;

    // Base options for all methods
    const baseOptions: Partial<cdk.aws_apigateway.MethodOptions> = {
      authorizationType: requiresAuth
        ? cdk.aws_apigateway.AuthorizationType.COGNITO
        : cdk.aws_apigateway.AuthorizationType.NONE,
      authorizer: requiresAuth ? this.cognitoAuthorizer : undefined,

      // Step 6: Add Cache-Control headers to responses
      // Task 5.1.6 Step 3: Add Content-Encoding header handling for compression
      methodResponses: [
        {
          statusCode: '200',
          responseParameters: {
            'method.response.header.Cache-Control': true,
            'method.response.header.Content-Type': true,
            'method.response.header.Content-Encoding': true, // Task 5.1.6: Support gzip/deflate
          },
        },
        {
          statusCode: '400',
          responseParameters: {
            'method.response.header.Cache-Control': true,
            'method.response.header.Content-Encoding': true,
          },
        },
        {
          statusCode: '401',
          responseParameters: {
            'method.response.header.Cache-Control': true,
            'method.response.header.Content-Encoding': true,
          },
        },
        {
          statusCode: '500',
          responseParameters: {
            'method.response.header.Cache-Control': true,
            'method.response.header.Content-Encoding': true,
          },
        },
      ],
    };

    // Step 7: Setup cache invalidation on PUT/POST/DELETE/PATCH methods
    // Only GET methods should use caching
    if (method === 'GET' && cachingEnabled) {
      return {
        ...baseOptions,

        // Step 5: Configure cache key parameters
        requestParameters: {
          // Include Authorization header in cache key (different users get different cached responses)
          'method.request.header.Authorization': requiresAuth,

          // Include common query parameters in cache key
          'method.request.querystring.page': false,
          'method.request.querystring.limit': false,
          'method.request.querystring.sort': false,
          'method.request.querystring.filter': false,
        },

        // Enable caching for this method
        requestValidatorOptions: {
          validateRequestParameters: true,
        },
      };
    }

    // POST/PUT/DELETE/PATCH methods: Disable caching (Step 7)
    return {
      ...baseOptions,

      // Explicitly disable caching for mutation methods
      requestParameters: requiresAuth
        ? {
            'method.request.header.Authorization': true,
          }
        : undefined,
    };
  }

  /**
   * Create Request Validator for body validation only
   *
   * Task 5.1.5 Implementation:
   * - Step 2: Validate request body schemas
   * - Rejects requests with invalid JSON body
   * - Does not validate query parameters or headers
   *
   * Use case: POST/PUT/PATCH methods with JSON body
   *
   * @param api - API Gateway REST API
   * @returns Request Validator for body validation
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Input Validation section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security - Input validation)
   */
  private createBodyValidator(
    api: cdk.aws_apigateway.RestApi
  ): cdk.aws_apigateway.RequestValidator {
    return new cdk.aws_apigateway.RequestValidator(this, 'BodyValidator', {
      restApi: api,
      requestValidatorName: `EveryoneCook-BodyValidator-${this.config.environment}`,
      validateRequestBody: true,
      validateRequestParameters: false,
    });
  }

  /**
   * Create Request Validator for parameters validation only
   *
   * Task 5.1.5 Implementation:
   * - Step 3: Validate query string parameters
   * - Step 4: Validate headers (Authorization, Content-Type)
   * - Rejects requests with missing required parameters
   * - Does not validate request body
   *
   * Use case: GET/DELETE methods with query parameters
   *
   * @param api - API Gateway REST API
   * @returns Request Validator for parameters validation
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Input Validation section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security - Input validation)
   */
  private createParamsValidator(
    api: cdk.aws_apigateway.RestApi
  ): cdk.aws_apigateway.RequestValidator {
    return new cdk.aws_apigateway.RequestValidator(this, 'ParamsValidator', {
      restApi: api,
      requestValidatorName: `EveryoneCook-ParamsValidator-${this.config.environment}`,
      validateRequestBody: false,
      validateRequestParameters: true,
    });
  }

  /**
   * Create Request Validator for full validation (body + parameters)
   *
   * Task 5.1.5 Implementation:
   * - Step 1: Enable request validation at API Gateway level
   * - Step 2: Validate request body schemas
   * - Step 3: Validate query string parameters
   * - Step 4: Validate headers (Authorization, Content-Type)
   * - Step 5: Reject invalid requests before Lambda invocation
   * - Step 6: Add request size limits (10MB max via API Gateway default)
   *
   * Use case: POST/PUT/PATCH methods with both body and parameters
   *
   * Benefits:
   * - Early rejection of invalid requests (before Lambda invocation)
   * - Cost optimization: No Lambda charges for invalid requests
   * - Security: Prevents malformed requests from reaching application code
   * - Performance: Faster error responses (no Lambda cold start)
   *
   * @param api - API Gateway REST API
   * @returns Request Validator for full validation
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Input Validation section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security - Input validation), Req 11 (Cost Optimization)
   */
  private createFullValidator(
    api: cdk.aws_apigateway.RestApi
  ): cdk.aws_apigateway.RequestValidator {
    return new cdk.aws_apigateway.RequestValidator(this, 'FullValidator', {
      restApi: api,
      requestValidatorName: `EveryoneCook-FullValidator-${this.config.environment}`,
      validateRequestBody: true,
      validateRequestParameters: true,
    });
  }

  /**
   * Create JSON Schema Model for request validation
   *
   * Task 5.1.5 Implementation:
   * - Defines JSON schema for request body validation
   * - Used with request validators to enforce schema compliance
   * - Supports nested objects, arrays, and complex types
   *
   * Example schemas:
   * - User registration: username, email, password, fullName
   * - Post creation: content, images[], privacy
   * - Recipe creation: title, ingredients[], steps[]
   *
   * @param api - API Gateway REST API
   * @param modelName - Name of the model (e.g., 'UserRegistration')
   * @param schema - JSON schema definition
   * @returns API Gateway Model
   *
   * @example
   * ```typescript
   * const userModel = this.createRequestModel(this.api, 'UserRegistration', {
   *   type: cdk.aws_apigateway.JsonSchemaType.OBJECT,
   *   required: ['username', 'email', 'password', 'fullName'],
   *   properties: {
   *     username: {
   *       type: cdk.aws_apigateway.JsonSchemaType.STRING,
   *       minLength: 3,
   *       maxLength: 30,
   *       pattern: '^[a-zA-Z0-9_]+$'
   *     },
   *     email: {
   *       type: cdk.aws_apigateway.JsonSchemaType.STRING,
   *       format: 'email'
   *     },
   *     password: {
   *       type: cdk.aws_apigateway.JsonSchemaType.STRING,
   *       minLength: 12
   *     },
   *     fullName: {
   *       type: cdk.aws_apigateway.JsonSchemaType.STRING,
   *       minLength: 1,
   *       maxLength: 100
   *     }
   *   }
   * });
   * ```
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Input Validation section
   */
  public createRequestModel(
    api: cdk.aws_apigateway.RestApi,
    modelName: string,
    schema: cdk.aws_apigateway.JsonSchema
  ): cdk.aws_apigateway.Model {
    return new cdk.aws_apigateway.Model(this, `${modelName}Model`, {
      restApi: api,
      modelName: `${modelName}${this.config.environment}`,
      contentType: 'application/json',
      schema: schema,
    });
  }

  /**
   * Get method options with request validation
   *
   * Task 5.1.5 Implementation:
   * - Combines caching options with request validation
   * - Validates request body, parameters, and headers
   * - Enforces 10MB request size limit (API Gateway default)
   * - Rejects invalid requests before Lambda invocation
   *
   * Features:
   * - GET methods: Validate parameters only (query strings, headers)
   * - POST/PUT/PATCH methods: Validate body + parameters
   * - DELETE methods: Validate parameters only
   * - All methods: Enforce required headers (Authorization, Content-Type)
   *
   * @param method - HTTP method (GET, POST, PUT, DELETE, PATCH)
   * @param requiresAuth - Whether the method requires authentication
   * @param requestModel - Optional JSON schema model for body validation
   * @returns Method options for API Gateway method configuration
   *
   * @example
   * ```typescript
   * // POST method with body validation
   * const createUserMethod = usersResource.addMethod(
   *   'POST',
   *   userIntegration,
   *   this.getMethodOptionsWithValidation('POST', true, userRegistrationModel)
   * );
   *
   * // GET method with parameter validation
   * const getUserMethod = usersResource.addMethod(
   *   'GET',
   *   userIntegration,
   *   this.getMethodOptionsWithValidation('GET', true)
   * );
   * ```
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Input Validation section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security), Req 11 (Cost Optimization)
   */
  public getMethodOptionsWithValidation(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    requiresAuth: boolean = true,
    requestModel?: cdk.aws_apigateway.IModel
  ): cdk.aws_apigateway.MethodOptions {
    // Get base caching options
    const cachingOptions = this.getMethodCachingOptions(method, requiresAuth);

    // Determine validator based on method and model
    let validator: cdk.aws_apigateway.IRequestValidator;
    let requestModels: { [contentType: string]: cdk.aws_apigateway.IModel } | undefined;

    if (method === 'GET' || method === 'DELETE') {
      // GET/DELETE: Validate parameters only (query strings, headers)
      validator = this.paramsValidator;
    } else if (requestModel) {
      // POST/PUT/PATCH with model: Validate body + parameters
      validator = this.fullValidator;
      requestModels = {
        'application/json': requestModel,
      };
    } else {
      // POST/PUT/PATCH without model: Validate body only
      validator = this.bodyValidator;
    }

    // Merge caching options with validation options
    return {
      ...cachingOptions,
      requestValidator: validator,
      requestModels: requestModels,

      // Enforce required parameters
      requestParameters: {
        ...cachingOptions.requestParameters,
        // Authorization header required for authenticated methods
        'method.request.header.Authorization': requiresAuth,
        // Content-Type header required for POST/PUT/PATCH
        'method.request.header.Content-Type': method !== 'GET' && method !== 'DELETE',
      },
    };
  }

  /**
   * Create API Gateway custom domain with ACM certificate and Route 53 DNS
   *
   * Task 5.1.7 Implementation:
   * - Step 1: Import ACM certificate from CertificateStack
   * - Step 2: Create API Gateway DomainName with TLS 1.2
   * - Step 3: Create BasePathMapping to v1 stage
   * - Step 4: Create Route 53 A record (Alias) pointing to API Gateway
   *
   * Features:
   * - Custom domain: api.everyonecook.cloud (or api-dev/api-staging)
   * - ACM wildcard certificate (*.everyonecook.cloud)
   * - TLS 1.2 security policy
   * - Regional endpoint type
   * - Automatic DNS configuration via Route 53
   *
   * Benefits:
   * - Production-ready URL from the start
   * - No URL migration needed later
   * - Friendly URL for testing and debugging
   * - Frontend can use custom domain immediately
   *
   * @param api - API Gateway REST API
   * @returns API Gateway DomainName
   *
   * @see .kiro/specs/project-restructure/requirements.md - Req 5 (Domain Configuration)
   * @see .kiro/specs/project-restructure/design.md - URL Strategy section
   * @see docs/phase-5/ACM-API-GATEWAY-CERTIFICATE.md - Certificate setup guide
   */
  private createApiCustomDomain(api: cdk.aws_apigateway.RestApi): cdk.aws_apigateway.DomainName {
    // Step 1: Create ACM certificate in ap-southeast-1 for API Gateway
    // IMPORTANT: API Gateway Regional endpoint requires certificate in same region
    // - CloudFront: Certificate MUST be in us-east-1 (handled by CertificateStack)
    // - API Gateway: Certificate MUST be in ap-southeast-1 (created here)

    // Import Route 53 Hosted Zone for DNS validation
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: 'Z018823421GWCSYG5UMHV', // Stable ID from DNS Stack
      zoneName: 'everyonecook.cloud',
    });

    // Create wildcard certificate for API Gateway in ap-southeast-1
    const certificate = new acm.Certificate(this, 'ApiGatewayCertificate', {
      domainName: '*.everyonecook.cloud', // Covers api-dev.everyonecook.cloud
      subjectAlternativeNames: ['everyonecook.cloud'], // Also covers root domain
      validation: acm.CertificateValidation.fromDns(hostedZone),
      certificateName: `EveryoneCook-API-Gateway-${this.config.environment}`,
    });

    // Add tags
    cdk.Tags.of(certificate).add('Component', 'APIGateway');
    cdk.Tags.of(certificate).add('Purpose', 'API-SSL-Regional');

    // Step 2: Create API Gateway DomainName
    const domainName = new cdk.aws_apigateway.DomainName(this, 'ApiDomain', {
      domainName: this.config.domains.api, // api.everyonecook.cloud or api-dev/api-staging
      certificate: certificate,
      endpointType: cdk.aws_apigateway.EndpointType.REGIONAL,
      securityPolicy: cdk.aws_apigateway.SecurityPolicy.TLS_1_2,
    });

    // Add tags
    cdk.Tags.of(domainName).add('Component', 'API');
    cdk.Tags.of(domainName).add('Purpose', 'CustomDomain');

    // Step 3: Create BasePathMapping to api stage
    // Maps api.everyonecook.cloud/ → API Gateway api stage
    new cdk.aws_apigateway.BasePathMapping(this, 'ApiMapping', {
      domainName: domainName,
      restApi: api,
      stage: api.deploymentStage,
      basePath: '', // Empty string means root path (api.everyonecook.cloud/)
    });

    // Step 4: Create Route 53 A record (Alias) pointing to API Gateway
    // hostedZone already imported in Step 1 for certificate validation

    // Create A record with Alias target
    new cdk.aws_route53.ARecord(this, 'ApiAliasRecord', {
      zone: hostedZone,
      recordName: this.config.domains.api, // api.everyonecook.cloud
      target: cdk.aws_route53.RecordTarget.fromAlias(
        new cdk.aws_route53_targets.ApiGatewayDomain(domainName)
      ),
      comment: `API Gateway custom domain for ${this.config.environment} environment`,
    });

    return domainName;
  }

  /**
   * Helper method to create Lambda Code from deployment folder
   * Uses NEVER follow mode to avoid circular symlink issues
   *
   * @param modulePath - Path to module deployment folder (e.g., 'services/api-router/deployment')
   * @returns Lambda Code configuration
   */
  private createLambdaCode(modulePath: string): cdk.aws_lambda.Code {
    return cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../', modulePath), {
      followSymlinks: cdk.SymlinkFollowMode.NEVER,
    });
  }

  /**
   * Create API Router Lambda Function
   *
   * Task 5.2.3 Implementation:
   * - Deploy API Router Lambda with JWT validation
   * - Configure environment variables for Cognito integration
   * - Grant DynamoDB read/write permissions
   * - Connect to API Gateway with proxy integration
   * - X-Ray tracing disabled (using CloudWatch Logs instead)
   *
   * Features:
   * - Runtime: Node.js 20.x
   * - Memory: 512MB (optimized for routing logic)
   * - Timeout: 30 seconds
   * - X-Ray tracing: Disabled
   * - CloudWatch logs: Structured JSON logging
   * - Environment variables: DynamoDB table, Cognito User Pool, AWS region
   *
   * @param props - Backend Stack Props with dependencies
   * @returns API Router Lambda Function
   *
   * @see .kiro/specs/project-restructure/design.md - Module Overview section
   * @see .kiro/specs/project-restructure/security-architecture.md - JWT validation
   * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy), Req 7 (Security)
   */
  private createApiRouterLambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'ApiRouterLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-api-router`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/api-router && .\prepare-deployment-layer.ps1` before deploying
    const apiRouterFunction = new cdk.aws_lambda.Function(this, 'ApiRouterFunction', {
      functionName: `everyonecook-${this.config.environment}-api-router`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/api-router/handlers/index.handler',
      code: this.createLambdaCode('services/api-router/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      tracing: cdk.aws_lambda.Tracing.DISABLED,
      environment: {
        DYNAMODB_TABLE: props.dynamoTable.tableName,
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',
        // Lambda ARNs for invocation
        AUTH_USER_LAMBDA_ARN: this.authUserFunction.functionArn,
        SOCIAL_LAMBDA_ARN: this.socialFunction.functionArn,
        RECIPE_AI_LAMBDA_ARN: this.recipeAIFunction.functionArn,
        ADMIN_LAMBDA_ARN: this.adminFunction.functionArn,
        UPLOAD_LAMBDA_ARN: this.uploadFunction.functionArn,
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Grant permissions
    props.dynamoTable.grantReadWriteData(apiRouterFunction);

    // Grant permission to invoke target Lambda functions
    this.authUserFunction.grantInvoke(apiRouterFunction);
    this.socialFunction.grantInvoke(apiRouterFunction);
    this.recipeAIFunction.grantInvoke(apiRouterFunction);
    this.adminFunction.grantInvoke(apiRouterFunction);
    this.uploadFunction.grantInvoke(apiRouterFunction);

    // Add tags
    cdk.Tags.of(apiRouterFunction).add('Component', 'API');
    cdk.Tags.of(apiRouterFunction).add('Module', 'ApiRouter');
    cdk.Tags.of(apiRouterFunction).add('Purpose', 'RequestRouting');

    // Connect to API Gateway with proxy integration
    const integration = new cdk.aws_apigateway.LambdaIntegration(apiRouterFunction, {
      proxy: true,
      allowTestInvoke: this.config.environment !== 'prod',
    });

    // Add proxy resource to API Gateway (catch-all route)
    // Note: Authentication is handled by API Router Lambda (JWT validation)
    // This allows flexible public/protected route handling without separate API Gateway resources
    this.api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    return apiRouterFunction;
  }

  /**
   * Create Auth & User Lambda Function
   *
   * Task 5.3.6 Implementation:
   * - Deploy Auth & User Lambda with authentication and profile management
   * - Configure environment variables for Cognito, DynamoDB, and S3 integration
   * - Grant permissions: Cognito (read), DynamoDB (read/write), S3 (read/write)
   * - X-Ray tracing disabled (using CloudWatch Logs instead)
   * - Configure CloudWatch logs with structured JSON logging
   *
   * Features:
   * - Runtime: Node.js 20.x
   * - Memory: 512MB (optimized for auth operations)
   * - Timeout: 30 seconds
   * - X-Ray tracing: Disabled
   * - CloudWatch logs: Structured JSON logging
   * - Environment variables: DynamoDB table, Cognito User Pool, S3 bucket, AWS region
   *
   * Handlers:
   * - Authentication: Login, register, password reset, token refresh
   * - Profile Management: Get, update, delete user profiles
   * - Privacy Settings: Get, update privacy controls
   * - User Search: Search users with privacy filtering
   *
   * @param props - Backend Stack Props with dependencies
   * @returns Auth & User Lambda Function
   *
   * @see .kiro/specs/project-restructure/design.md - Module Overview section (Lambda 1: Auth & User)
   * @see .kiro/specs/project-restructure/user-profile-design.md - Profile management
   * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy controls
   * @see .kiro/specs/project-restructure/security-architecture.md - Authentication patterns
   * @see .kiro/specs/project-restructure/requirements.md - Req 2 (Module Structure - Authentication Module), Req 12 (Monitoring - CloudWatch Logs)
   */
  private createAuthUserLambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Step 1: Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'AuthUserLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-auth-user`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Step 2: Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/auth-module && .\prepare-deployment-layer.ps1` before deploying
    const authUserFunction = new cdk.aws_lambda.Function(this, 'AuthUserFunction', {
      functionName: `everyonecook-${this.config.environment}-auth-user`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/auth-module/index.handler',
      code: this.createLambdaCode('services/auth-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 512, // Optimized for auth operations
      timeout: cdk.Duration.seconds(30),
      tracing: cdk.aws_lambda.Tracing.DISABLED, // X-Ray tracing disabled
      environment: {
        // DynamoDB configuration
        DYNAMODB_TABLE: props.dynamoTable.tableName,

        // Cognito configuration
        USER_POOL_ID: props.userPool.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,

        // S3 configuration
        CONTENT_BUCKET: props.contentBucket.bucketName,

        // Logging configuration
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',

        // Note: AWS_REGION is automatically set by Lambda runtime
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Step 3: Grant permissions
    // DynamoDB: Read/write access for user profiles, privacy settings
    props.dynamoTable.grantReadWriteData(authUserFunction);

    // S3: Read/write access for avatar and background uploads
    props.contentBucket.grantReadWrite(authUserFunction);

    // Cognito: Read access for user pool operations (list users, get user attributes)
    props.userPool.grant(
      authUserFunction,
      'cognito-idp:AdminGetUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:ListUsers'
    );

    // Step 4: Add tags
    cdk.Tags.of(authUserFunction).add('Component', 'Application');
    cdk.Tags.of(authUserFunction).add('Module', 'AuthUser');
    cdk.Tags.of(authUserFunction).add('Purpose', 'Authentication-Profile');

    // Step 5: Create CloudWatch alarms for monitoring
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for Lambda errors
      new cdk.aws_cloudwatch.Alarm(this, 'AuthUserErrorAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-AuthUser-Errors`,
        alarmDescription: 'Alert when Auth & User Lambda has errors',
        metric: authUserFunction.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5, // Alert if 5+ errors in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda duration (performance monitoring)
      new cdk.aws_cloudwatch.Alarm(this, 'AuthUserDurationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-AuthUser-Duration`,
        alarmDescription: 'Alert when Auth & User Lambda duration exceeds 10 seconds',
        metric: authUserFunction.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 10000, // 10 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda throttles
      new cdk.aws_cloudwatch.Alarm(this, 'AuthUserThrottleAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-AuthUser-Throttles`,
        alarmDescription: 'Alert when Auth & User Lambda is throttled',
        metric: authUserFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return authUserFunction;
  }

  /**
   * Create Social Lambda Function
   *
   * Task 5.4.8 Implementation:
   * - Step 1: Configure Lambda with 512MB Memory and 30s Timeout
   * - Step 2: X-Ray tracing disabled for cost optimization
   * - Step 3: Grant permissions to DynamoDB and SQS notification queue
   * - Step 4: Configure all necessary environment variables
   * - Step 5: Deploy the function as part of the BackendStack
   *
   * Features:
   * - Posts (create, read, update, delete)
   * - Comments and reactions
   * - Friend management
   * - Social feed generation
   * - Notifications
   * - Content reporting with two-threshold moderation
   *
   * Dependencies:
   * - DynamoDB: Read/write access for posts, comments, reactions, friends
   * - S3: Read/write access for post images
   * - SQS Notification Queue: Send notification messages
   * - SNS Admin Topic: Send admin alerts for content moderation
   *
   * @param props - Backend Stack Props with dependencies
   * @returns Social Lambda Function
   *
   * @see .kiro/specs/project-restructure/social-requirements.md - Complete social features requirements
   * @see .kiro/specs/project-restructure/social-design.md - Social module architecture
   * @see .kiro/specs/project-restructure/social-moderation.md - Content moderation system
   * @see .kiro/specs/project-restructure/requirements.md - Req 2 (Module Structure - Social Module), Req 12 (Monitoring - CloudWatch Logs)
   */
  private createSocialLambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Step 1: Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'SocialLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-social`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // NOTE: SNS Admin Topic removed - using in-app notifications instead
    // Admin can view reports via dashboard, no need for push notifications

    // Step 2: Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/social-module && .\prepare-deployment-layer.ps1` before deploying
    const socialFunction = new cdk.aws_lambda.Function(this, 'SocialFunction', {
      functionName: `everyonecook-${this.config.environment}-social`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/social-module/index.handler',
      code: this.createLambdaCode('services/social-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 512, // Step 1: Optimized for social operations
      timeout: cdk.Duration.seconds(30), // Step 1: 30s timeout
      tracing: cdk.aws_lambda.Tracing.DISABLED, // Step 2: X-Ray tracing disabled
      environment: {
        // Step 4: Configure environment variables

        // DynamoDB configuration (use DYNAMODB_TABLE for consistency)
        DYNAMODB_TABLE: props.dynamoTable.tableName,

        // S3 configuration
        CONTENT_BUCKET: props.contentBucket.bucketName,
        CDN_DOMAIN: this.config.domains.cdn,

        // SQS configuration
        NOTIFICATION_QUEUE_URL: this.notificationQueue.queueUrl,

        // NOTE: ADMIN_TOPIC_ARN removed - using in-app notifications instead

        // Logging configuration
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',

        // Note: AWS_REGION is automatically set by Lambda runtime
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Step 3: Grant permissions

    // DynamoDB: Read/write access for posts, comments, reactions, friends, notifications
    props.dynamoTable.grantReadWriteData(socialFunction);

    // S3: Read/write access for post images
    props.contentBucket.grantReadWrite(socialFunction);

    // SQS: Send messages to notification queue
    this.notificationQueue.grantSendMessages(socialFunction);

    // NOTE: SNS adminTopic.grantPublish removed - using in-app notifications instead

    // Step 3: Add tags
    cdk.Tags.of(socialFunction).add('Component', 'Application');
    cdk.Tags.of(socialFunction).add('Module', 'Social');
    cdk.Tags.of(socialFunction).add('Purpose', 'Social-Features');

    // Step 5: Create CloudWatch alarms for monitoring
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for Lambda errors
      new cdk.aws_cloudwatch.Alarm(this, 'SocialErrorAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Social-Errors`,
        alarmDescription: 'Alert when Social Lambda has errors',
        metric: socialFunction.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5, // Alert if 5+ errors in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda duration (performance monitoring)
      new cdk.aws_cloudwatch.Alarm(this, 'SocialDurationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Social-Duration`,
        alarmDescription: 'Alert when Social Lambda duration exceeds 10 seconds',
        metric: socialFunction.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 10000, // 10 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda throttles
      new cdk.aws_cloudwatch.Alarm(this, 'SocialThrottleAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Social-Throttles`,
        alarmDescription: 'Alert when Social Lambda is throttled',
        metric: socialFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return socialFunction;
  }

  /**
   * Create Recipe & AI Lambda Function
   *
   * Task 5.5.9 Implementation:
   * - Step 1: Configure Lambda with 1GB Memory and 30s Timeout
   * - Step 2: X-Ray tracing disabled for cost optimization
   * - Step 3: Grant permissions to DynamoDB, SQS AI queue, and Amazon Bedrock
   * - Step 4: Configure all necessary environment variables
   * - Step 5: Deploy the function as part of the BackendStack
   *
   * Features:
   * - AI recipe suggestions (Dictionary-first strategy)
   * - Recipe search (DynamoDB)
   * - Ingredient translation (Vietnamese ↔ English)
   * - Nutrition calculation
   * - Recipe CRUD operations
   * - Cache management (Dictionary, Translation Cache, AI Cache)
   *
   * Permissions:
   * - DynamoDB: Read/write access for recipes, dictionary, cache, job status
   * - SQS: Send messages to AI queue for async processing
   * - Bedrock: Invoke Claude 3.5 Sonnet v2 for AI generation
   * - S3: Read/write access for recipe images
   *
   * @param props - Backend stack props with dependencies
   * @returns Recipe & AI Lambda function
   *
   * @see .kiro/specs/project-restructure/design.md - Module Overview section
   * @see .kiro/specs/project-restructure/ai-services-design.md - Complete AI architecture
   * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy), Req 12 (Monitoring - CloudWatch Logs)
   */
  private createRecipeAILambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Step 1: Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'RecipeAILogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-recipe-ai`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Step 2: Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/ai-module && .\prepare-deployment-layer.ps1` before deploying
    const recipeAIFunction = new cdk.aws_lambda.Function(this, 'RecipeAIFunction', {
      functionName: `everyonecook-${this.config.environment}-recipe-ai`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/ai-module/index.handler',
      code: this.createLambdaCode('services/ai-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 1024, // Step 1: 1GB memory for AI operations
      timeout: cdk.Duration.seconds(30), // Step 1: 30s timeout
      tracing: cdk.aws_lambda.Tracing.DISABLED, // Step 2: X-Ray tracing disabled
      environment: {
        // Step 4: Configure environment variables

        // DynamoDB configuration (use DYNAMODB_TABLE for consistency)
        DYNAMODB_TABLE: props.dynamoTable.tableName,

        // S3 configuration
        CONTENT_BUCKET: props.contentBucket.bucketName,

        // SQS configuration
        AI_QUEUE_URL: this.aiQueue.queueUrl,

        // Bedrock configuration - Claude 3 Haiku (fast, cost-effective)
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        BEDROCK_REGION: 'us-east-1',

        // Logging configuration
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',

        // Note: AWS_REGION is automatically set by Lambda runtime
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Step 3: Grant permissions

    // DynamoDB: Read/write access for recipes, dictionary, cache, job status
    props.dynamoTable.grantReadWriteData(recipeAIFunction);

    // SQS: Send messages to AI queue for async processing
    this.aiQueue.grantSendMessages(recipeAIFunction);

    // Bedrock: Invoke Claude 3 Haiku for AI generation (cross-region us-east-1)
    recipeAIFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0',
          `arn:aws:bedrock:${this.config.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      })
    );

    // S3: Read/write access for recipe images
    props.contentBucket.grantReadWrite(recipeAIFunction);

    // Step 4: Add tags
    cdk.Tags.of(recipeAIFunction).add('Component', 'Application');
    cdk.Tags.of(recipeAIFunction).add('Module', 'RecipeAI');
    cdk.Tags.of(recipeAIFunction).add('Purpose', 'AI-Recipe-Management');

    // Step 5: Create CloudWatch alarms for monitoring
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for Lambda errors
      new cdk.aws_cloudwatch.Alarm(this, 'RecipeAIErrorAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-RecipeAI-Errors`,
        alarmDescription: 'Alert when Recipe & AI Lambda has errors',
        metric: recipeAIFunction.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5, // Alert if 5+ errors in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda duration (performance monitoring)
      new cdk.aws_cloudwatch.Alarm(this, 'RecipeAIDurationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-RecipeAI-Duration`,
        alarmDescription: 'Alert when Recipe & AI Lambda duration exceeds 15 seconds',
        metric: recipeAIFunction.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 15000, // 15 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda throttles
      new cdk.aws_cloudwatch.Alarm(this, 'RecipeAIThrottleAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-RecipeAI-Throttles`,
        alarmDescription: 'Alert when Recipe & AI Lambda is throttled',
        metric: recipeAIFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for AI cost monitoring (track Bedrock invocations)
      const bedrockInvocations = new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Invocations',
        dimensionsMap: {
          FunctionName: recipeAIFunction.functionName,
        },
        statistic: 'Sum',
        period: cdk.Duration.hours(1),
      });

      new cdk.aws_cloudwatch.Alarm(this, 'RecipeAIInvocationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-RecipeAI-HighInvocations`,
        alarmDescription:
          'Alert when Recipe & AI Lambda invocations exceed 1000/hour (cost monitoring)',
        metric: bedrockInvocations,
        threshold: 1000, // Alert if >1000 invocations per hour
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return recipeAIFunction;
  }

  /**
   * Create Admin Lambda Function
   *
   * Task 5.6.5 Implementation:
   * - Phase 1: Lambda Configuration (512MB memory, 30s timeout)
   * - Phase 2: Grant IAM Permissions (DynamoDB, Cognito, SQS, CloudWatch, Cost Explorer)
   * - Phase 3: API Gateway Integration (admin routes with Cognito authorizer)
   * - Phase 4: Deployment Testing (ban/unban API, audit logs, authorization)
   *
   * Features:
   * - User Management: Ban/unban users, get banned users list
   * - Content Moderation: Review reported posts, delete/restore posts
   * - System Monitoring: Health checks, metrics, cost tracking
   * - Audit Logging: Track all admin actions in DynamoDB
   *
   * Permissions:
   * - DynamoDB: Read/write access for user profiles, audit logs
   * - Cognito: AdminDisableUser, AdminEnableUser for user management
   * - SQS: SendMessage to email queue for notifications
   * - CloudWatch: PutMetricData for custom metrics
   * - Cost Explorer: GetCostAndUsage for cost monitoring (optional)
   *
   * @param props - Backend Stack Props with dependencies
   * @returns Admin Lambda Function
   *
   * @see .kiro/specs/project-restructure/design.md - Module Overview section (Lambda 4: Admin)
   * @see .kiro/specs/project-restructure/requirements.md - Req 2 (Module Structure - Admin Module), Req 12 (Monitoring)
   * @see .kiro/specs/project-restructure/tasks.md - Task 5.6.5 (Deploy Admin Lambda)
   */
  private createAdminLambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Phase 1: Lambda Configuration

    // Step 1: Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'AdminLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-admin`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Step 2: Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/admin-module && .\prepare-deployment-layer.ps1` before deploying
    const adminFunction = new cdk.aws_lambda.Function(this, 'AdminFunction', {
      functionName: `everyonecook-${this.config.environment}-admin`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/admin-module/index.handler',
      code: this.createLambdaCode('services/admin-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 512, // Optimized for admin operations
      timeout: cdk.Duration.seconds(30),
      tracing: cdk.aws_lambda.Tracing.DISABLED, // X-Ray tracing disabled
      environment: {
        // DynamoDB configuration
        DYNAMODB_TABLE: props.dynamoTable.tableName,

        // Cognito configuration
        USER_POOL_ID: props.userPool.userPoolId,

        // S3 configuration (for user file deletion)
        CONTENT_BUCKET: props.contentBucket.bucketName,

        // NOTE: EMAIL_QUEUE_URL removed - using in-app notifications instead of email

        // Logging configuration
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',

        // Note: AWS_REGION is automatically set by Lambda runtime
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Phase 2: Grant IAM Permissions

    // DynamoDB: Read/write access for user profiles, audit logs
    props.dynamoTable.grantReadWriteData(adminFunction);

    // DynamoDB: Query GSI for username lookup (ban status check)
    adminFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['dynamodb:Query', 'dynamodb:Scan'],
        resources: [props.dynamoTable.tableArn, `${props.dynamoTable.tableArn}/index/*`],
      })
    );

    // Cognito: Admin permissions for user management (ban/unban/delete)
    props.userPool.grant(
      adminFunction,
      'cognito-idp:AdminDisableUser',
      'cognito-idp:AdminEnableUser',
      'cognito-idp:AdminGetUser',
      'cognito-idp:AdminUpdateUserAttributes',
      'cognito-idp:AdminDeleteUser', // For permanent user deletion
      'cognito-idp:ListUsers'
    );

    // S3: Delete permissions for user file cleanup (permanent user deletion)
    props.contentBucket.grantDelete(adminFunction);
    props.contentBucket.grantRead(adminFunction); // For listing user files before deletion



    // CloudWatch: Put custom metrics for admin operations
    adminFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'], // CloudWatch metrics don't support resource-level permissions
      })
    );

    // Cost Explorer: Get cost and usage data (optional, for Task 5.6.4)
    // Only enable in production to avoid unnecessary permissions in dev/staging
    if (this.config.environment === 'prod') {
      adminFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ce:GetCostAndUsage',
            'ce:GetCostForecast',
            'ce:GetDimensionValues',
            'ce:GetTags',
          ],
          resources: ['*'], // Cost Explorer doesn't support resource-level permissions
        })
      );
    }

    // Add tags
    cdk.Tags.of(adminFunction).add('Component', 'Application');
    cdk.Tags.of(adminFunction).add('Module', 'Admin');
    cdk.Tags.of(adminFunction).add('Purpose', 'Admin-Operations');

    // Create CloudWatch alarms for monitoring
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for Lambda errors
      new cdk.aws_cloudwatch.Alarm(this, 'AdminErrorAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Admin-Errors`,
        alarmDescription: 'Alert when Admin Lambda has errors',
        metric: adminFunction.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5, // Alert if 5+ errors in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda duration (performance monitoring)
      new cdk.aws_cloudwatch.Alarm(this, 'AdminDurationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Admin-Duration`,
        alarmDescription: 'Alert when Admin Lambda duration exceeds 10 seconds',
        metric: adminFunction.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 10000, // 10 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda throttles
      new cdk.aws_cloudwatch.Alarm(this, 'AdminThrottleAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Admin-Throttles`,
        alarmDescription: 'Alert when Admin Lambda is throttled',
        metric: adminFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return adminFunction;
  }

  /**
   * Create Upload Lambda Function
   *
   * Task 5.7.5 Implementation:
   * - Step 1: Configure Lambda with 256MB Memory and 30s Timeout
   * - Step 2: X-Ray tracing disabled for cost optimization
   * - Step 3: Grant permissions to S3, DynamoDB, and SQS image processing queue
   * - Step 4: Configure all necessary environment variables
   * - Step 5: Deploy the function as part of the BackendStack
   *
   * Features:
   * - Presigned URL generation for S3 uploads (avatars, backgrounds, post images, recipe images)
   * - File validation (size, type, dimensions)
   * - Image processing queue integration
   * - Upload tracking in DynamoDB
   * - Rate limiting enforcement
   *
   * Permissions:
   * - S3: Read/write access for content bucket
   * - DynamoDB: Read/write access for upload tracking and rate limiting
   * - SQS: Send messages to image processing queue
   *
   * @param props - Backend Stack Props with dependencies
   * @returns Upload Lambda Function
   *
   * @see .kiro/specs/project-restructure/design.md - Module Overview section (Lambda 5: Upload)
   * @see .kiro/specs/project-restructure/storage-architecture.md - S3 upload workflows
   * @see .kiro/specs/project-restructure/security-architecture.md - Upload restrictions
   * @see .kiro/specs/project-restructure/requirements.md - Req 2 (Module Structure - Upload Module), Req 7.1 (Rate Limiting), Req 12 (Monitoring)
   */
  private createUploadLambda(props: BackendStackProps): cdk.aws_lambda.Function {
    // Step 1: Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'UploadLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-upload`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Step 2: Create Lambda function
    // Note: Use deployment folder which contains dist only (no node_modules)
    // Dependencies are provided by SharedDependenciesLayer
    // Run `cd services/upload-module && .\prepare-deployment-layer.ps1` before deploying
    const uploadFunction = new cdk.aws_lambda.Function(this, 'UploadFunction', {
      functionName: `everyonecook-${this.config.environment}-upload`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/upload-module/index.handler',
      code: this.createLambdaCode('services/upload-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 256, // Step 1: Optimized for presigned URL generation (lightweight operation)
      timeout: cdk.Duration.seconds(30), // Step 1: 30s timeout
      tracing: cdk.aws_lambda.Tracing.DISABLED, // Step 2: X-Ray tracing disabled
      environment: {
        // Step 4: Configure environment variables

        // DynamoDB configuration
        DYNAMODB_TABLE: props.dynamoTable.tableName,

        // S3 configuration
        CONTENT_BUCKET: props.contentBucket.bucketName,

        // SQS configuration
        IMAGE_PROCESSING_QUEUE_URL: this.imageProcessingQueue.queueUrl,

        // Upload restrictions (from security-architecture.md)
        MAX_AVATAR_SIZE: '5242880', // 5MB in bytes
        MAX_BACKGROUND_SIZE: '10485760', // 10MB in bytes
        MAX_POST_IMAGE_SIZE: '5242880', // 5MB per image
        MAX_RECIPE_IMAGE_SIZE: '5242880', // 5MB per image
        ALLOWED_IMAGE_TYPES: 'image/jpeg,image/png,image/webp',

        // Rate limiting (from security-architecture.md - Req 7.1)
        AVATAR_UPLOAD_LIMIT: '10', // 10 uploads per day
        BACKGROUND_UPLOAD_LIMIT: '10', // 10 uploads per day
        POST_IMAGE_LIMIT: '5', // 5 images per post
        RECIPE_IMAGE_LIMIT: '4', // 2 for dish + 2 per step

        // Logging configuration
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',

        // Note: AWS_REGION is automatically set by Lambda runtime
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
    });

    // Step 3: Grant permissions

    // S3: Read/write access for content bucket (presigned URLs)
    props.contentBucket.grantReadWrite(uploadFunction);

    // DynamoDB: Read/write access for upload tracking and rate limiting
    props.dynamoTable.grantReadWriteData(uploadFunction);

    // SQS: Send messages to image processing queue
    this.imageProcessingQueue.grantSendMessages(uploadFunction);

    // Step 4: Add tags
    cdk.Tags.of(uploadFunction).add('Component', 'Application');
    cdk.Tags.of(uploadFunction).add('Module', 'Upload');
    cdk.Tags.of(uploadFunction).add('Purpose', 'File-Upload-Management');

    // Step 5: Create CloudWatch alarms for monitoring
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for Lambda errors
      new cdk.aws_cloudwatch.Alarm(this, 'UploadErrorAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Upload-Errors`,
        alarmDescription: 'Alert when Upload Lambda has errors',
        metric: uploadFunction.metricErrors({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 5, // Alert if 5+ errors in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda duration (performance monitoring)
      new cdk.aws_cloudwatch.Alarm(this, 'UploadDurationAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Upload-Duration`,
        alarmDescription: 'Alert when Upload Lambda duration exceeds 10 seconds',
        metric: uploadFunction.metricDuration({
          period: cdk.Duration.minutes(5),
          statistic: 'Average',
        }),
        threshold: 10000, // 10 seconds in milliseconds
        evaluationPeriods: 2,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for Lambda throttles
      new cdk.aws_cloudwatch.Alarm(this, 'UploadThrottleAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Upload-Throttles`,
        alarmDescription: 'Alert when Upload Lambda is throttled',
        metric: uploadFunction.metricThrottles({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for rate limit violations (custom metric)
      const rateLimitMetric = new cdk.aws_cloudwatch.Metric({
        namespace: 'EveryoneCook',
        metricName: 'UploadRateLimitViolations',
        dimensionsMap: {
          Environment: this.config.environment,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      });

      new cdk.aws_cloudwatch.Alarm(this, 'UploadRateLimitAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-Upload-RateLimitViolations`,
        alarmDescription: 'Alert when upload rate limit violations exceed threshold',
        metric: rateLimitMetric,
        threshold: 10, // Alert if 10+ violations in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator:
          cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    return uploadFunction;
  }

  /**
   * Create AI Worker Lambda
   * Processes AI recipe generation jobs from SQS queue
   */
  private createAIWorker(props: BackendStackProps): cdk.aws_lambda.Function {
    const logGroup = new cdk.aws_logs.LogGroup(this, 'AIWorkerLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-ai-worker`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const aiWorker = new cdk.aws_lambda.Function(this, 'AIWorker', {
      functionName: `everyonecook-${this.config.environment}-ai-worker`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'services/ai-module/workers/ai-worker.handler',
      code: this.createLambdaCode('services/ai-module/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      tracing: cdk.aws_lambda.Tracing.DISABLED,
      environment: {
        DYNAMODB_TABLE: props.dynamoTable.tableName,
        // Claude 3 Haiku - fast and cost-effective for recipe generation
        BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
        BEDROCK_REGION: 'us-east-1',
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',
      },
      logGroup: logGroup,
    });

    // Add SQS event source
    aiWorker.addEventSource(
      new cdk.aws_lambda_event_sources.SqsEventSource(this.aiQueue, {
        batchSize: 1,
        maxBatchingWindow: cdk.Duration.seconds(0),
      })
    );

    // Grant permissions
    props.dynamoTable.grantReadWriteData(aiWorker);

    // Grant Bedrock permissions - Claude 3 Haiku (cross-region us-east-1)
    aiWorker.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0',
          `arn:aws:bedrock:${this.config.region}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`,
        ],
      })
    );

    // Add tags
    cdk.Tags.of(aiWorker).add('Component', 'EventProcessing');
    cdk.Tags.of(aiWorker).add('Module', 'AIWorker');
    cdk.Tags.of(aiWorker).add('Purpose', 'AI-Recipe-Generation');

    return aiWorker;
  }

  /**
   * Create Image Worker Lambda
   * Processes image optimization jobs from SQS queue
   */
  private createImageWorker(props: BackendStackProps): cdk.aws_lambda.Function {
    const logGroup = new cdk.aws_logs.LogGroup(this, 'ImageWorkerLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-image-worker`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const imageWorker = new cdk.aws_lambda.Function(this, 'ImageWorker', {
      functionName: `everyonecook-${this.config.environment}-image-worker`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: this.createLambdaCode('services/image-worker/deployment'),
      layers: [this.sharedLayer.layer], // Use shared dependencies layer
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      tracing: cdk.aws_lambda.Tracing.DISABLED,
      environment: {
        CONTENT_BUCKET: props.contentBucket.bucketName,
        DYNAMODB_TABLE: props.dynamoTable.tableName,
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',
      },
      logGroup: logGroup,
    });

    // Add SQS event source
    imageWorker.addEventSource(
      new cdk.aws_lambda_event_sources.SqsEventSource(this.imageProcessingQueue, {
        batchSize: 5,
      })
    );

    // Grant S3 permissions
    props.contentBucket.grantReadWrite(imageWorker);
    
    // Grant DynamoDB permissions
    props.dynamoTable.grantReadWriteData(imageWorker);

    cdk.Tags.of(imageWorker).add('Component', 'EventProcessing');
    cdk.Tags.of(imageWorker).add('Module', 'ImageWorker');
    cdk.Tags.of(imageWorker).add('Purpose', 'Image-Processing');

    return imageWorker;
  }

  /**
   * Create Analytics Worker Lambda
   * Processes analytics events from SQS queue
   */
  private createAnalyticsWorker(props: BackendStackProps): cdk.aws_lambda.Function {
    const logGroup = new cdk.aws_logs.LogGroup(this, 'AnalyticsWorkerLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-analytics-worker`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const analyticsWorker = new cdk.aws_lambda.Function(this, 'AnalyticsWorker', {
      functionName: `everyonecook-${this.config.environment}-analytics-worker`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: this.createLambdaCode('services/analytics-worker/deployment'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      tracing: cdk.aws_lambda.Tracing.DISABLED,
      environment: {
        DYNAMODB_TABLE: props.dynamoTable.tableName,
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',
      },
      logGroup: logGroup,
    });

    // Add SQS event source
    analyticsWorker.addEventSource(
      new cdk.aws_lambda_event_sources.SqsEventSource(this.analyticsQueue, {
        batchSize: 10,
      })
    );

    // Grant DynamoDB permissions
    props.dynamoTable.grantReadWriteData(analyticsWorker);

    cdk.Tags.of(analyticsWorker).add('Component', 'EventProcessing');
    cdk.Tags.of(analyticsWorker).add('Module', 'AnalyticsWorker');

    return analyticsWorker;
  }

  /**
   * Create Notification Worker Lambda
   * Processes notification jobs from SQS queue
   */
  private createNotificationWorker(props: BackendStackProps): cdk.aws_lambda.Function {
    const logGroup = new cdk.aws_logs.LogGroup(this, 'NotificationWorkerLogGroup', {
      logGroupName: `/aws/lambda/everyonecook-${this.config.environment}-notification-worker`,
      retention: this.config.cloudwatch.logRetentionDays,
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const notificationWorker = new cdk.aws_lambda.Function(this, 'NotificationWorker', {
      functionName: `everyonecook-${this.config.environment}-notification-worker`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: this.createLambdaCode('services/notification-worker/deployment'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      tracing: cdk.aws_lambda.Tracing.DISABLED,
      environment: {
        DYNAMODB_TABLE: props.dynamoTable.tableName,
        LOG_LEVEL: this.config.environment === 'prod' ? 'INFO' : 'DEBUG',
      },
      logGroup: logGroup,
    });

    // Add SQS event source
    notificationWorker.addEventSource(
      new cdk.aws_lambda_event_sources.SqsEventSource(this.notificationQueue, {
        batchSize: 10,
      })
    );

    // Grant DynamoDB permissions
    props.dynamoTable.grantReadWriteData(notificationWorker);

    cdk.Tags.of(notificationWorker).add('Component', 'EventProcessing');
    cdk.Tags.of(notificationWorker).add('Module', 'NotificationWorker');

    return notificationWorker;
  }

  /**
   * Create WAF Web ACL for API Gateway protection
   *
   * Task 5.8.1 Implementation:
   * - Step 1: Create WAF Web ACL for API Gateway (Regional scope)
   * - Step 2: Configure 5 WAF rules (rate limiting, SQL injection, XSS, known bad inputs, request size limit)
   * - Step 3: Enable CloudWatch metrics for monitoring
   * - Step 4: Configure sampling for blocked requests
   *
   * Features:
   * - Scope: REGIONAL (for API Gateway)
   * - Default action: Allow (block only on rule match)
   * - Rate limiting: 100 requests per 5 minutes per IP
   * - AWS Managed Rules: SQL injection, XSS, known bad inputs, core rule set
   * - Request size limit: 10MB maximum
   * - CloudWatch metrics: Enabled for all rules
   * - Sampled requests: Enabled for investigation
   *
   * WAF Rules (Priority Order):
   * 1. Rate Limiting (Priority 0): Block IPs exceeding 100 req/5min
   * 2. SQL Injection Protection (Priority 1): AWS Managed Rule Set
   * 3. Known Bad Inputs (Priority 2): AWS Managed Rule Set
   * 4. Core Rule Set (Priority 3): XSS, LFI, RFI protection
   * 5. Request Size Limit (Priority 4): Block requests >10MB
   *
   * Cost Analysis:
   * - Web ACL: $5.00/month
   * - Rules (5 rules × $1.00): $5.00/month
   * - Requests (1M requests × $0.60/1M): $0.60/month
   * - Total: ~$10.60/month
   *
   * @returns WAF Web ACL for API Gateway
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Section 3: AWS WAF Configuration
   * @see .kiro/specs/project-restructure/requirements.md - Req 7.2, 7.3, 7.13 (Security & Compliance)
   */
  private createApiGatewayWebAcl(): cdk.aws_wafv2.CfnWebACL {
    const webAcl = new cdk.aws_wafv2.CfnWebACL(this, 'ApiGatewayWebACL', {
      name: `EveryoneCook-API-WAF-${this.config.environment}`,
      scope: 'REGIONAL', // For API Gateway (CloudFront uses CLOUDFRONT scope)
      defaultAction: { allow: {} }, // Allow by default, block on rule match
      visibilityConfig: {
        sampledRequestsEnabled: true, // Enable request sampling for investigation
        cloudWatchMetricsEnabled: true, // Enable CloudWatch metrics
        metricName: `EveryoneCook-API-WAF-${this.config.environment}`,
      },
      rules: [
        // Rule 1: Rate Limiting (2000 req/5min per IP)
        // Protects against DDoS and brute force attacks
        // Note: Increased from 100 to 2000 to accommodate frontend polling
        // (notifications, comments, feed, trending all poll periodically)
        {
          name: 'RateLimitRule',
          priority: 0,
          statement: {
            rateBasedStatement: {
              limit: 2000, // 2000 requests per 5 minutes (~6.7 req/sec)
              aggregateKeyType: 'IP', // Track by source IP address
            },
          },
          action: { block: {} }, // Block requests exceeding rate limit
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
          },
        },

        // Rule 2: AWS Managed - SQL Injection Protection
        // Protects against SQL injection attacks
        {
          name: 'AWSManagedRulesSQLi',
          priority: 1,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
          overrideAction: { none: {} }, // Use default action from managed rule
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesSQLi',
          },
        },

        // Rule 3: AWS Managed - Known Bad Inputs
        // Protects against known malicious patterns
        {
          name: 'AWSManagedRulesKnownBadInputs',
          priority: 2,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesKnownBadInputs',
          },
        },

        // Rule 4: AWS Managed - Core Rule Set (XSS, LFI, RFI, etc.)
        // Comprehensive protection against common web exploits
        {
          name: 'AWSManagedRulesCoreRuleSet',
          priority: 3,
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          overrideAction: { none: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AWSManagedRulesCoreRuleSet',
          },
        },

        // Rule 5: Request Size Limit (10MB)
        // Protects against large payload attacks
        {
          name: 'RequestSizeLimit',
          priority: 4,
          statement: {
            sizeConstraintStatement: {
              fieldToMatch: { body: {} }, // Check request body size
              comparisonOperator: 'GT', // Greater than
              size: 10485760, // 10MB in bytes
              textTransformations: [{ priority: 0, type: 'NONE' }],
            },
          },
          action: { block: {} }, // Block requests exceeding size limit
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RequestSizeLimit',
          },
        },
      ],
    });

    // Add tags
    cdk.Tags.of(webAcl).add('Component', 'Security');
    cdk.Tags.of(webAcl).add('Purpose', 'API-Gateway-Protection');
    cdk.Tags.of(webAcl).add('Layer', 'Security');

    return webAcl;
  }

  /**
   * Associate WAF Web ACL with API Gateway
   *
   * Task 5.8.1 Implementation:
   * - Step 2: Associate WAF Web ACL with API Gateway stage
   * - Creates WebACLAssociation resource
   * - Links WAF protection to API Gateway v1 stage
   *
   * Features:
   * - Automatic protection for all API Gateway endpoints
   * - No code changes required in Lambda functions
   * - Protection applied at API Gateway level (before Lambda invocation)
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Section 3: AWS WAF Configuration
   */
  private associateWafWithApiGateway(): void {
    if (!this.apiGatewayWebAcl) {
      return; // Skip if WAF Web ACL not created
    }

    // Associate WAF with API Gateway stage
    new cdk.aws_wafv2.CfnWebACLAssociation(this, 'ApiGatewayWafAssociation', {
      resourceArn: `arn:aws:apigateway:${this.region}::/restapis/${this.api.restApiId}/stages/${this.api.deploymentStage.stageName}`,
      webAclArn: this.apiGatewayWebAcl.attrArn,
    });
  }

  /**
   * Create CloudWatch alarms for WAF metrics
   *
   * Task 5.8.1 Implementation:
   * - Step 3: Create CloudWatch alarms for WAF blocked requests
   * - Monitor for potential DDoS attacks
   * - Alert when WAF blocks exceed threshold
   *
   * Features:
   * - High WAF blocks alarm: Alert when blocks exceed 1000 in 5 minutes
   * - Indicates potential DDoS attack or misconfigured client
   * - Helps identify security threats early
   *
   * @see .kiro/specs/project-restructure/monitoring-architecture.md - CloudWatch Alarms section
   * @see .kiro/specs/project-restructure/requirements.md - Req 12 (Monitoring & Observability)
   */
  private createWafCloudWatchAlarms(): void {
    if (!this.apiGatewayWebAcl || !this.config.cloudwatch.alarms.enabled) {
      return; // Skip if WAF Web ACL not created or alarms disabled
    }

    // Alarm for high WAF blocks (potential attack)
    new cdk.aws_cloudwatch.Alarm(this, 'HighWAFBlocks', {
      alarmName: `EveryoneCook-${this.config.environment}-API-WAF-HighBlocks`,
      alarmDescription: 'Alert when WAF blocks exceed 1000 in 5 minutes (potential DDoS attack)',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
          Region: this.region,
          Rule: 'ALL',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1000, // Alert if 1000+ blocks in 5 minutes
      evaluationPeriods: 2, // 2 consecutive periods (10 minutes total)
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm for rate limit rule violations
    new cdk.aws_cloudwatch.Alarm(this, 'RateLimitViolations', {
      alarmName: `EveryoneCook-${this.config.environment}-API-WAF-RateLimitViolations`,
      alarmDescription: 'Alert when rate limit rule blocks exceed 100 in 5 minutes',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/WAFV2',
        metricName: 'BlockedRequests',
        dimensionsMap: {
          WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
          Region: this.region,
          Rule: 'RateLimitRule',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100, // Alert if 100+ rate limit blocks in 5 minutes
      evaluationPeriods: 1,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Configure WAF logging and monitoring
   *
   * Task 5.8.3 Implementation:
   * - Step 1: Create CloudWatch Log Group for WAF logs
   * - Step 2: Enable WAF logging to CloudWatch
   * - Step 3: Create CloudWatch dashboard for WAF metrics
   * - Step 4: Create alarms for security events (SQLi, XSS, high blocks)
   *
   * Architecture:
   * - WAF logs → CloudWatch Log Group `/aws/waf/everyonecook-{env}`
   * - CloudWatch logs → S3 bucket `everyonecook-logs-{env}` (existing, from CoreStack)
   * - S3 Intelligent-Tiering for cost optimization (automatic after 30 days)
   * - 30-day retention in CloudWatch, long-term storage in S3
   *
   * Features:
   * - CloudWatch Log Group with KMS encryption
   * - 30-day retention in CloudWatch (dev), 90-day (prod)
   * - Automatic export to S3 logs bucket (Intelligent-Tiering)
   * - CloudWatch dashboard for WAF metrics visualization
   * - Security event alarms (SQLi attempts, XSS attempts, rate limit violations)
   *
   * Cost Estimate:
   * - CloudWatch Log Group: ~$0.50/month (200MB logs)
   * - S3 storage (in existing logs bucket): ~$0.01/month (Intelligent-Tiering)
   * - CloudWatch dashboard: $3/month
   * - Total: ~$3.51/month
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Section 3: AWS WAF Configuration
   * @see .kiro/specs/project-restructure/monitoring-architecture.md - Section 5.1: Log Groups Configuration
   * @see .kiro/specs/project-restructure/storage-architecture.md - Section 1: S3 Buckets (logs bucket)
   * @see .kiro/specs/project-restructure/requirements.md - Req 7.7, 7.15 (Security - Audit logging, CloudWatch alarms)
   */
  private configureWafLogging(): void {
    if (!this.apiGatewayWebAcl) {
      return; // Skip if WAF Web ACL not created
    }

    // Step 1: Create CloudWatch Log Group for WAF logs
    // AWS WAFv2 requires log group name to start with "aws-waf-logs-" prefix
    const wafLogGroup = new cdk.aws_logs.LogGroup(this, 'WafLogGroup', {
      logGroupName: `aws-waf-logs-everyonecook-${this.config.environment}`,
      retention: this.config.cloudwatch.logRetentionDays, // 30 days (dev), 90 days (prod)
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      // Note: KMS encryption is handled by CloudWatch Logs default encryption
    });

    // Add tags
    cdk.Tags.of(wafLogGroup).add('Component', 'Security');
    cdk.Tags.of(wafLogGroup).add('Purpose', 'WAF-Logs');
    cdk.Tags.of(wafLogGroup).add('Layer', 'Security');

    // Step 2: Enable WAF logging to CloudWatch
    // AWS WAFv2 LoggingConfiguration ARN format: arn:aws:logs:region:account:log-group:aws-waf-logs-name:*
    const wafLogDestination = `arn:aws:logs:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:log-group:${wafLogGroup.logGroupName}:*`;

    new cdk.aws_wafv2.CfnLoggingConfiguration(this, 'ApiGatewayWafLogging', {
      resourceArn: this.apiGatewayWebAcl.attrArn,
      logDestinationConfigs: [wafLogDestination],
    });

    // Step 3: Create CloudWatch dashboard for WAF metrics
    const wafDashboard = new cdk.aws_cloudwatch.Dashboard(this, 'WafDashboard', {
      dashboardName: `EveryoneCook-${this.config.environment}-WAF`,
    });

    // Add widgets to dashboard
    wafDashboard.addWidgets(
      // Row 1: Blocked vs Allowed Requests
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'WAF Blocked Requests',
        left: [
          new cdk.aws_cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
              Region: this.region,
              Rule: 'ALL',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Blocked Requests',
          }),
        ],
        width: 12,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'WAF Allowed Requests',
        left: [
          new cdk.aws_cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'AllowedRequests',
            dimensionsMap: {
              WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
              Region: this.region,
              Rule: 'ALL',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Allowed Requests',
          }),
        ],
        width: 12,
      })
    );

    // Row 2: Rule-specific metrics
    wafDashboard.addWidgets(
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'Rate Limit Blocks',
        left: [
          new cdk.aws_cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
              Region: this.region,
              Rule: 'RateLimitRule',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'Rate Limit Violations',
          }),
        ],
        width: 8,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'SQL Injection Blocks',
        left: [
          new cdk.aws_cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
              Region: this.region,
              Rule: 'AWSManagedRulesSQLi',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'SQLi Attempts',
          }),
        ],
        width: 8,
      }),
      new cdk.aws_cloudwatch.GraphWidget({
        title: 'XSS Attack Blocks',
        left: [
          new cdk.aws_cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            dimensionsMap: {
              WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
              Region: this.region,
              Rule: 'AWSManagedRulesCoreRuleSet',
            },
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
            label: 'XSS Attempts',
          }),
        ],
        width: 8,
      })
    );

    // Step 4: Create alarms for security events
    if (this.config.cloudwatch.alarms.enabled) {
      // Alarm for SQL injection attempts
      new cdk.aws_cloudwatch.Alarm(this, 'SQLiAttackAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-SQLi-Attack`,
        alarmDescription: 'Alert when SQL injection attempts are detected',
        metric: new cdk.aws_cloudwatch.Metric({
          namespace: 'AWS/WAFV2',
          metricName: 'BlockedRequests',
          dimensionsMap: {
            WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
            Region: this.region,
            Rule: 'AWSManagedRulesSQLi',
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10, // Alert if 10+ SQLi attempts in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for XSS attack attempts
      new cdk.aws_cloudwatch.Alarm(this, 'XSSAttackAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-XSS-Attack`,
        alarmDescription: 'Alert when XSS attack attempts are detected',
        metric: new cdk.aws_cloudwatch.Metric({
          namespace: 'AWS/WAFV2',
          metricName: 'BlockedRequests',
          dimensionsMap: {
            WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
            Region: this.region,
            Rule: 'AWSManagedRulesCoreRuleSet',
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10, // Alert if 10+ XSS attempts in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Alarm for known bad inputs
      new cdk.aws_cloudwatch.Alarm(this, 'KnownBadInputsAlarm', {
        alarmName: `EveryoneCook-${this.config.environment}-KnownBadInputs`,
        alarmDescription: 'Alert when known malicious patterns are detected',
        metric: new cdk.aws_cloudwatch.Metric({
          namespace: 'AWS/WAFV2',
          metricName: 'BlockedRequests',
          dimensionsMap: {
            WebACL: `EveryoneCook-API-WAF-${this.config.environment}`,
            Region: this.region,
            Rule: 'AWSManagedRulesKnownBadInputs',
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10, // Alert if 10+ known bad inputs in 5 minutes
        evaluationPeriods: 1,
        comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }
  }

  /**
   * Export stack outputs for cross-stack references
   *
   * Exports:
   * - API Gateway URL: EveryoneCook-{env}-ApiUrl
   * - API Gateway ID: EveryoneCook-{env}-ApiId
   * - API Custom Domain: EveryoneCook-{env}-ApiCustomDomain
   * - SQS Queue URLs: EveryoneCook-{env}-{QueueName}QueueUrl
   * - Lambda Function ARNs: EveryoneCook-{env}-{ModuleName}LambdaArn
   * - WAF WebACL ARN: EveryoneCook-{env}-WafWebAclArn
   *
   * These exports will be used by FrontendStack and ObservabilityStack
   */
  private exportOutputs(): void {
    // Export API Gateway outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      exportName: this.exportName('ApiUrl'),
      description: 'API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      exportName: this.exportName('ApiId'),
      description: 'API Gateway ID',
    });

    new cdk.CfnOutput(this, 'ApiRootResourceId', {
      value: this.api.root.resourceId,
      exportName: this.exportName('ApiRootResourceId'),
      description: 'API Gateway Root Resource ID',
    });

    // Export API Gateway custom domain (Task 5.1.7)
    new cdk.CfnOutput(this, 'ApiCustomDomain', {
      value: `https://${this.config.domains.api}`,
      exportName: this.exportName('ApiCustomDomain'),
      description: 'API Gateway Custom Domain URL',
    });

    new cdk.CfnOutput(this, 'ApiDomainName', {
      value: this.apiDomainName.domainName,
      exportName: this.exportName('ApiDomainName'),
      description: 'API Gateway Domain Name',
    });

    new cdk.CfnOutput(this, 'ApiDomainTarget', {
      value: this.apiDomainName.domainNameAliasDomainName,
      description: 'API Gateway Domain Alias Target (for DNS verification)',
    });

    // Export SQS Queue URLs
    new cdk.CfnOutput(this, 'AIQueueUrl', {
      value: this.aiQueue.queueUrl,
      exportName: this.exportName('AIQueueUrl'),
      description: 'AI Queue URL',
    });

    new cdk.CfnOutput(this, 'ImageProcessingQueueUrl', {
      value: this.imageProcessingQueue.queueUrl,
      exportName: this.exportName('ImageProcessingQueueUrl'),
      description: 'Image Processing Queue URL',
    });

    new cdk.CfnOutput(this, 'AnalyticsQueueUrl', {
      value: this.analyticsQueue.queueUrl,
      exportName: this.exportName('AnalyticsQueueUrl'),
      description: 'Analytics Queue URL',
    });

    new cdk.CfnOutput(this, 'NotificationQueueUrl', {
      value: this.notificationQueue.queueUrl,
      exportName: this.exportName('NotificationQueueUrl'),
      description: 'Notification Queue URL',
    });

    // Export Lambda Function ARNs (Task 5.2.3)
    new cdk.CfnOutput(this, 'ApiRouterFunctionArn', {
      value: this.apiRouterFunction.functionArn,
      exportName: this.exportName('ApiRouterFunctionArn'),
      description: 'API Router Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ApiRouterFunctionName', {
      value: this.apiRouterFunction.functionName,
      exportName: this.exportName('ApiRouterFunctionName'),
      description: 'API Router Lambda Function Name',
    });

    // Export Auth & User Lambda Function (Task 5.3.6)
    new cdk.CfnOutput(this, 'AuthUserFunctionArn', {
      value: this.authUserFunction.functionArn,
      exportName: this.exportName('AuthUserFunctionArn'),
      description: 'Auth & User Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'AuthUserFunctionName', {
      value: this.authUserFunction.functionName,
      exportName: this.exportName('AuthUserFunctionName'),
      description: 'Auth & User Lambda Function Name',
    });

    // Export Social Lambda Function (Task 5.4.8)
    new cdk.CfnOutput(this, 'SocialFunctionArn', {
      value: this.socialFunction.functionArn,
      exportName: this.exportName('SocialFunctionArn'),
      description: 'Social Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'SocialFunctionName', {
      value: this.socialFunction.functionName,
      exportName: this.exportName('SocialFunctionName'),
      description: 'Social Lambda Function Name',
    });

    // Export Recipe & AI Lambda Function (Task 5.5.9)
    new cdk.CfnOutput(this, 'RecipeAIFunctionArn', {
      value: this.recipeAIFunction.functionArn,
      exportName: this.exportName('RecipeAIFunctionArn'),
      description: 'Recipe & AI Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'RecipeAIFunctionName', {
      value: this.recipeAIFunction.functionName,
      exportName: this.exportName('RecipeAIFunctionName'),
      description: 'Recipe & AI Lambda Function Name',
    });

    // Export Admin Lambda Function (Task 5.6.5)
    new cdk.CfnOutput(this, 'AdminFunctionArn', {
      value: this.adminFunction.functionArn,
      exportName: this.exportName('AdminFunctionArn'),
      description: 'Admin Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'AdminFunctionName', {
      value: this.adminFunction.functionName,
      exportName: this.exportName('AdminFunctionName'),
      description: 'Admin Lambda Function Name',
    });

    // Export Upload Lambda Function (Task 5.7.5)
    new cdk.CfnOutput(this, 'UploadFunctionArn', {
      value: this.uploadFunction.functionArn,
      exportName: this.exportName('UploadFunctionArn'),
      description: 'Upload Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'UploadFunctionName', {
      value: this.uploadFunction.functionName,
      exportName: this.exportName('UploadFunctionName'),
      description: 'Upload Lambda Function Name',
    });

    // Export WAF Web ACL ARN (Task 5.8.1)
    if (this.apiGatewayWebAcl) {
      new cdk.CfnOutput(this, 'ApiGatewayWebAclArn', {
        value: this.apiGatewayWebAcl.attrArn,
        exportName: this.exportName('ApiGatewayWebAclArn'),
        description: 'API Gateway WAF Web ACL ARN',
      });

      new cdk.CfnOutput(this, 'ApiGatewayWebAclId', {
        value: this.apiGatewayWebAcl.attrId,
        exportName: this.exportName('ApiGatewayWebAclId'),
        description: 'API Gateway WAF Web ACL ID',
      });
    }

    // Additional exports will be added in subsequent tasks:
    // - CloudFront WAF WebACL ARN (Task 5.8.2)
  }
}
