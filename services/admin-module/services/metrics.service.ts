/**
 * Metrics Service
 *
 * Provides business metrics aggregation.
 * Tracks user metrics, content metrics, and AI metrics.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  GetMetricStatisticsCommandInput,
} from '@aws-sdk/client-cloudwatch';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const cloudWatchClient = new CloudWatchClient({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const NAMESPACE = 'EveryoneCook';

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
}

export interface ContentMetrics {
  totalPosts: number;
  postsToday: number;
  reportedPosts: number;
}

export interface AIMetrics {
  aiCallsToday: number;
  cacheHitRate: number;
  dictionaryCoverage: number;
}

export interface BusinessMetrics {
  user: UserMetrics;
  content: ContentMetrics;
  ai: AIMetrics;
  timestamp: string;
}

export class MetricsService {
  /**
   * Get Business Metrics
   *
   * Aggregates all business metrics.
   *
   * @returns Business metrics
   */
  async getBusinessMetrics(): Promise<BusinessMetrics> {
    const [userMetrics, contentMetrics, aiMetrics] = await Promise.all([
      this.getUserMetrics(),
      this.getContentMetrics(),
      this.getAIMetrics(),
    ]);

    return {
      user: userMetrics,
      content: contentMetrics,
      ai: aiMetrics,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get User Metrics
   *
   * Calculates user-related metrics.
   *
   * @returns User metrics
   */
  private async getUserMetrics(): Promise<UserMetrics> {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Scan for user profiles
    const result = await dynamoDB.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':sk': 'PROFILE',
        },
        ProjectionExpression: 'userId, createdAt, lastLoginAt',
      })
    );

    const users = result.Items || [];
    const totalUsers = users.length;

    // Active users (logged in within 30 days)
    const activeUsers = users.filter((user) => {
      const lastLogin = user.lastLoginAt || 0;
      return lastLogin >= thirtyDaysAgo;
    }).length;

    // New users (created within 7 days)
    const newUsers = users.filter((user) => {
      const createdAt = user.createdAt || 0;
      return createdAt >= sevenDaysAgo;
    }).length;

    return {
      totalUsers,
      activeUsers,
      newUsers,
    };
  }

  /**
   * Get Content Metrics
   *
   * Calculates content-related metrics.
   *
   * @returns Content metrics
   */
  private async getContentMetrics(): Promise<ContentMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = todayStart.getTime();

    // Query all posts using GSI2 (POST#PUBLIC)
    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'POST#PUBLIC',
        },
        ProjectionExpression: 'postId, createdAt, reportCount',
      })
    );

    const posts = result.Items || [];
    const totalPosts = posts.length;

    // Posts created today
    const postsToday = posts.filter((post) => {
      const createdAt = post.createdAt || 0;
      return createdAt >= todayTimestamp;
    }).length;

    // Reported posts (reportCount >= 10)
    const reportedPosts = posts.filter((post) => {
      const reportCount = post.reportCount || 0;
      return reportCount >= 10;
    }).length;

    return {
      totalPosts,
      postsToday,
      reportedPosts,
    };
  }

  /**
   * Get AI Metrics
   *
   * Calculates AI-related metrics from CloudWatch.
   *
   * @returns AI metrics
   */
  private async getAIMetrics(): Promise<AIMetrics> {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Get AI calls today from CloudWatch
    const aiCallsToday = await this.getCloudWatchMetric('AI.Invocations', todayStart, now);

    // Get cache hits and misses
    const cacheHits = await this.getCloudWatchMetric('Cache.Hit', todayStart, now);
    const cacheMisses = await this.getCloudWatchMetric('Cache.Miss', todayStart, now);

    // Calculate cache hit rate
    const totalCacheRequests = cacheHits + cacheMisses;
    const cacheHitRate = totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0;

    // Get dictionary coverage (count dictionary entries)
    const dictionaryResult = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'DICTIONARY',
        },
        Select: 'COUNT',
      })
    );

    const dictionaryCount = dictionaryResult.Count || 0;
    // Assume target is 1000 ingredients for 100% coverage
    const dictionaryCoverage = Math.min((dictionaryCount / 1000) * 100, 100);

    return {
      aiCallsToday,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100, // Round to 2 decimals
      dictionaryCoverage: Math.round(dictionaryCoverage * 100) / 100,
    };
  }

  /**
   * Get CloudWatch Metric
   *
   * Retrieves metric value from CloudWatch.
   *
   * @param metricName - Metric name
   * @param startTime - Start time
   * @param endTime - End time
   * @returns Metric sum value
   */
  private async getCloudWatchMetric(
    metricName: string,
    startTime: Date,
    endTime: Date
  ): Promise<number> {
    try {
      const params: GetMetricStatisticsCommandInput = {
        Namespace: NAMESPACE,
        MetricName: metricName,
        StartTime: startTime,
        EndTime: endTime,
        Period: 86400, // 1 day in seconds
        Statistics: ['Sum'],
      };

      const result = await cloudWatchClient.send(new GetMetricStatisticsCommand(params));

      if (result.Datapoints && result.Datapoints.length > 0) {
        return result.Datapoints[0].Sum || 0;
      }

      return 0;
    } catch (error) {
      console.error(`Failed to get CloudWatch metric ${metricName}:`, error);
      return 0;
    }
  }
}
