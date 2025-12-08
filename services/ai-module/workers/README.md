# AI Module Workers

This directory contains Lambda worker functions that process asynchronous AI-related tasks.

## Workers

### AI Worker (`ai-worker.ts`)

**Purpose:** Process AI recipe generation requests from SQS AIQueue

**Trigger:** SQS AIQueue messages

**Performance:** 25-35 seconds (AI generation time)

**Flow:**

```
SQS AIQueue → AI Worker → Bedrock AI → AI Cache Service → DynamoDB
```

**Responsibilities:**

1. **Process SQS Messages**: Receive AI job messages from AIQueue
2. **Generate Recipes**: Call Bedrock AI (Claude 3 Haiku) to generate recipes
3. **Store in Cache**: Save results to AI Cache with:
   - Main cache entry with GSI2 fields (GSI2PK, GSI2SK, searchableText)
   - Ingredient indexes for GSI4 (one per ingredient)
   - 24-hour TTL

**Message Format:**

```typescript
interface AIJobMessage {
  jobId: string;
  userId: string;
  ingredients: string[]; // Normalized English ingredients
  settings: {
    servings: number;
    mealType: string;
    maxTime: number;
    preferredCookingMethods: string[];
    dislikedIngredients: string[];
  };
  cacheKey: string;
}
```

**Cache Structure:**

```typescript
// Main cache entry
{
  PK: "AI_CACHE#{cacheKey}",
  SK: "METADATA",
  cacheKey: string,
  recipes: AIRecipe[],
  settings: {...},
  createdAt: string,
  ttl: number, // 24 hours

  // GSI2 for text search fallback
  GSI2PK: "CACHE#PUBLIC",
  GSI2SK: createdAt, // ISO timestamp
  searchableText: string, // Lowercase: title + ingredients
}

// Ingredient indexes (for GSI4)
{
  PK: "AI_CACHE#{cacheKey}",
  SK: "INGREDIENT#{normalized}",
  GSI4PK: "CACHE_INGREDIENT#{normalized}",
  GSI4SK: "AI_CACHE#{cacheKey}",
  ingredientName: string,
  ttl: number, // 24 hours
}
```

**GSI2 Fields:**

- **GSI2PK**: `"CACHE#PUBLIC"` - All AI cache is public
- **GSI2SK**: ISO timestamp (e.g., `"2025-01-20T10:00:00Z"`)
- **searchableText**: Lowercase text combining recipe titles and ingredients

**GSI4 Indexes:**

- One index item per ingredient
- Enables ingredient-based search
- Supports partial matching (subset of ingredients)

**Error Handling:**

- Bedrock API errors → Retry via SQS (max 3 attempts)
- DynamoDB errors → Retry via SQS (max 3 attempts)
- Parse errors → Send to DLQ for manual review

**Environment Variables:**

- `AWS_REGION`: AWS region (default: ap-southeast-1)
- `BEDROCK_REGION`: Bedrock region (default: us-east-1)
- `BEDROCK_MODEL_ID`: Bedrock model ID (default: anthropic.claude-3-haiku-20240307-v1:0)
- `DYNAMODB_TABLE`: DynamoDB table name (default: EveryoneCook)

**Testing:**

```bash
# Unit tests
npm test -- workers/ai-worker.test.ts

# Integration tests (requires real DynamoDB)
RUN_INTEGRATION_TESTS=true npm test -- workers/__tests__/ai-worker-integration.test.ts
```

**Deployment:**

The AI Worker is deployed as part of the BackendStack:

```typescript
const aiWorker = new lambda.Function(this, 'AIWorker', {
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: 'ai-worker.handler',
  code: lambda.Code.fromAsset('services/ai-module/workers'),
  memorySize: 1024,
  timeout: cdk.Duration.seconds(120),
  reservedConcurrentExecutions: 10, // Control Bedrock quota
  environment: {
    // Claude 3 Haiku - fast and cost-effective
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
    BEDROCK_REGION: 'us-east-1',
    DYNAMODB_TABLE: dynamoTable.tableName,
  },
});

// Connect to SQS
aiWorker.addEventSource(
  new lambdaEventSources.SqsEventSource(aiQueue, {
    batchSize: 1, // Process one AI request at a time
    maxBatchingWindow: cdk.Duration.seconds(0),
  })
);
```

**Monitoring:**

Key metrics to monitor:

- AI Worker invocations
- AI Worker duration (should be 25-35s)
- AI Worker errors
- Bedrock API errors
- DynamoDB write errors
- SQS DLQ messages

**Cost Optimization:**

- Bedrock AI: $0.02 per recipe generation
- DynamoDB writes: ~$0.0001 per cache entry
- Lambda: ~$0.001 per invocation
- Total: ~$0.021 per AI job

**Related Services:**

- [AI Cache Service](../../../shared/business-logic/search/ai-cache.service.ts)
- [Ingredient Search Service](../../../shared/business-logic/search/ingredient-search.service.ts)
- [Search Design](../../../.kiro/specs/project-restructure/search-design.md)

## Future Workers

Additional workers to be implemented:

- **Image Worker**: Process image uploads and transformations
- **Analytics Worker**: Batch write analytics data

> **Note**: Push Notification Worker đã được loại bỏ khỏi kế hoạch. Dự án sử dụng In-app notifications (lưu trong DynamoDB) thay vì push notifications qua SNS.
