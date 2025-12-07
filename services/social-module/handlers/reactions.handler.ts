/**
 * Reaction Handlers
 *
 * API handlers for reactions (like, love, wow, sad, angry)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ReactionService } from '../services/reaction.service';
import { AddReactionRequest, ReactionType } from '../models/reaction.model';

// Lazy initialization - allows dependency injection for testing
let reactionService: ReactionService | null = null;

/**
 * Get or create ReactionService instance
 */
export function getReactionService(): ReactionService {
  if (!reactionService) {
    reactionService = new ReactionService();
  }
  return reactionService;
}

/**
 * Set ReactionService instance (for testing)
 */
export function setReactionService(service: ReactionService): void {
  reactionService = service;
}

/**
 * Reset ReactionService instance (for testing)
 */
export function resetReactionService(): void {
  reactionService = null;
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
 * Validate reaction type
 */
function isValidReactionType(type: string): type is ReactionType {
  return ['like', 'love', 'wow', 'sad', 'angry'].includes(type);
}

/**
 * Add or update reaction handler (toggle pattern)
 * POST /v1/posts/:postId/react
 * POST /v1/comments/:commentId/react
 */
export async function addReaction(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const data = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!data.targetId || !data.targetType || !data.reactionType) {
      return createResponse(400, {
        error: 'Missing required fields: targetId, targetType, reactionType',
      });
    }

    // Validate targetType
    if (data.targetType !== 'post' && data.targetType !== 'comment') {
      return createResponse(400, {
        error: 'Invalid targetType. Must be "post" or "comment"',
      });
    }

    // Validate reactionType
    if (!isValidReactionType(data.reactionType)) {
      return createResponse(400, {
        error: 'Invalid reactionType. Must be one of: like, love, wow, sad, angry',
      });
    }

    const request: AddReactionRequest = {
      targetId: data.targetId,
      targetType: data.targetType,
      reactionType: data.reactionType,
    };

    const reaction = await getReactionService().addReaction(userId, request);

    return createResponse(200, {
      message: 'Reaction added successfully',
      reaction,
    });
  } catch (error: any) {
    console.error('Error adding reaction:', error);
    return createResponse(500, {
      error: error.message || 'Failed to add reaction',
    });
  }
}

/**
 * Remove reaction handler
 * DELETE /v1/posts/:postId/react
 * DELETE /v1/comments/:commentId/react
 */
export async function removeReaction(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const data = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!data.targetId || !data.targetType) {
      return createResponse(400, {
        error: 'Missing required fields: targetId, targetType',
      });
    }

    // Validate targetType
    if (data.targetType !== 'post' && data.targetType !== 'comment') {
      return createResponse(400, {
        error: 'Invalid targetType. Must be "post" or "comment"',
      });
    }

    await getReactionService().removeReaction(userId, data.targetId, data.targetType);

    return createResponse(200, {
      message: 'Reaction removed successfully',
    });
  } catch (error: any) {
    console.error('Error removing reaction:', error);

    if (error.message === 'Reaction not found') {
      return createResponse(404, {
        error: 'Reaction not found',
      });
    }

    return createResponse(500, {
      error: error.message || 'Failed to remove reaction',
    });
  }
}

/**
 * Get reactions handler (grouped by type)
 * GET /v1/posts/:postId/reactions
 * GET /v1/comments/:commentId/reactions
 */
export async function getReactions(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const targetId = event.pathParameters?.targetId;
    const targetType = event.queryStringParameters?.targetType;

    if (!targetId || !targetType) {
      return createResponse(400, {
        error: 'Missing required parameters: targetId, targetType',
      });
    }

    // Validate targetType
    if (targetType !== 'post' && targetType !== 'comment') {
      return createResponse(400, {
        error: 'Invalid targetType. Must be "post" or "comment"',
      });
    }

    const reactions = await getReactionService().getReactions(targetId, targetType);

    return createResponse(200, {
      reactions,
    });
  } catch (error: any) {
    console.error('Error getting reactions:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get reactions',
    });
  }
}

/**
 * Get user's reaction handler
 * GET /v1/posts/:postId/my-reaction
 * GET /v1/comments/:commentId/my-reaction
 */
export async function getMyReaction(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const userId = getUserId(event);
    const targetId = event.pathParameters?.targetId;
    const targetType = event.queryStringParameters?.targetType;

    if (!targetId || !targetType) {
      return createResponse(400, {
        error: 'Missing required parameters: targetId, targetType',
      });
    }

    // Validate targetType
    if (targetType !== 'post' && targetType !== 'comment') {
      return createResponse(400, {
        error: 'Invalid targetType. Must be "post" or "comment"',
      });
    }

    const reaction = await getReactionService().getUserReaction(userId, targetId, targetType);

    if (!reaction) {
      return createResponse(404, {
        message: 'No reaction found',
      });
    }

    return createResponse(200, {
      reaction,
    });
  } catch (error: any) {
    console.error('Error getting user reaction:', error);
    return createResponse(500, {
      error: error.message || 'Failed to get user reaction',
    });
  }
}
