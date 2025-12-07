/**
 * Reaction Service
 *
 * Business logic for reactions (like, love, wow, sad, angry)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import {
  Reaction,
  ReactionType,
  ReactionSummary,
  AddReactionRequest,
} from '../models/reaction.model';
import { TrendingService } from './trending.service';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const trendingService = new TrendingService();

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Reaction Service Class
 */
export class ReactionService {
  /**
   * Add or update reaction (toggle pattern)
   * If user already reacted with same type, do nothing
   * If user reacted with different type, update to new type
   * If user hasn't reacted, create new reaction
   */
  async addReaction(userId: string, request: AddReactionRequest): Promise<Reaction> {
    const { targetId, targetType, reactionType } = request;

    // 1. Check if user already reacted
    const existingReaction = await this.getUserReaction(userId, targetId, targetType);

    const now = new Date().toISOString();
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = `REACTION#${userId}`;

    // 2. If same reaction type, do nothing (idempotent)
    if (existingReaction && existingReaction.reactionType === reactionType) {
      return existingReaction;
    }

    // 3. Create or update reaction
    const reaction: Reaction = {
      PK,
      SK,
      targetId,
      targetType,
      userId,
      reactionType,
      createdAt: existingReaction?.createdAt || now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: reaction,
      })
    );

    // 4. Update likes counter (only if new reaction, not update)
    if (!existingReaction) {
      await this.incrementLikesCounter(targetId, targetType, 1);

      // 5. Send notification to target author (async via SQS)
      await this.sendReactionNotification(userId, targetId, targetType, reactionType);

      // 6. Track for trending (only for posts with like reaction)
      if (targetType === 'post' && reactionType === 'like') {
        await this.trackPostLikeForTrending(targetId);
      }
    }

    return reaction;
  }

  /**
   * Remove reaction
   * Note: If reaction doesn't exist, we still try to clean up trending data
   * to handle edge cases where data might be out of sync
   */
  async removeReaction(
    userId: string,
    targetId: string,
    targetType: 'post' | 'comment'
  ): Promise<void> {
    // 1. Check if reaction exists
    const existingReaction = await this.getUserReaction(userId, targetId, targetType);

    if (!existingReaction) {
      // Reaction doesn't exist - still try to untrack from trending for data consistency
      if (targetType === 'post') {
        try {
          await trendingService.untrackPostLike(targetId);
        } catch (e) {
          // Ignore - trending entry might not exist either
        }
      }
      throw new Error('Reaction not found');
    }

    // 2. Delete reaction
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = `REACTION#${userId}`;

    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
      })
    );

    // 3. Decrement likes counter
    await this.incrementLikesCounter(targetId, targetType, -1);

    // 4. Untrack from trending (only for posts with like reaction)
    if (targetType === 'post' && existingReaction.reactionType === 'like') {
      await trendingService.untrackPostLike(targetId);
    }
  }

  /**
   * Get all reactions for a target (grouped by type)
   */
  async getReactions(targetId: string, targetType: 'post' | 'comment'): Promise<ReactionSummary> {
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;

    // Query all reactions for this target
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :reaction)',
        ExpressionAttributeValues: {
          ':pk': PK,
          ':reaction': 'REACTION#',
        },
      })
    );

    // Group by reaction type
    const summary: ReactionSummary = {
      like: { count: 0, users: [] },
      love: { count: 0, users: [] },
      wow: { count: 0, users: [] },
      sad: { count: 0, users: [] },
      angry: { count: 0, users: [] },
    };

    for (const item of result.Items || []) {
      const reaction = item as Reaction;
      summary[reaction.reactionType].count++;
      summary[reaction.reactionType].users.push(reaction.userId);
    }

    return summary;
  }

  /**
   * Get user's reaction for a target
   */
  async getUserReaction(
    userId: string,
    targetId: string,
    targetType: 'post' | 'comment'
  ): Promise<Reaction | null> {
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = `REACTION#${userId}`;

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
      })
    );

    return result.Item ? (result.Item as Reaction) : null;
  }

  /**
   * Increment/decrement likes counter
   * Also updates GSI3SK for trending posts
   */
  private async incrementLikesCounter(
    targetId: string,
    targetType: 'post' | 'comment',
    increment: number
  ): Promise<void> {
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = 'METADATA';

    // For posts, we need to update GSI3SK to maintain trending sort order
    if (targetType === 'post') {
      // First, get the current post to get createdAt timestamp
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK, SK },
        })
      );

      if (result.Item) {
        const currentLikes = result.Item.likes || 0;
        const newLikes = Math.max(0, currentLikes + increment); // Ensure non-negative
        const createdAt = result.Item.createdAt;

        // Update likes and GSI3SK
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK, SK },
            UpdateExpression: 'SET likes = :newLikes, GSI3SK = :gsi3sk',
            ExpressionAttributeValues: {
              ':newLikes': newLikes,
              ':gsi3sk': `${String(newLikes).padStart(5, '0')}#${createdAt}`, // Pad to 5 digits
            },
          })
        );
      }
    } else {
      // For comments, just update likes counter
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK, SK },
          UpdateExpression: 'SET likes = if_not_exists(likes, :zero) + :inc',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':inc': increment,
          },
        })
      );
    }
  }

  /**
   * Track post like for trending
   * Only tracks PUBLIC posts - friends/private posts are excluded from trending
   */
  private async trackPostLikeForTrending(postId: string): Promise<void> {
    try {
      // Get post metadata
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: `POST#${postId}`, SK: 'METADATA' },
        })
      );

      if (result.Item) {
        const post = result.Item;

        // Only track PUBLIC posts for trending
        // Friends and private posts should not appear in trending
        if (post.privacyLevel !== 'public') {
          console.log('Skipping trending track for non-public post:', postId, post.privacyLevel);
          return;
        }

        // Fetch author info from user profile if authorName not in post
        let authorName = post.authorName;
        let authorAvatar = post.authorAvatar;

        if (!authorName && post.authorId) {
          try {
            const userResult = await docClient.send(
              new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `USER#${post.authorId}`, SK: 'PROFILE' },
              })
            );
            if (userResult.Item) {
              authorName = userResult.Item.username || userResult.Item.userId;
              authorAvatar = authorAvatar || userResult.Item.avatarUrl;
            }
          } catch (userError) {
            console.error('Error fetching user for trending:', userError);
          }
        }

        // Get first image from post
        let postImage = post.image;
        if (!postImage && post.images) {
          if (post.images.quickImages?.length > 0) {
            postImage = post.images.quickImages[0];
          } else if (post.images.recipeImages?.completed) {
            postImage = post.images.recipeImages.completed;
          }
        }

        await trendingService.trackPostLike(
          postId,
          post.title || post.content?.substring(0, 50) || 'Bài viết',
          post.authorId,
          authorName || 'Unknown',
          authorAvatar,
          postImage
        );
      }
    } catch (error) {
      console.error('Error tracking post like for trending:', error);
      // Don't throw - trending tracking failure shouldn't block reaction
    }
  }

  /**
   * Send reaction notification (direct DynamoDB write)
   * In-app notification only - no push notification needed for web app
   */
  private async sendReactionNotification(
    reactorId: string,
    targetId: string,
    targetType: 'post' | 'comment',
    reactionType: ReactionType
  ): Promise<void> {
    // Get target to find author
    const PK = targetType === 'post' ? `POST#${targetId}` : `COMMENT#${targetId}`;
    const SK = 'METADATA';

    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK, SK },
      })
    );

    if (!result.Item) {
      return;
    }

    const authorId = result.Item.authorId;

    // Don't notify if user reacts to own content
    if (authorId === reactorId) {
      return;
    }

    // Write notification directly to DynamoDB
    const notificationId = uuidv4();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${authorId}`,
            SK: `NOTIFICATION#${now}#${notificationId}`,
            notificationId,
            recipientId: authorId,
            type: 'new_reaction',
            actorId: reactorId,
            resourceId: targetId,
            resourceType: targetType,
            metadata: { reactionType },
            isRead: false,
            createdAt: now,
            ttl,
          },
        })
      );
    } catch (error) {
      console.error('Failed to save reaction notification:', error);
      // Don't throw - notification failure shouldn't block reaction
    }
  }
}
