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
    method: HttpMethod.GET,
    path: '/users/me/stats',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: true,
    cacheable: true,
    description: 'Get current user stats',
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
    path: '/auth/forgot-password',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Request password reset',
  },
  {
    method: HttpMethod.POST,
    path: '/auth/reset-password',
    handler: HandlerModule.AUTH_USER,
    requiresAuth: false,
    description: 'Reset password with code',
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
    method: HttpMethod.DELETE,
    path: '/friends/{userId}/request',
    handler: HandlerModule.SOCIAL,
    requiresAuth: true,
    description: 'Decline friend request',
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

  // Recipe Group routes
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
    path: '/ai/suggestions',
    handler: HandlerModule.RECIPE_AI,
    requiresAuth: true,
    description: 'Get AI recipe suggestions',
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
  // Admin Routes (Reserved for future implementation)
  // ============================================
  // NOTE: Admin routes removed - frontend admin panel not yet implemented
  // Routes removed: /admin/users, /admin/users/{userId}/ban, /admin/users/{userId}/unban
  // Routes removed: /admin/posts/reported, /admin/posts/{postId}/moderate, /admin/metrics

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
