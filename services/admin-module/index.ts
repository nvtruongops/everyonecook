/**
 * Admin Module - Entry Point
 *
 * This module handles administrative operations including:
 * - Content moderation
 * - User management (ban/suspend)
 * - System monitoring
 * - Analytics and reporting
 */

// Export main handler
export { handler } from './handler';

// Export handlers
export * from './handlers';

// Export services
export * from './services';

// Export models
export * from './models';
