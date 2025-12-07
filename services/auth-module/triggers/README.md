# Cognito Lambda Triggers

This directory contains Lambda triggers for Cognito User Pool lifecycle events.

## Triggers

### 1. PostConfirmation Trigger

**File:** `post-confirmation.ts`

**Triggered:** After user confirms their email address

**Purpose:** Creates 3 DynamoDB entities for new users:

1. Core Profile (PK=USER#{userId}, SK=PROFILE)
2. Privacy Settings (PK=USER#{userId}, SK=PRIVACY_SETTINGS)
3. AI Preferences (PK=USER#{userId}, SK=AI_PREFERENCES)

**Important Notes:**

- Birthday, gender, country are NULL initially (completed in onboarding)
- TTL is NULL initially (set after 90 days inactivity)
- Default privacy settings: fullName=public, email=private, etc.

### 2. PreAuthentication Trigger

**File:** `pre-authentication.ts`

**Triggered:** Before user authentication

**Purpose:** Security check before login:

- Checks if user is banned (temporary or permanent)
- Checks if user account is inactive
- Rejects login if user is banned or inactive

**Ban Types:**

- Temporary Ban: Auto-unban after expiration (via TTL)
- Permanent Ban: Manual unban by admin required

### 3. PostAuthentication Trigger

**File:** `post-authentication.ts`

**Triggered:** After successful user authentication

**Purpose:** Activity tracking and cleanup:

- Updates lastLoginAt timestamp
- Handles inactive user cleanup logic (90 days threshold)
- Auto-unbans users with expired temporary bans

**TTL Strategy:**

- If inactive > 90 days: Set TTL = now + 7 days (grace period)
- If active: Remove TTL (if exists)
- Grace period: 7 days before account deletion

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Deploy

The triggers are automatically deployed as part of the AuthStack:

```bash
cd infrastructure
npm run cdk deploy EveryoneCook-dev-Auth
```

## Environment Variables

All triggers require:

- `DYNAMODB_TABLE_NAME`: DynamoDB table name (default: EveryoneCook)
- `ENVIRONMENT`: Environment name (dev, staging, prod)

## Testing

### Test Signup Flow

```bash
aws cognito-idp sign-up \
  --client-id <client-id> \
  --username testuser \
  --password Test123!@# \
  --user-attributes Name=email,Value=test@example.com Name=given_name,Value="Test User"
```

### Verify Profile Creation

```bash
aws dynamodb get-item \
  --table-name EveryoneCook-dev \
  --key '{"PK":{"S":"USER#<userId>"},"SK":{"S":"PROFILE"}}'
```

### Check Lambda Logs

```bash
aws logs tail /aws/lambda/EveryoneCook-dev-PostConfirmation --follow
aws logs tail /aws/lambda/EveryoneCook-dev-PreAuthentication --follow
aws logs tail /aws/lambda/EveryoneCook-dev-PostAuthentication --follow
```

## References

- [User Profile Design](../../../.kiro/specs/project-restructure/user-profile-design.md)
- [User Profile Privacy](../../../.kiro/specs/project-restructure/user-profile-privacy.md)
- [Database Architecture](../../../.kiro/specs/project-restructure/database-architecture.md)
- [Security Architecture](../../../.kiro/specs/project-restructure/security-architecture.md)
