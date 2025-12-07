/**
 * Health Service
 *
 * Provides system health checks for AWS services.
 * Checks DynamoDB, Cognito, S3, and Lambda status.
 */

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';

const dynamoClient = new DynamoDBClient({});
const cognitoClient = new CognitoIdentityProviderClient({});
const s3Client = new S3Client({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency: number;
  message?: string;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: ServiceHealth[];
  timestamp: string;
}

export class HealthService {
  /**
   * Get System Health
   *
   * Checks health of all AWS services.
   *
   * @returns System health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const checks = await Promise.allSettled([
      this.checkDynamoDB(),
      this.checkCognito(),
      this.checkS3(),
    ]);

    const services: ServiceHealth[] = checks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceNames = ['DynamoDB', 'Cognito', 'S3'];
        return {
          service: serviceNames[index],
          status: 'unhealthy' as const,
          latency: 0,
          message: result.reason?.message || 'Health check failed',
        };
      }
    });

    // Determine overall health
    const unhealthyCount = services.filter((s) => s.status === 'unhealthy').length;
    const degradedCount = services.filter((s) => s.status === 'degraded').length;

    let overall: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (unhealthyCount > 0) {
      overall = 'unhealthy';
    } else if (degradedCount > 0) {
      overall = 'degraded';
    }

    return {
      overall,
      services,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check DynamoDB Health
   *
   * Verifies DynamoDB table is accessible.
   *
   * @returns DynamoDB health status
   */
  private async checkDynamoDB(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      const result = await dynamoClient.send(
        new DescribeTableCommand({
          TableName: TABLE_NAME,
        })
      );

      const latency = Date.now() - startTime;
      const tableStatus = result.Table?.TableStatus;

      if (tableStatus === 'ACTIVE') {
        return {
          service: 'DynamoDB',
          status: 'healthy',
          latency,
          details: {
            tableName: TABLE_NAME,
            itemCount: result.Table?.ItemCount || 0,
            tableStatus,
          },
        };
      } else {
        return {
          service: 'DynamoDB',
          status: 'degraded',
          latency,
          message: `Table status: ${tableStatus}`,
          details: { tableStatus },
        };
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        service: 'DynamoDB',
        status: 'unhealthy',
        latency,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check Cognito Health
   *
   * Verifies Cognito User Pool is accessible.
   *
   * @returns Cognito health status
   */
  private async checkCognito(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: USER_POOL_ID,
          Limit: 1,
        })
      );

      const latency = Date.now() - startTime;

      return {
        service: 'Cognito',
        status: 'healthy',
        latency,
        details: {
          userPoolId: USER_POOL_ID,
        },
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        service: 'Cognito',
        status: 'unhealthy',
        latency,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check S3 Health
   *
   * Verifies S3 service is accessible.
   *
   * @returns S3 health status
   */
  private async checkS3(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      await s3Client.send(new ListBucketsCommand({}));

      const latency = Date.now() - startTime;

      return {
        service: 'S3',
        status: 'healthy',
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      return {
        service: 'S3',
        status: 'unhealthy',
        latency,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
