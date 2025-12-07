# Upload Module

## Overview

The Upload Module handles all file upload operations for the Everyone Cook platform, including presigned URL generation, file validation, and integration with the image processing queue.

## Features

- **Presigned URL Generation**: Generate secure S3 presigned URLs for direct client uploads
- **File Validation**: Validate file types, sizes, and upload limits
- **Rate Limiting**: Enforce upload restrictions (10 avatars/day, 10 backgrounds/day)
- **Image Processing**: Queue images for processing (resize, optimize, thumbnail generation)
- **Upload Tracking**: Track upload history and enforce daily limits

## Architecture

### Lambda Configuration

- **Memory**: 256MB
- **Timeout**: 30 seconds
- **Runtime**: Node.js 20.x

### S3 Bucket Structure

```
everyonecook-content-{env}/
├── avatars/{userId}/avatar-{timestamp}.jpg
├── backgrounds/{userId}/background-{timestamp}.jpg
└── posts/{postId}/image-{index}.jpg
```

## API Endpoints

### Generate Presigned URL

```
POST /upload/presigned-url
Body: {
  "fileType": "avatar" | "background" | "post",
  "contentType": "image/jpeg" | "image/png",
  "fileSize": number
}
Response: {
  "uploadUrl": "https://...",
  "key": "avatars/user123/avatar-1234567890.jpg",
  "expiresIn": 300
}
```

## Upload Limits

| Upload Type | Daily Limit | Max File Size | Allowed Types |
| ----------- | ----------- | ------------- | ------------- |
| Avatar      | 10/day      | 5MB           | JPEG, PNG     |
| Background  | 10/day      | 10MB          | JPEG, PNG     |
| Post Image  | 5 per post  | 5MB           | JPEG, PNG     |

## Rate Limiting

Rate limits are tracked in DynamoDB with TTL:

```typescript
{
  PK: "USER#{userId}",
  SK: "UPLOAD_LIMIT#{date}#{type}",
  count: number,
  ttl: timestamp (24 hours)
}
```

## Dependencies

- `@aws-sdk/client-s3` - S3 operations
- `@aws-sdk/s3-request-presigner` - Presigned URL generation
- `@aws-sdk/client-dynamodb` - Rate limit tracking
- `@aws-sdk/client-sqs` - Image processing queue

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run watch
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Related Documentation

- [Storage Architecture](../../.kiro/specs/project-restructure/storage-architecture.md)
- [Security Architecture](../../.kiro/specs/project-restructure/security-architecture.md)
- [Design Document](../../.kiro/specs/project-restructure/design.md)
