import * as cdk from 'aws-cdk-lib';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';

// Task 2.2.2: Import Route 53 targets for CloudFront Alias record
import * as targets from 'aws-cdk-lib/aws-route53-targets';

/**
 * Core Stack for Everyone Cook Infrastructure
 *
 * This stack contains the foundational data layer infrastructure:
 * - DynamoDB Single Table with 5 GSI indexes (username-based PK)
 * - S3 buckets for content storage (avatars, posts, recipes, backgrounds)
 * - CloudFront CDN distribution with Origin Access Control
 * - KMS encryption keys for data security
 *
 * Schema Design:
 * - PK: USER#{username}, SK: PROFILE|RECIPE#{id}|POST#{id}
 * - Username is immutable and serves as primary identifier
 * - GSI1: User recipes by date (username-based)
 *
 * This is the first stack to deploy and rarely changes.
 * Other stacks depend on the resources created here.
 *
 * @see .kiro/specs/project-restructure/database-architecture.md - Single Table Design
 * @see .kiro/specs/project-restructure/storage-architecture.md - S3 and CloudFront setup
 * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy)
 */
export class CoreStack extends BaseStack {
  // DynamoDB Table
  public readonly table: cdk.aws_dynamodb.Table;

  // S3 Buckets
  public readonly contentBucket: cdk.aws_s3.Bucket;
  public readonly cdnLogsBucket: cdk.aws_s3.Bucket;

  // CloudFront Distribution
  public readonly distribution: cdk.aws_cloudfront.Distribution;
  public readonly cloudFrontKeyGroup: cdk.aws_cloudfront.KeyGroup;
  public readonly cloudFrontPublicKey: cdk.aws_cloudfront.PublicKey;

  // KMS Keys
  public readonly dynamoDbKey: cdk.aws_kms.Key;
  public readonly s3Key: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Add stack-specific tags for cost tracking
    cdk.Tags.of(this).add('StackType', 'Core');
    cdk.Tags.of(this).add('Layer', 'Data');
    cdk.Tags.of(this).add('CostCenter', `Core-${this.config.environment}`);

    // Task 2.1.4: Create KMS keys for encryption
    this.dynamoDbKey = this.createDynamoDBKey();
    this.s3Key = this.createS3Key();

    // Task 2.1.2: Create DynamoDB Single Table
    this.table = this.createDynamoDBTable();

    // Task 2.2.1: Create S3 content bucket with Intelligent-Tiering
    this.contentBucket = this.createContentBucket();

    // Task 2.2.2: Create CDN logs bucket with Intelligent-Tiering
    // Note: logsBucket removed - CloudWatch logs are retained for 3 days and auto-deleted
    // No need for S3 archive as CloudWatch retention is sufficient for debugging
    this.cdnLogsBucket = this.createCdnLogsBucket();

    // Task 2.2.4: Setup CloudFront key pair and key group for signed URLs
    // Note: Temporarily disabled until we generate actual key pair
    // const { publicKey, keyGroup } = this.createCloudFrontKeyGroup();
    // this.cloudFrontPublicKey = publicKey;
    // this.cloudFrontKeyGroup = keyGroup;

    // Task 2.2.3: Setup CloudFront distribution with optimization
    this.distribution = this.createCloudFrontDistribution();

    // Export stack outputs for cross-stack references
    this.exportOutputs();
  }

  /**
   * Create KMS key for DynamoDB encryption
   *
   * Task 2.1.4: Setup encryption and security
   *
   * Features:
   * - Customer managed KMS key for DynamoDB encryption at rest
   * - Automatic key rotation enabled (yearly)
   * - Deletion protection for production environment
   * - CloudWatch alarms for key usage monitoring
   * - IAM policies for Lambda and service access
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Encryption section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security)
   */
  private createDynamoDBKey(): cdk.aws_kms.Key {
    const key = new cdk.aws_kms.Key(this, 'DynamoDBKey', {
      alias: `everyonecook-dynamodb-${this.config.environment}`,
      description: `KMS key for DynamoDB encryption in ${this.config.environment} environment`,

      // Enable automatic key rotation (yearly)
      enableKeyRotation: true,

      // Deletion protection for production
      pendingWindow:
        this.config.environment === 'prod' ? cdk.Duration.days(30) : cdk.Duration.days(7),

      // Removal policy: RETAIN for prod, DESTROY for dev/staging
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add key policy for DynamoDB service
    key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow DynamoDB to use the key',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('dynamodb.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:CreateGrant'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `dynamodb.${this.region}.amazonaws.com`,
          },
        },
      })
    );

    // Add key policy for CloudWatch Logs
    key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow CloudWatch Logs to use the key',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal(`logs.${this.region}.amazonaws.com`)],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:CreateGrant',
          'kms:DescribeKey',
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${this.region}:${this.account}:*`,
          },
        },
      })
    );

    // Add tags for cost tracking
    cdk.Tags.of(key).add('Name', `everyonecook-dynamodb-${this.config.environment}`);
    cdk.Tags.of(key).add('Environment', this.config.environment);
    cdk.Tags.of(key).add('Service', 'KMS');
    cdk.Tags.of(key).add('Purpose', 'DynamoDB-Encryption');

    // Create CloudWatch alarms for key usage
    this.createKMSAlarms(key, 'DynamoDB');

    return key;
  }

  /**
   * Create KMS key for S3 encryption
   *
   * Task 2.1.4: Setup encryption and security
   *
   * Features:
   * - Customer managed KMS key for S3 bucket encryption
   * - Automatic key rotation enabled (yearly)
   * - Deletion protection for production environment
   * - IAM policies for S3 and CloudFront access
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Encryption section
   * @see .kiro/specs/project-restructure/storage-architecture.md - S3 encryption
   */
  private createS3Key(): cdk.aws_kms.Key {
    const key = new cdk.aws_kms.Key(this, 'S3Key', {
      alias: `everyonecook-s3-${this.config.environment}`,
      description: `KMS key for S3 encryption in ${this.config.environment} environment`,

      // Enable automatic key rotation (yearly)
      enableKeyRotation: true,

      // Deletion protection for production
      pendingWindow:
        this.config.environment === 'prod' ? cdk.Duration.days(30) : cdk.Duration.days(7),

      // Removal policy: RETAIN for prod, DESTROY for dev/staging
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add key policy for S3 service
    key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow S3 to use the key',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
      })
    );

    // Add key policy for CloudFront (for signed URLs)
    key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow CloudFront to use the key',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: ['*'],
      })
    );

    // Add tags for cost tracking
    cdk.Tags.of(key).add('Name', `everyonecook-s3-${this.config.environment}`);
    cdk.Tags.of(key).add('Environment', this.config.environment);
    cdk.Tags.of(key).add('Service', 'KMS');
    cdk.Tags.of(key).add('Purpose', 'S3-Encryption');

    // Create CloudWatch alarms for key usage
    this.createKMSAlarms(key, 'S3');

    return key;
  }

  /**
   * Create CloudWatch alarms for KMS key usage monitoring
   *
   * Task 2.1.4: Setup encryption and security
   *
   * Monitors:
   * - Key usage (encrypt/decrypt operations)
   * - Key errors (access denied, invalid key state)
   *
   * @param key - KMS key to monitor
   * @param purpose - Purpose of the key (DynamoDB or S3)
   */
  private createKMSAlarms(key: cdk.aws_kms.Key, purpose: string): void {
    // Only create alarms if enabled in config
    if (!this.config.cloudwatch.alarms.enabled) {
      return;
    }

    // KMS Key Usage Alarm (high usage may indicate issues)
    new cdk.aws_cloudwatch.Alarm(this, `${purpose}KMSUsageAlarm`, {
      alarmName: `EveryoneCook-${this.config.environment}-${purpose}-KMS-HighUsage`,
      alarmDescription: `Alert when ${purpose} KMS key usage is unusually high`,
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/KMS',
        metricName: 'NumberOfOperations',
        dimensionsMap: {
          KeyId: key.keyId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1000,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Create DynamoDB Single Table with cost optimization
   *
   * Task 2.1.2: Implement DynamoDB Single Table with cost optimization
   * Task 2.1.3: Create 5 GSI indexes for diverse access patterns
   * Task 2.1.4: Enable encryption at rest with customer managed KMS key
   *
   * Schema Design:
   * - PK: USER#{username} (username is immutable primary identifier)
   * - SK: PROFILE|POST#{postId}|RECIPE#{recipeId}
   * - GSI1: User recipes by date (username-based)
   * - GSI2-GSI5: Posts, trending, ingredients, dictionary
   *
   * Features:
   * - Single Table Design with PK/SK pattern
   * - 5 GSI indexes for different access patterns
   * - Provisioned Mode with Auto-Scaling for prod/staging (cost optimization)
   * - Pay-per-request for dev (simplicity)
   * - Point-in-time recovery for prod/staging
   * - DynamoDB Streams enabled (NEW_AND_OLD_IMAGES)
   * - TTL attribute configured for automatic cleanup
   * - CloudWatch alarms for throttling detection
   * - Customer managed KMS encryption at rest
   *
   * @see .kiro/specs/project-restructure/database-architecture.md - Single Table Design
   * @see .kiro/specs/project-restructure/requirements.md - Req 6, Req 7, Req 11
   */
  private createDynamoDBTable(): cdk.aws_dynamodb.Table {
    const tableName = `EveryoneCook-${this.config.environment}-v2`; // v2 to avoid conflict
    const dbConfig = this.config.dynamodb;

    // Create table with appropriate billing mode
    const table = new cdk.aws_dynamodb.Table(this, 'EveryoneCookTable', {
      tableName,
      partitionKey: {
        name: 'PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },

      // Billing mode: PROVISIONED for prod/staging, PAY_PER_REQUEST for dev
      billingMode:
        dbConfig.billingMode === 'PROVISIONED'
          ? cdk.aws_dynamodb.BillingMode.PROVISIONED
          : cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,

      // Set read/write capacity for PROVISIONED mode
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),

      // Enable point-in-time recovery for prod/staging
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: dbConfig.pointInTimeRecovery,
      },

      // Enable deletion protection for production
      deletionProtection: dbConfig.deletionProtection,

      // Enable DynamoDB Streams for event-driven architecture
      stream: dbConfig.streamEnabled
        ? cdk.aws_dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
        : undefined,

      // Configure TTL attribute for automatic cleanup
      timeToLiveAttribute: 'ttl',

      // Task 2.1.4: Encryption at rest with customer managed KMS key
      encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.dynamoDbKey,

      // Removal policy: RETAIN for prod, DESTROY for dev/staging
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Task 2.1.3: Add 5 GSI indexes for diverse access patterns
    this.addGlobalSecondaryIndexes(table, dbConfig);

    // Add tags for cost tracking
    cdk.Tags.of(table).add('Name', tableName);
    cdk.Tags.of(table).add('Environment', this.config.environment);
    cdk.Tags.of(table).add('Service', 'DynamoDB');
    cdk.Tags.of(table).add('CostCenter', `Core-${this.config.environment}`);

    // Configure Auto-Scaling for PROVISIONED mode
    if (dbConfig.billingMode === 'PROVISIONED' && dbConfig.autoScaling) {
      const { minCapacity, maxCapacity, targetUtilization } = dbConfig.autoScaling;

      // Read capacity auto-scaling
      const readScaling = table.autoScaleReadCapacity({
        minCapacity,
        maxCapacity,
      });

      readScaling.scaleOnUtilization({
        targetUtilizationPercent: targetUtilization,
      });

      // Write capacity auto-scaling
      const writeScaling = table.autoScaleWriteCapacity({
        minCapacity,
        maxCapacity,
      });

      writeScaling.scaleOnUtilization({
        targetUtilizationPercent: targetUtilization,
      });
    }

    // CloudWatch Alarms for throttling detection
    this.createDynamoDBAlarms(table);

    return table;
  }

  /**
   * Add 5 Global Secondary Indexes for diverse access patterns
   *
   * Task 2.1.3: Create 5 GSI indexes
   *
   * Schema Change: Using USERNAME as PK instead of userId
   * - PK: USER#{username}, SK: PROFILE|RECIPE#{id}|POST#{id}
   *
   * ACTUAL GSI USAGE (as implemented in code):
   * GSI1: Friend relationships (reverse lookup) + Notifications (unread)
   *       - Friend: GSI1PK=USER#{userId}, GSI1SK=FRIEND#{friendId}
   *       - Notification: GSI1PK=USER#{userId}#UNREAD, GSI1SK=timestamp
   *       ⚠️ Overloaded: 2 access patterns on same GSI (acceptable for now)
   *
   * GSI2: Public feed + Search fallback + Private posts
   *       - Public: GSI2PK=POST#PUBLIC, GSI2SK=timestamp
   *       - Private: GSI2PK=POST#{userId}, GSI2SK=timestamp
   *       - Cache: GSI2PK=CACHE#PUBLIC, GSI2SK=timestamp
   *       ✅ Well-designed: Clear partition separation
   *
   * GSI3: Trending posts + User recipe groups
   *       - Trending: GSI3PK=POST#TRENDING, GSI3SK={likes}#{timestamp}
   *       - Groups: GSI3PK=USER#{userId}#GROUPS, GSI3SK=GROUP#{groupId}
   *       ⚠️ Shared: 2 different use cases, but different partition keys (OK)
   *
   * GSI4: Ingredient-based search (Posts + AI Cache)
   *       - Posts: GSI4PK=POST_INGREDIENT#{ingredient}, GSI4SK=POST#{id}
   *       - Cache: GSI4PK=CACHE_INGREDIENT#{ingredient}, GSI4SK=AI_CACHE#{key}
   *       ✅ High volume: Critical for search functionality
   *
   * GSI5: Dictionary duplicate prevention (English → Vietnamese lookup)
   *       - GSI5PK=ENGLISH_NAME#{normalized}, GSI5SK=DICTIONARY
   *       ✅ Specialized: Low volume, clear purpose
   *
   * All GSIs use ProjectionType.ALL for complete data access
   * Auto-scaling configured same as base table (2-10 RCU/WCU, 70% target)
   *
   * Note: See docs/GSI-DETAILED-ANALYSIS.md for complete usage analysis
   * @see .kiro/specs/project-restructure/database-architecture.md - GSI Configurations
   * @param table - DynamoDB table to add GSIs to
   * @param dbConfig - Database configuration
   */
  private addGlobalSecondaryIndexes(
    table: cdk.aws_dynamodb.Table,
    dbConfig: {
      billingMode: string;
      readCapacity?: number;
      writeCapacity?: number;
      autoScaling?: {
        minCapacity: number;
        maxCapacity: number;
        targetUtilization: number;
      };
    }
  ): void {
    // GSI1: Friend relationships (reverse lookup) + Notifications (unread)
    // ACTUAL USAGE (not User recipes as originally designed):
    //   1. Friend reverse: GSI1PK = "USER#{friendId}", GSI1SK = "FRIEND#{userId}"
    //      Query: Find all users who have {friendId} as friend
    //   2. Unread notifications: GSI1PK = "USER#{userId}#UNREAD", GSI1SK = timestamp
    //      Query: Get all unread notifications for user
    // Note: User recipes query pattern is NOT implemented (uses main table instead)
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: {
        name: 'GSI1PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),
    });

    // GSI2: Search and discovery (GSI2PK, GSI2SK)
    // Use case: Public posts feed, sorted by timestamp
    // Example: GSI2PK = "POST#PUBLIC", GSI2SK = "2025-01-20T10:00:00Z"
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: {
        name: 'GSI2PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),
    });

    // GSI3: Trending posts + User recipe groups (GSI3PK, GSI3SK)
    // DUAL PURPOSE (different partition keys - no conflict):
    //   1. Trending posts: GSI3PK = "POST#TRENDING", GSI3SK = "{likes_padded}#{timestamp}"
    //      Query: Get trending posts sorted by engagement (hot partition warning!)
    //   2. Recipe groups: GSI3PK = "USER#{userId}#GROUPS", GSI3SK = "GROUP#{groupId}"
    //      Query: Get all recipe collections for a user
    // Note: Different partition keys avoid direct conflict, but monitor for hot partitions
    table.addGlobalSecondaryIndex({
      indexName: 'GSI3',
      partitionKey: {
        name: 'GSI3PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI3SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),
    });

    // GSI4: Ingredient-based search (GSI4PK, GSI4SK)
    // Use case: Find posts/recipes by ingredient
    // Example: GSI4PK = "POST_INGREDIENT#pork-belly", GSI4SK = "POST#post123"
    table.addGlobalSecondaryIndex({
      indexName: 'GSI4',
      partitionKey: {
        name: 'GSI4PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI4SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),
    });

    // GSI5: Duplicate prevention (GSI5PK, GSI5SK)
    // Use case: Dictionary reverse lookup (English → Vietnamese)
    // Example: GSI5PK = "pork-belly", GSI5SK = "DICTIONARY"
    table.addGlobalSecondaryIndex({
      indexName: 'GSI5',
      partitionKey: {
        name: 'GSI5PK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI5SK',
        type: cdk.aws_dynamodb.AttributeType.STRING,
      },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      ...(dbConfig.billingMode === 'PROVISIONED' && {
        readCapacity: dbConfig.readCapacity,
        writeCapacity: dbConfig.writeCapacity,
      }),
    });

    // Configure Auto-Scaling for each GSI (same as base table)
    if (dbConfig.billingMode === 'PROVISIONED' && dbConfig.autoScaling) {
      this.configureGSIAutoScaling(table, dbConfig.autoScaling);
    }
  }

  /**
   * Configure Auto-Scaling for all GSI indexes
   *
   * Applies same auto-scaling configuration as base table:
   * - Min capacity: 2 RCU/WCU
   * - Max capacity: 10 RCU/WCU
   * - Target utilization: 70%
   *
   * Note: All 5 GSIs configured with username-based schema
   *
   * @param table - DynamoDB table with GSIs
   * @param autoScalingConfig - Auto-scaling configuration
   */
  private configureGSIAutoScaling(
    table: cdk.aws_dynamodb.Table,
    autoScalingConfig: {
      minCapacity: number;
      maxCapacity: number;
      targetUtilization: number;
    }
  ): void {
    const { minCapacity, maxCapacity, targetUtilization } = autoScalingConfig;
    const gsiNames = ['GSI1', 'GSI2', 'GSI3', 'GSI4', 'GSI5'];

    gsiNames.forEach((gsiName) => {
      // Read capacity auto-scaling
      const readScaling = table.autoScaleGlobalSecondaryIndexReadCapacity(gsiName, {
        minCapacity,
        maxCapacity,
      });

      readScaling.scaleOnUtilization({
        targetUtilizationPercent: targetUtilization,
      });

      // Write capacity auto-scaling
      const writeScaling = table.autoScaleGlobalSecondaryIndexWriteCapacity(gsiName, {
        minCapacity,
        maxCapacity,
      });

      writeScaling.scaleOnUtilization({
        targetUtilizationPercent: targetUtilization,
      });
    });
  }

  /**
   * Create CloudWatch alarms for DynamoDB throttling detection
   *
   * Monitors:
   * - Read throttle events
   * - Write throttle events
   * - System errors
   *
   * @param table - DynamoDB table to monitor
   */
  private createDynamoDBAlarms(table: cdk.aws_dynamodb.Table): void {
    // Only create alarms if enabled in config
    if (!this.config.cloudwatch.alarms.enabled) {
      return;
    }

    // Read Throttle Alarm
    new cdk.aws_cloudwatch.Alarm(this, 'DynamoDBReadThrottleAlarm', {
      alarmName: `${table.tableName}-ReadThrottle`,
      alarmDescription: 'Alert when DynamoDB read requests are throttled',
      metric: table.metricUserErrors({
        dimensionsMap: {
          TableName: table.tableName,
          Operation: 'GetItem',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Write Throttle Alarm
    new cdk.aws_cloudwatch.Alarm(this, 'DynamoDBWriteThrottleAlarm', {
      alarmName: `${table.tableName}-WriteThrottle`,
      alarmDescription: 'Alert when DynamoDB write requests are throttled',
      metric: table.metricUserErrors({
        dimensionsMap: {
          TableName: table.tableName,
          Operation: 'PutItem',
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // System Errors Alarm
    new cdk.aws_cloudwatch.Alarm(this, 'DynamoDBSystemErrorsAlarm', {
      alarmName: `${table.tableName}-SystemErrors`,
      alarmDescription: 'Alert when DynamoDB encounters system errors',
      metric: table.metricSystemErrorsForOperations({
        operations: [
          cdk.aws_dynamodb.Operation.GET_ITEM,
          cdk.aws_dynamodb.Operation.PUT_ITEM,
          cdk.aws_dynamodb.Operation.QUERY,
          cdk.aws_dynamodb.Operation.SCAN,
        ],
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Create S3 bucket for content storage with Intelligent-Tiering
   *
   * Task 2.2.1: Create S3 bucket for content storage with Intelligent-Tiering
   *
   * Features:
   * - Private bucket (Block ALL public access)
   * - Versioning enabled for production environment
   * - S3 Intelligent-Tiering for automatic cost optimization (57% savings)
   * - Archive tier after 90 days, Deep Archive after 180 days
   * - CORS configuration for frontend access
   * - Lifecycle rule to delete old versions after 30 days
   * - S3-managed encryption at rest
   * - Folder structure: avatars/, backgrounds/, recipes/, posts/
   *
   * Cost Optimization:
   * - Intelligent-Tiering: $0.023/GB (Frequent) → $0.00099/GB (Deep Archive)
   * - 100GB content: $2.30/month → $0.98/month after 12 months (57% reduction)
   *
   * @see .kiro/specs/project-restructure/storage-architecture.md - S3 Intelligent-Tiering section
   * @see .kiro/specs/project-restructure/requirements.md - Req 6, Req 11
   */
  private createContentBucket(): cdk.aws_s3.Bucket {
    const bucketName = `everyonecook-content-${this.config.environment}`;
    const s3Config = this.config.s3;

    const bucket = new cdk.aws_s3.Bucket(this, 'ContentBucket', {
      bucketName,

      // Step 2: Block ALL public access (private bucket)
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,

      // Step 3: Enable versioning for production environment
      versioned: s3Config.versioning,

      // Step 8: Configure bucket encryption (S3-managed keys)
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,

      // Step 4 & 5: Enable S3 Intelligent-Tiering for cost optimization
      ...(s3Config.lifecycleRules.intelligentTiering && {
        intelligentTieringConfigurations: [
          {
            name: 'EntireBucket',
            archiveAccessTierTime: cdk.Duration.days(s3Config.lifecycleRules.archiveAfterDays),
            deepArchiveAccessTierTime: cdk.Duration.days(
              s3Config.lifecycleRules.deepArchiveAfterDays
            ),
          },
        ],
      }),

      // Step 7: Add lifecycle rules
      lifecycleRules: [
        // Rule 1: Delete old versions after 30 days
        {
          id: 'DeleteOldVersions',
          enabled: s3Config.versioning,
          noncurrentVersionExpiration: cdk.Duration.days(
            s3Config.lifecycleRules.deleteOldVersionsAfterDays
          ),
        },
        // Rule 2: Auto-delete orphan temp uploads after 24 hours
        // Temp folder is used for post images before post is created
        // If post creation fails or user cancels, these files are cleaned up automatically
        {
          id: 'DeleteTempUploads',
          enabled: true,
          prefix: 'posts/temp/',
          expiration: cdk.Duration.days(1), // 24 hours
        },
      ],

      // Step 6: Setup CORS for frontend access
      cors: [
        {
          allowedOrigins: [
            `https://${this.config.domain.frontend}`,
            ...(this.config.environment === 'dev' ? ['http://localhost:3000'] : []),
          ],
          allowedMethods: [
            cdk.aws_s3.HttpMethods.GET,
            cdk.aws_s3.HttpMethods.PUT,
            cdk.aws_s3.HttpMethods.POST,
            cdk.aws_s3.HttpMethods.DELETE,
          ],
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],

      // Removal policy: RETAIN for prod, DESTROY for dev/staging
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,

      // Auto-delete objects for non-prod environments
      autoDeleteObjects: this.config.environment !== 'prod',
    });

    // Add tags for cost tracking
    cdk.Tags.of(bucket).add('Name', bucketName);
    cdk.Tags.of(bucket).add('Environment', this.config.environment);
    cdk.Tags.of(bucket).add('Service', 'S3');
    cdk.Tags.of(bucket).add('Purpose', 'Content-Storage');
    cdk.Tags.of(bucket).add('CostCenter', `Core-${this.config.environment}`);

    // Create CloudWatch alarms for bucket monitoring
    this.createS3Alarms(bucket);

    return bucket;
  }

  /**
   * Create S3 bucket for CloudWatch logs archive with Intelligent-Tiering
   *
   * Task 2.2.2: Create additional S3 buckets with Intelligent-Tiering
   *
   * Features:
   * - Private bucket (Block ALL public access)
   * - S3 Intelligent-Tiering for automatic cost optimization (57% savings)
   * - Archive tier after 90 days, Deep Archive after 180 days
   * - Lambda export access only
  /**
   * Create S3 bucket for CloudFront CDN logs with Intelligent-Tiering
   *
   * Task 2.2.2: Create additional S3 buckets with Intelligent-Tiering
   *
   * Features:
   * - Private bucket (Block ALL public access)
   * - S3 Intelligent-Tiering for automatic cost optimization
   * - Archive tier after 90 days, Deep Archive after 180 days
   * - CloudFront logging access
   * - S3-managed encryption at rest
   * - Lifecycle policy for automatic tier transitions
   *
   * Cost Optimization:
   * - Minimal storage (~1GB CDN logs)
   * - Monthly: ~$0.02/month
   *
   * @see .kiro/specs/project-restructure/storage-architecture.md - S3 Intelligent-Tiering section
   * @see .kiro/specs/project-restructure/requirements.md - Req 6, Req 11
   */
  private createCdnLogsBucket(): cdk.aws_s3.Bucket {
    const bucketName = `everyonecook-cdn-logs-${this.config.environment}`;
    const s3Config = this.config.s3;

    const bucket = new cdk.aws_s3.Bucket(this, 'CdnLogsBucket', {
      bucketName,

      // Block ALL public access (private bucket)
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,

      // No versioning needed for CDN logs
      versioned: false,

      // Configure bucket encryption (S3-managed keys)
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,

      // Enable S3 Intelligent-Tiering for cost optimization
      ...(s3Config.lifecycleRules.intelligentTiering && {
        intelligentTieringConfigurations: [
          {
            name: 'CDNLogArchive',
            archiveAccessTierTime: cdk.Duration.days(s3Config.lifecycleRules.archiveAfterDays),
            deepArchiveAccessTierTime: cdk.Duration.days(
              s3Config.lifecycleRules.deepArchiveAfterDays
            ),
          },
        ],
      }),

      // Lifecycle rule for automatic tier transitions
      lifecycleRules: [
        {
          id: 'TransitionToIntelligentTiering',
          enabled: s3Config.lifecycleRules.intelligentTiering,
          transitions: [
            {
              storageClass: cdk.aws_s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(0), // Immediate transition
            },
          ],
        },
      ],

      // Removal policy: RETAIN for prod, DESTROY for dev/staging
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,

      // Auto-delete objects for non-prod environments
      autoDeleteObjects: this.config.environment !== 'prod',

      // Grant CloudFront access for logging
      objectOwnership: cdk.aws_s3.ObjectOwnership.OBJECT_WRITER,
    });

    // Add bucket policy for CloudFront logging access
    bucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'AllowCloudFrontLogging',
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:PutObject'],
        resources: [`${bucket.bucketArn}/*`],
        conditions: {
          StringEquals: {
            'AWS:SourceAccount': this.account,
          },
        },
      })
    );

    // Add tags for cost tracking
    cdk.Tags.of(bucket).add('Name', bucketName);
    cdk.Tags.of(bucket).add('Environment', this.config.environment);
    cdk.Tags.of(bucket).add('Service', 'S3');
    cdk.Tags.of(bucket).add('Purpose', 'CDN-Logs');
    cdk.Tags.of(bucket).add('CostCenter', `Core-${this.config.environment}`);

    return bucket;
  }

  /**
   * Create CloudFront key pair and key group for signed URLs
   *
   * Task 2.2.4: Configure CloudFront signed URLs for private content
   *
   * Features:
   * - Public key for CloudFront signing
   * - Key group for trusted signers
   * - Used for private content (avatars, backgrounds, recipes)
   * - Enables time-limited access to private S3 objects
   *
   * Security:
   * - Private key stored in AWS Secrets Manager (manual step)
   * - Public key registered with CloudFront
   * - Key rotation supported via key group updates
   *
   * @see .kiro/specs/project-restructure/storage-architecture.md - CloudFront Signed URLs section
   * @see .kiro/specs/project-restructure/requirements.md - Req 7 (Security)
   * @returns Object containing public key and key group
   */
  private createCloudFrontKeyGroup(): {
    publicKey: cdk.aws_cloudfront.PublicKey;
    keyGroup: cdk.aws_cloudfront.KeyGroup;
  } {
    // Note: The actual public key value must be generated manually and stored in Secrets Manager
    // This is a placeholder that will be replaced during deployment
    // To generate a key pair:
    // 1. openssl genrsa -out private_key.pem 2048
    // 2. openssl rsa -pubout -in private_key.pem -out public_key.pem
    // 3. Store private_key.pem in AWS Secrets Manager
    // 4. Use public_key.pem content here

    // For now, we'll use a parameter to allow the public key to be provided at deploy time
    const publicKeyValue = new cdk.CfnParameter(this, 'CloudFrontPublicKeyParam', {
      type: 'String',
      description:
        'CloudFront public key for signed URLs (PEM format). Generate with: openssl genrsa -out private_key.pem 2048 && openssl rsa -pubout -in private_key.pem -out public_key.pem',
      noEcho: false,
      default: 'PLACEHOLDER_PUBLIC_KEY',
    });

    // Create CloudFront public key
    const publicKey = new cdk.aws_cloudfront.PublicKey(this, 'CloudFrontPublicKey', {
      publicKeyName: `everyonecook-cf-key-${this.config.environment}`,
      comment: `CloudFront public key for signed URLs in ${this.config.environment} environment`,
      encodedKey: publicKeyValue.valueAsString,
    });

    // Create key group with the public key
    const keyGroup = new cdk.aws_cloudfront.KeyGroup(this, 'CloudFrontKeyGroup', {
      keyGroupName: `everyonecook-cf-keygroup-${this.config.environment}`,
      comment: `CloudFront key group for signed URLs in ${this.config.environment} environment`,
      items: [publicKey],
    });

    // Add tags for tracking
    cdk.Tags.of(publicKey).add('Name', `everyonecook-cf-key-${this.config.environment}`);
    cdk.Tags.of(publicKey).add('Environment', this.config.environment);
    cdk.Tags.of(publicKey).add('Service', 'CloudFront');
    cdk.Tags.of(publicKey).add('Purpose', 'Signed-URLs');

    return { publicKey, keyGroup };
  }

  /**
   * Create CloudFront distribution with compression and caching optimization
   *
   * Task 2.2.3: Setup CloudFront distribution with optimization
   * Task 2.2.4: Configure signed URLs for private content
   *
   * Features:
   * - Origin Access Control (OAC) for S3 security
   * - HTTPS redirect for all requests
   * - Gzip/Brotli compression enabled (70-80% size reduction)
   * - Cache policies: CACHING_OPTIMIZED for public, CACHING_DISABLED for private
   * - Price Class 200 (US, Europe, Asia) for cost optimization
   * - Cache TTL: default 24h, max 7 days
   * - Custom domain: cdn.everyonecook.cloud
   * - CloudWatch metrics for cache hit rate monitoring
   * - Security headers (HSTS, X-Frame-Options, etc.)
   *
   * Cost Optimization:
   * - Compression: 70-80% size reduction
   * - Price Class 200: 45% cost reduction vs Price Class All
   * - Cache hit rate target: >90%
   *
   * ✅ CDK v2.223.0+ Implementation:
   * - Using S3BucketOrigin.withOriginAccessControl() (new API)
   * - OAC is created automatically by the origin
   * - S3 bucket policy is created automatically
   * - Zero deprecation warnings
   * - Clean, modern CDK code
   *
   * @see .kiro/specs/project-restructure/storage-architecture.md - CloudFront Optimization section
   * @see .kiro/specs/project-restructure/requirements.md - Req 6, Req 11
   */
  private createCloudFrontDistribution(): cdk.aws_cloudfront.Distribution {
    const cloudFrontConfig = this.config.cloudfront;

    // Task 2.2.2 Step 1: Import Route 53 Hosted Zone from Phase 2 (DnsStack)
    const hostedZone = cdk.aws_route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: cdk.Fn.importValue(this.exportName('HostedZoneId')),
      zoneName: 'everyonecook.cloud',
    });

    // Task 2.2.2 Step 2: Import ACM certificate from Certificate Stack (us-east-1)
    // Certificate is created in a separate stack in us-east-1 region
    // Cannot use Fn.importValue for cross-region references
    // Certificate ARN from Certificate Stack: arn:aws:acm:us-east-1:616580903213:certificate/8d53776e-0480-47d2-a6ff-4fe9b2eb6534
    const certificate = cdk.aws_certificatemanager.Certificate.fromCertificateArn(
      this,
      'ImportedCloudFrontCertificate',
      'arn:aws:acm:us-east-1:616580903213:certificate/8d53776e-0480-47d2-a6ff-4fe9b2eb6534'
    );

    // COST OPTIMIZATION: CloudFront WAF removed
    // CloudFront is protected by Shield Standard (free, auto-enabled)
    // API Gateway has full WAF protection in BackendStack
    // Savings: $9/month ($108/year)

    // Step 1: Origin Access Control (OAC) is created automatically by S3BucketOrigin.withOriginAccessControl()
    // No need to create it manually - the new API handles it internally

    // Step 3 & 4: Create cache policies
    // Public content cache policy (CACHING_OPTIMIZED)
    const publicCachePolicy = new cdk.aws_cloudfront.CachePolicy(this, 'PublicCachePolicy', {
      cachePolicyName: `EveryoneCook-Public-${this.config.environment}`,
      comment: 'Cache policy for public posts with compression',

      // Step 6: Set cache TTL
      defaultTtl: cdk.Duration.seconds(cloudFrontConfig.cacheTTL.default), // 24h
      maxTtl: cdk.Duration.seconds(cloudFrontConfig.cacheTTL.max), // 7 days
      minTtl: cdk.Duration.seconds(0),

      // Step 3: Enable compression
      // Note: When enableAcceptEncodingGzip is true, we CANNOT whitelist Accept-Encoding header
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,

      // Query string and header handling
      queryStringBehavior: cdk.aws_cloudfront.CacheQueryStringBehavior.all(),
      // Fix: Remove Accept-Encoding from whitelist when compression is enabled
      headerBehavior: cdk.aws_cloudfront.CacheHeaderBehavior.allowList('CloudFront-Viewer-Country'),
      cookieBehavior: cdk.aws_cloudfront.CacheCookieBehavior.none(),
    });

    // Security headers policy
    const securityHeadersPolicy = new cdk.aws_cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeaders',
      {
        responseHeadersPolicyName: `EveryoneCook-Security-${this.config.environment}`,
        comment: 'Security headers for CloudFront distribution',

        // Security headers
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cdk.aws_cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cdk.aws_cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
        },

        // CORS headers for frontend access
        corsBehavior: {
          accessControlAllowOrigins: [
            `https://${this.config.domain.frontend}`,
            ...(this.config.environment === 'dev' ? ['http://localhost:3000'] : []),
          ],
          accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
          accessControlAllowHeaders: ['*'],
          accessControlAllowCredentials: false,
          originOverride: true,
        },
      }
    );

    // Step 2 & 7: Create CloudFront distribution
    const distribution = new cdk.aws_cloudfront.Distribution(this, 'CDNDistribution', {
      comment: `Everyone Cook CDN - ${this.config.environment}`,

      // COST OPTIMIZATION: CloudFront WAF removed (Shield Standard provides DDoS protection)
      // webAclId: undefined (no WAF)

      // Default behavior for public content (posts)
      defaultBehavior: {
        // Using new S3BucketOrigin with OAC (CDK v2.223.0+)
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.contentBucket),

        // Step 2: HTTPS redirect
        viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,

        // Step 3: Enable compression
        compress: cloudFrontConfig.compressionEnabled,

        // Step 4: Use public cache policy
        cachePolicy: publicCachePolicy,

        // Apply security headers
        responseHeadersPolicy: securityHeadersPolicy,

        // Allowed HTTP methods
        allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      },

      // Additional behaviors for content (avatars public, backgrounds/recipes private)
      // Task 2.2.4: Configure signed URLs with trusted key groups
      additionalBehaviors: {
        // Avatars - PUBLIC content (no signed URLs needed)
        // Avatars are always public for social features (friends list, posts, comments)
        // Using public cache policy for better performance and simpler URLs
        '/avatars/*': {
          // Using new S3BucketOrigin with OAC (CDK v2.223.0+)
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.contentBucket),
          viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: cloudFrontConfig.compressionEnabled,
          // PUBLIC cache policy - avatars are cached for performance
          // Cache TTL: 24h default, 7 days max (same as posts)
          cachePolicy: publicCachePolicy,
          responseHeadersPolicy: securityHeadersPolicy,
          allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cdk.aws_cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          // NO signed URLs for avatars - they are public content
        },

        // Backgrounds - private content with signed URLs
        '/backgrounds/*': {
          // Using new S3BucketOrigin with OAC (CDK v2.223.0+)
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.contentBucket),
          viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: cloudFrontConfig.compressionEnabled,
          cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: securityHeadersPolicy,
          allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          // Task 2.2.4: Enable signed URLs with trusted key group
          // Note: Temporarily disabled until we generate actual key pair
          // trustedKeyGroups: [this.cloudFrontKeyGroup],
        },

        // Recipes - private content with signed URLs
        '/recipes/*': {
          // Using new S3BucketOrigin with OAC (CDK v2.223.0+)
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.contentBucket),
          viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: cloudFrontConfig.compressionEnabled,
          cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: securityHeadersPolicy,
          allowedMethods: cdk.aws_cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          // Task 2.2.4: Enable signed URLs with trusted key group
          // Note: Temporarily disabled until we generate actual key pair
          // trustedKeyGroups: [this.cloudFrontKeyGroup],
        },
      },

      // Step 5: Configure Price Class 200 (US, Europe, Asia)
      priceClass: cdk.aws_cloudfront.PriceClass[cloudFrontConfig.priceClass],

      // Task 2.2.2 Step 9: Configure custom domain (cdn.everyonecook.cloud)
      // Certificate is imported from DNS Stack (already validated)
      // No timing issues - certificate ready before CloudFront needs it
      domainNames: [this.config.domains.cdn],
      certificate: certificate,

      // Step 8: Enable CloudWatch metrics for monitoring
      enableLogging: true,
      logBucket: this.cdnLogsBucket,
      logFilePrefix: 'cdn-access-logs/',
      logIncludesCookies: false,

      // Enable IPv6
      enableIpv6: true,

      // HTTP version
      httpVersion: cdk.aws_cloudfront.HttpVersion.HTTP2_AND_3,

      // Minimum TLS version
      minimumProtocolVersion: cdk.aws_cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,

      // Error responses
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // Note: S3 bucket policy for CloudFront OAC access is automatically created
    // by S3BucketOrigin.withOriginAccessControl() - no manual policy needed

    // Task 2.2.2 Step 10: Create Route 53 A record (Alias) pointing to CloudFront distribution
    // Certificate is imported from DNS Stack (already validated)
    new cdk.aws_route53.ARecord(this, 'CdnAliasRecord', {
      zone: hostedZone,
      recordName: this.config.domains.cdn.split('.')[0], // Extract 'cdn-dev' from 'cdn-dev.everyonecook.cloud'
      target: cdk.aws_route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      comment: `CloudFront CDN alias for ${this.config.environment} environment`,
    });

    // Add tags for cost tracking
    cdk.Tags.of(distribution).add('Name', `everyonecook-cdn-${this.config.environment}`);
    cdk.Tags.of(distribution).add('Environment', this.config.environment);
    cdk.Tags.of(distribution).add('Service', 'CloudFront');
    cdk.Tags.of(distribution).add('CostCenter', `Core-${this.config.environment}`);

    // Step 8: Create CloudWatch alarms for CloudFront monitoring
    this.createCloudFrontAlarms(distribution);

    return distribution;
  }

  /**
   * Create CloudWatch alarms for CloudFront distribution monitoring
   *
   * Task 2.2.3: Enable CloudWatch metrics for cache hit rate monitoring
   *
   * Monitors:
   * - Cache hit rate (target >90%)
   * - 4XX error rate (client errors)
   * - 5XX error rate (server errors)
   * - Total error rate
   *
   * @param distribution - CloudFront distribution to monitor
   */
  private createCloudFrontAlarms(distribution: cdk.aws_cloudfront.Distribution): void {
    // Only create alarms if enabled in config
    if (!this.config.cloudwatch.alarms.enabled) {
      return;
    }

    // Cache hit rate alarm (alert when <70%)
    new cdk.aws_cloudwatch.Alarm(this, 'CloudFrontCacheHitRateAlarm', {
      alarmName: `EveryoneCook-${this.config.environment}-CDN-LowCacheHitRate`,
      alarmDescription: 'Alert when CloudFront cache hit rate is below 70%',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'CacheHitRate',
        dimensionsMap: {
          DistributionId: distribution.distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 70,
      evaluationPeriods: 3,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 4XX error rate alarm (client errors)
    new cdk.aws_cloudwatch.Alarm(this, 'CloudFront4XXErrorRateAlarm', {
      alarmName: `EveryoneCook-${this.config.environment}-CDN-4XXErrors`,
      alarmDescription: 'Alert when CloudFront 4XX error rate is high',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '4xxErrorRate',
        dimensionsMap: {
          DistributionId: distribution.distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5%
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 5XX error rate alarm (server errors)
    new cdk.aws_cloudwatch.Alarm(this, 'CloudFront5XXErrorRateAlarm', {
      alarmName: `EveryoneCook-${this.config.environment}-CDN-5XXErrors`,
      alarmDescription: 'Alert when CloudFront 5XX error rate is high',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '5xxErrorRate',
        dimensionsMap: {
          DistributionId: distribution.distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1, // 1%
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Total error rate alarm
    new cdk.aws_cloudwatch.Alarm(this, 'CloudFrontTotalErrorRateAlarm', {
      alarmName: `EveryoneCook-${this.config.environment}-CDN-TotalErrors`,
      alarmDescription: 'Alert when CloudFront total error rate is high',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'TotalErrorRate',
        dimensionsMap: {
          DistributionId: distribution.distributionId,
        },
        statistic: 'Average',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5%
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Create CloudWatch alarms for S3 bucket monitoring
   *
   * Monitors:
   * - Bucket size growth (alert when exceeding 200GB)
   * - 4XX errors (client errors)
   * - 5XX errors (server errors)
   *
   * @param bucket - S3 bucket to monitor
   */
  private createS3Alarms(bucket: cdk.aws_s3.Bucket): void {
    // Only create alarms if enabled in config
    if (!this.config.cloudwatch.alarms.enabled) {
      return;
    }

    // Bucket size alarm (alert when exceeding 200GB)
    new cdk.aws_cloudwatch.Alarm(this, 'S3BucketSizeAlarm', {
      alarmName: `${bucket.bucketName}-SizeExceeded`,
      alarmDescription: 'Alert when S3 bucket size exceeds 200GB',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: 'BucketSizeBytes',
        dimensionsMap: {
          BucketName: bucket.bucketName,
          StorageType: 'StandardStorage',
        },
        statistic: 'Average',
        period: cdk.Duration.hours(24),
      }),
      threshold: 200 * 1024 * 1024 * 1024, // 200GB in bytes
      evaluationPeriods: 1,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 4XX errors alarm (client errors)
    new cdk.aws_cloudwatch.Alarm(this, 'S3-4XXErrorsAlarm', {
      alarmName: `${bucket.bucketName}-4XXErrors`,
      alarmDescription: 'Alert when S3 4XX error rate is high',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '4xxErrors',
        dimensionsMap: {
          BucketName: bucket.bucketName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 50,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // 5XX errors alarm (server errors)
    new cdk.aws_cloudwatch.Alarm(this, 'S3-5XXErrorsAlarm', {
      alarmName: `${bucket.bucketName}-5XXErrors`,
      alarmDescription: 'Alert when S3 5XX error rate is high',
      metric: new cdk.aws_cloudwatch.Metric({
        namespace: 'AWS/S3',
        metricName: '5xxErrors',
        dimensionsMap: {
          BucketName: bucket.bucketName,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cdk.aws_cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  /**
   * Export stack outputs for other stacks to reference
   *
   * Naming convention: EveryoneCook-{Environment}-{ResourceName}
   * Example: EveryoneCook-dev-DynamoDBTableName
   */
  private exportOutputs(): void {
    // Export DynamoDB table name and ARN (Task 2.1.2)
    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: this.table.tableName,
      exportName: this.exportName('DynamoDBTableName'),
      description: 'DynamoDB table name for Everyone Cook',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableArn', {
      value: this.table.tableArn,
      exportName: this.exportName('DynamoDBTableArn'),
      description: 'DynamoDB table ARN for Everyone Cook',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableStreamArn', {
      value: this.table.tableStreamArn || 'N/A',
      exportName: this.exportName('DynamoDBTableStreamArn'),
      description: 'DynamoDB table stream ARN for event-driven architecture',
    });

    // Export KMS key IDs and ARNs (Task 2.1.4)
    new cdk.CfnOutput(this, 'DynamoDBKeyId', {
      value: this.dynamoDbKey.keyId,
      exportName: this.exportName('DynamoDBKeyId'),
      description: 'KMS key ID for DynamoDB encryption',
    });

    new cdk.CfnOutput(this, 'DynamoDBKeyArn', {
      value: this.dynamoDbKey.keyArn,
      exportName: this.exportName('DynamoDBKeyArn'),
      description: 'KMS key ARN for DynamoDB encryption',
    });

    new cdk.CfnOutput(this, 'S3KeyId', {
      value: this.s3Key.keyId,
      exportName: this.exportName('S3KeyId'),
      description: 'KMS key ID for S3 encryption',
    });

    new cdk.CfnOutput(this, 'S3KeyArn', {
      value: this.s3Key.keyArn,
      exportName: this.exportName('S3KeyArn'),
      description: 'KMS key ARN for S3 encryption',
    });

    // Export S3 content bucket (Task 2.2.1)
    new cdk.CfnOutput(this, 'ContentBucketName', {
      value: this.contentBucket.bucketName,
      exportName: this.exportName('ContentBucketName'),
      description: 'S3 content bucket name for user-generated content',
    });

    new cdk.CfnOutput(this, 'ContentBucketArn', {
      value: this.contentBucket.bucketArn,
      exportName: this.exportName('ContentBucketArn'),
      description: 'S3 content bucket ARN',
    });

    new cdk.CfnOutput(this, 'ContentBucketDomainName', {
      value: this.contentBucket.bucketDomainName,
      exportName: this.exportName('ContentBucketDomainName'),
      description: 'S3 content bucket domain name',
    });

    // Export additional S3 buckets (Task 2.2.2)
    // Note: logsBucket removed for cost optimization, using cdnLogsBucket for all logs
    new cdk.CfnOutput(this, 'LogsBucketName', {
      value: this.cdnLogsBucket.bucketName,
      exportName: this.exportName('LogsBucketName'),
      description: 'S3 logs bucket name for CloudFront access logs',
    });

    new cdk.CfnOutput(this, 'LogsBucketArn', {
      value: this.cdnLogsBucket.bucketArn,
      exportName: this.exportName('LogsBucketArn'),
      description: 'S3 logs bucket ARN',
    });

    new cdk.CfnOutput(this, 'CdnLogsBucketName', {
      value: this.cdnLogsBucket.bucketName,
      exportName: this.exportName('CdnLogsBucketName'),
      description: 'S3 CDN logs bucket name for CloudFront access logs',
    });

    new cdk.CfnOutput(this, 'CdnLogsBucketArn', {
      value: this.cdnLogsBucket.bucketArn,
      exportName: this.exportName('CdnLogsBucketArn'),
      description: 'S3 CDN logs bucket ARN',
    });

    // Export CloudFront distribution (Task 2.2.3)
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      exportName: this.exportName('CloudFrontDistributionId'),
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      exportName: this.exportName('CloudFrontDomainName'),
      description: 'CloudFront distribution domain name (use for CNAME in Hostinger DNS)',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionArn', {
      value: `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`,
      exportName: this.exportName('CloudFrontDistributionArn'),
      description: 'CloudFront distribution ARN',
    });

    // Export CloudFront key group and public key (Task 2.2.4)
    // Note: Temporarily disabled until we generate actual key pair
    // new cdk.CfnOutput(this, 'CloudFrontKeyGroupId', {
    //   value: this.cloudFrontKeyGroup.keyGroupId,
    //   exportName: this.exportName('CloudFrontKeyGroupId'),
    //   description: 'CloudFront key group ID for signed URLs',
    // });

    // new cdk.CfnOutput(this, 'CloudFrontPublicKeyId', {
    //   value: this.cloudFrontPublicKey.publicKeyId,
    //   exportName: this.exportName('CloudFrontPublicKeyId'),
    //   description: 'CloudFront public key ID for signed URLs',
    // });

    // ACM certificates moved to ObservabilityStack (Phase 7)
    // Custom domains will be configured after Route 53 Hosted Zone is created

    // Stack information output
    new cdk.CfnOutput(this, 'StackInfo', {
      value: `Core Stack for ${this.config.environment} environment`,
      description: 'Core infrastructure stack information',
    });
  }
}
