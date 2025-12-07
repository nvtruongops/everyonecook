/**
 * Social Module - Main Lambda Handler
 *
 * Routes incoming requests to appropriate sub-handlers based on path and method.
 * This is the entry point for the Social Lambda function.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getPersonalizedFeed,
  getTrendingFeed,
  getFriendsFeed,
  getDiscoverFeed,
} from './handlers/feed.handler';
import {
  createQuickPost,
  shareRecipeAsPost,
  sharePost,
  getPost,
  updatePost,
  deletePost,
  getUserFeed,
  getUserPosts,
  saveRecipeFromPost,
  getPostImageUploadUrl,
  getPostsStats,
} from './handlers/posts.handler';
import { addComment, getComments, deleteCommentByPath } from './handlers/comments.handler';
import { addReaction, removeReaction } from './handlers/reactions.handler';
import { reportContent } from './handlers/reports.handler';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  unfriend,
  getPendingRequests,
  getSentRequests,
  getFriendsList,
  blockUser,
  unblockUser,
  getBlockedUsers,
  getFriendshipStatus,
} from './handlers/friends.handler';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  getUnreadCount,
  deleteNotification,
  deleteAllNotifications,
} from './handlers/notifications.handler';
import {
  createRecipeGroup,
  getMyRecipeGroups,
  addRecipeToGroup,
} from './handlers/recipe-group.handler';
import {
  getTrendingSearches,
  getTrendingPosts,
  getAllTrending,
  trackSearch,
  cleanupTrending,
} from './handlers/trending.handler';
import { getMyViolationDetail } from './handlers/violations.handler';

/**
 * Helper function to create error response
 */
function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Main Lambda handler
 * Routes requests based on HTTP method and path
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Social Module - Incoming request:', {
    method: event.httpMethod,
    path: event.path,
    resource: event.resource,
    pathParameters: event.pathParameters,
  });

  const method = event.httpMethod;
  // Use path as-is (no /v1 prefix in MVP)
  const path = event.path;

  try {
    // Feed endpoints
    if (method === 'GET' && path === '/feed') {
      return await getPersonalizedFeed(event);
    }
    if (method === 'GET' && path === '/feed/trending') {
      return await getTrendingFeed(event);
    }
    if (method === 'GET' && path === '/feed/following') {
      return await getFriendsFeed(event);
    }
    if (method === 'GET' && path === '/feed/discover') {
      return await getDiscoverFeed(event);
    }

    // Posts endpoints
    if (method === 'POST' && path === '/posts') {
      return await createQuickPost(event);
    }
    if (method === 'POST' && path === '/posts/share-recipe') {
      return await shareRecipeAsPost(event);
    }
    if (method === 'GET' && path.match(/^\/users\/[^/]+\/posts$/)) {
      return await getUserPosts(event);
    }
    if (method === 'GET' && path.match(/^\/posts\/[^/]+$/)) {
      return await getPost(event);
    }
    if (method === 'PUT' && path.match(/^\/posts\/[^/]+$/)) {
      return await updatePost(event);
    }
    if (method === 'DELETE' && path.match(/^\/posts\/[^/]+$/)) {
      return await deletePost(event);
    }
    if (method === 'GET' && path === '/posts') {
      return await getUserFeed(event);
    }
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/save-recipe$/)) {
      return await saveRecipeFromPost(event);
    }
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/share$/)) {
      return await sharePost(event);
    }
    if (method === 'POST' && path === '/posts/upload-image') {
      return await getPostImageUploadUrl(event);
    }
    if (method === 'POST' && path === '/posts/stats') {
      return await getPostsStats(event);
    }

    // Comments endpoints
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/comments$/)) {
      return await addComment(event);
    }
    if (method === 'GET' && path.match(/^\/posts\/[^/]+\/comments$/)) {
      return await getComments(event);
    }
    if (method === 'DELETE' && path.match(/^\/posts\/[^/]+\/comments\/[^/]+$/)) {
      return await deleteCommentByPath(event);
    }

    // Reactions endpoints
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/reactions$/)) {
      return await addReaction(event);
    }
    if (method === 'DELETE' && path.match(/^\/posts\/[^/]+\/reactions$/)) {
      return await removeReaction(event);
    }

    // Reports endpoints
    if (method === 'POST' && path === '/reports') {
      return await reportContent(event);
    }
    // Report post: POST /posts/{postId}/report
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/report$/)) {
      // Extract postId and set targetType
      const postId = event.pathParameters?.postId || path.split('/')[2];
      event.body = JSON.stringify({
        ...JSON.parse(event.body || '{}'),
        targetId: postId,
        targetType: 'post',
      });
      return await reportContent(event);
    }
    // Report comment: POST /posts/{postId}/comments/{commentId}/report
    if (method === 'POST' && path.match(/^\/posts\/[^/]+\/comments\/[^/]+\/report$/)) {
      // Extract commentId and set targetType
      const commentId = event.pathParameters?.commentId || path.split('/')[4];
      event.body = JSON.stringify({
        ...JSON.parse(event.body || '{}'),
        targetId: commentId,
        targetType: 'comment',
      });
      return await reportContent(event);
    }

    // Friends endpoints
    if (method === 'POST' && path.match(/^\/friends\/[^/]+\/request$/)) {
      return await sendFriendRequest(event);
    }
    // NOTE: POST /friends/{userId} (direct add without /request) removed - frontend uses /friends/{userId}/request
    if (method === 'PUT' && path.match(/^\/friends\/[^/]+\/accept$/)) {
      return await acceptFriendRequest(event);
    }
    if (method === 'PUT' && path.match(/^\/friends\/[^/]+\/reject$/)) {
      return await rejectFriendRequest(event);
    }
    if (method === 'DELETE' && path.match(/^\/friends\/[^/]+\/cancel$/)) {
      return await cancelFriendRequest(event);
    }
    if (method === 'DELETE' && path.match(/^\/friends\/[^/]+$/)) {
      return await unfriend(event);
    }
    if (method === 'GET' && path === '/friends/requests') {
      return await getPendingRequests(event);
    }
    if (method === 'GET' && path === '/friends/sent') {
      return await getSentRequests(event);
    }
    if (method === 'GET' && path === '/friends') {
      return await getFriendsList(event);
    }
    if (method === 'POST' && path.match(/^\/friends\/[^/]+\/block$/)) {
      return await blockUser(event);
    }
    if (method === 'DELETE' && path.match(/^\/friends\/[^/]+\/block$/)) {
      return await unblockUser(event);
    }
    if (method === 'GET' && path === '/friends/blocked') {
      return await getBlockedUsers(event);
    }
    if (method === 'GET' && path.match(/^\/friends\/[^/]+\/status$/)) {
      return await getFriendshipStatus(event);
    }

    // Notifications endpoints
    if (method === 'GET' && path === '/notifications') {
      return await getNotifications(event);
    }
    if (method === 'GET' && path === '/notifications/unread/count') {
      return await getUnreadCount(event);
    }
    if (method === 'PUT' && path.match(/^\/notifications\/[^/]+\/read$/)) {
      return await markAsRead(event);
    }
    if (method === 'PUT' && path === '/notifications/read-all') {
      return await markAllAsRead(event);
    }
    if (method === 'GET' && path === '/notifications/preferences') {
      return await getPreferences(event);
    }
    if (method === 'PUT' && path === '/notifications/preferences') {
      return await updatePreferences(event);
    }
    if (method === 'DELETE' && path === '/notifications') {
      return await deleteAllNotifications(event);
    }
    if (method === 'DELETE' && path.match(/^\/notifications\/[^/]+$/)) {
      return await deleteNotification(event);
    }

    // Recipe Groups endpoints
    if (method === 'POST' && path.match(/^\/users\/[^/]+\/recipe-groups$/)) {
      return await createRecipeGroup(event);
    }
    if (method === 'GET' && path.match(/^\/users\/[^/]+\/recipe-groups$/)) {
      return await getMyRecipeGroups(event);
    }
    if (method === 'POST' && path.match(/^\/users\/[^/]+\/recipe-groups\/[^/]+\/recipes$/)) {
      return await addRecipeToGroup(event);
    }

    // User violations endpoint (for viewing hidden content details)
    if (method === 'GET' && path === '/users/me/violations') {
      return await getMyViolationDetail(event);
    }

    // Trending endpoints
    if (method === 'GET' && path === '/trending') {
      return await getAllTrending(event);
    }
    if (method === 'GET' && path === '/trending/searches') {
      return await getTrendingSearches(event);
    }
    if (method === 'GET' && path === '/trending/posts') {
      return await getTrendingPosts(event);
    }
    if (method === 'POST' && path === '/trending/track-search') {
      return await trackSearch(event);
    }
    if (method === 'DELETE' && path === '/trending/cleanup') {
      return await cleanupTrending(event);
    }

    // No matching route
    return errorResponse(404, `Route not found: ${method} ${path}`);
  } catch (error: any) {
    console.error('Social Module - Error:', error);
    return errorResponse(500, error.message || 'Internal server error');
  }
}
