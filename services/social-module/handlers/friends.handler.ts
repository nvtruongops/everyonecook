/**
 * Friend Handlers
 *
 * API handlers for friend management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { FriendService } from '../services/friend.service';
import { getUserId } from '../shared/cognito.utils';

// Lazy initialization - allows dependency injection for testing
let friendService: FriendService | null = null;

/**
 * Get or create FriendService instance
 */
export function getFriendService(): FriendService {
  if (!friendService) {
    friendService = new FriendService();
  }
  return friendService;
}

/**
 * Set FriendService instance (for testing)
 */
export function setFriendService(service: FriendService): void {
  friendService = service;
}

/**
 * Reset FriendService instance (for testing)
 */
export function resetFriendService(): void {
  friendService = null;
}

/**
 * Helper function to create API response
 * Note: CORS headers are handled by API Gateway defaultCorsPreflightOptions
 * Lambda only needs to return Access-Control-Allow-Origin for the actual response
 */
function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Send friend request handler
 * POST /friends/:userId/request
 */
export async function sendFriendRequest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    // Extract friendUserId from path parameters
    let friendUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path /friends/{userId}/request or /friends/{userId}
    if (!friendUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)/);
      if (match) {
        friendUserId = match[1];
      }
    }

    if (!friendUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    const friendship = await getFriendService().sendFriendRequest(userId, friendUserId);

    return createResponse(201, {
      message: 'Friend request sent successfully',
      friendship,
    });
  } catch (error: any) {
    console.error('Error sending friend request:', error);

    if (
      error.message === 'Cannot send friend request to yourself' ||
      error.message === 'You are already friends with this user' ||
      error.message === 'Friend request already sent' ||
      error.message === 'Cannot send friend request to blocked user' ||
      error.message === 'This user has blocked you'
    ) {
      return createResponse(400, {
        error: error.message,
      });
    }

    if (error.message.includes('Rate limit exceeded')) {
      return createResponse(429, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to send friend request',
    });
  }
}

/**
 * Accept friend request handler
 * PUT /friends/:userId/accept
 */
export async function acceptFriendRequest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let friendUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!friendUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)\/accept/);
      if (match) {
        friendUserId = match[1];
      }
    }

    if (!friendUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    const friendship = await getFriendService().acceptFriendRequest(userId, friendUserId);

    return createResponse(200, {
      message: 'Friend request accepted successfully',
      friendship,
    });
  } catch (error: any) {
    console.error('Error accepting friend request:', error);

    if (error.message === 'Friend request not found') {
      return createResponse(404, {
        error: 'Friend request not found',
      });
    }

    if (
      error.message === 'Friend request already accepted' ||
      error.message === 'Cannot accept request from blocked user'
    ) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to accept friend request',
    });
  }
}

/**
 * Reject friend request handler
 * DELETE /friends/:userId/request
 */
export async function rejectFriendRequest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let friendUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!friendUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)/);
      if (match) {
        friendUserId = match[1];
      }
    }

    if (!friendUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    await getFriendService().rejectFriendRequest(userId, friendUserId);

    return createResponse(200, {
      message: 'Friend request rejected successfully',
    });
  } catch (error: any) {
    console.error('Error rejecting friend request:', error);

    if (error.message === 'Friend request not found') {
      return createResponse(404, {
        error: 'Friend request not found',
      });
    }

    if (error.message === 'Cannot reject an accepted friendship') {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to reject friend request',
    });
  }
}

/**
 * Cancel friend request handler (sender cancels their own request)
 * DELETE /friends/:userId/request
 */
export async function cancelFriendRequest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let friendUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!friendUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)\/cancel/);
      if (match) {
        friendUserId = match[1];
      }
    }

    if (!friendUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    await getFriendService().cancelFriendRequest(userId, friendUserId);

    return createResponse(200, {
      message: 'Friend request cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling friend request:', error);

    if (error.message === 'Friend request not found') {
      return createResponse(404, {
        error: 'Friend request not found',
      });
    }

    if (
      error.message === 'Cannot cancel an accepted friendship. Use unfriend instead.' ||
      error.message === 'Cannot cancel a blocked relationship' ||
      error.message === 'No pending friend request to cancel'
    ) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to cancel friend request',
    });
  }
}

/**
 * Unfriend user handler
 * DELETE /friends/:userId
 */
export async function unfriend(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let friendUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!friendUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)$/);
      if (match) {
        friendUserId = match[1];
      }
    }

    if (!friendUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    await getFriendService().unfriend(userId, friendUserId);

    return createResponse(200, {
      message: 'Friend removed successfully',
    });
  } catch (error: any) {
    console.error('Error unfriending user:', error);

    if (error.message === 'Friendship not found') {
      return createResponse(404, {
        error: 'Friendship not found',
      });
    }

    if (error.message === 'Can only unfriend accepted friendships') {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to unfriend user',
    });
  }
}

/**
 * Block user handler
 * POST /friends/:userId/block
 */
export async function blockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let blockedUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!blockedUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)\/block/);
      if (match) {
        blockedUserId = match[1];
      }
    }

    if (!blockedUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    const blockRecord = await getFriendService().blockUser(userId, blockedUserId);

    return createResponse(200, {
      message: 'User blocked successfully',
      blockRecord,
    });
  } catch (error: any) {
    console.error('Error blocking user:', error);

    if (error.message === 'Cannot block yourself') {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to block user',
    });
  }
}

/**
 * Unblock user handler
 * DELETE /friends/:userId/block
 */
export async function unblockUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let blockedUserId = event.pathParameters?.userId || event.pathParameters?.username;

    // Fallback: extract from path
    if (!blockedUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)\/block/);
      if (match) {
        blockedUserId = match[1];
      }
    }

    if (!blockedUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    await getFriendService().unblockUser(userId, blockedUserId);

    return createResponse(200, {
      message: 'User unblocked successfully',
    });
  } catch (error: any) {
    console.error('Error unblocking user:', error);

    if (error.message === 'Block record not found') {
      return createResponse(404, {
        error: 'Block record not found',
      });
    }

    if (error.message === 'User is not blocked') {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to unblock user',
    });
  }
}

/**
 * Get friends list handler
 * GET /friends
 */
export async function getFriendsList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const friends = await getFriendService().getFriendsList(userId);

    return createResponse(200, {
      friends,
      count: friends.length,
    });
  } catch (error: any) {
    console.error('Error getting friends list:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get friends list',
    });
  }
}

/**
 * Get pending friend requests handler
 * GET /friends/requests
 */
export async function getPendingRequests(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const requests = await getFriendService().getPendingRequests(userId);

    return createResponse(200, {
      requests,
      count: requests.length,
    });
  } catch (error: any) {
    console.error('Error getting pending requests:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get pending requests',
    });
  }
}

/**
 * Get sent friend requests handler (requests I sent to others)
 * GET /friends/sent
 */
export async function getSentRequests(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const requests = await getFriendService().getSentRequests(userId);

    return createResponse(200, {
      requests,
      count: requests.length,
    });
  } catch (error: any) {
    console.error('Error getting sent requests:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get sent requests',
    });
  }
}

/**
 * Get blocked users handler
 * GET /friends/blocked
 */
export async function getBlockedUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    const blockedUsers = await getFriendService().getBlockedUsers(userId);

    return createResponse(200, {
      blockedUsers,
      count: blockedUsers.length,
    });
  } catch (error: any) {
    console.error('Error getting blocked users:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get blocked users',
    });
  }
}

/**
 * Get friendship status handler
 * GET /friends/:userId/status
 */
export async function getFriendshipStatus(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    let targetUserId = event.pathParameters?.userId;

    // Fallback: extract from path
    if (!targetUserId && event.path) {
      const match = event.path.match(/\/friends\/([^/]+)\/status/);
      if (match) {
        targetUserId = match[1];
      }
    }

    if (!targetUserId) {
      return createResponse(400, {
        error: 'Missing userId parameter',
      });
    }

    const result = await getFriendService().getFriendshipStatus(userId, targetUserId);

    return createResponse(200, result);
  } catch (error: any) {
    console.error('Error getting friendship status:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get friendship status',
    });
  }
}
