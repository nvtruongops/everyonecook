/**
 * Comment Service
 *
 * Business logic for comment management
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Comment, CommentCreateData, CommentUpdateData } from '../models/comment.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Comment Service Class
 */
export class CommentService {
  /**
   * Add a comment to a post
   */
  async addComment(postId: string, userId: string, data: CommentCreateData): Promise<Comment> {
    // 1. Validate content
    if (!data.content || data.content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }

    if (data.content.length > 2000) {
      throw new Error('Comment content cannot exceed 2000 characters');
    }

    // 2. If this is a reply, verify parent comment exists
    if (data.parentCommentId) {
      const parentComment = await this.getComment(postId, data.parentCommentId);
      if (!parentComment) {
        throw new Error('Parent comment not found');
      }
    }

    // 3. Generate comment ID
    const commentId = uuidv4();
    const now = new Date().toISOString();

    // 4. Create comment entity
    const comment: Comment = {
      PK: `POST#${postId}`,
      SK: `COMMENT#${commentId}`,
      commentId,
      postId,
      authorId: userId,
      content: data.content.trim(),
      parentCommentId: data.parentCommentId,
      isEdited: false,
      createdAt: now,
      GSI1PK: `USER#${userId}`,
      GSI1SK: `COMMENT#${now}`,
    };

    // 5. Save to DynamoDB
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: comment,
      })
    );

    // 6. Increment post comment count
    await this.incrementPostCommentCount(postId);

    // 7. Send notification (async via SQS)
    if (data.parentCommentId) {
      // Reply to comment - notify parent comment author
      const parentComment = await this.getComment(postId, data.parentCommentId);
      if (parentComment && parentComment.authorId !== userId) {
        await this.sendCommentNotification(
          userId,
          parentComment.authorId,
          postId,
          commentId,
          'comment_reply'
        );
      }
    } else {
      // New comment on post - notify post author
      await this.sendCommentNotification(userId, postId, postId, commentId, 'new_comment');
    }

    // 8. Handle @mentions in comment content
    const mentions = this.extractMentions(data.content);
    if (mentions.length > 0) {
      await this.sendMentionNotifications(userId, postId, commentId, mentions);
    }

    return comment;
  }

  /**
   * Extract @mentions from comment content
   * Returns array of usernames mentioned
   */
  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    return [...new Set(mentions)]; // Remove duplicates
  }

  /**
   * Send notifications to mentioned users
   * Only sends notification if the mentioned user has permission to view the post
   */
  private async sendMentionNotifications(
    actorId: string,
    postId: string,
    commentId: string,
    usernames: string[]
  ): Promise<void> {
    console.log(`[Mention] Processing ${usernames.length} mentions:`, usernames);

    // Get post to check privacy
    const postResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
      })
    );

    if (!postResult.Item) {
      console.log(`[Mention] Post ${postId} not found, skipping notifications`);
      return;
    }

    const post = postResult.Item;
    const postAuthorId = post.authorId;
    const privacyLevel = post.privacyLevel || 'public';

    for (const username of usernames) {
      try {
        // Find user by username using GSI2 (USERNAME#{username})
        // Username is stored lowercase in GSI2PK
        const normalizedUsername = username.toLowerCase().trim();
        console.log(
          `[Mention] Looking up user: @${username} -> GSI2PK: USERNAME#${normalizedUsername}`
        );

        const userResult = await docClient.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI2',
            KeyConditionExpression: 'GSI2PK = :pk',
            ExpressionAttributeValues: {
              ':pk': `USERNAME#${normalizedUsername}`,
            },
            Limit: 1,
          })
        );

        console.log(
          `[Mention] GSI2 query result for @${username}:`,
          userResult.Items?.length || 0,
          'items'
        );

        if (userResult.Items && userResult.Items.length > 0) {
          // Extract userId from PK (USER#{userId})
          const pk = userResult.Items[0].PK as string;
          const mentionedUserId = pk.replace('USER#', '');
          console.log(`[Mention] Found user ${username} -> userId: ${mentionedUserId}`);

          // Don't notify yourself
          if (mentionedUserId === actorId) {
            console.log(`[Mention] Skipping self-mention for @${username}`);
            continue;
          }

          // Check if mentioned user can view the post
          const canView = await this.canUserViewPost(postAuthorId, mentionedUserId, privacyLevel);

          if (!canView) {
            console.log(
              `[Mention] User @${username} cannot view post (privacy: ${privacyLevel}), skipping notification`
            );
            continue;
          }

          await this.sendCommentNotification(
            actorId,
            mentionedUserId,
            postId,
            commentId,
            'mention'
          );
          console.log(`Sent mention notification to user ${mentionedUserId} for @${username}`);
        } else {
          console.log(`User @${username} not found, skipping notification`);
        }
      } catch (error) {
        console.error(`Error sending mention notification to @${username}:`, error);
      }
    }
  }

  /**
   * Check if a user can view a post based on privacy settings
   * @param postAuthorId - The post author's user ID
   * @param viewerId - The user trying to view the post
   * @param privacyLevel - The post's privacy level
   * @returns true if user can view, false otherwise
   */
  private async canUserViewPost(
    postAuthorId: string,
    viewerId: string,
    privacyLevel: string
  ): Promise<boolean> {
    // Author can always view their own posts
    if (postAuthorId === viewerId) {
      return true;
    }

    // Public posts can be viewed by anyone
    if (privacyLevel === 'public') {
      return true;
    }

    // Private posts can only be viewed by author
    if (privacyLevel === 'private') {
      return false;
    }

    // Friends-only posts require friendship check
    if (privacyLevel === 'friends') {
      try {
        const friendshipResult = await docClient.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: {
              PK: `USER#${postAuthorId}`,
              SK: `FRIEND#${viewerId}`,
            },
          })
        );

        // Check if friendship exists and is accepted
        return friendshipResult.Item?.status === 'accepted';
      } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
      }
    }

    // Default: deny access for unknown privacy levels
    return false;
  }

  /**
   * Get comments for a post (paginated)
   * Enriches comments with author info (name, avatar)
   * Filters out hidden comments - they are not visible to anyone (including author)
   */
  async getComments(
    postId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<{
    comments: (Comment & { authorName?: string; authorAvatar?: string })[];
    lastKey?: Record<string, unknown>;
  }> {
    // Query more comments than needed to account for hidden comments being filtered out
    const queryLimit = Math.min(limit * 2, 100);
    
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `POST#${postId}`,
          ':sk': 'COMMENT#',
        },
        Limit: queryLimit,
        ExclusiveStartKey: lastKey,
      })
    );

    // Filter out hidden comments - they are not visible to anyone (including author)
    // Author can only view hidden comments via violations page
    const allComments = (result.Items || []) as Comment[];
    const visibleComments = allComments.filter((comment: any) => comment.status !== 'hidden');

    // Sort comments by createdAt (oldest first) since SK uses UUID not timestamp
    const comments = visibleComments.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeA - timeB;
    }).slice(0, limit);

    // Enrich comments with author info
    const enrichedComments = await Promise.all(
      comments.map(async (comment) => {
        try {
          const userResult = await docClient.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: { PK: `USER#${comment.authorId}`, SK: 'PROFILE' },
              ProjectionExpression: 'username, fullName, avatarUrl',
            })
          );
          const user = userResult.Item;
          return {
            ...comment,
            authorName: user?.username || 'Unknown User',
            authorAvatar: user?.avatarUrl,
          };
        } catch (error) {
          console.error('Error fetching user for comment:', error);
          return { ...comment, authorName: 'Unknown User' };
        }
      })
    );

    return {
      comments: enrichedComments,
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get a single comment
   */
  async getComment(postId: string, commentId: string): Promise<Comment | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: `COMMENT#${commentId}`,
        },
      })
    );

    return result.Item ? (result.Item as Comment) : null;
  }

  /**
   * Update a comment
   */
  async updateComment(
    postId: string,
    commentId: string,
    userId: string,
    data: CommentUpdateData
  ): Promise<Comment> {
    // 1. Get existing comment
    const existingComment = await this.getComment(postId, commentId);
    if (!existingComment) {
      throw new Error('Comment not found');
    }

    // 2. Verify ownership
    if (existingComment.authorId !== userId) {
      throw new Error('You can only update your own comments');
    }

    // 3. Validate content
    if (!data.content || data.content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }

    if (data.content.length > 2000) {
      throw new Error('Comment content cannot exceed 2000 characters');
    }

    // 4. Update comment
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: `COMMENT#${commentId}`,
        },
        UpdateExpression: 'SET content = :content, isEdited = :isEdited, editedAt = :editedAt',
        ExpressionAttributeValues: {
          ':content': data.content.trim(),
          ':isEdited': true,
          ':editedAt': now,
        },
      })
    );

    // 5. Return updated comment
    const updatedComment = await this.getComment(postId, commentId);
    if (!updatedComment) {
      throw new Error('Failed to retrieve updated comment');
    }

    return updatedComment;
  }

  /**
   * Delete a comment
   */
  async deleteComment(postId: string, commentId: string, userId: string): Promise<void> {
    // 1. Get existing comment
    const comment = await this.getComment(postId, commentId);
    if (!comment) {
      throw new Error('Comment not found');
    }

    // 2. Verify ownership
    if (comment.authorId !== userId) {
      throw new Error('You can only delete your own comments');
    }

    // 3. Delete comment
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: `COMMENT#${commentId}`,
        },
      })
    );

    // 4. Decrement post comment count
    await this.decrementPostCommentCount(postId);

    // TODO: Delete all replies to this comment (if it's a parent comment)
  }

  /**
   * Increment post comment count
   */
  private async incrementPostCommentCount(postId: string): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET comments = if_not_exists(comments, :zero) + :inc',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':inc': 1,
        },
      })
    );
  }

  /**
   * Decrement post comment count
   */
  private async decrementPostCommentCount(postId: string): Promise<void> {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `POST#${postId}`,
          SK: 'METADATA',
        },
        UpdateExpression: 'SET comments = if_not_exists(comments, :one) - :dec',
        ExpressionAttributeValues: {
          ':one': 1,
          ':dec': 1,
        },
      })
    );
  }

  /**
   * Send comment notification (direct DynamoDB write)
   * In-app notification only - no push notification needed for web app
   */
  private async sendCommentNotification(
    commenterId: string,
    targetId: string,
    postId: string,
    commentId: string,
    notificationType: 'new_comment' | 'comment_reply' | 'mention'
  ): Promise<void> {
    // For new_comment, targetId is postId - need to get post author
    // For mention, targetId is the mentioned user's ID
    let recipientId = targetId;

    if (notificationType === 'new_comment') {
      // Get post to find author
      const result = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `POST#${postId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        return;
      }

      recipientId = result.Item.authorId;
    }

    // Don't notify if user comments on own content
    if (recipientId === commenterId) {
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
            PK: `USER#${recipientId}`,
            SK: `NOTIFICATION#${now}#${notificationId}`,
            notificationId,
            recipientId,
            type: notificationType,
            actorId: commenterId,
            resourceId: commentId,
            resourceType: 'comment',
            metadata: { postId, commentId },
            isRead: false,
            createdAt: now,
            ttl,
          },
        })
      );
    } catch (error) {
      console.error('Failed to save comment notification:', error);
      // Don't throw - notification failure shouldn't block comment
    }
  }
}
