# Shared Utilities

This directory contains reusable utility functions used across all Lambda functions.

## CloudFront Signer (`cloudfront-signer.ts`)

Utility for generating CloudFront signed URLs for private content.

### Features

- Generate signed URLs for private S3 content (avatars, backgrounds, recipes)
- Batch generation for multiple URLs
- Private key caching to reduce Secrets Manager calls
- Automatic expiration time handling
- Helper functions for URL conversion and validation

### Usage

```typescript
import {
  generateSignedUrl,
  generateSignedUrls,
  requiresSignedUrl,
} from '../../shared/utils/cloudfront-signer';

// Single signed URL
const avatarUrl = await generateSignedUrl('avatars/user123/avatar.jpg', 3600);

// Multiple signed URLs
const imageUrls = await generateSignedUrls(
  ['recipes/user123/recipe456/step-1.jpg', 'recipes/user123/recipe456/step-2.jpg'],
  86400
);

// Check if content requires signed URL
if (requiresSignedUrl(s3Key)) {
  const signedUrl = await generateSignedUrl(s3Key);
}
```

### Environment Variables

Required environment variables for Lambda functions:

- `CLOUDFRONT_DOMAIN`: CloudFront distribution domain (e.g., `cdn-dev.everyonecook.cloud`)
- `CLOUDFRONT_KEY_PAIR_ID`: CloudFront public key ID (from CloudFormation output)
- `CLOUDFRONT_PRIVATE_KEY_SECRET`: Secrets Manager secret name (e.g., `everyonecook/dev/cloudfront-private-key`)
- `AWS_REGION`: AWS region (default: `us-east-1`)

### Setup

See [CloudFront Signed URLs Setup Guide](../../docs/CLOUDFRONT-SIGNED-URLS-SETUP.md) for complete setup instructions.

## Rate Limiter (`rate-limiter.ts`)

Utility for implementing rate limiting using DynamoDB with TTL-based cleanup.

### Features

- DynamoDB-based rate limiting with automatic TTL cleanup
- Configurable time windows and attempt limits
- Pre-defined configurations for common operations
- Reusable across all modules

### Usage

```typescript
import { checkRateLimit, RATE_LIMITS } from '../../shared/utils/rate-limiter';

// Check rate limit
const isLimited = await checkRateLimit(userId, RATE_LIMITS.AVATAR_UPLOAD);
if (isLimited) {
  throw new Error('Rate limit exceeded. Please try again later.');
}

// Custom rate limit
const customLimit = {
  operation: 'custom_operation',
  maxAttempts: 5,
  windowSeconds: 3600, // 1 hour
};
const isLimited = await checkRateLimit(userId, customLimit);
```

### Pre-defined Rate Limits

- `PROFILE_UPDATE`: 10 attempts per 15 minutes
- `AVATAR_UPLOAD`: 10 attempts per day
- `BACKGROUND_UPLOAD`: 10 attempts per day
- `POST_IMAGE_UPLOAD`: 10 attempts per day
- `RECIPE_IMAGE_UPLOAD`: 10 attempts per day
- `POST_CREATE`: 20 attempts per day
- `COMMENT_CREATE`: 50 attempts per hour
- `AI_RECIPE_GENERATION`: 10 attempts per day
- `RECIPE_CREATE`: 20 attempts per day

## S3 Presigned URL (`s3-presigned-url.ts`)

Utility for generating S3 presigned URLs for secure file uploads.

### Features

- Generate presigned URLs for direct S3 uploads
- File type and size validation
- Unique file key generation with timestamps
- Pre-defined configurations for common file types
- Helper functions for avatars, backgrounds, posts, recipes

### Usage

```typescript
import {
  generateAvatarUploadUrl,
  generatePostImageUploadUrl,
  FILE_TYPES,
} from '../../shared/utils/s3-presigned-url';

// Avatar upload
const result = await generateAvatarUploadUrl(
  userId,
  'avatar.jpg',
  'image/jpeg',
  1024 * 1024 // 1 MB
);
// Returns: { uploadUrl, fileKey, cdnUrl, expiresIn }

// Post image upload
const result = await generatePostImageUploadUrl(
  userId,
  postId,
  'photo.jpg',
  'image/jpeg',
  2 * 1024 * 1024 // 2 MB
);

// Custom file type
const customConfig = {
  allowedTypes: ['image/jpeg', 'image/png'],
  maxSizeBytes: 3 * 1024 * 1024,
  folder: 'custom',
};
```

### Pre-defined File Types

- `AVATAR`: JPEG/PNG/WebP, max 5 MB, folder: `avatars/`
- `BACKGROUND`: JPEG/PNG/WebP, max 10 MB, folder: `backgrounds/`
- `POST_IMAGE`: JPEG/PNG/WebP, max 5 MB, folder: `posts/`
- `RECIPE_IMAGE`: JPEG/PNG/WebP, max 5 MB, folder: `recipes/`

## Future Utilities

Additional utilities will be added here as needed:

- `logger.ts` - Structured logging utility
- `metrics.ts` - CloudWatch metrics tracking
- `validator.ts` - Input validation helpers
- `error-handler.ts` - Standardized error handling
