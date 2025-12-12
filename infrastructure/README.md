# Infrastructure - AWS CDK

AWS CDK infrastructure code cho Everyone Cook platform.

## Stack Architecture

```
DNS Stack -> Certificate Stack -> Core Stack -> Auth Stack -> Backend Stack -> Observability Stack
```

| Stack | Region | Mô tả |
|-------|--------|-------|
| DNS | ap-southeast-1 | Route 53 Hosted Zone |
| Certificate | us-east-1 | ACM Certificate (CloudFront requirement) |
| Core | ap-southeast-1 | DynamoDB, S3, CloudFront, KMS |
| Auth | ap-southeast-1 | Cognito User Pool, Lambda Triggers |
| Backend | ap-southeast-1 | API Gateway, Lambda, SQS, WAF |
| Observability | ap-southeast-1 | CloudWatch Dashboards, Alarms |

## Custom Configurations

### DynamoDB

Single Table Design với username-based PK pattern.

| Config | Dev | Staging/Prod | Default |
|--------|-----|--------------|---------|
| Billing Mode | PAY_PER_REQUEST | PROVISIONED | PAY_PER_REQUEST |
| Read/Write Capacity | - | 2 RCU/WCU | - |
| Auto Scaling | - | 2-10 units, 70% target | Disabled |
| Point-in-Time Recovery | Disabled | Enabled | Disabled |
| Deletion Protection | Disabled | Enabled | Disabled |
| Stream | NEW_AND_OLD_IMAGES | NEW_AND_OLD_IMAGES | Disabled |
| TTL Attribute | `ttl` | `ttl` | None |
| Encryption | Customer Managed KMS | Customer Managed KMS | AWS Owned |

**GSI Indexes (5 indexes):**

| GSI | Partition Key | Sort Key | Use Case |
|-----|---------------|----------|----------|
| GSI1 | GSI1PK | GSI1SK | Friend relationships, Notifications |
| GSI2 | GSI2PK | GSI2SK | Public feed, Search |
| GSI3 | GSI3PK | GSI3SK | Trending posts, Recipe groups |
| GSI4 | GSI4PK | GSI4SK | Ingredient-based search |
| GSI5 | GSI5PK | GSI5SK | Dictionary duplicate prevention |

### S3 Content Bucket

| Config | Value | Default |
|--------|-------|---------|
| Block Public Access | BLOCK_ALL | BLOCK_ALL |
| Versioning | Disabled (dev), Enabled (prod) | Disabled |
| Encryption | S3_MANAGED | S3_MANAGED |
| Intelligent-Tiering | Enabled | Disabled |
| Archive Tier | 90 days | - |
| Deep Archive Tier | 180 days | - |
| Delete Old Versions | 30 days | - |
| Temp Upload Cleanup | 24 hours (posts/temp/) | - |

**CORS Origins:**
- `https://{environment}.everyonecook.cloud`
- `http://localhost:3000` (dev only)

### CloudFront Distribution

| Config | Value | Default |
|--------|-------|---------|
| Price Class | PRICE_CLASS_200 (US, EU, Asia) | PRICE_CLASS_ALL |
| Compression | Enabled | Disabled |
| Cache TTL | 1 day default, 1 year max | 1 day |
| Origin Access | Origin Access Control (OAC) | None |

### Cognito User Pool

| Config | Value | Default |
|--------|-------|---------|
| Sign-in Aliases | username, email | username |
| Self Sign-up | Enabled | Disabled |
| Email Verification | Required | Optional |
| MFA | OFF | OFF |
| Device Tracking | Enabled, no challenge | Disabled |
| Account Recovery | EMAIL_ONLY | PHONE_AND_EMAIL |

**Password Policy:**

| Config | Dev/Staging/Prod | Default |
|--------|------------------|---------|
| Minimum Length | 12 | 8 |
| Require Lowercase | Yes | Yes |
| Require Uppercase | Yes | Yes |
| Require Digits | Yes | Yes |
| Require Symbols | Yes | No |
| Temp Password Validity | 7 days | 7 days |

**Custom Attributes:**
- `account_status` (string, 1-20 chars) - Admin ban status
- `country` (string, 2 chars) - ISO 3166-1 alpha-2

**Lambda Triggers:**
- PreSignUp - Cleanup unverified users
- PostConfirmation - Create DynamoDB profile
- PreAuthentication - Check ban status
- PostAuthentication - Update lastLoginAt
- CustomMessage - Custom email templates

**Token Validity:**

| Token | Value | Default |
|-------|-------|---------|
| Access Token | 1 hour | 1 hour |
| ID Token | 1 hour | 1 hour |
| Refresh Token | 30 days | 30 days |

### API Gateway

| Config | Dev | Staging | Prod | Default |
|--------|-----|---------|------|---------|
| Rate Limit | 1,000/sec | 5,000/sec | 10,000/sec | 10,000/sec |
| Burst Limit | 500 | 2,500 | 5,000 | 5,000 |
| Caching | Disabled | Enabled | Enabled | Disabled |
| Cache Size | - | 0.5 GB | 0.5 GB | - |
| Cache TTL | - | 300 sec | 300 sec | 300 sec |
| Cache Encryption | - | Enabled | Enabled | Disabled |
| Compression | Enabled (>1KB) | Enabled | Enabled | Disabled |
| X-Ray Tracing | Disabled | Disabled | Disabled | Disabled |
| CloudWatch Logs | INFO | INFO | INFO | OFF |
| Data Trace | Enabled | Enabled | Disabled | Disabled |

**CORS Configuration:**
- Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
- Headers: Content-Type, Authorization, X-Amz-*, X-Correlation-Id, Cache-Control, Accept-Encoding
- Credentials: false (Bearer token auth)
- Max Age: 1 hour

**Gateway Responses:** 401, 403, 4XX, 5XX với CORS headers

### Lambda Functions

| Function | Memory | Timeout | Runtime |
|----------|--------|---------|---------|
| API Router | 512 MB | 30 sec | Node.js 20.x |
| Auth User | 512 MB | 30 sec | Node.js 20.x |
| Social | 512 MB | 30 sec | Node.js 20.x |
| Recipe AI | 1024 MB | 120 sec | Node.js 20.x |
| Admin | 512 MB | 30 sec | Node.js 20.x |
| Upload | 256 MB | 60 sec | Node.js 20.x |
| Cognito Triggers | 256 MB | 10-30 sec | Node.js 20.x |

**Shared Layer:** AWS SDK v3, uuid, jsonwebtoken, jwks-rsa

### SQS Queues

| Queue | Visibility Timeout | Retention | Max Receive | DLQ Retention |
|-------|-------------------|-----------|-------------|---------------|
| AI Queue | 120 sec | 4 days | 3 | 14 days |
| Image Queue | 60 sec | 4 days | 3 | 14 days |
| Analytics Queue | 30 sec | 4 days | 3 | 14 days |
| Notification Queue | 30 sec | 4 days | 3 | 14 days |

Encryption: KMS_MANAGED

### KMS Keys

| Key | Purpose | Rotation | Pending Window |
|-----|---------|----------|----------------|
| DynamoDB Key | Table encryption | Yearly (auto) | 7 days (dev), 30 days (prod) |
| S3 Key | Bucket encryption | Yearly (auto) | 7 days (dev), 30 days (prod) |

**Key Policies:**
- DynamoDB service access
- CloudWatch Logs access
- S3 service access
- CloudFront access (signed URLs)

### WAF (Staging/Prod only)

| Rule | Staging | Prod |
|------|---------|------|
| SQL Injection | Enabled | Enabled |
| XSS | Enabled | Enabled |
| Rate Limit | Enabled | Enabled |
| Geo Blocking | Disabled | Enabled |
| Bot Protection | Enabled | Enabled |

### CloudWatch

| Config | Dev | Staging | Prod |
|--------|-----|---------|------|
| Log Level | DEBUG | INFO | INFO |
| Log Retention | 3 days | 30 days | 90 days |
| Alarms | Disabled | Enabled | Enabled |

**Alarms:**
- DynamoDB: Read/Write Throttle, System Errors
- SQS: DLQ Messages, Queue Depth
- KMS: High Usage
- API Gateway: Cache Hit Rate (<70%)
- WAF: Blocked Requests

## Deployment

```bash
# Synthesize
cdk synth --context environment=dev

# Diff
cdk diff --context environment=dev

# Deploy all stacks
cdk deploy --all --context environment=dev

# Deploy specific stack
cdk deploy EveryoneCook-dev-Core --context environment=dev
```

## Environment Variables

Required in CDK context or environment:
- `CDK_DEFAULT_ACCOUNT` - AWS Account ID
- `CDK_DEFAULT_REGION` - AWS Region

## Tagging Strategy

All resources tagged with:
- `Project`: EveryoneCook
- `Environment`: dev/staging/prod
- `ManagedBy`: CDK
- `Contact`: everyonecookcloud@gmail.com
- `Repository`: https://github.com/nvtruongops/everyonecook.git
- `StackType`: DNS/Core/Auth/Backend/Observability
- `CostCenter`: {StackType}-{Environment}
