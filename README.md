# 🍳 Everyone Cook

Nền tảng chia sẻ công thức nấu ăn xã hội - Social Recipe Platform

## 📋 Tổng quan

Everyone Cook là một ứng dụng web cho phép người dùng chia sẻ, khám phá và lưu trữ các công thức nấu ăn. Dự án được xây dựng với kiến trúc serverless trên AWS sử dụng CDK (Cloud Development Kit).

## 🏗️ Kiến trúc hệ thống

### AWS Services

| Service | Mô tả |
|---------|-------|
| **DynamoDB** | Single Table Design với 5 GSI indexes |
| **S3** | Lưu trữ nội dung (avatars, posts, recipes, backgrounds) |
| **CloudFront** | CDN phân phối nội dung |
| **Cognito** | Xác thực người dùng |
| **API Gateway** | REST API với Cognito Authorizer |
| **Lambda** | 6 modules xử lý nghiệp vụ |
| **SQS** | 4 queues cho xử lý bất đồng bộ |
| **KMS** | Mã hóa dữ liệu |
| **WAF** | Bảo vệ API Gateway |
| **Route 53** | DNS management |
| **ACM** | SSL/TLS certificates |

### CDK Stacks (5-Stack Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Stack                       │
│              (CloudWatch Dashboards & Alarms)                │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                      Backend Stack                           │
│    (API Gateway, Lambda Functions, SQS Queues, WAF)         │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                        Auth Stack                            │
│           (Cognito User Pool, Lambda Triggers)               │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                        Core Stack                            │
│           (DynamoDB, S3, CloudFront, KMS)                    │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                    Certificate Stack                         │
│              (ACM Certificate - us-east-1)                   │
└─────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────┐
│                        DNS Stack                             │
│                  (Route 53 Hosted Zone)                      │
└─────────────────────────────────────────────────────────────┘
```

### Lambda Modules

| Module | Chức năng |
|--------|-----------|
| `api-router` | Điều hướng API requests |
| `auth-module` | Xác thực & quản lý người dùng |
| `social-module` | Tương tác xã hội (like, comment, friend) |
| `recipe-module` | Quản lý công thức nấu ăn |
| `ai-module` | Tích hợp AI (Bedrock) |
| `admin-module` | Quản trị hệ thống |
| `upload-module` | Upload files |
| `image-worker` | Xử lý ảnh bất đồng bộ |

### SQS Queues

- `ai-queue` - Xử lý AI requests (Bedrock)
- `image-queue` - Xử lý ảnh
- `analytics-queue` - Batch analytics
- `notification-queue` - Push notifications

## 🛠️ Tech Stack

### Backend
- **Runtime:** Node.js 20.x
- **Infrastructure:** AWS CDK v2.114+
- **Database:** DynamoDB (Single Table Design)
- **Authentication:** AWS Cognito
- **AI:** AWS Bedrock

### Frontend
- **Framework:** Next.js 15
- **UI:** React 18, Tailwind CSS, Flowbite
- **Auth:** AWS Amplify

## 📁 Cấu trúc dự án

```
everyonecook/
├── frontend/              # Next.js frontend application
├── infrastructure/        # AWS CDK infrastructure code
│   ├── bin/              # CDK app entry point
│   ├── lib/
│   │   ├── stacks/       # CDK Stacks
│   │   └── constructs/   # Reusable constructs
│   └── config/           # Environment configurations
├── services/             # Lambda function modules
│   ├── admin-module/
│   ├── ai-module/
│   ├── api-router/
│   ├── auth-module/
│   ├── image-worker/
│   ├── recipe-module/
│   ├── social-module/
│   ├── upload-module/
│   └── websocket-module/
├── shared/               # Shared utilities
├── layers/               # Lambda layers
└── bootstrap/            # Data seeding scripts
```

## 🚀 Deployment

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- AWS CLI configured
- AWS CDK CLI installed

### Environment Setup

```bash
# Install dependencies
npm install

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

### Deploy Commands

```bash
# Deploy to development
npm run deploy:dev

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod

# CDK commands
npm run cdk:synth    # Synthesize CloudFormation
npm run cdk:diff     # Show changes
npm run cdk:bootstrap # Bootstrap CDK
```

## 🌐 Environments

| Environment | Frontend | API | CDN |
|-------------|----------|-----|-----|
| **Dev** | dev.everyonecook.cloud | api-dev.everyonecook.cloud | cdn-dev.everyonecook.cloud |
| **Staging** | staging.everyonecook.cloud | api-staging.everyonecook.cloud | cdn-staging.everyonecook.cloud |
| **Prod** | everyonecook.cloud | api.everyonecook.cloud | cdn.everyonecook.cloud |

## 🔧 Development

```bash
# Run frontend locally
cd frontend
npm run dev

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## 🔒 Security Features

- Cognito User Pool với password policy mạnh (12+ ký tự)
- KMS encryption cho DynamoDB và S3
- WAF protection cho API Gateway
- CORS configuration
- Device tracking
- Email verification required

## 📊 Monitoring

- CloudWatch Logs với retention policies
- CloudWatch Alarms cho:
  - DynamoDB throttling
  - SQS Dead Letter Queues
  - KMS key usage
  - API Gateway cache hit rate
- CloudWatch Dashboards (Observability Stack)

## 💰 Cost Optimization

- DynamoDB: Pay-per-request (dev), Provisioned với Auto-scaling (staging/prod)
- S3 Intelligent-Tiering
- CloudFront caching
- API Gateway caching (staging/prod)
- Lambda right-sizing
- Log retention optimization

## 📝 Scripts

| Script | Mô tả |
|--------|-------|
| `npm run build` | Build all workspaces |
| `npm run test` | Run tests |
| `npm run lint` | Lint code |
| `npm run format` | Format code |
| `npm run verify` | Verify all configurations |

## 📄 License

Private - All rights reserved

## 👥 Contact

- Email: everyonecookcloud@gmail.com
- Repository: https://github.com/nvtruongops/everyonecook.git
