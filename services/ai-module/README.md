# Recipe & AI Module

## Overview

The Recipe & AI Module handles AI-powered recipe suggestions and recipe management for the Everyone Cook platform. This module implements a **Dictionary-first strategy** to optimize costs and performance.

## Features

### Core Features

- **AI Recipe Suggestions**: Generate recipe suggestions based on available ingredients using AWS Bedrock (Claude 3.5 Sonnet v2)
- **Recipe Search**: Search recipes using DynamoDB GSI for full-text search
- **Ingredient Translation**: Vietnamese ↔ English translation with Dictionary-first approach
- **Nutrition Calculation**: Calculate nutritional information for recipes
- **Recipe Management**: CRUD operations for user recipes
- **Cache Management**: Intelligent caching with Dictionary, Translation Cache, and AI Cache

### Architecture Highlights

#### Dictionary-First Strategy (99% Cost Reduction)

```
User Input → Vietnamese Normalization → Dictionary Lookup → Cache Check → AI (last resort)
```

- **Dictionary**: Permanent storage (NO TTL) - 422 bootstrap ingredients
- **Translation Cache**: 1-year TTL for evaluation
- **AI Cache**: 24-hour TTL for short-term reuse

#### Hybrid Cache Lookup

1. **Exact Match** (O(1), 50ms): Check AI Cache with exact ingredient list
2. **Partial Match** (O(n), 200ms): Check via GSI4 for similar ingredient combinations
3. **AI Generation** (25-35s, $0.02): Last resort - invoke Bedrock AI

#### Vietnamese Normalization (Critical)

```typescript
"Thịt Ba Chỉ" → "thit-ba-chi"  // Lowercase, remove accents, hyphenate
```

This prevents duplicates and ensures consistent Dictionary lookups.

## Directory Structure

```
ai-module/
├── handlers/          # Lambda handler functions
│   ├── ai-suggestion.handler.ts
│   ├── recipe-search.handler.ts
│   ├── ingredient-lookup.handler.ts
│   └── nutrition.handler.ts
├── services/          # Business logic services
│   ├── dictionary.service.ts
│   ├── cache.service.ts
│   ├── bedrock.service.ts
│   └── nutrition.service.ts
├── models/            # Data models and interfaces
│   ├── recipe.model.ts
│   ├── ingredient.model.ts
│   └── cache.model.ts
├── utils/             # Utility functions
│   ├── vietnamese-normalizer.ts
│   └── cache-key-generator.ts
├── index.ts           # Main Lambda entry point
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript configuration
└── README.md          # This file
```

## Installation

```bash
cd services/ai-module
npm install
```

## Development

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

## Key Dependencies

- **@aws-sdk/client-bedrock-runtime**: AWS Bedrock AI integration
- **@aws-sdk/client-dynamodb**: DynamoDB operations
- **@aws-sdk/client-sqs**: SQS queue integration for async processing
- **@aws-sdk/lib-dynamodb**: DynamoDB Document Client

## Environment Variables

```bash
# DynamoDB
DYNAMODB_TABLE_NAME=EveryoneCook

# Bedrock AI - Claude 3 Haiku (fast, cost-effective)
BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
BEDROCK_REGION=us-east-1

# SQS Queues
AI_QUEUE_URL=https://sqs.region.amazonaws.com/account/ai-queue
```

## API Endpoints

### AI Recipe Suggestions

```
POST /api/v1/recipes/ai-suggest
Body: {
  "ingredients": ["thịt ba chỉ", "cà chua", "hành tây"],
  "servings": 4,
  "dietaryRestrictions": []
}
```

### Recipe Search

```
GET /api/v1/recipes/search?q=phở&category=soup
```

### Ingredient Lookup

```
GET /api/v1/ingredients/lookup?name=thịt+ba+chỉ
```

### Nutrition Calculation

```
POST /api/v1/recipes/nutrition
Body: {
  "recipeId": "recipe-123"
}
```

## Performance Targets

- **Dictionary Lookup**: < 50ms
- **Cache Hit (Exact)**: < 50ms
- **Cache Hit (Partial)**: < 200ms
- **AI Generation**: 25-35 seconds
- **Cache Hit Rate**: 90-95% (after 12 months)

## Cost Optimization

### Target Costs (1K users)

- **Month 1**: $300/month (AI-heavy)
- **Month 6**: $50/month (70% Dictionary coverage)
- **Month 12**: < $2/month (99% Dictionary coverage)

### Strategy

1. **Bootstrap Dictionary**: 422 common ingredients
2. **Auto-Learning**: AI translations → Dictionary
3. **Cache Reuse**: 24h TTL for AI Cache
4. **Translation Cache**: 1-year evaluation period

## Testing

### Unit Tests

```bash
npm test
```

### Coverage Report

```bash
npm test -- --coverage
```

Target: 80% coverage (branches, functions, lines, statements)

## References

### Detailed Specifications

- **AI Services Design**: `.kiro/specs/project-restructure/ai-services-design.md`
- **AI Services Requirements**: `.kiro/specs/project-restructure/ai-services-requirements.md`
- **AI Services Flows**: `.kiro/specs/project-restructure/ai-services-flows.md`
- **Database Architecture**: `.kiro/specs/project-restructure/database-architecture.md`

### Architecture Standards

- **Architecture Standards**: `.kiro/steering/architecture-standards.md`
- **AI Services Standards**: `.kiro/steering/ai-services-standards.md`
- **Database Standards**: `.kiro/steering/database-standards.md`

## License

MIT
