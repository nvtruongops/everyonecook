/**
 * Auth & User Module - Main Entry Point
 *
 * This module handles authentication and user management for Everyone Cook platform.
 *
 * Features:
 * - User authentication (login, register, password reset)
 * - User profile management (CRUD operations)
 * - Privacy settings management
 * - User search functionality
 *
 * @module auth-module
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { checkUsernameAvailability } from './handlers/auth.handler';
import {
  getOwnProfile,
  getOtherUserProfile,
  updateProfile,
  uploadAvatar,
  uploadBackground,
} from './handlers/profile.handler';
import { getOwnPrivacySettings, updateOwnPrivacySettings } from './handlers/privacy.handler';
import {
  getStablePreferencesHandler,
  getFrequentPreferencesHandler,
  updateStablePreferencesHandler,
  updateFrequentPreferencesHandler,
} from './handlers/preferences.handler';
import {
  getCustomSectionsHandler,
  createSectionHandler,
  updateSectionHandler,
  deleteSectionHandler,
  addFieldHandler,
  updateFieldHandler,
  deleteFieldHandler,
} from './handlers/custom-section.handler';
import { searchUsers } from './handlers/search.handler';
import { getBanStatus } from './handlers/ban-status.handler';

/**
 * Main Lambda handler for Auth & User module
 * Routes requests to appropriate handlers based on path and method
 *
 * @param event - API Gateway proxy event
 * @param _context - Lambda execution context (unused for now)
 * @returns API Gateway proxy result
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> => {
  const path = event.path;
  const method = event.httpMethod;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };

  try {
    // Handle username availability check (public endpoint)
    if (method === 'GET' && path.includes('/users/username/check')) {
      const username = event.queryStringParameters?.username;

      if (!username) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Username parameter is required',
          }),
        };
      }

      const result = await checkUsernameAvailability(username);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: result,
        }),
      };
    }

    // Extract user ID from JWT (set by API Gateway authorizer)
    const userId = event.requestContext.authorizer?.claims?.sub;

    // Ban status endpoint - GET /users/ban-status
    if (path.includes('/users/ban-status') && method === 'GET') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      const result = await getBanStatus(userId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: result }),
      };
    }

    // Profile endpoints - /users/me or /users/profile (exclude sub-routes)
    if (
      path === '/users/me' ||
      path.endsWith('/users/me') ||
      (path.includes('/users/profile') &&
        !path.includes('/privacy') &&
        !path.includes('/avatar') &&
        !path.includes('/preferences') &&
        !path.includes('/custom-sections'))
    ) {
      // GET /users/me or /users/profile - Get own profile
      if (method === 'GET') {
        if (!userId) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        const result = await getOwnProfile(userId);

        // Map internal model (camelCase) to API response format (snake_case)
        const apiResponse = {
          profile: {
            ...result.profile,
            full_name: result.profile.fullName,
            avatar_url: result.profile.avatarUrl,
            background_url: result.profile.backgroundUrl,
            date_of_birth: result.profile.birthday, // Map birthday -> date_of_birth
            is_active: result.profile.isActive,
            is_banned: result.profile.isBanned,
            is_suspended: result.profile.isSuspended,
            last_login_at: result.profile.lastLoginAt,
            created_at: result.profile.createdAt,
            updated_at: result.profile.updatedAt,
          },
          privacy: result.privacy,
        };

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: apiResponse }),
        };
      }

      // PUT /v1/users/profile - Update profile
      if (method === 'PUT') {
        if (!userId) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        const requestBody = JSON.parse(event.body || '{}');

        // Map API request format (snake_case) to internal model (camelCase)
        const updates = {
          fullName: requestBody.full_name,
          bio: requestBody.bio,
          birthday: requestBody.date_of_birth, // Map date_of_birth -> birthday
          gender: requestBody.gender,
          country: requestBody.country,
        };

        const result = await updateProfile(userId, updates);

        // Map internal model (camelCase) to API response format (snake_case)
        const apiResponse = {
          ...result,
          full_name: result.fullName,
          avatar_url: result.avatarUrl,
          background_url: result.backgroundUrl,
          date_of_birth: result.birthday, // Map birthday -> date_of_birth
          is_active: result.isActive,
          is_banned: result.isBanned,
          is_suspended: result.isSuspended,
          last_login_at: result.lastLoginAt,
          created_at: result.createdAt,
          updated_at: result.updatedAt,
        };

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: { profile: apiResponse } }),
        };
      }
    }

    // Privacy endpoints
    if (path.includes('/users/profile/privacy')) {
      // GET /v1/users/profile/privacy - Get privacy settings
      if (method === 'GET') {
        if (!userId) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        const result = await getOwnPrivacySettings(userId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: { privacy: result } }),
        };
      }

      // PUT /v1/users/profile/privacy - Update privacy settings
      if (method === 'PUT') {
        if (!userId) {
          return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Unauthorized' }),
          };
        }

        const updates = JSON.parse(event.body || '{}');
        console.log('[Privacy Update] userId:', userId);
        console.log('[Privacy Update] updates:', JSON.stringify(updates));
        const result = await updateOwnPrivacySettings(userId, updates);
        console.log('[Privacy Update] result:', JSON.stringify(result));
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: { privacy: result } }),
        };
      }
    }

    // Avatar upload endpoint (legacy)
    if (path.includes('/users/profile/avatar/upload') && method === 'POST') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      const { contentType, fileSize } = JSON.parse(event.body || '{}');
      const result = await uploadAvatar(userId, contentType, fileSize);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: result }),
      };
    }

    // Avatar presigned URL endpoint
    if (path.includes('/users/profile/avatar/presigned') && method === 'POST') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      const body = JSON.parse(event.body || '{}');
      const contentType = body.file_type || body.contentType;
      const fileSize = body.file_size || body.fileSize;

      if (!contentType || !fileSize) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing required fields: file_type and file_size',
          }),
        };
      }

      const result = await uploadAvatar(userId, contentType, fileSize);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            upload_url: result.uploadUrl,
            avatar_url: result.avatarUrl,
          },
        }),
      };
    }

    // Background upload endpoint (legacy)
    if (path.includes('/users/profile/background/upload') && method === 'POST') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      const { contentType, fileSize } = JSON.parse(event.body || '{}');
      const result = await uploadBackground(userId, contentType, fileSize);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data: result }),
      };
    }

    // Background presigned URL endpoint
    if (path.includes('/users/profile/background/presigned') && method === 'POST') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      const body = JSON.parse(event.body || '{}');
      const contentType = body.file_type || body.contentType;
      const fileSize = body.file_size || body.fileSize;

      if (!contentType || !fileSize) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing required fields: file_type and file_size',
          }),
        };
      }

      const result = await uploadBackground(userId, contentType, fileSize);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: {
            upload_url: result.uploadUrl,
            background_url: result.backgroundUrl,
          },
        }),
      };
    }

    // Stats endpoint
    if (path.includes('/users/me/stats') && method === 'GET') {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      try {
        // Import getUserStats from profile handler
        const { getUserStats } = await import('./handlers/profile.handler');
        const stats = await getUserStats(userId);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            stats,
          }),
        };
      } catch (error: any) {
        console.error('Failed to get user stats:', error);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            stats: {
              friend_count: 0,
              post_count: 0,
            },
          }),
        };
      }
    }

    // User search endpoint - GET /v1/users/search?q=query&limit=20&nextToken=xxx
    if (path.includes('/users/search') && method === 'GET') {
      const query = event.queryStringParameters?.q;
      const limit = parseInt(event.queryStringParameters?.limit || '20', 10);
      const nextToken = event.queryStringParameters?.nextToken;

      if (!query) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Query parameter "q" is required' }),
        };
      }

      try {
        const result = await searchUsers(query, userId || null, limit, nextToken);

        // Map to API response format (snake_case)
        const apiResponse = {
          users: result.users.map((user) => ({
            user_id: user.userId,
            username: user.username,
            full_name: user.fullName,
            avatar_url: user.avatarUrl,
            bio: user.bio,
            country: user.country,
            // Friendship status fields
            friendship_status: user.friendshipStatus,
            is_friend: user.isFriend,
            is_pending_sent: user.isPendingSent,
            is_pending_received: user.isPendingReceived,
          })),
          next_token: result.nextToken,
        };

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: apiResponse }),
        };
      } catch (error: any) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: error.message }),
        };
      }
    }

    // View other user's profile - GET /v1/users/{userId}/profile
    const userProfileMatch = path.match(/\/users\/([^/]+)\/profile$/);
    if (userProfileMatch && method === 'GET') {
      const targetUserId = userProfileMatch[1];

      // Skip if it's a reserved path
      if (
        targetUserId === 'profile' ||
        targetUserId === 'me' ||
        targetUserId === 'username' ||
        targetUserId === 'search'
      ) {
        // Let other handlers process
      } else {
        // Debug: Log authorizer info
        console.log('[getOtherUserProfile] Debug info:');
        console.log('  targetUserId:', targetUserId);
        console.log('  userId from JWT:', userId);
        console.log('  authorizer:', JSON.stringify(event.requestContext.authorizer));
        console.log('  claims:', JSON.stringify(event.requestContext.authorizer?.claims));

        try {
          const result = await getOtherUserProfile(targetUserId, userId || null);
          const profileData = result.profile;

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: {
                profile: {
                  user_id: profileData.userId,
                  username: profileData.username,
                  full_name: profileData.fullName,
                  avatar_url: profileData.avatarUrl,
                  background_url: profileData.backgroundUrl,
                  bio: profileData.bio,
                  date_of_birth: profileData.birthday,
                  gender: profileData.gender,
                  country: profileData.country,
                  email: profileData.email,
                  is_active: profileData.isActive,
                  is_banned: profileData.isBanned,
                  created_at: profileData.createdAt,
                  updated_at: profileData.updatedAt,
                  is_friend: result.is_friend,
                  // Stats
                  friend_count: result.stats.friend_count,
                  post_count: result.stats.post_count,
                },
                privacy: result.privacy,
                relationship: result.relationship,
                stats: result.stats,
              },
            }),
          };
        } catch (error: any) {
          // Handle 404 errors (user not found)
          if (
            error.statusCode === 404 ||
            error.message === 'User not found' ||
            error.message === 'Profile not found'
          ) {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                success: false,
                error: 'User not found',
                message: 'The requested user profile does not exist',
              }),
            };
          }
          throw error;
        }
      }
    }

    // View other user's custom sections - GET /users/{userId}/custom-sections
    const userCustomSectionsMatch = path.match(/\/users\/([^/]+)\/custom-sections$/);
    if (userCustomSectionsMatch && method === 'GET') {
      const targetUserId = userCustomSectionsMatch[1];

      // Skip if it's a reserved path
      if (targetUserId !== 'profile' && targetUserId !== 'me') {
        try {
          // Get custom sections for target user
          const sections = await getCustomSectionsHandler(targetUserId);

          // Determine relationship for privacy filtering
          let relationship = 'stranger';
          if (userId) {
            if (userId === targetUserId) {
              relationship = 'self';
            } else {
              // Check if they are friends
              const { determineRelationship } = await import('./services/profile.service');
              const rel = await determineRelationship(userId, targetUserId);
              relationship = rel;
            }
          }

          // Filter sections based on privacy and relationship
          const filteredSections = sections.sections.filter((section: any) => {
            if (relationship === 'self') return true;
            if (section.privacy === 'public') return true;
            if (section.privacy === 'friends' && relationship === 'friend') return true;
            return false;
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: { sections: filteredSections },
            }),
          };
        } catch (error: any) {
          console.error('[getOtherUserCustomSections] Error:', error);
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              data: { sections: [] },
            }),
          };
        }
      }
    }

    // Preferences endpoints
    if (path.includes('/users/profile/preferences/stable')) {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      // GET /v1/users/profile/preferences/stable
      if (method === 'GET') {
        const result = await getStablePreferencesHandler(userId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // PUT /v1/users/profile/preferences/stable
      if (method === 'PUT') {
        const updates = JSON.parse(event.body || '{}');
        const result = await updateStablePreferencesHandler(userId, updates);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }
    }

    if (path.includes('/users/profile/preferences/frequent')) {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      // GET /v1/users/profile/preferences/frequent
      if (method === 'GET') {
        const result = await getFrequentPreferencesHandler(userId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // PUT /v1/users/profile/preferences/frequent
      if (method === 'PUT') {
        const updates = JSON.parse(event.body || '{}');
        const result = await updateFrequentPreferencesHandler(userId, updates);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }
    }

    // Custom sections endpoints
    if (path.includes('/users/profile/custom-sections')) {
      if (!userId) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Unauthorized' }),
        };
      }

      // GET /users/profile/custom-sections - Get all sections
      if (method === 'GET' && path.endsWith('/users/profile/custom-sections')) {
        const result = await getCustomSectionsHandler(userId);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // POST /users/profile/custom-sections - Create section
      if (method === 'POST' && path.endsWith('/users/profile/custom-sections')) {
        const request = JSON.parse(event.body || '{}');
        const result = await createSectionHandler(userId, request);
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // PUT /v1/users/profile/custom-sections/{sectionId} - Update section
      const updateSectionMatch = path.match(/\/users\/profile\/custom-sections\/([^/]+)$/);
      if (updateSectionMatch && method === 'PUT') {
        const sectionId = updateSectionMatch[1];
        const request = JSON.parse(event.body || '{}');
        const result = await updateSectionHandler(userId, sectionId, request);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // DELETE /v1/users/profile/custom-sections/{sectionId} - Delete section
      if (updateSectionMatch && method === 'DELETE') {
        const sectionId = updateSectionMatch[1];
        await deleteSectionHandler(userId, sectionId);
        return {
          statusCode: 204,
          headers,
          body: '',
        };
      }

      // POST /v1/users/profile/custom-sections/{sectionId}/fields - Add field
      const addFieldMatch = path.match(/\/users\/profile\/custom-sections\/([^/]+)\/fields$/);
      if (addFieldMatch && method === 'POST') {
        const sectionId = addFieldMatch[1];
        const request = JSON.parse(event.body || '{}');
        const result = await addFieldHandler(userId, sectionId, request);
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // PUT /v1/users/profile/custom-sections/{sectionId}/fields/{fieldId} - Update field
      const updateFieldMatch = path.match(
        /\/users\/profile\/custom-sections\/([^/]+)\/fields\/([^/]+)$/
      );
      if (updateFieldMatch && method === 'PUT') {
        const [, sectionId, fieldId] = updateFieldMatch;
        const request = JSON.parse(event.body || '{}');
        const result = await updateFieldHandler(userId, sectionId, fieldId, request);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, data: result }),
        };
      }

      // DELETE /v1/users/profile/custom-sections/{sectionId}/fields/{fieldId} - Delete field
      if (updateFieldMatch && method === 'DELETE') {
        const [, sectionId, fieldId] = updateFieldMatch;
        await deleteFieldHandler(userId, sectionId, fieldId);
        return {
          statusCode: 204,
          headers,
          body: '',
        };
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        error: 'Not found',
        path,
        method,
      }),
    };
  } catch (error: any) {
    console.error('Error in auth-module handler:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || 'Internal server error',
      }),
    };
  }
};
