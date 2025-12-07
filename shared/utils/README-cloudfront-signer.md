# CloudFront Signer Utility

## Overview

The `cloudfront-signer.ts` utility provides functions to generate CloudFront signed URLs for private content. It handles private key retrieval from AWS Secrets Manager, caching for performance, and batch URL generation.

**Task:** 2.2.3 - Configure CloudFront signed URLs for private content

## Features

- ✅ **Automatic Private Key Retrieval** - Fetches private key from AWS Secrets Manager
- ✅ **Intelligent Caching** - Caches private key for 1 hour to reduce API calls
- ✅ **Batch Generation** - Generate multiple signed URLs efficiently
- ✅ **Path Detection** - Automatically detect if a path requires signed URL
- ✅ **TypeScript Support** - Full type safety and IntelliSense

## Installation

The utility is part of the shared package and can be imported directly:

```typescript
import {
  generateSignedUrl,
  generateSignedUrlForPath,
  generateSignedUrlsForPaths,
  requiresSignedUrl,
  clearPrivateKeyCache,
} from '@shared/utils/cloudfront-signer';
```

## Environment Variables

The following environment variables must be set:

| Variable                 | Description                    | Example                      |
| ------------------------ | ------------------------------ | ---------------------------- |
| `CLOUDFRONT_KEY_PAIR_ID` | CloudFront public key ID       | `K2JCJMDEHXQW5F`             |
| `CLOUDFRONT_DOMAIN`      | CloudFront distribution domain | `cdn-dev.everyonecook.cloud` |
| `ENVIRONMENT`            | Deployment environment         | `dev`, `staging`, `prod`     |
| `AWS_REGION`             | AWS region for Secrets Manager | `us-east-1`                  |

**Note:** These are automatically set by CDK during Lambda deployment.

## Usage Examples

### Example 1: Generate Signed URL for Full URL

```typescript
import { generateSignedUrl } from '@shared/utils/cloudfront-signer';

// Generate signed URL with 1 hour expiration (default)
const signedUrl = await generateSignedUrl(
  'https://cdn-dev.everyonecook.cloud/avatars/user123/avatar.jpg'
);

// Generate signed URL with custom expiration (2 hours)
const signedUrl = await generateSignedUrl(
  'https://cdn-dev.everyonecook.cloud/avatars/user123/avatar.jpg',
  7200
);
```

### Example 2: Generate Signed URL for Path

```typescript
import { generateSignedUrlForPath } from '@shared/utils/cloudfront-signer';

// Automatically adds CloudFront domain
const signedUrl = await generateSignedUrlForPath('/avatars/user123/avatar.jpg');

// With custom expiration
const signedUrl = await generateSignedUrlForPath('/avatars/user123/avatar.jpg', 3600);
```

### Example 3: Batch Generation

```typescript
import { generateSignedUrlsForPaths } from '@shared/utils/cloudfront-signer';

// Generate signed URLs for multiple images
const imagePaths = [
  '/avatars/user123/avatar.jpg',
  '/recipes/recipe456/step1.jpg',
  '/recipes/recipe456/step2.jpg',
];

const signedUrls = await generateSignedUrlsForPaths(imagePaths, 3600);

// signedUrls is an array in the same order as imagePaths
console.log(signedUrls[0]); // Signed URL for avatar
console.log(signedUrls[1]); // Signed URL for step1
console.log(signedUrls[2]); // Signed URL for step2
```

### Example 4: Check if Path Requires Signed URL

```typescript
import { requiresSignedUrl, generateSignedUrlForPath } from '@shared/utils/cloudfront-signer';

const path = '/avatars/user123/avatar.jpg';

if (requiresSignedUrl(path)) {
  // Private content - generate signed URL
  const signedUrl = await generateSignedUrlForPath(path);
  return { url: signedUrl };
} else {
  // Public content - return regular URL
  const publicUrl = `https://cdn-dev.everyonecook.cloud${path}`;
  return { url: publicUrl };
}
```

### Example 5: Lambda Handler

```typescript
import { generateSignedUrlForPath } from '@shared/utils/cloudfront-signer';

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    const userId = event.pathParameters?.userId;
    const avatarPath = `/avatars/${userId}/avatar-${Date.now()}.jpg`;

    // Generate signed URL (expires in 1 hour)
    const signedUrl = await generateSignedUrlForPath(avatarPath, 3600);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        url: signedUrl,
        expiresIn: 3600,
      }),
    };
  } catch (error) {
    console.error('Failed to generate signed URL:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to generate signed URL',
      }),
    };
  }
};
```

### Example 6: Clear Cache (for Testing)

```typescript
import { clearPrivateKeyCache, generateSignedUrl } from '@shared/utils/cloudfront-signer';

// Clear cache to force fresh retrieval from Secrets Manager
clearPrivateKeyCache();

// Next call will fetch from Secrets Manager
const signedUrl = await generateSignedUrl('https://cdn-dev.everyonecook.cloud/avatars/test.jpg');
```

## Private Content Paths

The following paths require signed URLs:

| Path Pattern     | Content Type             | Expiration |
| ---------------- | ------------------------ | ---------- |
| `/avatars/*`     | User profile avatars     | 1 hour     |
| `/backgrounds/*` | User profile backgrounds | 1 hour     |
| `/recipes/*`     | Private recipe images    | 24 hours   |

Public content paths (no signed URL required):

| Path Pattern | Content Type              |
| ------------ | ------------------------- |
| `/posts/*`   | Public social media posts |

## Performance Considerations

### Private Key Caching

The private key is cached for 1 hour to reduce Secrets Manager API calls:

- **First call:** ~100ms (Secrets Manager API call)
- **Subsequent calls:** ~5ms (cached key)
- **Cache TTL:** 1 hour (3600 seconds)

### Cost Optimization

- **Secrets Manager:** $0.05 per 10,000 API calls
- **With caching:** ~24 API calls per day per Lambda instance
- **Monthly cost:** ~$0.0036 per Lambda instance

### Batch Generation

Use `generateSignedUrlsForPaths()` for multiple URLs to reuse the cached private key:

```typescript
// ❌ Inefficient - Multiple cache lookups
const url1 = await generateSignedUrlForPath('/avatars/user1.jpg');
const url2 = await generateSignedUrlForPath('/avatars/user2.jpg');
const url3 = await generateSignedUrlForPath('/avatars/user3.jpg');

// ✅ Efficient - Single cache lookup
const urls = await generateSignedUrlsForPaths([
  '/avatars/user1.jpg',
  '/avatars/user2.jpg',
  '/avatars/user3.jpg',
]);
```

## Error Handling

### Error: "CLOUDFRONT_KEY_PAIR_ID environment variable is not set"

**Cause:** Key Pair ID not configured

**Solution:**

```bash
# Get Key Pair ID from CloudFormation
export CLOUDFRONT_KEY_PAIR_ID=$(aws cloudformation describe-stacks \
  --stack-name EveryoneCook-dev-Core \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontPublicKeyId`].OutputValue' \
  --output text)
```

### Error: "Failed to retrieve CloudFront private key"

**Cause:** Private key not stored in Secrets Manager

**Solution:**

```bash
# Store private key in Secrets Manager
aws secretsmanager create-secret \
  --name everyonecook/dev/cloudfront-private-key \
  --secret-string file://private_key.pem \
  --region us-east-1
```

### Error: "Failed to generate signed URL"

**Possible Causes:**

1. Invalid private key format
2. Private key doesn't match public key
3. Key Pair ID is incorrect

**Solution:**

```bash
# Regenerate key pair
openssl genrsa -out private_key.pem 2048
openssl rsa -pubout -in private_key.pem -out public_key.pem

# Update Secrets Manager
aws secretsmanager update-secret \
  --secret-id everyonecook/dev/cloudfront-private-key \
  --secret-string file://private_key.pem

# Redeploy CoreStack with new public key
cd infrastructure
npm run cdk deploy EveryoneCook-dev-Core \
  --parameters CloudFrontPublicKeyParam="$(cat public_key.pem)"
```

## Testing

### Unit Tests

```typescript
import { requiresSignedUrl } from '@shared/utils/cloudfront-signer';

describe('CloudFront Signer', () => {
  test('requiresSignedUrl returns true for private paths', () => {
    expect(requiresSignedUrl('/avatars/user123/avatar.jpg')).toBe(true);
    expect(requiresSignedUrl('/backgrounds/user123/bg.jpg')).toBe(true);
    expect(requiresSignedUrl('/recipes/recipe456/step1.jpg')).toBe(true);
  });

  test('requiresSignedUrl returns false for public paths', () => {
    expect(requiresSignedUrl('/posts/post789/image.jpg')).toBe(false);
  });
});
```

### Integration Tests

```bash
# Test signed URL generation
node scripts/test-signed-url.js dev /avatars/test-user/avatar.jpg

# Generate signed URL
node scripts/generate-signed-url.js cdn-dev.everyonecook.cloud/avatars/test.jpg
```

## Security Best Practices

### 1. Key Rotation

Rotate CloudFront key pairs every 90 days:

```bash
# Generate new key pair
openssl genrsa -out private_key_new.pem 2048
openssl rsa -pubout -in private_key_new.pem -out public_key_new.pem

# Update Secrets Manager
aws secretsmanager update-secret \
  --secret-id everyonecook/dev/cloudfront-private-key \
  --secret-string file://private_key_new.pem

# Clear Lambda cache
# (Lambda functions will automatically fetch new key on next invocation)
```

### 2. Expiration Times

Use appropriate expiration times:

- **Avatars:** 1 hour (3600s) - frequently accessed
- **Backgrounds:** 1 hour (3600s) - frequently accessed
- **Recipe Images:** 24 hours (86400s) - less frequently changed
- **Temporary Uploads:** 15 minutes (900s) - short-lived

### 3. IAM Permissions

Ensure Lambda functions have Secrets Manager access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:everyonecook/*/cloudfront-private-key-*"
    }
  ]
}
```

## References

- [CloudFront Signed URLs Setup Guide](../../docs/cloudfront-signed-urls-setup.md)
- [Storage Architecture](../../.kiro/specs/project-restructure/storage-architecture.md)
- [Security Architecture](../../.kiro/specs/project-restructure/security-architecture.md)
- [AWS CloudFront Signed URLs Documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-urls.html)

## Support

For issues or questions:

1. Check the [CloudFront Signed URLs Setup Guide](../../docs/cloudfront-signed-urls-setup.md)
2. Review CloudWatch logs for error messages
3. Verify environment variables are set correctly
4. Test with `scripts/test-signed-url.js`
