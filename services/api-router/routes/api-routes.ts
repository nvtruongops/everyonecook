/**
 * API Routes Definition - Single Source of Truth
 *
 * Shared between:
 * - Backend: API Router routing logic
 * - Frontend: Type-safe API client
 * - Infrastructure: API Gateway resource creation
 *
 * @module shared/routes/api-routes
 */

/**
 * HTTP Methods
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  OPTIONS = 'OPTIONS',
}

/**
 * Lambda Handler Modules
 */
export enum HandlerModule {
  AUTH_USER = 'auth-user-lambda',
  SOCIAL = 'social-lambda',
  RECIPE_AI = 'recipe-ai-lambda',
  ADMIN = 'admin-lambda',
  UPLOAD = 'upload-lambda',
  HEALTH = 'health-check',
}

/**
 * Route Definition
 */
export interface RouteDefinition {
  /** HTTP method */
  method: HttpMethod;
  /** Path pattern (e.g., /users/{userId}) */
  path: string;
  /** Handler module */
  handler: HandlerModule;
  /** Requires authentication */
  requiresAuth: boolean;
  /** Enable caching (GET only) */
  cacheable?: boolean;
  /** Description */
  description?: string;
}

/**
 * API Routes - Single Source of Truth
 *
 * Rules:
 * 1. All paths are relative (no /v1 prefix)
 * 2. Use {param} for path parameters
 * 3. Sort by module for maintainability
 */
export const API_ROUTES: RouteDefinition[] = [
  // ============================================
  // Health Check Routes (Public)
  // ============================================
  {
    method: HttpMethod.GET,
    path: '/health',
    handler: HandlerModule.HEALTH,
    requiresAuth: false,
    description: 'Health check endpoint',
  },
  {
    method: HttpMethod.GET,
    path: '/status',
    handler: HandlerModule.HEALTH,
    requiresAuth: false,
    description: 'Status check endpoint',
  },

  // ============================================
  // Auth & User Routes
  // ============================================
  {
    method: HttpMethod.POST,
    path: '/auth/login',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'User login',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/register',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'User registration',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/refresh',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Refresh access token',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/logout',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'User logout',
  },
  {
    method: HttpMethod.GET,
    path: '/users/username/check',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Check username availability',
  },

  // Current user profile routes
  {
    method: HttpMethod.GET,
    path: '/users/me',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get current user profile',
  },
  {
    method: HttpMethod.GET,
    path: '/users/profile',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get current user profile (legacy)',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update current user profile',
  },
  {
    method: HttpMethod.GET,
    path: '/users/profile/privacy',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get privacy settings',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile/privacy',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update privacy settings',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/avatar/upload',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Upload avatar',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/background/upload',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Upload background image',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/avatar/presigned',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Get presigned URL for avatar upload',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/background/presigned',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Get presigned URL for background upload',
  },
  {
    method: HttpMethod.GET,
    path: '/users/me/stats',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get current user stats',
  },
  {
    method: HttpMethod.GET,
    path: '/users/me/violations',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Get violation details for user hidden content',
  },

  // User preferences routes
  {
    method: HttpMethod.GET,
    path: '/users/profile/preferences/stable',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get stable cooking preferences',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile/preferences/stable',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update stable cooking preferences',
  },
  {
    method: HttpMethod.GET,
    path: '/users/profile/preferences/frequent',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get frequent cooking preferences',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile/preferences/frequent',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update frequent cooking preferences',
  },

  // Custom sections routes
  {
    method: HttpMethod.GET,
    path: '/users/profile/custom-sections',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get all custom sections with fields',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/custom-sections',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Create new custom section',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile/custom-sections/{sectionId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update custom section',
  },
  {
    method: HttpMethod.DELETE,
    path: '/users/profile/custom-sections/{sectionId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Delete custom section',
  },
  {
    method: HttpMethod.POST,
    path: '/users/profile/custom-sections/{sectionId}/fields',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Add field to custom section',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/profile/custom-sections/{sectionId}/fields/{fieldId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update custom field',
  },
  {
    method: HttpMethod.DELETE,
    path: '/users/profile/custom-sections/{sectionId}/fields/{fieldId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Delete custom field',
  },
  {
    method: HttpMethod.GET,
    path: '/users/{userId}/custom-sections',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get custom sections for another user (with privacy filtering)',
  },

  // Ban status check (public - must be before /users/{userId} to avoid matching)
  {
    method: HttpMethod.GET,
    path: '/users/ban-status',
    handler: HandlerModule.ADMIN,
    requiresAuth: false,
    description: 'Check ban status by username (public - for banned page)',
  },

  // Other user profile routes
  {
    method: HttpMethod.GET,
    path: '/users/{userId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get user by ID',
  },
  {
    method: HttpMethod.GET,
    path: '/users/{userId}/profile',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false, // Allow public access - privacy filtering handles visibility
    cacheable: true,
    description: 'Get user profile by ID (public with privacy filtering)',
  },
  {
    method: HttpMethod.PUT,
    path: '/users/{userId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update user profile',
  },
  {
    method: HttpMethod.DELETE,
    path: '/users/{userId}',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Delete user account',
  },
  // NOTE: GET /users/{userId}/privacy removed - frontend uses /users/profile/privacy
  {
    method: HttpMethod.PUT,
    path: '/users/{userId}/privacy',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Update user privacy settings',
  },
  {
    method: HttpMethod.POST,
    path: '/users/{userId}/avatar',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Upload user avatar',
  },
  {
    method: HttpMethod.POST,
    path: '/users/{userId}/background',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    description: 'Upload user background',
  },
  {
    method: HttpMethod.GET,
    path: '/users/search',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Search users',
  },

  // ============================================
  // Auth Routes (Additional)
  // ============================================
  {
    method: HttpMethod.POST,
    path: '/users/profile/resetPassword',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Reset password with verification code',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/verify-email',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Verify email with code',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/resend-code',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Resend verification code',
  },

  // ============================================
  // Social Routes
  // ============================================
  {
    method: HttpMethod.GET,
    path: '/posts',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get all posts',
  },
  {
    method: HttpMethod.POST,
    path: '/posts',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Create new post',
  },
  {
    method: HttpMethod.GET,
    path: '/posts/{postId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get post by ID',
  },
  {
    method: HttpMethod.PUT,
    path: '/posts/{postId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Update post',
  },
  {
    method: HttpMethod.DELETE,
    path: '/posts/{postId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Delete post',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/stats',
    handler: HandlerModule.SOCIAL,
    requiresAuth: false, // Allow anonymous for public posts
    description: 'Get stats (likes, comments count) for multiple posts - optimized for polling',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/upload-image',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Get presigned URL for post image upload',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/share-recipe',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Share recipe from Recipe Management to Social Feed',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/save-recipe',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Save recipe from post to Recipe Management',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/share',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Share post (like Facebook share) - creates new post referencing original',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/report',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Report a post',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/comments',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Add comment to post',
  },
  {
    method: HttpMethod.GET,
    path: '/posts/{postId}/comments',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get post comments',
  },
  {
    method: HttpMethod.DELETE,
    path: '/posts/{postId}/comments/{commentId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Delete comment',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/comments/{commentId}/report',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Report a comment',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/like',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Like post',
  },
  {
    method: HttpMethod.DELETE,
    path: '/posts/{postId}/like',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Unlike post',
  },
  {
    method: HttpMethod.POST,
    path: '/posts/{postId}/reactions',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Add reaction to post',
  },
  {
    method: HttpMethod.DELETE,
    path: '/posts/{postId}/reactions',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Remove reaction from post',
  },
  {
    method: HttpMethod.GET,
    path: '/feed',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get user feed',
  },
  {
    method: HttpMethod.GET,
    path: '/users/{userId}/posts',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get posts by user ID',
  },
  {
    method: HttpMethod.GET,
    path: '/friends',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get friends list',
  },
  {
    method: HttpMethod.GET,
    path: '/friends/requests',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get friend requests',
  },
  {
    method: HttpMethod.GET,
    path: '/friends/sent',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get sent friend requests',
  },
  // NOTE: POST /friends/{userId} (direct add) removed - frontend uses /friends/{userId}/request
  {
    method: HttpMethod.POST,
    path: '/friends/{userId}/request',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Send friend request',
  },
  {
    method: HttpMethod.PUT,
    path: '/friends/{userId}/accept',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Accept friend request',
  },
  {
    method: HttpMethod.PUT,
    path: '/friends/{userId}/reject',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Reject friend request',
  },
  {
    method: HttpMethod.DELETE,
    path: '/friends/{userId}/cancel',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Cancel sent friend request',
  },
  {
    method: HttpMethod.DELETE,
    path: '/friends/{userId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Remove friend',
  },
  {
    method: HttpMethod.POST,
    path: '/friends/{userId}/block',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Block user',
  },
  {
    method: HttpMethod.DELETE,
    path: '/friends/{userId}/block',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Unblock user',
  },
  {
    method: HttpMethod.GET,
    path: '/friends/blocked',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get blocked users list',
  },
  {
    method: HttpMethod.GET,
    path: '/friends/{userId}/status',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get friendship status with user',
  },

  // ============================================
  // Trending Routes (Weekly reset)
  // ============================================
  {
    method: HttpMethod.GET,
    path: '/trending',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get all trending data (searches, posts)',
  },
  {
    method: HttpMethod.GET,
    path: '/trending/searches',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get top searches this week',
  },
  {
    method: HttpMethod.GET,
    path: '/trending/posts',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get top liked posts this week',
  },
  {
    method: HttpMethod.POST,
    path: '/trending/track-search',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Track search for trending',
  },
  {
    method: HttpMethod.DELETE,
    path: '/trending/cleanup',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Cleanup previous week trending data (Admin only)',
  },

  // Recipe Group routes (Social feature - sharing recipes)
  {
    method: HttpMethod.POST,
    path: '/users/{userId}/recipe-groups',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Create recipe group',
  },
  {
    method: HttpMethod.GET,
    path: '/users/{userId}/recipe-groups',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get recipe groups',
  },
  {
    method: HttpMethod.POST,
    path: '/users/{userId}/recipe-groups/{groupId}/recipes',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Add recipe to group',
  },

  // ============================================
  // Notification Routes
  // ============================================
  {
    method: HttpMethod.GET,
    path: '/notifications',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get notifications',
  },
  {
    method: HttpMethod.GET,
    path: '/notifications/unread/count',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    cacheable: true,
    description: 'Get unread notification count',
  },
  {
    method: HttpMethod.PUT,
    path: '/notifications/{notificationId}/read',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Mark notification as read',
  },
  {
    method: HttpMethod.PUT,
    path: '/notifications/read-all',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Mark all notifications as read',
  },
  {
    method: HttpMethod.DELETE,
    path: '/notifications/{notificationId}',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Delete notification',
  },
  {
    method: HttpMethod.DELETE,
    path: '/notifications',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Delete all notifications',
  },
  {
    method: HttpMethod.GET,
    path: '/notifications/preferences',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Get notification preferences',
  },
  {
    method: HttpMethod.PUT,
    path: '/notifications/preferences',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Update notification preferences',
  },

  // ============================================
  // Recipe & AI Routes
  // ============================================
  {
    method: HttpMethod.GET,
    path: '/recipes',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    cacheable: true,
    description: 'Get all recipes',
  },
  {
    method: HttpMethod.POST,
    path: '/recipes',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Create new recipe',
  },
  {
    method: HttpMethod.GET,
    path: '/recipes/{recipeId}',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    cacheable: true,
    description: 'Get recipe by ID',
  },
  {
    method: HttpMethod.PUT,
    path: '/recipes/{recipeId}',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Update recipe',
  },
  {
    method: HttpMethod.DELETE,
    path: '/recipes/{recipeId}',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Delete recipe',
  },
  {
    method: HttpMethod.POST,
    path: '/recipes/search',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Search recipes',
  },
  {
    method: HttpMethod.POST,
    path: '/recipes/generate-ai',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Generate recipe with AI',
  },
  {
    method: HttpMethod.POST,
    path: '/recipes/{recipeId}/save',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Save/bookmark recipe',
  },
  {
    method: HttpMethod.GET,
    path: '/users/{userId}/recipes',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    cacheable: true,
    description: 'Get user recipes (Recipe Picker)',
  },
  {
    method: HttpMethod.POST,
    path: '/ai/suggestions',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Get AI recipe suggestions',
  },
  {
    method: HttpMethod.GET,
    path: '/ai/suggestions/{jobId}',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    cacheable: false,
    description: 'Get AI job status and results',
  },
  {
    method: HttpMethod.POST,
    path: '/ai/nutrition',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Get nutrition analysis',
  },
  {
    method: HttpMethod.GET,
    path: '/dictionary/{ingredient}',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    cacheable: true,
    description: 'Get ingredient translation',
  },
  // NOTE: POST /dictionary removed - no frontend usage for adding ingredients

  // ============================================
  // Admin Routes
  // ============================================
  // System Monitoring
  {
    method: HttpMethod.GET,
    path: '/admin/stats',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get database statistics for admin dashboard',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/stats/detailed',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get detailed statistics with time-based filtering (day/week/month)',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/health',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get system health status',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/metrics',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get business metrics',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/costs',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get AWS costs',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/activity',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get admin activity log',
  },

  // User Management
  {
    method: HttpMethod.GET,
    path: '/admin/users',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get all users with pagination and filtering',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/users/banned',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get banned users list',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/users/{userId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get user detail with violations and ban history',
  },
  {
    method: HttpMethod.DELETE,
    path: '/admin/users/{userId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Delete user',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/users/ban',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Ban user',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/users/unban',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Unban user',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/users/cleanup-inactive',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Cleanup inactive users',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/users/sync',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Sync users between Cognito and DynamoDB (cleanup orphaned users)',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/users/{userId}/ban-status',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Check user ban status',
  },

  // Report Management
  {
    method: HttpMethod.GET,
    path: '/admin/reports/stats',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get report statistics by status and type',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/posts/reported',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get reported posts',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/posts/{postId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get post detail for admin review',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/posts/{postId}/review',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Review reported post',
  },
  {
    method: HttpMethod.DELETE,
    path: '/admin/posts/{postId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Delete post',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/posts/{postId}/restore',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Restore deleted post',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/posts/{postId}/action',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Take action on reported post (warn, delete, ban)',
  },

  // Comment Report Management
  {
    method: HttpMethod.GET,
    path: '/admin/comments/reported',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get reported comments',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/comments/{commentId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get comment detail for admin review',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/comments/{commentId}/action',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Take action on reported comment (warn, hide, delete, ban)',
  },

  // Appeal Management
  {
    method: HttpMethod.GET,
    path: '/admin/appeals',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get all appeals with filtering',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/appeals/{appealId}/review',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Review and decide on appeal',
  },
  {
    method: HttpMethod.POST,
    path: '/appeals/submit',
    handler: HandlerModule.ADMIN,
    requiresAuth: false,
    description: 'Submit appeal for ban (public - user is banned so no token)',
  },
  {
    method: HttpMethod.GET,
    path: '/users/me/ban-status',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Check current user ban status',
  },

  // Feedback Management (Admin)
  {
    method: HttpMethod.GET,
    path: '/admin/feedbacks',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get all feedbacks (admin)',
  },
  {
    method: HttpMethod.GET,
    path: '/admin/feedbacks/{feedbackId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get feedback detail (admin)',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/feedbacks/{feedbackId}/reply',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Reply to feedback (admin)',
  },
  {
    method: HttpMethod.POST,
    path: '/admin/feedbacks/{feedbackId}/close',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Close feedback (admin)',
  },

  // Feedback (User)
  {
    method: HttpMethod.POST,
    path: '/feedback',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Create new feedback',
  },
  {
    method: HttpMethod.GET,
    path: '/feedback/my',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get user own feedbacks',
  },
  {
    method: HttpMethod.GET,
    path: '/feedback/{feedbackId}',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Get feedback detail',
  },
  {
    method: HttpMethod.POST,
    path: '/feedback/{feedbackId}/reply',
    handler: HandlerModule.ADMIN,
    requiresAuth: true,
    description: 'Reply to feedback',
  },
  // ============================================
  // Upload Routes
  // ============================================
  {
    method: HttpMethod.POST,
    path: '/upload/presigned-url',
    handler: HandlerModule.UPLOAD,
    requiresAuth: true,
    description: 'Get presigned URL for upload',
  },
  // NOTE: /upload/avatar and /upload/background removed - frontend uses presigned URLs
];

/**
 * Helper: Get routes by handler module
 */
export function getRoutesByHandler(handler: HandlerModule): RouteDefinition[] {
  return API_ROUTES.filter((route) => route.handler === handler);
}

/**
 * Helper: Get routes by method
 */
export function getRoutesByMethod(method: HttpMethod): RouteDefinition[] {
  return API_ROUTES.filter((route) => route.method === method);
}

/**
 * Helper: Find route by method and path
 */
export function findRoute(method: HttpMethod, path: string): RouteDefinition | undefined {
  return API_ROUTES.find((route) => route.method === method && route.path === path);
}

/**
 * Helper: Get all cacheable routes
 */
export function getCacheableRoutes(): RouteDefinition[] {
  return API_ROUTES.filter((route) => route.cacheable === true);
}

/**
 * Helper: Get all public routes (no auth required)
 */
export function getPublicRoutes(): RouteDefinition[] {
  return API_ROUTES.filter((route) => !route.requiresAuth);
}
