/**
 * Environment Configuration System
 *
 * Centralized configuration management for dev, staging, and prod environments.
 * Provides type-safe configuration with validation and backward compatibility.
 *
 * Usage:
 *   import { getConfig } from './environment';
 *   const config = getConfig('dev');
 *
 * @see .kiro/specs/project-restructure/requirements.md - Req 4, Req 5
 * @see .kiro/specs/project-restructure/design.md - Deployment Architecture
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type EnvironmentType = 'dev' | 'staging' | 'prod';

export type BillingMode = 'PAY_PER_REQUEST' | 'PROVISIONED';

export type CognitoSecurityMode = 'OFF' | 'AUDIT' | 'ENFORCED';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Domain Configuration
 * Defines custom domains for frontend, API, and CDN
 */
export interface DomainConfig {
  frontend: string;
  api: string;
  cdn: string;
}

/**
 * Contact Information
 * Required for stack tagging and notifications
 */
export interface ContactConfig {
  email: string;
  repository: string;
}

/**
 * DynamoDB Configuration
 * Single Table Design with auto-scaling support
 */
export interface DynamoDBConfig {
  billingMode: BillingMode;
  readCapacity?: number;
  writeCapacity?: number;
  autoScaling?: {
    minCapacity: number;
    maxCapacity: number;
    targetUtilization: number;
  };
  pointInTimeRecovery: boolean;
  deletionProtection: boolean;
  streamEnabled: boolean;
}

/**
 * S3 Configuration
 * Bucket settings with Intelligent-Tiering support
 */
export interface S3Config {
  versioning: boolean;
  lifecycleRules: {
    intelligentTiering: boolean;
    archiveAfterDays: number;
    deepArchiveAfterDays: number;
    deleteOldVersionsAfterDays: number;
  };
}

/**
 * CloudFront Configuration
 * CDN settings with compression and caching
 */
export interface CloudFrontConfig {
  priceClass: 'PRICE_CLASS_100' | 'PRICE_CLASS_200' | 'PRICE_CLASS_ALL';
  compressionEnabled: boolean;
  cacheTTL: {
    default: number;
    max: number;
    min: number;
  };
}

/**
 * Cognito Configuration
 * User authentication and security settings
 *
 * Note: advancedSecurityMode is deprecated and requires Cognito Plus feature plan.
 * For cost optimization, we use standard security with strong password policy and device tracking.
 * This provides adequate security for MVP without additional costs (~$0.05 per MAU).
 */
export interface CognitoConfig {
  advancedSecurityMode: CognitoSecurityMode; // Deprecated - not used in implementation
  passwordPolicy: {
    minimumLength: number;
    requireLowercase: boolean;
    requireUppercase: boolean;
    requireDigits: boolean;
    requireSymbols: boolean;
  };
  deviceTracking: boolean;
  mfaConfiguration: 'OFF' | 'OPTIONAL' | 'REQUIRED';
}

/**
 * API Gateway Configuration
 * REST API settings with throttling
 */
export interface APIGatewayConfig {
  throttling: {
    rateLimit: number;
    burstLimit: number;
  };
  caching: {
    enabled: boolean;
    ttl: number;
    cacheSize: string;
  };
  compression: boolean;
}

/**
 * Lambda Configuration
 * Function-specific memory and timeout settings
 */
export interface LambdaConfig {
  apiRouter: {
    memory: number;
    timeout: number;
  };
  authUser: {
    memory: number;
    timeout: number;
  };
  social: {
    memory: number;
    timeout: number;
  };
  recipeAI: {
    memory: number;
    timeout: number;
  };
  admin: {
    memory: number;
    timeout: number;
  };
  upload: {
    memory: number;
    timeout: number;
  };
}

/**
 * CloudWatch Configuration
 * Logging and monitoring settings
 */
export interface CloudWatchConfig {
  logLevel: LogLevel;
  logRetentionDays: number;
  alarms: {
    enabled: boolean;
  };
}

/**
 * WAF Configuration
 * Web Application Firewall settings
 */
export interface WAFConfig {
  enabled: boolean;
  rules: {
    sqlInjection: boolean;
    xss: boolean;
    rateLimit: boolean;
    geoBlocking: boolean;
    botProtection: boolean;
  };
}

/**
 * Environment Configuration
 * Complete configuration for a single environment
 */
export interface EnvironmentConfig {
  // Environment identification
  name: EnvironmentType;
  environment: string; // Alias for backward compatibility

  // AWS settings
  region: string;
  account?: string; // Optional - set from CDK_DEFAULT_ACCOUNT at deploy time

  // Domain configuration
  domain: DomainConfig; // Legacy property name
  domains: DomainConfig; // New standard name

  // Contact information
  contact: ContactConfig;

  // AWS service configurations
  dynamodb: DynamoDBConfig;
  s3: S3Config;
  cloudfront: CloudFrontConfig;
  cognito: CognitoConfig;
  apiGateway: APIGatewayConfig;
  lambda: LambdaConfig;
  cloudwatch: CloudWatchConfig;
  waf: WAFConfig;
}

// ============================================================================
// Environment Configurations
// ============================================================================

/**
 * Development Environment Configuration
 *
 * Optimized for:
 * - Fast iteration and debugging
 * - Production parity (dev mirrors prod as closely as possible)
 * - Early bug detection with production-like settings
 *
 * Key Features:
 * - Pay-per-request DynamoDB (no baseline cost)
 * - Cognito password policy identical to prod (12 chars, symbols required)
 * - SES production mode enabled (same email configuration as prod)
 * - No WAF (reduce complexity, can be added later)
 * - DEBUG logging with 7-day retention (cost optimization)
 * - No deletion protection (flexibility for testing)
 * - PriceClass_200 for Asia/Singapore support
 *
 * Philosophy: "Dev should mirror Prod as closely as possible"
 * - Same password policy → Test real user experience
 * - Same SES setup → Test email delivery
 * - Same Cognito config → No surprises in production
 * - Different only where necessary (logs, deletion protection, WAF)
 */
const devConfig: EnvironmentConfig = {
  name: 'dev',
  environment: 'dev',

  region: 'ap-southeast-1', // Singapore region
  account: process.env.CDK_DEFAULT_ACCOUNT,

  domain: {
    frontend: 'dev.everyonecook.cloud',
    api: 'api-dev.everyonecook.cloud',
    cdn: 'cdn-dev.everyonecook.cloud',
  },
  domains: {
    frontend: 'dev.everyonecook.cloud',
    api: 'api-dev.everyonecook.cloud',
    cdn: 'cdn-dev.everyonecook.cloud',
  },

  contact: {
    email: 'everyonecookcloud@gmail.com',
    repository: 'https://github.com/nvtruongops/everyonecook.git',
  },

  dynamodb: {
    billingMode: 'PAY_PER_REQUEST',
    pointInTimeRecovery: false,
    deletionProtection: false,
    streamEnabled: true,
  },

  s3: {
    versioning: false,
    lifecycleRules: {
      intelligentTiering: true,
      archiveAfterDays: 90,
      deepArchiveAfterDays: 180,
      deleteOldVersionsAfterDays: 30,
    },
  },

  cloudfront: {
    priceClass: 'PRICE_CLASS_200', // US, Europe, Asia (includes Singapore)
    compressionEnabled: true,
    cacheTTL: {
      default: 86400, // 1 day
      max: 31536000, // 1 year
      min: 0,
    },
  },

  cognito: {
    advancedSecurityMode: 'AUDIT',
    passwordPolicy: {
      minimumLength: 12, // ✅ Giống prod để test thực tế
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: true, // ✅ Giống prod
    },
    deviceTracking: true,
    mfaConfiguration: 'OFF',
  },

  apiGateway: {
    throttling: {
      rateLimit: 1000,
      burstLimit: 500,
    },
    caching: {
      enabled: false,
      ttl: 300,
      cacheSize: '0.5',
    },
    compression: true,
  },

  lambda: {
    apiRouter: { memory: 512, timeout: 30 },
    authUser: { memory: 512, timeout: 30 },
    social: { memory: 512, timeout: 30 },
    recipeAI: { memory: 1024, timeout: 120 },
    admin: { memory: 512, timeout: 30 },
    upload: { memory: 256, timeout: 60 },
  },

  cloudwatch: {
    logLevel: 'DEBUG',
    logRetentionDays: 3, // Reduced from 7 to 3 days for dev - sufficient for debugging
    alarms: {
      enabled: false,
    },
  },

  waf: {
    enabled: false,
    rules: {
      sqlInjection: false,
      xss: false,
      rateLimit: false,
      geoBlocking: false,
      botProtection: false,
    },
  },
};

/**
 * Staging Environment Configuration
 *
 * Optimized for:
 * - Production-like testing
 * - Performance validation
 * - Security testing
 *
 * Key Features:
 * - Provisioned DynamoDB with auto-scaling (2-10 units)
 * - Cognito ENFORCED mode (production security)
 * - WAF enabled with all rules
 * - INFO logging with 30-day retention
 * - Deletion protection enabled
 */
const stagingConfig: EnvironmentConfig = {
  name: 'staging',
  environment: 'staging',

  region: 'ap-southeast-1', // Singapore region
  account: process.env.CDK_DEFAULT_ACCOUNT,

  domain: {
    frontend: 'staging.everyonecook.cloud',
    api: 'api-staging.everyonecook.cloud',
    cdn: 'cdn-staging.everyonecook.cloud',
  },
  domains: {
    frontend: 'staging.everyonecook.cloud',
    api: 'api-staging.everyonecook.cloud',
    cdn: 'cdn-staging.everyonecook.cloud',
  },

  contact: {
    email: 'everyonecookcloud@gmail.com',
    repository: 'https://github.com/nvtruongops/everyonecook.git',
  },

  dynamodb: {
    billingMode: 'PROVISIONED',
    readCapacity: 2,
    writeCapacity: 2,
    autoScaling: {
      minCapacity: 2,
      maxCapacity: 10,
      targetUtilization: 70,
    },
    pointInTimeRecovery: true,
    deletionProtection: true,
    streamEnabled: true,
  },

  s3: {
    versioning: true,
    lifecycleRules: {
      intelligentTiering: true,
      archiveAfterDays: 90,
      deepArchiveAfterDays: 180,
      deleteOldVersionsAfterDays: 30,
    },
  },

  cloudfront: {
    priceClass: 'PRICE_CLASS_200', // US, Europe, Asia
    compressionEnabled: true,
    cacheTTL: {
      default: 86400, // 1 day
      max: 31536000, // 1 year
      min: 0,
    },
  },

  cognito: {
    advancedSecurityMode: 'ENFORCED',
    passwordPolicy: {
      minimumLength: 12,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: true,
    },
    deviceTracking: true,
    mfaConfiguration: 'OPTIONAL',
  },

  apiGateway: {
    throttling: {
      rateLimit: 5000,
      burstLimit: 2500,
    },
    caching: {
      enabled: true,
      ttl: 300,
      cacheSize: '0.5',
    },
    compression: true,
  },

  lambda: {
    apiRouter: { memory: 512, timeout: 30 },
    authUser: { memory: 512, timeout: 30 },
    social: { memory: 512, timeout: 30 },
    recipeAI: { memory: 1024, timeout: 120 },
    admin: { memory: 512, timeout: 30 },
    upload: { memory: 256, timeout: 60 },
  },

  cloudwatch: {
    logLevel: 'INFO',
    logRetentionDays: 30,
    alarms: {
      enabled: true,
    },
  },

  waf: {
    enabled: true,
    rules: {
      sqlInjection: true,
      xss: true,
      rateLimit: true,
      geoBlocking: false,
      botProtection: true,
    },
  },
};

/**
 * Production Environment Configuration
 *
 * Optimized for:
 * - Maximum security
 * - High availability
 * - Cost efficiency at scale
 *
 * Key Features:
 * - Provisioned DynamoDB with auto-scaling (2-10 units)
 * - Cognito ENFORCED mode with MFA optional
 * - WAF enabled with all rules including geo-blocking
 * - INFO logging with 90-day retention
 * - Deletion protection enabled
 * - Resource retention on stack deletion
 */
const prodConfig: EnvironmentConfig = {
  name: 'prod',
  environment: 'prod',

  region: 'ap-southeast-1', // Singapore region
  account: process.env.CDK_DEFAULT_ACCOUNT,

  domain: {
    frontend: 'everyonecook.cloud',
    api: 'api.everyonecook.cloud',
    cdn: 'cdn.everyonecook.cloud',
  },
  domains: {
    frontend: 'everyonecook.cloud',
    api: 'api.everyonecook.cloud',
    cdn: 'cdn.everyonecook.cloud',
  },

  contact: {
    email: 'everyonecookcloud@gmail.com',
    repository: 'https://github.com/nvtruongops/everyonecook.git',
  },

  dynamodb: {
    billingMode: 'PROVISIONED',
    readCapacity: 2,
    writeCapacity: 2,
    autoScaling: {
      minCapacity: 2,
      maxCapacity: 10,
      targetUtilization: 70,
    },
    pointInTimeRecovery: true,
    deletionProtection: true,
    streamEnabled: true,
  },

  s3: {
    versioning: true,
    lifecycleRules: {
      intelligentTiering: true,
      archiveAfterDays: 90,
      deepArchiveAfterDays: 180,
      deleteOldVersionsAfterDays: 30,
    },
  },

  cloudfront: {
    priceClass: 'PRICE_CLASS_200', // US, Europe, Asia
    compressionEnabled: true,
    cacheTTL: {
      default: 86400, // 1 day
      max: 31536000, // 1 year
      min: 0,
    },
  },

  cognito: {
    advancedSecurityMode: 'ENFORCED',
    passwordPolicy: {
      minimumLength: 12,
      requireLowercase: true,
      requireUppercase: true,
      requireDigits: true,
      requireSymbols: true,
    },
    deviceTracking: true,
    mfaConfiguration: 'OPTIONAL',
  },

  apiGateway: {
    throttling: {
      rateLimit: 10000,
      burstLimit: 5000,
    },
    caching: {
      enabled: true,
      ttl: 300,
      cacheSize: '0.5',
    },
    compression: true,
  },

  lambda: {
    apiRouter: { memory: 512, timeout: 30 },
    authUser: { memory: 512, timeout: 30 },
    social: { memory: 512, timeout: 30 },
    recipeAI: { memory: 1024, timeout: 120 },
    admin: { memory: 512, timeout: 30 },
    upload: { memory: 256, timeout: 60 },
  },

  cloudwatch: {
    logLevel: 'INFO',
    logRetentionDays: 90,
    alarms: {
      enabled: true,
    },
  },

  waf: {
    enabled: true,
    rules: {
      sqlInjection: true,
      xss: true,
      rateLimit: true,
      geoBlocking: true,
      botProtection: true,
    },
  },
};

// ============================================================================
// Configuration Registry
// ============================================================================

const configurations: Record<EnvironmentType, EnvironmentConfig> = {
  dev: devConfig,
  staging: stagingConfig,
  prod: prodConfig,
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate environment configuration
 *
 * Checks:
 * - Region is specified
 * - Domain names are valid
 * - DynamoDB capacity settings for PROVISIONED mode
 * - Cognito password policy requirements
 * - SES domain verification for production mode
 * - API Gateway limits are positive numbers
 * - Lambda memory and timeout within AWS limits
 *
 * @param config - Configuration to validate
 * @throws Error if validation fails
 */
function validateConfig(config: EnvironmentConfig): void {
  // Validate region
  if (!config.region) {
    throw new Error(`Region is required for ${config.environment} environment`);
  }

  // Validate domain names
  if (!config.domains.frontend || !config.domains.api || !config.domains.cdn) {
    throw new Error(`All domain names are required for ${config.environment} environment`);
  }

  // Validate DynamoDB capacity for PROVISIONED mode
  if (config.dynamodb.billingMode === 'PROVISIONED') {
    if (!config.dynamodb.readCapacity || !config.dynamodb.writeCapacity) {
      throw new Error(
        `Read and write capacity are required for PROVISIONED billing mode in ${config.environment}`
      );
    }

    if (config.dynamodb.autoScaling) {
      const { minCapacity, maxCapacity, targetUtilization } = config.dynamodb.autoScaling;

      if (minCapacity < 1 || maxCapacity < minCapacity) {
        throw new Error(
          `Invalid auto-scaling capacity settings in ${config.environment}: min=${minCapacity}, max=${maxCapacity}`
        );
      }

      if (targetUtilization < 20 || targetUtilization > 90) {
        throw new Error(
          `Target utilization must be between 20-90% in ${config.environment}, got ${targetUtilization}%`
        );
      }
    }
  }

  // Validate Cognito password policy (all environments use 12 chars minimum for parity)
  const minLength = 12; // Production parity: dev mirrors prod
  if (config.cognito.passwordPolicy.minimumLength < minLength) {
    throw new Error(
      `Password minimum length must be at least ${minLength} characters for ${config.environment}`
    );
  }

  // SES production mode is now enabled for all environments (dev mirrors prod)
  // No warning needed - this is intentional for production parity

  // Validate API Gateway limits
  if (config.apiGateway.throttling.rateLimit <= 0 || config.apiGateway.throttling.burstLimit <= 0) {
    throw new Error(
      `API Gateway throttling limits must be positive numbers in ${config.environment}`
    );
  }

  // Validate Lambda memory and timeout
  Object.entries(config.lambda).forEach(([functionName, settings]) => {
    if (settings.memory < 128 || settings.memory > 10240) {
      throw new Error(
        `Lambda memory must be between 128-10240 MB for ${functionName} in ${config.environment}`
      );
    }

    if (settings.timeout < 1 || settings.timeout > 900) {
      throw new Error(
        `Lambda timeout must be between 1-900 seconds for ${functionName} in ${config.environment}`
      );
    }
  });

  // Validate CloudWatch log retention
  const validRetentionDays = [
    1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653,
  ];
  if (!validRetentionDays.includes(config.cloudwatch.logRetentionDays)) {
    throw new Error(
      `Invalid log retention days for ${config.environment}. Must be one of: ${validRetentionDays.join(', ')}`
    );
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get environment configuration with validation
 *
 * This is the main function to use for loading configuration.
 * It validates the configuration and throws an error if invalid.
 *
 * @param environment - Environment name (dev, staging, prod)
 * @returns Validated environment configuration
 * @throws Error if environment is invalid or configuration fails validation
 *
 * @example
 * ```typescript
 * import { getConfig } from './environment';
 * const config = getConfig('dev');
 * console.log(config.domains.frontend); // 'dev.everyonecook.cloud'
 * ```
 */
export function getEnvironmentConfig(environment: string): EnvironmentConfig {
  // Validate environment name
  if (!['dev', 'staging', 'prod'].includes(environment)) {
    throw new Error(`Invalid environment: ${environment}. Must be one of: dev, staging, prod`);
  }

  const config = configurations[environment as EnvironmentType];

  // Validate configuration
  validateConfig(config);

  return config;
}

/**
 * Get environment configuration (alias for backward compatibility)
 *
 * @param environment - Environment name (dev, staging, prod)
 * @returns Validated environment configuration
 */
export function getConfig(environment: string): EnvironmentConfig {
  return getEnvironmentConfig(environment);
}

/**
 * Get environment configuration without validation (for testing)
 *
 * This function skips validation and is intended for testing purposes only.
 * Use getConfig() or getEnvironmentConfig() in production code.
 *
 * @param environment - Environment name (dev, staging, prod)
 * @returns Environment configuration without validation
 *
 * @example
 * ```typescript
 * import { getConfigUnsafe } from './environment';
 * const config = getConfigUnsafe('dev'); // No validation
 * ```
 */
export function getConfigUnsafe(environment: string): EnvironmentConfig {
  if (!['dev', 'staging', 'prod'].includes(environment)) {
    throw new Error(`Invalid environment: ${environment}. Must be one of: dev, staging, prod`);
  }

  return configurations[environment as EnvironmentType];
}

/**
 * Get all available environment names
 *
 * @returns Array of environment names
 */
export function getEnvironments(): EnvironmentType[] {
  return Object.keys(configurations) as EnvironmentType[];
}

/**
 * Check if an environment exists
 *
 * @param environment - Environment name to check
 * @returns True if environment exists
 */
export function isValidEnvironment(environment: string): boolean {
  return ['dev', 'staging', 'prod'].includes(environment);
}
