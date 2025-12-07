# API Router Lambda

## Overview

API Router Lambda serves as the single entry point for all API requests in the Everyone Cook system. It implements the API Router pattern to provide centralized request handling, JWT validation, routing, and error handling.

## Architecture

```
Client → API Gateway → API Router Lambda → Handler Lambdas
                            ↓
                    - JWT Validation
                    - Correlation ID
                    - Request Routing
                    - Error Handling
```

## Key Features

- **Single Entry Point**: All API requests flow through this Lambda
- **JWT Validation**: Validates Cognito JWT tokens
- **Request Routing**: Routes to appropriate handler Lambda based on path + method
- **Correlation IDs**: Adds correlation IDs for request tracing
- **Error Handling**: Consistent error response format
- **Structured Logging**: JSON-formatted logs with context

## Directory Structure

```
api-router/
├── handlers/           # Lambda handler functions
│   └── index.ts       # Main handler entry point
├── utils/             # Utility functions
│   ├── jwt.ts        # JWT validation
│   ├── router.ts     # Routing logic
│   ├── logger.ts     # Structured logging
│   └── response.ts   # Response formatting
├── types/             # TypeScript type definitions
│   └── index.ts      # Shared types
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Environment Variables

- `DYNAMODB_TABLE`: DynamoDB table name
- `USER_POOL_ID`: Cognito User Pool ID
- `AWS_REGION`: AWS region (auto-set by Lambda)
- `LOG_LEVEL`: Logging level (INFO, WARN, ERROR, DEBUG)

## Development

### Install Dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Run Tests

```bash
npm test
```

### Lint

```bash
npm run lint
```

## Routing Configuration

Routes are defined based on HTTP method and path:

```typescript
{
  'GET /users/{userId}': 'auth-user-lambda',
  'POST /posts': 'social-lambda',
  'GET /recipes/search': 'recipe-ai-lambda',
  'POST /admin/moderate': 'admin-lambda',
  'POST /upload/presigned-url': 'upload-lambda'
}
```

## Error Handling

All errors are returned in a consistent format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "User-friendly message",
    "details": {},
    "correlationId": "abc-123-def-456"
  }
}
```

## Logging

Structured JSON logs with correlation IDs:

```json
{
  "timestamp": "2025-01-20T10:30:00.000Z",
  "level": "INFO",
  "correlationId": "abc-123-def-456",
  "service": "api-router",
  "operation": "route-request",
  "duration": 45,
  "metadata": {
    "method": "GET",
    "path": "/users/123",
    "userId": "user-123"
  }
}
```

## References

- [Design Document](../../.kiro/specs/project-restructure/design.md)
- [Requirements](../../.kiro/specs/project-restructure/requirements.md)
- [Architecture Standards](../../.kiro/steering/architecture-standards.md)
