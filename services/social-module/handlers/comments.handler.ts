/**
 * Comment Handlers
 *
 * API handlers for comment management
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CommentService } from '../services/comment.service';
import { CommentCreateData, CommentUpdateData } from '../models/comment.model';

// Lazy initialization - allows dependency injection for testing
let commentService: CommentService | null = null;

/**
 * Get or create CommentService instance
 */
export function getCommentService(): CommentService {
  if (!commentService) {
    commentService = new CommentService();
  }
  return commentService;
}

/**
 * Set CommentService instance (for testing)
 */
export function setCommentService(service: CommentService): void {
  commentService = service;
}

/**
 * Reset CommentService instance (for testing)
 */
export function resetCommentService(): void {
  commentService = null;
}

/**
 * Helper function to create API response
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
 * Helper function to get user ID from event
 */
function getUserId(event: APIGatewayProxyEvent): string {
  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    throw new Error('User not authenticated');
  }
  return userId;
}

/**
 * Add comment to post handler
 * POST /v1/posts/:postId/comments
 */
export async function addComment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    const data: CommentCreateData = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!data.content) {
      return createResponse(400, {
        error: 'Missing required field: content',
      });
    }

    const comment = await getCommentService().addComment(postId, userId, data);

    return createResponse(201, {
      message: 'Comment added successfully',
      comment,
    });
  } catch (error: any) {
    console.error('Error adding comment:', error);

    if (error.message === 'Comment content cannot be empty') {
      return createResponse(400, {
        error: error.message,
      });
    }

    if (error.message === 'Comment content cannot exceed 2000 characters') {
      return createResponse(400, {
        error: error.message,
      });
    }

    if (error.message === 'Parent comment not found') {
      return createResponse(404, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to add comment',
    });
  }
}

/**
 * Get comments for post handler
 * GET /v1/posts/:postId/comments
 */
export async function getComments(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const postId = event.pathParameters?.postId;

    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId parameter',
      });
    }

    const limit = parseInt(event.queryStringParameters?.limit || '20', 10);

    // Support both lastKey (legacy) and nextToken parameter names
    const paginationToken =
      event.queryStringParameters?.nextToken || event.queryStringParameters?.lastKey;
    const lastKey = paginationToken ? JSON.parse(decodeURIComponent(paginationToken)) : undefined;

    const result = await getCommentService().getComments(postId, limit, lastKey);

    // Return both formats for compatibility
    const encodedToken = result.lastKey
      ? encodeURIComponent(JSON.stringify(result.lastKey))
      : undefined;
    return createResponse(200, {
      comments: result.comments,
      nextToken: encodedToken,
      lastKey: encodedToken, // Legacy support
      hasMore: !!result.lastKey,
    });
  } catch (error: any) {
    console.error('Error getting comments:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get comments',
    });
  }
}

/**
 * Update comment handler
 * PUT /v1/comments/:commentId
 */
export async function updateComment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const commentId = event.pathParameters?.commentId;

    if (!commentId) {
      return createResponse(400, {
        error: 'Missing commentId parameter',
      });
    }

    const data: CommentUpdateData = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!data.content) {
      return createResponse(400, {
        error: 'Missing required field: content',
      });
    }

    // Extract postId from query parameter (required for DynamoDB query)
    const postId = event.queryStringParameters?.postId;
    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId query parameter',
      });
    }

    const comment = await getCommentService().updateComment(postId, commentId, userId, data);

    return createResponse(200, {
      message: 'Comment updated successfully',
      comment,
    });
  } catch (error: any) {
    console.error('Error updating comment:', error);

    if (error.message === 'Comment not found') {
      return createResponse(404, {
        error: error.message,
      });
    }

    if (error.message === 'You can only update your own comments') {
      return createResponse(403, {
        error: error.message,
      });
    }

    if (
      error.message === 'Comment content cannot be empty' ||
      error.message === 'Comment content cannot exceed 2000 characters'
    ) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to update comment',
    });
  }
}

/**
 * Delete comment handler
 * DELETE /v1/comments/:commentId
 */
export async function deleteComment(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const commentId = event.pathParameters?.commentId;

    if (!commentId) {
      return createResponse(400, {
        error: 'Missing commentId parameter',
      });
    }

    // Extract postId from query parameter (required for DynamoDB query)
    const postId = event.queryStringParameters?.postId;
    if (!postId) {
      return createResponse(400, {
        error: 'Missing postId query parameter',
      });
    }

    await getCommentService().deleteComment(postId, commentId, userId);

    return createResponse(200, {
      message: 'Comment deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting comment:', error);

    if (error.message === 'Comment not found') {
      return createResponse(404, {
        error: error.message,
      });
    }

    if (error.message === 'You can only delete your own comments') {
      return createResponse(403, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to delete comment',
    });
  }
}

/**
 * Delete comment handler (path-based)
 * DELETE /posts/:postId/comments/:commentId
 *
 * Extracts postId and commentId from path parameters
 */
export async function deleteCommentByPath(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);

    // Extract from path: /posts/{postId}/comments/{commentId}
    const pathMatch = event.path.match(/\/posts\/([^/]+)\/comments\/([^/]+)/);
    if (!pathMatch) {
      return createResponse(400, {
        error: 'Invalid path format',
      });
    }

    const postId = pathMatch[1];
    const commentId = pathMatch[2];

    await getCommentService().deleteComment(postId, commentId, userId);

    return createResponse(200, {
      message: 'Comment deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting comment:', error);

    if (error.message === 'Comment not found') {
      return createResponse(404, {
        error: error.message,
      });
    }

    if (error.message === 'You can only delete your own comments') {
      return createResponse(403, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to delete comment',
    });
  }
}
