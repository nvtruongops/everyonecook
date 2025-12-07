import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/environment';

/**
 * Base Stack Props
 * Extended by all stack implementations
 */
export interface BaseStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

/**
 * Base Stack Class
 *
 * Provides common functionality for all stacks:
 * - Environment configuration access
 * - Consistent naming conventions
 * - Common tagging
 * - Utility methods
 */
export abstract class BaseStack extends cdk.Stack {
  protected readonly config: EnvironmentConfig;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    this.config = props.config;

    // Add common tags
    cdk.Tags.of(this).add('Stack', id);
    cdk.Tags.of(this).add('Environment', this.config.environment);
  }

  /**
   * Generate resource name with environment prefix
   * Format: everyonecook-{environment}-{resourceName}
   */
  protected resourceName(name: string): string {
    return `everyonecook-${this.config.environment}-${name}`;
  }

  /**
   * Generate export name for cross-stack references
   * Format: EveryoneCook-{Environment}-{ExportName}
   */
  protected exportName(name: string): string {
    return `EveryoneCook-${this.config.environment}-${name}`;
  }

  /**
   * Check if running in production environment
   */
  protected isProduction(): boolean {
    return this.config.environment === 'prod';
  }

  /**
   * Check if running in development environment
   */
  protected isDevelopment(): boolean {
    return this.config.environment === 'dev';
  }

  /**
   * Get removal policy based on environment
   * - Production: RETAIN (keep resources on stack deletion)
   * - Non-production: DESTROY (delete resources on stack deletion)
   */
  protected getRemovalPolicy(): cdk.RemovalPolicy {
    return this.isProduction() ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
  }
}
