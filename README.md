# 🍳 Everyone Cook

> Social Recipe Platform - Nền tảng chia sẻ công thức nấu ăn với AI

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![AWS](https://img.shields.io/badge/AWS-Serverless-orange?logo=amazon-aws)](https://aws.amazon.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-red)]()

## 📋 Mục lục

- [Giới thiệu](#-giới-thiệu)
- [Tính năng](#-tính-năng)
- [Tech Stack](#-tech-stack)
- [Kiến trúc](#-kiến-trúc)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Cài đặt](#-cài-đặt)
- [Chạy dự án](#-chạy-dự-án)
- [Deployment](#-deployment)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)
- [Team](#-team)

---

## 🎯 Giới thiệu

**Everyone Cook** là nền tảng mạng xã hội chia sẻ công thức nấu ăn, tích hợp AI để gợi ý món ăn dựa trên nguyên liệu có sẵn. Dự án được xây dựng với kiến trúc Serverless trên AWS, tối ưu chi phí và khả năng mở rộng.

### Demo

- **Production:** https://everyonecook.cloud
- **Youtube** https://www.youtube.com/watch?v=wF7LJZpX89o&feature=youtu.be
---

## ✨ Tính năng

### 👤 Authentication
- Đăng ký/Đăng nhập với AWS Cognito
- Xác thực email
- Quên mật khẩu
- JWT Token với auto-refresh

### 📱 Social Features
- Tạo bài viết với hình ảnh
- Like, comment, share
- Feed theo dõi bạn bè
- Thông báo real-time (polling)

### 🍲 Recipe Management
- Tạo và quản lý công thức
- Chia sẻ công thức lên feed
- Lưu công thức yêu thích
- Nhóm công thức (Recipe Groups)

### 🤖 AI Features
- Gợi ý món ăn từ nguyên liệu (AWS Bedrock - Claude 3)
- Tính toán dinh dưỡng
- Đề xuất công thức cá nhân hóa

### 👨‍💼 Admin Panel
- Quản lý người dùng
- Xử lý báo cáo vi phạm
- Thống kê hệ thống
- Ban/Unban users

---

## 🛠 Tech Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.0 | React Framework với App Router |
| TypeScript | 5.3 | Type-safe JavaScript |
| Tailwind CSS | 3.4 | Utility-first CSS |
| Flowbite React | 0.7 | UI Components |
| AWS Amplify | 6.x | Authentication SDK |
| Axios | 1.x | HTTP Client |

### Backend (Serverless)
| Service | Purpose |
|---------|---------|
| AWS Lambda | Serverless compute (6 modules) |
| API Gateway | REST API với Cognito Authorizer |
| DynamoDB | NoSQL Database (Single Table Design) |
| S3 | Object storage cho images |
| CloudFront | CDN cho static assets |
| Cognito | User authentication |
| SES | Email service |
| Bedrock | AI/ML (Claude 3 Haiku) |
| WAF | Web Application Firewall |
| CloudWatch | Monitoring & Logging |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| AWS CDK | Infrastructure as Code |
| TypeScript | CDK language |

---

## 🏗 Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 15)                     │
│              AWS Amplify Hosting (SSR Support)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY (REST)                        │
│         Cognito Authorizer + WAF + Rate Limiting             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LAMBDA FUNCTIONS                          │
│   API Router → Auth/Social/Recipe/AI/Admin/Upload Modules    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    DATA LAYER                                │
│   DynamoDB (Single Table) + S3 + CloudFront CDN              │
└─────────────────────────────────────────────────────────────┘
```

### CDK Stacks (6 Stacks)
1. **DNS Stack** - Route 53 Hosted Zone
2. **Certificate Stack** - ACM Certificate (us-east-1)
3. **Core Stack** - DynamoDB, S3, CloudFront, KMS
4. **Auth Stack** - Cognito User Pool, SES
5. **Backend Stack** - API Gateway, Lambda, SQS, WAF
6. **Observability Stack** - CloudWatch Dashboards & Alarms

---

## 📁 Cấu trúc dự án

```
everyonecook/
├── frontend/                 # Next.js 15 Frontend
│   ├── app/                  # App Router pages
│   │   ├── (auth)/          # Auth pages (login, register, etc.)
│   │   ├── admin/           # Admin dashboard
│   │   ├── dashboard/       # Main feed
│   │   ├── profile/         # User profile
│   │   ├── cooking/         # AI recipe suggestions
│   │   └── ...
│   ├── components/          # Reusable components
│   ├── contexts/            # React Contexts (Auth, Avatar)
│   ├── hooks/               # Custom hooks
│   ├── lib/                 # Utilities, API client
│   ├── services/            # API service functions
│   └── types/               # TypeScript types
│
├── infrastructure/          # AWS CDK Infrastructure
│   ├── bin/                 # CDK app entry point
│   ├── lib/                 # CDK stacks
│   │   └── stacks/         # Individual stacks
│   └── config/              # Environment configurations
│
├── services/                # Lambda function modules
│   ├── api-router/          # Main API router
│   ├── auth-module/         # Authentication & User management
│   ├── social-module/       # Posts, comments, likes, friends
│   ├── recipe-module/       # Recipes, AI suggestions
│   ├── admin-module/        # Admin operations
│   ├── upload-module/       # File uploads
│   └── shared/              # Shared utilities
│
├── shared/                  # Shared code across modules
│   ├── types/               # Shared TypeScript types
│   ├── utils/               # Shared utilities
│   └── business-logic/      # Shared business logic
│
├── layers/                  # Lambda Layers
│   └── shared-dependencies/ # Shared npm packages
│
├── tests/                   # Integration & Load tests
│   ├── integration/
│   └── load/
│
└── package.json             # Root package.json (workspaces)
```

---

## 🚀 Cài đặt

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- AWS CLI configured
- AWS CDK CLI (`npm install -g aws-cdk`)

### 1. Clone repository

```bash
git clone https://github.com/nvtruongops/everyonecook.git
cd everyonecook
```

### 2. Install dependencies

```bash
# Install all workspace dependencies
npm install
```

### 3. Setup environment variables

```bash
# Root level
cp .env.example .env

# Frontend
cp frontend/.env.example frontend/.env.local
```

### 4. Configure AWS credentials

```bash
aws configure
# Hoặc set AWS_PROFILE
export AWS_PROFILE=your-profile
```

---

## 💻 Chạy dự án

### Frontend Development

```bash
cd frontend
npm run dev
```

Mở http://localhost:3000

### Backend (Local testing)

Backend chạy trên AWS Lambda, không có local server. Để test:

1. Deploy lên môi trường dev
2. Sử dụng API URL từ dev environment

---

## 🌐 Deployment

### Deploy Infrastructure (CDK)

```bash
# Bootstrap CDK (chỉ cần chạy 1 lần)
npm run cdk:bootstrap

# Deploy tất cả stacks lên dev
npm run deploy:dev

# Deploy lên staging
npm run deploy:staging

# Deploy lên production
npm run deploy:prod

# Xem thay đổi trước khi deploy
npm run cdk:diff
```

### Deploy Frontend (Amplify)

Frontend được deploy tự động qua AWS Amplify khi push code lên GitHub.

---

## 🔐 Environment Variables

### Frontend (.env.local)

```bash
# API
NEXT_PUBLIC_API_URL=https://api-dev.everyonecook.cloud

# CDN
NEXT_PUBLIC_CDN_URL=https://cdn-dev.everyonecook.cloud

# Cognito
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-1_xxxxx
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxx
NEXT_PUBLIC_COGNITO_REGION=ap-southeast-1

# Environment
NEXT_PUBLIC_ENV=development
```

### Backend (.env)

Xem file `.env.example` để biết tất cả các biến môi trường cần thiết.

---

## 📚 API Documentation

### Base URLs

| Environment | URL |
|-------------|-----|
| Production | https://api.everyonecook.cloud |
| Development | https://api-dev.everyonecook.cloud |

### Authentication

Tất cả API (trừ public endpoints) yêu cầu JWT token trong header:

```
Authorization: Bearer <ID_TOKEN>
```

### Main Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | Login |
| POST | /auth/register | Register |
| GET | /users/profile | Get current user profile |
| GET | /feed | Get social feed |
| POST | /posts | Create post |
| GET | /posts/:id | Get post detail |
| POST | /posts/:id/reactions | Like/React to post |
| GET | /recipes | Get recipes |
| POST | /ai/suggest | AI recipe suggestions |

---

## 📊 Monitoring

### CloudWatch Dashboards

- Lambda metrics (invocations, errors, duration)
- API Gateway metrics (requests, latency, 4xx/5xx)
- DynamoDB metrics (read/write capacity, throttling)

### Alarms

- Lambda error rate > 5%
- API Gateway 5xx > 1%
- DynamoDB throttling

---

## 💰 Cost Estimation (Dev Environment)

**Based on AWS Pricing Calculator estimate for 100-500 MAU:**

| Service            | Monthly Cost (USD) | Description                                       |
|--------------------|--------------------|---------------------------------------------------|
| Amazon DynamoDB    | \$13.06            | Single-table design, 5 GSIs, provisioned capacity |
| Amazon S3          | \$0.84             | 2 buckets, Intelligent-Tiering                    |
| Amazon CloudFront  | \$1.44             | CDN, Price Class 200                              |
| Amazon Cognito     | \$5.00             | User authentication                               |
| AWS Lambda         | \$0.00             | 13 functions (Free Tier)                          |
| Amazon API Gateway | \$20.65            | REST API with 0.5GB cache                         |
| Amazon SQS         | \$0.00             | 8 queues (Free Tier)                              |
| Amazon SES         | \$0.02             | Transactional emails                              |
| AWS KMS            | \$2.00             | 2 customer managed keys                           |
| AWS WAF            | \$10.00            | Web ACL, 5 rules                                  |
| Amazon CloudWatch  | \$21.25            | Metrics, dashboards, alarms, logs                 |
| Amazon Route 53    | \$0.93             | DNS hosted zone                                   |
| AWS Amplify        | \$4.58             | Frontend hosting (Next.js)                        |
| Amazon Bedrock     | \$64.80            | Claude 3 Haiku AI                                 |
| Total              | \~\$144.54         | Per month                                         |

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Integration tests
npm run test:integration

# Load tests
npm run test:load
```

---

## 📝 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run build` | Build all workspaces |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run deploy:dev` | Deploy to dev environment |
| `npm run cdk:synth` | Synthesize CloudFormation |
| `npm run cdk:diff` | Show deployment diff |

---

## 👥 Team

| Name                 | Title  | Role            | Email / Contact Info        |
|----------------------|--------|-----------------|-----------------------------|
| Pham Minh Hoang Viet | Leader | Project Manager | vietpmhse181851@gmail.com   |
| Nguyen Van Truong    | Member | DevOps          | truongnvse182034@fpt.edu.vn |
| Huynh Duc Anh        | Member | Cloud Engineer  | anhhdse183114@fpt.edu.vn    |
| Nguyen Thanh Hong    | Member | Tester          | hongntse183239@fpt.edu.vn   |
| Nguyen Qui Duc       | Member | Frontend        | ducnqse182087@fpt.edu.vn    |

---

## 📄 License

Private - All rights reserved.

---

## 🔗 Links

- [Production](https://everyonecook.cloud)
- [Development](https://dev.everyonecook.cloud)
- [GitHub Repository](https://github.com/nvtruongops/everyonecook)

---

*Last updated: December 2024*
