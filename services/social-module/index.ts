/**
 * Social Module - Main Entry Point
 *
 * This module handles all social features including:
 * - Posts (create, read, update, delete)
 * - Comments and reactions
 * - Friend management
 * - Social feed generation
 * - Notifications
 *
 * Updated: 2025-11-23 16:30 - Fixed uuid dependency
 */

// Export main handler
export { handler } from './handler';

// Export handlers (excluding recipe-group temporarily)
export * from './handlers/posts.handler';
export * from './handlers/comments.handler';
export * from './handlers/reactions.handler';
export * from './handlers/reports.handler';
export * from './handlers/friends.handler';
export * from './handlers/feed.handler';
export * from './handlers/notifications.handler';
export * from './handlers/violations.handler';
// export * from './handlers/recipe-group.handler'; // TODO: Fix TypeScript errors

// Export services (excluding recipe-group temporarily)
export * from './services/post.service';
export * from './services/comment.service';
export * from './services/reaction.service';
export * from './services/report.service';
export * from './services/friend.service';
export * from './services/feed.service';
export * from './services/notification.service';
// export * from './services/recipe-group.service'; // TODO: Fix TypeScript errors

// Export models
export * from './models';

// Export utils
export * from './utils';
