# Admin Module

## Overview

The Admin Module handles administrative operations for the Everyone Cook platform, focusing on user management, ban operations, audit logging, and inactive user cleanup.

## Features

- **User Management**: Ban/unban users with temporary or permanent bans
- **Audit Logging**: Complete audit trail of all admin actions
- **Rate Limiting**: Prevent abuse with soft (50/hour) and hard (100/hour) limits
- **Notification System**: Automated email notifications for ban/unban operations
- **Inactive User Cleanup**: Automated cleanup of inactive users (90+ days)
- **Rollback Support**: Automatic rollback on operation failures

## Architecture

### Authorization

- Cognito Admin Group membership required
- JWT token validation
- IP address tracking for audit

### Rate Limiting

- Soft limit: 50 actions/hour (warning)
- Hard limit: 100 actions/hour (block)
- Automatic reset after 1 hour

### Audit Logging

- All admin actions logged to DynamoDB
- GSI6 index for admin activity queries
- Includes: admin ID, action type, target user, reason, IP, timestamp

### Ban System

- **Temporary Ban**: Auto-unban via DynamoDB TTL + Streams
- **Permanent Ban**: Manual unban only
- **Rollback**: Automatic rollback on failure

## Directory Structure

```
admin-module/
├── handlers/              # Lambda handlers
│   ├── ban-user.ts       # Ban user endpoint
│   ├── unban-user.ts     # Unban user endpoint
│   ├── get-banned-users.ts # List banned users
│   ├── cleanup-inactive.ts # Cleanup inactive users
│   └── index.ts          # Handler exports
├── services/             # Business logic
│   ├── ban.service.ts    # Ban/unban operations
│   ├── audit-log.service.ts # Audit logging
│   └── notification.service.ts # Email notifications
├── middleware/           # Middleware
│   ├── admin-auth.ts     # Authorization
│   └── rate-limit.ts     # Rate limiting
├── models/               # Data models
│   ├── validation.ts     # Zod schemas
│   ├── admin-action.ts   # Audit entity
│   └── ban-user.ts       # Ban types
├── utils/                # Utilities
│   └── error-handler.ts  # Error handling
├── index.ts              # Module entry point
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## API Endpoints

### Ban User

```http
POST /admin/users/ban
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "targetUserId": "uuid",
  "banReason": "Violation of community guidelines",
  "banDuration": 7  // days (0 = permanent)
}
```

**Response:**

```json
{
  "data": {
    "message": "User banned successfully",
    "userId": "uuid",
    "banType": "temporary",
    "banDuration": 7
  },
  "correlationId": "request-id"
}
```

### Unban User

```http
POST /admin/users/unban
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "targetUserId": "uuid",
  "unbanReason": "Appeal approved"  // optional
}
```

### Get Banned Users

```http
GET /admin/users/banned?banType=all&limit=20&lastEvaluatedKey=...
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**

- `banType`: `all` | `temporary` | `permanent` (default: `all`)
- `limit`: 1-100 (default: 20)
- `lastEvaluatedKey`: Pagination token

### Cleanup Inactive Users

```http
POST /admin/users/cleanup-inactive
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "dryRun": true,  // default: true
  "inactiveDays": 90  // default: 90
}
```

## Setup

Install dependencies:

```bash
npm install
```

## Development

Build the module:

```bash
npm run build
```

Watch for changes:

```bash
npm run watch
```

Run tests:

```bash
npm test
```

Run linter:

```bash
npm run lint
```

## Environment Variables

Required:

- `DYNAMODB_TABLE_NAME` - DynamoDB table name (default: `EveryoneCook`)
- `USER_POOL_ID` - Cognito User Pool ID
- `EMAIL_QUEUE_URL` - SQS Email Queue URL

Optional:

- `AWS_REGION` - AWS region (default: `ap-southeast-1`)

## Error Codes

| Code        | Description            |
| ----------- | ---------------------- |
| `ADMIN_001` | Admin unauthorized     |
| `ADMIN_002` | Invalid JWT token      |
| `ADMIN_100` | Validation error       |
| `ADMIN_200` | Target user not found  |
| `ADMIN_201` | User already banned    |
| `ADMIN_202` | User not banned        |
| `ADMIN_300` | Ban operation failed   |
| `ADMIN_301` | Unban operation failed |
| `ADMIN_400` | Rate limit exceeded    |
| `ADMIN_500` | Internal error         |

## Security

### Authorization

- Only users in Cognito `Admin` group can access endpoints
- JWT token validation on every request
- IP address logging for audit trail

### Rate Limiting

- Prevents compromised admin accounts from causing damage
- Soft limit triggers warning alerts
- Hard limit blocks requests with `429 Too Many Requests`

### Audit Logging

- All actions logged with full context
- Immutable audit trail in DynamoDB
- Queryable via GSI6 index

### Rollback

- Automatic rollback on partial failures
- Ensures data consistency
- Logs rollback attempts

## Testing

```bash
# Run all tests
npm test

# Run specific test
npm test -- ban-user.test.ts

# Coverage report
npm test -- --coverage
```

## Monitoring

### CloudWatch Metrics

- Admin action count by type
- Rate limit violations
- Ban/unban success/failure rates
- Cleanup operation metrics

### CloudWatch Alarms

- Rate limit soft threshold (50/hour)
- Rate limit hard threshold (100/hour)
- Ban operation failures
- Cleanup operation failures

## Dependencies

- `@aws-sdk/client-dynamodb` - DynamoDB operations
- `@aws-sdk/client-cognito-identity-provider` - Cognito operations
- `@aws-sdk/client-sqs` - SQS operations
- `@aws-sdk/lib-dynamodb` - DynamoDB Document Client
- `aws-lambda` - Lambda types
- `zod` - Input validation

## Related Modules

- **Auth Module**: User authentication and authorization
- **Social Module**: Social content being moderated
- **User Module**: User profile management

## References

- [User Profile Privacy](../../.kiro/specs/project-restructure/user-profile-privacy.md) - Admin Ban System
- [Security Architecture](../../.kiro/specs/project-restructure/security-architecture.md) - Authorization patterns
- [Database Architecture](../../.kiro/specs/project-restructure/database-architecture.md) - TTL strategies
- [Requirements](../../.kiro/specs/project-restructure/requirements.md) - Requirement 17
