# Social Module

## Overview

The Social Module handles all social features for the Everyone Cook platform, including posts, comments, reactions, friend management, and social feed generation.

## Features

- **Posts**: Create, read, update, and delete social posts
- **Comments**: Add and manage comments on posts
- **Reactions**: Like, love, and other reactions to posts
- **Friends**: Friend requests, acceptance, and management
- **Feed**: Generate personalized social feeds
- **Notifications**: Social notifications for user interactions

## Directory Structure

```
social-module/
├── handlers/          # Lambda handler functions
├── services/          # Business logic services
├── models/            # Data models and types
├── utils/             # Utility functions
├── index.ts           # Main entry point
├── package.json       # Dependencies
├── tsconfig.json      # TypeScript configuration
└── jest.config.js     # Test configuration
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

## Architecture

The Social Module follows the modular monolith pattern:

- **Handlers**: Lambda entry points that handle API Gateway events
- **Services**: Business logic layer that implements social features
- **Models**: TypeScript interfaces and types for data structures
- **Utils**: Shared utility functions for validation, formatting, etc.

## Integration

This module integrates with:

- **DynamoDB**: Single Table Design for data storage
- **S3**: Image storage for post attachments
- **CloudFront**: CDN for serving images
- **SQS**: Async processing for notifications and analytics

## Privacy

All social features respect user privacy settings:

- Posts can be public, friends-only, or private
- Profile visibility is controlled by privacy settings
- Friend relationships determine content visibility

## References

- [Social Requirements](../../.kiro/specs/project-restructure/social-requirements.md)
- [Social Design](../../.kiro/specs/project-restructure/social-design.md)
- [Social Moderation](../../.kiro/specs/project-restructure/social-moderation.md)
