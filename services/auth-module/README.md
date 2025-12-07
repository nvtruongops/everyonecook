# Auth & User Module

Authentication and user management module for Everyone Cook platform.

## Overview

This module handles:

- User authentication (login, register, password reset)
- User profile management (CRUD operations)
- Privacy settings management
- User search functionality

## Architecture

### Directory Structure

```
auth-module/
├── handlers/          # Lambda handler functions
│   ├── auth.ts       # Authentication handlers
│   ├── profile.ts    # Profile management handlers
│   ├── privacy.ts    # Privacy settings handlers
│   └── search.ts     # User search handlers
├── services/         # Business logic services
│   ├── auth.service.ts
│   ├── profile.service.ts
│   └── privacy.service.ts
├── models/           # Data models and types
│   ├── user.model.ts
│   └── privacy.model.ts
├── utils/            # Utility functions
│   └── validation.ts
├── triggers/         # Cognito Lambda triggers
│   ├── post-confirmation.ts
│   ├── pre-authentication.ts
│   └── post-authentication.ts
└── index.ts          # Main entry point
```

## Features

### Authentication

- Login with username/email and password
- User registration with email verification
- Password reset flow
- Token refresh

### User Profile

- Get user profile (with privacy filtering)
- Update profile information
- Upload profile picture
- Delete account

### Privacy Settings

- Configure field-level privacy (Public/Friends/Private)
- Default privacy settings
- Privacy filtering based on relationships

### User Search

- Search users by username (partial match)
- Pagination support
- Privacy-aware results (filtered based on relationship)

## Dependencies

- AWS Cognito - User authentication
- DynamoDB - User profile storage
- S3 - Profile picture storage

## Environment Variables

```bash
DYNAMODB_TABLE=EveryoneCook-dev
USER_POOL_ID=ap-southeast-1_xxxxx
USER_POOL_CLIENT_ID=xxxxx
AWS_REGION=ap-southeast-1
LOG_LEVEL=INFO
```

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

## Deployment

This module is deployed as part of the Backend Stack:

```bash
cd infrastructure
npm run cdk deploy EveryoneCook-dev-Backend
```

## References

- [User Profile Design](../../.kiro/specs/project-restructure/user-profile-design.md)
- [User Profile Privacy](../../.kiro/specs/project-restructure/user-profile-privacy.md)
- [Security Architecture](../../.kiro/specs/project-restructure/security-architecture.md)
