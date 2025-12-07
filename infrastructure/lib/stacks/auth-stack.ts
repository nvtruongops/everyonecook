import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BaseStack, BaseStackProps } from '../base-stack';
import * as path from 'path';

/**
 * Auth Stack Props
 * Extends BaseStackProps with DynamoDB table reference from CoreStack
 */
export interface AuthStackProps extends BaseStackProps {
  /**
   * DynamoDB table from CoreStack
   * Required for Lambda triggers to access user data
   */
  dynamoTable: cdk.aws_dynamodb.ITable;
}

/**
 * Authentication Stack for Everyone Cook Infrastructure
 *
 * This stack contains authentication and user management infrastructure:
 * - AWS Cognito User Pool with Advanced Security Mode
 * - Cognito User Pool Client for frontend authentication
 * - Lambda triggers for custom authentication flows
 *
 * This is the second stack to deploy (after CoreStack) and rarely changes.
 * BackendStack depends on the resources created here.
 *
 * @see .kiro/specs/project-restructure/requirements.md - Req 6 (CDK Stack Strategy - Auth Stack)
 * @see .kiro/specs/project-restructure/security-architecture.md - Authentication section
 * @see .kiro/specs/project-restructure/design.md - Security Architecture section
 */
export class AuthStack extends BaseStack {
  // Cognito User Pool
  public readonly userPool: cdk.aws_cognito.UserPool;

  // Cognito User Pool Client
  public readonly userPoolClient: cdk.aws_cognito.UserPoolClient;

  // Lambda Triggers
  public readonly postConfirmationTrigger: cdk.aws_lambda.Function;
  public readonly preAuthenticationTrigger: cdk.aws_lambda.Function;
  public readonly postAuthenticationTrigger: cdk.aws_lambda.Function;
  public readonly customMessageTrigger: cdk.aws_lambda.Function;
  public readonly preSignUpTrigger: cdk.aws_lambda.Function;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Add stack-specific tags for cost tracking
    cdk.Tags.of(this).add('StackType', 'Auth');
    cdk.Tags.of(this).add('Layer', 'Authentication');
    cdk.Tags.of(this).add('CostCenter', `Auth-${this.config.environment}`);

    // Task 4.1.4: Setup Lambda triggers FIRST (before User Pool)
    // Lambda functions must exist before User Pool references them
    this.postConfirmationTrigger = this.createPostConfirmationTrigger(props.dynamoTable);
    this.preAuthenticationTrigger = this.createPreAuthenticationTrigger(props.dynamoTable);
    this.postAuthenticationTrigger = this.createPostAuthenticationTrigger(props.dynamoTable);
    this.customMessageTrigger = this.createCustomMessageTrigger();

    // Task 3.1.2: Create Cognito User Pool (✅ Complete)
    this.userPool = this.createUserPool();

    // Task 4.1.4b: Create PreSignUp trigger AFTER User Pool (needs User Pool ID)
    this.preSignUpTrigger = this.createPreSignUpTrigger();

    // Task 4.1.4: Add Lambda triggers to User Pool
    this.addLambdaTriggersToUserPool();

    // Task 4.1.5: Create Cognito User Pool Client
    this.userPoolClient = this.createUserPoolClient();

    // Export stack outputs for cross-stack references
    this.exportOutputs();
  }

  /**
   * Create Cognito User Pool with production-grade security settings
   *
   * Configuration:
   * - NO MFA required (only email, username, password management)
   * - Minimal registration: 4 required fields (username, email, password, fullName)
   * - Optional fields: birthday, gender, country (completed in onboarding)
   * - Standard attributes: username, email, given_name (fullName)
   * - Custom attributes: account_status (for admin ban), country (ISO 3166-1 alpha-2)
   * - Password policy: Min 12 chars (8 for dev), require uppercase, lowercase, digits, symbols
   * - Device tracking: Enabled but challengeRequiredOnNewDevice = false (NO MFA)
   * - Email verification: Required before use
   *
   * Note: Advanced Security Mode (ENFORCED/AUDIT) requires Cognito Plus feature plan.
   * For cost optimization, we use standard security with strong password policy and device tracking.
   * This provides adequate security for the application without additional costs.
   *
   * @returns Cognito User Pool
   *
   * @see .kiro/specs/project-restructure/user-profile-requirements.md - Registration requirements
   * @see .kiro/specs/project-restructure/security-architecture.md - Cognito security
   * @see infrastructure/docs/phase3/COGNITO-CONFIGURATION-REPORT.md - Complete configuration guide
   */
  private createUserPool(): cdk.aws_cognito.UserPool {
    const cognitoConfig = this.config.cognito;

    // Create User Pool
    const userPool = new cdk.aws_cognito.UserPool(this, 'UserPool', {
      userPoolName: `EveryoneCook-${this.config.environment}`,

      // Sign-in configuration
      signInAliases: {
        username: true,
        email: true,
      },

      // Self sign-up enabled
      selfSignUpEnabled: true,

      // Standard attributes (required and optional)
      standardAttributes: {
        email: {
          required: true,
          mutable: false, // Email cannot be changed after registration
        },
        givenName: {
          required: true, // fullName stored in given_name
          mutable: true,
        },
        birthdate: {
          required: false,
          mutable: true,
        },
        gender: {
          required: false,
          mutable: true,
        },
        // Note: country will be stored as custom attribute for more flexibility
      },

      // Custom attributes
      customAttributes: {
        account_status: new cdk.aws_cognito.StringAttribute({
          mutable: true,
          minLen: 1,
          maxLen: 20,
        }),
        country: new cdk.aws_cognito.StringAttribute({
          mutable: true,
          minLen: 2,
          maxLen: 2, // ISO 3166-1 alpha-2 country code
        }),
      },

      // Password policy
      passwordPolicy: {
        minLength: cognitoConfig.passwordPolicy.minimumLength,
        requireLowercase: cognitoConfig.passwordPolicy.requireLowercase,
        requireUppercase: cognitoConfig.passwordPolicy.requireUppercase,
        requireDigits: cognitoConfig.passwordPolicy.requireDigits,
        requireSymbols: cognitoConfig.passwordPolicy.requireSymbols,
        tempPasswordValidity: cdk.Duration.days(7),
      },

      // Account recovery
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_ONLY,

      // Email configuration - Use Cognito default email
      email: cdk.aws_cognito.UserPoolEmail.withCognito(),

      // Auto-verify email
      autoVerify: {
        email: true,
      },

      // MFA configuration (OFF - no MFA required)
      mfa: cdk.aws_cognito.Mfa.OFF,

      // Device tracking (enabled but no MFA challenge)
      deviceTracking: cognitoConfig.deviceTracking
        ? {
            challengeRequiredOnNewDevice: false, // NO MFA challenge
            deviceOnlyRememberedOnUserPrompt: true,
          }
        : undefined,

      // User invitation - Simple text email (Cognito has 20K char limit)
      userInvitation: {
        emailSubject: '🍳 Welcome to Everyone Cook!',
        emailBody:
          'Hello {username}, your temporary password is: {####}. Please sign in and change your password.',
      },

      // User verification - Simple text email (Cognito has 20K char limit)
      userVerification: {
        emailSubject: '🍳 Verify your Everyone Cook account',
        emailBody:
          'Hello {username}, welcome to Everyone Cook! Your verification code is: {####}. This code expires in 24 hours.',
        emailStyle: cdk.aws_cognito.VerificationEmailStyle.CODE,
      },

      // Deletion protection for production
      deletionProtection: this.config.environment === 'prod',

      // Removal policy
      removalPolicy:
        this.config.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Add tags for cost tracking
    cdk.Tags.of(userPool).add('Component', 'Authentication');
    cdk.Tags.of(userPool).add('ManagedBy', 'CDK');

    return userPool;
  }

  /**
   * Create PostConfirmation Lambda Trigger
   *
   * Triggered after user confirms their email address.
   * Creates 3 DynamoDB entities:
   * 1. Core Profile (PK=USER#{userId}, SK=PROFILE)
   * 2. Privacy Settings (PK=USER#{userId}, SK=PRIVACY_SETTINGS)
   * 3. AI Preferences (PK=USER#{userId}, SK=AI_PREFERENCES)
   *
   * @param dynamoTable - DynamoDB table from CoreStack
   * @returns Lambda function
   */
  private createPostConfirmationTrigger(
    dynamoTable: cdk.aws_dynamodb.ITable
  ): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'PostConfirmationLogGroup', {
      logGroupName: `/aws/lambda/EveryoneCook-${this.config.environment}-PostConfirmation`,
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const trigger = new cdk.aws_lambda.Function(this, 'PostConfirmationTrigger', {
      functionName: `EveryoneCook-${this.config.environment}-PostConfirmation`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'post-confirmation.handler',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../services/auth-module/triggers/dist')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        ENVIRONMENT: this.config.environment,
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
      tracing: cdk.aws_lambda.Tracing.DISABLED,
    });

    // Grant DynamoDB write permissions
    dynamoTable.grantWriteData(trigger);

    // Add tags
    cdk.Tags.of(trigger).add('Component', 'Authentication');
    cdk.Tags.of(trigger).add('TriggerType', 'PostConfirmation');

    return trigger;
  }

  /**
   * Create PreAuthentication Lambda Trigger
   *
   * Triggered before user authentication.
   * Checks if user is banned or suspended and rejects login if so.
   *
   * @param dynamoTable - DynamoDB table from CoreStack
   * @returns Lambda function
   */
  private createPreAuthenticationTrigger(
    dynamoTable: cdk.aws_dynamodb.ITable
  ): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'PreAuthenticationLogGroup', {
      logGroupName: `/aws/lambda/EveryoneCook-${this.config.environment}-PreAuthentication`,
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const trigger = new cdk.aws_lambda.Function(this, 'PreAuthenticationTrigger', {
      functionName: `EveryoneCook-${this.config.environment}-PreAuthentication`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'pre-authentication.handler',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../services/auth-module/triggers/dist')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        ENVIRONMENT: this.config.environment,
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
      tracing: cdk.aws_lambda.Tracing.DISABLED,
    });

    // Grant DynamoDB read permissions
    dynamoTable.grantReadData(trigger);

    // Add tags
    cdk.Tags.of(trigger).add('Component', 'Authentication');
    cdk.Tags.of(trigger).add('TriggerType', 'PreAuthentication');

    return trigger;
  }

  /**
   * Create PostAuthentication Lambda Trigger
   *
   * Triggered after successful user authentication.
   * Updates lastLoginAt timestamp and handles inactive user cleanup logic.
   *
   * @param dynamoTable - DynamoDB table from CoreStack
   * @returns Lambda function
   */
  private createPostAuthenticationTrigger(
    dynamoTable: cdk.aws_dynamodb.ITable
  ): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'PostAuthenticationLogGroup', {
      logGroupName: `/aws/lambda/EveryoneCook-${this.config.environment}-PostAuthentication`,
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const trigger = new cdk.aws_lambda.Function(this, 'PostAuthenticationTrigger', {
      functionName: `EveryoneCook-${this.config.environment}-PostAuthentication`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'post-authentication.handler',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../services/auth-module/triggers/dist')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        ENVIRONMENT: this.config.environment,
      },
      logGroup: logGroup, // Use logGroup instead of deprecated logRetention
      tracing: cdk.aws_lambda.Tracing.DISABLED,
    });

    // Grant DynamoDB read/write permissions
    dynamoTable.grantReadWriteData(trigger);

    // Add tags
    cdk.Tags.of(trigger).add('Component', 'Authentication');
    cdk.Tags.of(trigger).add('TriggerType', 'PostAuthentication');

    return trigger;
  }

  /**
   * Create CustomMessage Lambda Trigger
   *
   * Triggered when Cognito sends email or SMS messages.
   * Customizes email templates with user's username and styled HTML.
   *
   * @returns Lambda function
   */
  private createCustomMessageTrigger(): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'CustomMessageLogGroup', {
      logGroupName: `/aws/lambda/EveryoneCook-${this.config.environment}-CustomMessage`,
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const trigger = new cdk.aws_lambda.Function(this, 'CustomMessageTrigger', {
      functionName: `EveryoneCook-${this.config.environment}-CustomMessage`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'custom-message.handler',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../services/auth-module/triggers/dist')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ENVIRONMENT: this.config.environment,
      },
      logGroup: logGroup,
      tracing: cdk.aws_lambda.Tracing.DISABLED,
    });

    // Add tags
    cdk.Tags.of(trigger).add('Component', 'Authentication');
    cdk.Tags.of(trigger).add('TriggerType', 'CustomMessage');

    return trigger;
  }

  /**
   * Create PreSignUp Lambda Trigger
   *
   * Triggered BEFORE user registration is confirmed.
   * Handles cleanup of unverified users with the same username/email.
   *
   * Use Cases:
   * - User registers but doesn't verify email within 24 hours
   * - User tries to register again with same username/email
   * - Auto-delete expired unverified users to prevent "already taken" errors
   *
   * Permissions:
   * - cognito-idp:ListUsers - Check if username/email exists
   * - cognito-idp:AdminDeleteUser - Delete expired unverified users
   *
   * @returns Lambda function
   * @see https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-pre-sign-up.html
   */
  private createPreSignUpTrigger(): cdk.aws_lambda.Function {
    // Create log group first (to avoid deprecated logRetention warning)
    const logGroup = new cdk.aws_logs.LogGroup(this, 'PreSignUpLogGroup', {
      logGroupName: `/aws/lambda/EveryoneCook-${this.config.environment}-PreSignUp`,
      retention: cdk.aws_logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const trigger = new cdk.aws_lambda.Function(this, 'PreSignUpTrigger', {
      functionName: `EveryoneCook-${this.config.environment}-PreSignUp`,
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      handler: 'pre-signup.handler',
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, '../../../services/auth-module/triggers/dist')),
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        ENVIRONMENT: this.config.environment,
      },
      logGroup: logGroup,
      tracing: cdk.aws_lambda.Tracing.DISABLED,
    });

    // Grant Cognito permissions to list and delete users
    // Note: We can't use this.userPool.grant() here as it would create circular dependency
    // So we grant directly to the Lambda role with wildcard resource
    trigger.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cognito-idp:ListUsers', 'cognito-idp:AdminDeleteUser'],
        resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`],
      })
    );

    // Add tags
    cdk.Tags.of(trigger).add('Component', 'Authentication');
    cdk.Tags.of(trigger).add('TriggerType', 'PreSignUp');

    return trigger;
  }

  /**
   * Add Lambda triggers to Cognito User Pool
   *
   * Configures the User Pool to invoke Lambda functions at specific lifecycle events:
   * - PreSignUp: Before user registration (cleanup unverified users)
   * - CustomMessage: Customize email/SMS messages
   * - PostConfirmation: After email verification
   * - PreAuthentication: Before login
   * - PostAuthentication: After successful login
   */
  private addLambdaTriggersToUserPool(): void {
    // Add triggers to User Pool
    this.userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.PRE_SIGN_UP, this.preSignUpTrigger);

    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.CUSTOM_MESSAGE,
      this.customMessageTrigger
    );

    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.POST_CONFIRMATION,
      this.postConfirmationTrigger
    );

    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.PRE_AUTHENTICATION,
      this.preAuthenticationTrigger
    );

    this.userPool.addTrigger(
      cdk.aws_cognito.UserPoolOperation.POST_AUTHENTICATION,
      this.postAuthenticationTrigger
    );
  }

  /**
   * Create Cognito User Pool Client for web application
   *
   * Configuration:
   * - Auth flows: USER_PASSWORD_AUTH, USER_SRP_AUTH (Secure Remote Password)
   * - OAuth flows: Authorization code grant (for future social login)
   * - Token validity:
   *   - Access token: 1 hour
   *   - ID token: 1 hour
   *   - Refresh token: 30 days
   * - Callback URLs:
   *   - Production: https://everyonecook.cloud/auth/callback
   *   - Staging: https://staging.everyonecook.cloud/auth/callback
   *   - Dev: http://localhost:3000/auth/callback
   * - Read attributes: email, email_verified, given_name, account_status
   * - Write attributes: given_name (fullName editable)
   *
   * @returns Cognito User Pool Client
   *
   * @see .kiro/specs/project-restructure/security-architecture.md - Authentication section
   * @see infrastructure/docs/phase3/COGNITO-CONFIGURATION-REPORT.md - User Pool Client configuration
   */
  private createUserPoolClient(): cdk.aws_cognito.UserPoolClient {
    // Determine callback URLs based on environment
    const callbackUrls = this.getCallbackUrls();
    const logoutUrls = this.getLogoutUrls();

    const userPoolClient = new cdk.aws_cognito.UserPoolClient(this, 'UserPoolClient', {
      userPoolClientName: `EveryoneCook-Web-Client-${this.config.environment}`,
      userPool: this.userPool,

      // Auth flows
      authFlows: {
        userPassword: true, // USER_PASSWORD_AUTH
        userSrp: true, // USER_SRP_AUTH (Secure Remote Password)
        custom: false,
        adminUserPassword: false,
      },

      // OAuth configuration (for future social login)
      oAuth: {
        flows: {
          authorizationCodeGrant: true, // Authorization code grant
          implicitCodeGrant: false, // Not recommended for security
          clientCredentials: false,
        },
        scopes: [
          cdk.aws_cognito.OAuthScope.EMAIL,
          cdk.aws_cognito.OAuthScope.OPENID,
          cdk.aws_cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: callbackUrls,
        logoutUrls: logoutUrls,
      },

      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // Read attributes (what the client can read from Cognito)
      readAttributes: new cdk.aws_cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true, // fullName
        })
        .withCustomAttributes('account_status', 'country'),

      // Write attributes - Removed to use Cognito defaults
      // By not specifying writeAttributes, Cognito allows writing to all mutable attributes
      // This includes givenName (fullName) which is marked as mutable in User Pool

      // Security settings
      preventUserExistenceErrors: true, // Prevent user enumeration attacks
      enableTokenRevocation: true, // Allow token revocation

      // Generate client secret (not needed for public web apps)
      generateSecret: false,
    });

    // Add tags
    cdk.Tags.of(userPoolClient).add('Component', 'Authentication');
    cdk.Tags.of(userPoolClient).add('ClientType', 'Web');

    return userPoolClient;
  }

  /**
   * Get callback URLs based on environment
   *
   * @returns Array of callback URLs
   */
  private getCallbackUrls(): string[] {
    const urls: string[] = [];

    // Add environment-specific frontend URL
    urls.push(`https://${this.config.domains.frontend}/auth/callback`);

    // Add localhost for dev environment
    if (this.config.environment === 'dev') {
      urls.push('http://localhost:3000/auth/callback');
    }

    return urls;
  }

  /**
   * Get logout URLs based on environment
   *
   * @returns Array of logout URLs
   */
  private getLogoutUrls(): string[] {
    const urls: string[] = [];

    // Add environment-specific frontend URL
    urls.push(`https://${this.config.domains.frontend}/auth/logout`);

    // Add localhost for dev environment
    if (this.config.environment === 'dev') {
      urls.push('http://localhost:3000/auth/logout');
    }

    return urls;
  }

  /**
   * Get verification email template (simplified for Cognito limits)
   */
  private getVerificationEmailTemplate(): string {
    return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f5f5f0">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px">
<tr><td style="background:linear-gradient(135deg,#203d11,#2d5518);padding:40px 30px;text-align:center;border-radius:16px 16px 0 0">
<div style="margin:0 auto 20px;width:80px;height:80px;background:rgba(16,185,129,0.2);border-radius:16px;padding:16px">
<svg width="48" height="48" viewBox="0 0 24 24" fill="#fff"><path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.20-1.10-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L9.7 14.70l.7.7 4.58-4.58z"/><path d="M2.88 15.68l1.24 1.24 1.41-1.41L4.29 14.27l-1.41 1.41zm2.83 2.83l1.24 1.24 1.41-1.41-1.24-1.24-1.41 1.41zm2.82 2.83l1.25 1.24 1.41-1.41-1.24-1.24-1.42 1.41z"/></svg>
</div>
<h1 style="margin:0;color:#fff;font-size:28px;font-weight:700">Everyone Cook</h1>
<p style="margin:10px 0 0;color:rgba(255,255,255,0.9);font-size:16px">Welcome!</p>
</td></tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #203d11; font-size: 24px; font-weight: 600;">Verify Your Email Address</h2>
              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hello <strong style="color: #203d11;">{username}</strong>,
              </p>
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Thank you for joining Everyone Cook! To complete your registration and start sharing your culinary creations, please verify your email address using the code below:
              </p>

              <!-- Verification Code Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 30px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f7f3ed 0%, #faf8f3 100%); border: 3px solid #975b1d; border-radius: 12px; padding: 30px; text-align: center;">
                    <p style="margin: 0 0 10px; color: #975b1d; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
                    <div style="font-size: 42px; font-weight: 700; color: #203d11; letter-spacing: 8px; font-family: 'Courier New', monospace;">{####}</div>
                    <p style="margin: 10px 0 0; color: #718096; font-size: 13px;">This code expires in 24 hours</p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Once verified, you'll be able to:
              </p>
              <ul style="margin: 0 0 30px; padding-left: 20px; color: #4a5568; font-size: 15px; line-height: 1.8;">
                <li style="margin-bottom: 8px;">🥘 Share your favorite recipes with the community</li>
                <li style="margin-bottom: 8px;">👨‍🍳 Discover new dishes from fellow cooks</li>
                <li style="margin-bottom: 8px;">💬 Connect with food enthusiasts worldwide</li>
                <li style="margin-bottom: 8px;">📖 Save and organize your recipe collection</li>
              </ul>

              <!-- Divider -->
              <div style="border-top: 2px solid #e2e8f0; margin: 30px 0;"></div>

              <!-- Security Notice -->
              <div style="background-color: #fef5e7; border-left: 4px solid #975b1d; padding: 15px 20px; border-radius: 8px; margin: 0 0 20px;">
                <p style="margin: 0; color: #975b1d; font-size: 14px; line-height: 1.6;">
                  <strong>🔒 Security Tip:</strong> Never share this code with anyone. Our team will never ask for your verification code.
                </p>
              </div>

              <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.6;">
                If you didn't create an account with Everyone Cook, please ignore this email or contact our support team.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #203d11; font-size: 16px; font-weight: 600;">Happy Cooking! 👨‍🍳</p>
              <p style="margin: 0 0 15px; color: #718096; font-size: 14px;">The Everyone Cook Team</p>
              <div style="margin: 20px 0 0;">
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍕</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍜</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🥗</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍰</span>
              </div>
              <p style="margin: 20px 0 0; color: #a0aec0; font-size: 12px;">
                © ${new Date().getFullYear()} Everyone Cook. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Get professional invitation email template
   * Theme: Kitchen/Cooking with green (#203d11) and brown-yellow (#975b1d)
   */
  private getInvitationEmailTemplate(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Everyone Cook</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f0;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(32, 61, 17, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #203d11 0%, #2d5518 100%); padding: 40px 30px; text-align: center; border-radius: 16px 16px 0 0;">
              <!-- Professional Logo - Cooking Utensils -->
              <div style="margin: 0 auto 20px; width: 80px; height: 80px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%); border-radius: 16px; padding: 16px; box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg" style="display: block; margin: 0 auto;">
                  <path d="M8.1 13.34l2.83-2.83L3.91 3.5a4.008 4.008 0 0 0 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.20-1.10-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L9.7 14.70l.7.7 4.58-4.58z"/>
                  <path d="M2.88 15.68l1.24 1.24 1.41-1.41L4.29 14.27l-1.41 1.41zm2.83 2.83l1.24 1.24 1.41-1.41-1.24-1.24-1.41 1.41zm2.82 2.83l1.25 1.24 1.41-1.41-1.24-1.24-1.42 1.41z"/>
                </svg>
              </div>
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Everyone Cook</h1>
              <p style="margin: 10px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">You've been invited!</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="margin: 0 0 20px; color: #203d11; font-size: 24px; font-weight: 600;">Welcome to Everyone Cook!</h2>
              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                Hello <strong style="color: #203d11;">{username}</strong>,
              </p>
              <p style="margin: 0 0 30px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                An account has been created for you on Everyone Cook. Use your temporary password below to sign in and start your culinary journey!
              </p>

              <!-- Temporary Password Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 30px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f7f3ed 0%, #faf8f3 100%); border: 3px solid #975b1d; border-radius: 12px; padding: 30px; text-align: center;">
                    <p style="margin: 0 0 10px; color: #975b1d; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Your Temporary Password</p>
                    <div style="font-size: 32px; font-weight: 700; color: #203d11; letter-spacing: 2px; font-family: 'Courier New', monospace; word-break: break-all;">{####}</div>
                    <p style="margin: 10px 0 0; color: #718096; font-size: 13px;">You'll be prompted to change this on first login</p>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="background-color: #fef5e7; border-left: 4px solid #975b1d; padding: 15px 20px; border-radius: 8px; margin: 0 0 30px;">
                <p style="margin: 0; color: #975b1d; font-size: 14px; line-height: 1.6;">
                  <strong>🔒 Important:</strong> Please change your password immediately after signing in. Choose a strong password with at least 12 characters.
                </p>
              </div>

              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                What you can do on Everyone Cook:
              </p>
              <ul style="margin: 0 0 30px; padding-left: 20px; color: #4a5568; font-size: 15px; line-height: 1.8;">
                <li style="margin-bottom: 8px;">🥘 Share your favorite recipes</li>
                <li style="margin-bottom: 8px;">👨‍🍳 Discover new dishes</li>
                <li style="margin-bottom: 8px;">💬 Connect with food lovers</li>
                <li style="margin-bottom: 8px;">📖 Build your recipe collection</li>
              </ul>

              <p style="margin: 0; color: #718096; font-size: 14px; line-height: 1.6;">
                If you didn't expect this invitation, please contact our support team immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 30px; text-align: center; border-radius: 0 0 16px 16px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px; color: #203d11; font-size: 16px; font-weight: 600;">Happy Cooking! 👨‍🍳</p>
              <p style="margin: 0 0 15px; color: #718096; font-size: 14px;">The Everyone Cook Team</p>
              <div style="margin: 20px 0 0;">
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍕</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍜</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🥗</span>
                <span style="display: inline-block; margin: 0 8px; color: #975b1d; font-size: 24px;">🍰</span>
              </div>
              <p style="margin: 20px 0 0; color: #a0aec0; font-size: 12px;">
                © ${new Date().getFullYear()} Everyone Cook. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Export stack outputs for cross-stack references
   *
   * Exports:
   * - UserPoolId: Cognito User Pool ID
   * - UserPoolArn: Cognito User Pool ARN
   * - UserPoolClientId: Cognito User Pool Client ID
   * - CustomMessageFunctionArn: CustomMessage Lambda ARN
   * - PostConfirmationFunctionArn: PostConfirmation Lambda ARN
   * - PreAuthenticationFunctionArn: PreAuthentication Lambda ARN
   * - PostAuthenticationFunctionArn: PostAuthentication Lambda ARN
   *
   * These exports will be used by BackendStack for API Gateway Cognito Authorizer
   */
  private exportOutputs(): void {
    // Export User Pool ID
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: this.exportName('UserPoolId'),
      description: 'Cognito User Pool ID',
    });

    // Export User Pool ARN
    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      exportName: this.exportName('UserPoolArn'),
      description: 'Cognito User Pool ARN',
    });

    // Export User Pool Client ID
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: this.exportName('UserPoolClientId'),
      description: 'Cognito User Pool Client ID',
    });

    // Export Lambda Trigger ARNs
    new cdk.CfnOutput(this, 'CustomMessageFunctionArn', {
      value: this.customMessageTrigger.functionArn,
      exportName: this.exportName('CustomMessageFunctionArn'),
      description: 'CustomMessage Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'PostConfirmationFunctionArn', {
      value: this.postConfirmationTrigger.functionArn,
      exportName: this.exportName('PostConfirmationFunctionArn'),
      description: 'PostConfirmation Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'PreAuthenticationFunctionArn', {
      value: this.preAuthenticationTrigger.functionArn,
      exportName: this.exportName('PreAuthenticationFunctionArn'),
      description: 'PreAuthentication Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'PostAuthenticationFunctionArn', {
      value: this.postAuthenticationTrigger.functionArn,
      exportName: this.exportName('PostAuthenticationFunctionArn'),
      description: 'PostAuthentication Lambda Function ARN',
    });
  }
}
