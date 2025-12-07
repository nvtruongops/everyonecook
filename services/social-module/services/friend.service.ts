/**
 * Friend Service
 *
 * Business logic for friend management
 *
 * IMPORTANT: This service uses userId (Cognito sub) as the primary identifier
 * to maintain consistency with auth-module's profile schema:
 * - PK: USER#{userId} (Cognito sub)
 * - SK: FRIEND#{friendUserId}
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
import { Friendship, FriendListItem, FriendRequestItem } from '../models/friend.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Friend Service Class
 *
 * All methods now accept userId (Cognito sub) instead of username
 * to maintain schema consistency with auth-module
 */
export class FriendService {
  /**
   * Send a friend request
   * @param userId - Current user's userId (Cognito sub)
   * @param friendUserId - Friend's userId (Cognito sub)
   */
  async sendFriendRequest(userId: string, friendUserId: string): Promise<Friendship> {
    // 1. Check if sending request to self
    if (userId === friendUserId) {
      throw new Error('Cannot send friend request to yourself');
    }

    // 2. Check if friendship already exists
    const existingFriendship = await this.getFriendship(userId, friendUserId);
    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        throw new Error('You are already friends with this user');
      }
      if (existingFriendship.status === 'pending') {
        throw new Error('Friend request already sent');
      }
      if (existingFriendship.status === 'blocked') {
        throw new Error('Cannot send friend request to blocked user');
      }
    }

    // 3. Check if reverse friendship exists (they sent request to us)
    const reverseFriendship = await this.getFriendship(friendUserId, userId);
    if (reverseFriendship) {
      if (reverseFriendship.status === 'pending') {
        // Auto-accept if they already sent us a request
        return await this.acceptFriendRequest(userId, friendUserId);
      }
      if (reverseFriendship.status === 'blocked') {
        throw new Error('This user has blocked you');
      }
    }

    // 4. Check rate limit (50 requests/day)
    await this.checkRateLimit(userId, 'send_friend_request', 50);

    // 5. Create friendship record using userId (Cognito sub)
    const now = new Date().toISOString();
    const friendship: Friendship = {
      PK: `USER#${userId}`,
      SK: `FRIEND#${friendUserId}`,
      userId: userId,
      friendId: friendUserId,
      status: 'pending',
      requestedBy: userId,
      createdAt: now,
      GSI1PK: `USER#${friendUserId}`,
      GSI1SK: `FRIEND#${userId}`,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: friendship,
      })
    );

    // 6. Send notification
    await this.sendNotification({
      type: 'friend_request',
      recipientId: friendUserId,
      actorId: userId,
      resourceId: userId,
      timestamp: now,
    });

    return friendship;
  }

  /**
   * Accept a friend request
   * @param userId - Current user's userId (Cognito sub)
   * @param friendUserId - Friend's userId (Cognito sub)
   */
  async acceptFriendRequest(userId: string, friendUserId: string): Promise<Friendship> {
    // 1. Get existing friendship (friend sent request to us)
    const friendship = await this.getFriendship(friendUserId, userId);
    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.status === 'accepted') {
      throw new Error('Friend request already accepted');
    }

    if (friendship.status === 'blocked') {
      throw new Error('Cannot accept request from blocked user');
    }

    // 2. Update friendship status to accepted
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${friendUserId}`,
          SK: `FRIEND#${userId}`,
        },
        UpdateExpression: 'SET #status = :accepted, acceptedAt = :now',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':accepted': 'accepted',
          ':now': now,
        },
      })
    );

    // 3. Create bidirectional friendship (reverse record)
    const reverseFriendship: Friendship = {
      PK: `USER#${userId}`,
      SK: `FRIEND#${friendUserId}`,
      userId: userId,
      friendId: friendUserId,
      status: 'accepted',
      requestedBy: friendUserId,
      createdAt: friendship.createdAt,
      acceptedAt: now,
      GSI1PK: `USER#${friendUserId}`,
      GSI1SK: `FRIEND#${userId}`,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: reverseFriendship,
      })
    );

    // 4. Send notification
    await this.sendNotification({
      type: 'friend_accepted',
      recipientId: friendUserId,
      actorId: userId,
      resourceId: userId,
      timestamp: now,
    });

    // 5. Return updated friendship
    const updatedFriendship = await this.getFriendship(friendUserId, userId);
    if (!updatedFriendship) {
      throw new Error('Failed to retrieve updated friendship');
    }

    return updatedFriendship;
  }

  /**
   * Reject a friend request
   * @param userId - Current user's userId (Cognito sub)
   * @param friendUserId - Friend's userId (Cognito sub)
   */
  async rejectFriendRequest(userId: string, friendUserId: string): Promise<void> {
    // 1. Get existing friendship (friend sent request to us)
    const friendship = await this.getFriendship(friendUserId, userId);
    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.status === 'accepted') {
      throw new Error('Cannot reject an accepted friendship');
    }

    // 2. Delete friendship record
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${friendUserId}`,
          SK: `FRIEND#${userId}`,
        },
      })
    );
  }

  /**
   * Cancel a friend request (sender cancels their own request)
   * @param userId - Current user's userId (Cognito sub) - the sender
   * @param friendUserId - Friend's userId (Cognito sub) - the recipient
   */
  async cancelFriendRequest(userId: string, friendUserId: string): Promise<void> {
    // 1. Get existing friendship (I sent request to friend)
    const friendship = await this.getFriendship(userId, friendUserId);
    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.status === 'accepted') {
      throw new Error('Cannot cancel an accepted friendship. Use unfriend instead.');
    }

    if (friendship.status === 'blocked') {
      throw new Error('Cannot cancel a blocked relationship');
    }

    if (friendship.status !== 'pending') {
      throw new Error('No pending friend request to cancel');
    }

    // 2. Delete friendship record
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `FRIEND#${friendUserId}`,
        },
      })
    );
  }

  /**
   * Unfriend a user (remove friendship)
   * @param userId - Current user's userId (Cognito sub)
   * @param friendUserId - Friend's userId (Cognito sub)
   */
  async unfriend(userId: string, friendUserId: string): Promise<void> {
    // 1. Get existing friendship
    const friendship = await this.getFriendship(userId, friendUserId);
    if (!friendship) {
      throw new Error('Friendship not found');
    }

    if (friendship.status !== 'accepted') {
      throw new Error('Can only unfriend accepted friendships');
    }

    // 2. Delete both friendship records (bidirectional)
    await Promise.all([
      docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${userId}`,
            SK: `FRIEND#${friendUserId}`,
          },
        })
      ),
      docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${friendUserId}`,
            SK: `FRIEND#${userId}`,
          },
        })
      ),
    ]);
  }

  /**
   * Block a user
   * @param userId - Current user's userId (Cognito sub)
   * @param blockedUserId - Blocked user's userId (Cognito sub)
   */
  async blockUser(userId: string, blockedUserId: string): Promise<Friendship> {
    // 1. Validate not blocking self
    if (userId === blockedUserId) {
      throw new Error('Cannot block yourself');
    }

    // 2. Check if friendship exists
    const existingFriendship = await this.getFriendship(userId, blockedUserId);

    // 3. If friendship exists and is accepted, delete reverse record
    if (existingFriendship && existingFriendship.status === 'accepted') {
      await docClient.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: {
            PK: `USER#${blockedUserId}`,
            SK: `FRIEND#${userId}`,
          },
        })
      );
    }

    // 4. Create or update block record
    const now = new Date().toISOString();
    const blockRecord: Friendship = {
      PK: `USER#${userId}`,
      SK: `FRIEND#${blockedUserId}`,
      userId: userId,
      friendId: blockedUserId,
      status: 'blocked',
      requestedBy: userId,
      createdAt: existingFriendship?.createdAt || now,
      GSI1PK: `USER#${blockedUserId}`,
      GSI1SK: `FRIEND#${userId}`,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: blockRecord,
      })
    );

    return blockRecord;
  }

  /**
   * Unblock a user
   * @param userId - Current user's userId (Cognito sub)
   * @param blockedUserId - Blocked user's userId (Cognito sub)
   */
  async unblockUser(userId: string, blockedUserId: string): Promise<void> {
    // 1. Get existing block record
    const blockRecord = await this.getFriendship(userId, blockedUserId);
    if (!blockRecord) {
      throw new Error('Block record not found');
    }

    if (blockRecord.status !== 'blocked') {
      throw new Error('User is not blocked');
    }

    // 2. Delete block record
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `FRIEND#${blockedUserId}`,
        },
      })
    );
  }

  /**
   * Get user's friends list
   * @param userId - Current user's userId (Cognito sub)
   */
  async getFriendsList(userId: string): Promise<FriendListItem[]> {
    // Query all friendships for user
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :userId AND begins_with(SK, :friend)',
        FilterExpression: '#status = :accepted',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':userId': `USER#${userId}`,
          ':friend': 'FRIEND#',
          ':accepted': 'accepted',
        },
      })
    );

    const friendships = (result.Items || []) as Friendship[];

    // Get user profiles for each friend
    const friendProfiles = await Promise.all(
      friendships.map(async (friendship) => {
        const profile = await this.getUserProfile(friendship.friendId);
        return {
          userId: friendship.friendId,
          username: profile?.username || 'Unknown',
          fullName: profile?.fullName || 'Unknown User',
          avatarUrl: profile?.avatarUrl,
          status: friendship.status,
          createdAt: friendship.createdAt,
          acceptedAt: friendship.acceptedAt,
        };
      })
    );

    return friendProfiles;
  }

  /**
   * Get pending friend requests (received)
   * @param userId - Current user's userId (Cognito sub)
   */
  async getPendingRequests(userId: string): Promise<FriendRequestItem[]> {
    // Query using GSI1 to find all pending requests sent to this user
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :userId AND begins_with(GSI1SK, :friend)',
        FilterExpression: '#status = :pending',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':userId': `USER#${userId}`,
          ':friend': 'FRIEND#',
          ':pending': 'pending',
        },
      })
    );

    const requests = (result.Items || []) as Friendship[];

    // Get user profiles for each requester
    const requestProfiles = await Promise.all(
      requests.map(async (request) => {
        const profile = await this.getUserProfile(request.userId);
        return {
          requestId: `${request.userId}#${request.friendId}`,
          fromUserId: request.userId,
          fromUsername: profile?.username || 'Unknown',
          fromFullName: profile?.fullName || 'Unknown User',
          fromAvatarUrl: profile?.avatarUrl,
          createdAt: request.createdAt,
        };
      })
    );

    return requestProfiles;
  }

  /**
   * Get sent friend requests (requests I sent to others)
   * @param userId - Current user's userId (Cognito sub)
   */
  async getSentRequests(userId: string): Promise<FriendRequestItem[]> {
    // Query all friendships where I am the sender and status is pending
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :userId AND begins_with(SK, :friend)',
        FilterExpression: '#status = :pending',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':userId': `USER#${userId}`,
          ':friend': 'FRIEND#',
          ':pending': 'pending',
        },
      })
    );

    const requests = (result.Items || []) as Friendship[];

    // Get user profiles for each recipient
    const requestProfiles = await Promise.all(
      requests.map(async (request) => {
        const profile = await this.getUserProfile(request.friendId);
        return {
          requestId: `${request.userId}#${request.friendId}`,
          fromUserId: request.friendId, // The person we sent request to
          fromUsername: profile?.username || 'Unknown',
          fromFullName: profile?.fullName || 'Unknown User',
          fromAvatarUrl: profile?.avatarUrl,
          createdAt: request.createdAt,
        };
      })
    );

    return requestProfiles;
  }

  /**
   * Get blocked users list
   * @param userId - Current user's userId (Cognito sub)
   */
  async getBlockedUsers(userId: string): Promise<FriendListItem[]> {
    // Query all blocked relationships for user
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :userId AND begins_with(SK, :friend)',
        FilterExpression: '#status = :blocked',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':userId': `USER#${userId}`,
          ':friend': 'FRIEND#',
          ':blocked': 'blocked',
        },
      })
    );

    const blockRecords = (result.Items || []) as Friendship[];

    // Get user profiles for each blocked user
    const blockedProfiles = await Promise.all(
      blockRecords.map(async (record) => {
        const profile = await this.getUserProfile(record.friendId);
        return {
          userId: record.friendId,
          username: profile?.username || 'Unknown',
          fullName: profile?.fullName || 'Unknown User',
          avatarUrl: profile?.avatarUrl,
          status: record.status,
          createdAt: record.createdAt,
        };
      })
    );

    return blockedProfiles;
  }

  /**
   * Check if two users are friends
   * @param userId - First user's userId (Cognito sub)
   * @param friendUserId - Second user's userId (Cognito sub)
   */
  async areFriends(userId: string, friendUserId: string): Promise<boolean> {
    const friendship = await this.getFriendship(userId, friendUserId);
    return friendship?.status === 'accepted';
  }

  /**
   * Get friendship status between two users
   * Returns detailed status including pending requests
   * @param userId - Current user's userId (Cognito sub)
   * @param targetUserId - Target user's userId (Cognito sub)
   */
  async getFriendshipStatus(
    userId: string,
    targetUserId: string
  ): Promise<{
    status: 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'blocked' | 'blocked_by';
    friendship?: Friendship;
  }> {
    // Self check
    if (userId === targetUserId) {
      return { status: 'none' };
    }

    // Check if current user has a relationship with target
    const myRelationship = await this.getFriendship(userId, targetUserId);

    if (myRelationship) {
      if (myRelationship.status === 'accepted') {
        return { status: 'friends', friendship: myRelationship };
      }
      if (myRelationship.status === 'blocked') {
        return { status: 'blocked', friendship: myRelationship };
      }
      if (myRelationship.status === 'pending') {
        // I sent the request
        return { status: 'pending_sent', friendship: myRelationship };
      }
    }

    // Check if target user has a relationship with current user
    const theirRelationship = await this.getFriendship(targetUserId, userId);

    if (theirRelationship) {
      if (theirRelationship.status === 'accepted') {
        return { status: 'friends', friendship: theirRelationship };
      }
      if (theirRelationship.status === 'blocked') {
        return { status: 'blocked_by' };
      }
      if (theirRelationship.status === 'pending') {
        // They sent me a request
        return { status: 'pending_received', friendship: theirRelationship };
      }
    }

    return { status: 'none' };
  }

  /**
   * Get friendship between two users
   * @param userId - First user's userId (Cognito sub)
   * @param friendUserId - Second user's userId (Cognito sub)
   */
  private async getFriendship(userId: string, friendUserId: string): Promise<Friendship | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `FRIEND#${friendUserId}`,
        },
      })
    );

    return result.Item ? (result.Item as Friendship) : null;
  }

  /**
   * Get user profile (basic info) by userId
   * @param userId - User's userId (Cognito sub)
   */
  private async getUserProfile(
    userId: string
  ): Promise<{ username: string; fullName: string; avatarUrl?: string } | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: 'PROFILE',
        },
        ProjectionExpression: 'username, fullName, avatarUrl',
      })
    );

    return result.Item
      ? {
          username: result.Item.username,
          fullName: result.Item.fullName,
          avatarUrl: result.Item.avatarUrl,
        }
      : null;
  }

  /**
   * Check rate limit
   */
  private async checkRateLimit(
    username: string,
    action: string,
    limit: number,
    windowSeconds: number = 86400
  ): Promise<void> {
    const key = `RATE_LIMIT#${username}#${action}`;
    const now = Math.floor(Date.now() / 1000);

    // Get current count
    const record = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: key, SK: 'METADATA' },
      })
    );

    if (!record.Item) {
      // First request, create record
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: key,
            SK: 'METADATA',
            count: 1,
            resetAt: now + windowSeconds,
            ttl: now + windowSeconds,
          },
        })
      );
      return;
    }

    // Check if window expired
    if (now >= record.Item.resetAt) {
      // Reset counter
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: key,
            SK: 'METADATA',
            count: 1,
            resetAt: now + windowSeconds,
            ttl: now + windowSeconds,
          },
        })
      );
      return;
    }

    // Check if limit exceeded
    if (record.Item.count >= limit) {
      throw new Error(`Rate limit exceeded: Maximum ${limit} ${action} per day`);
    }

    // Increment counter
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: key, SK: 'METADATA' },
        UpdateExpression: 'SET #count = #count + :inc',
        ExpressionAttributeNames: { '#count': 'count' },
        ExpressionAttributeValues: { ':inc': 1 },
      })
    );
  }

  /**
   * Send notification (direct DynamoDB write)
   * In-app notification only - no push notification needed for web app
   */
  private async sendNotification(message: {
    type: string;
    recipientId: string;
    actorId: string;
    resourceId: string;
    timestamp: string;
  }): Promise<void> {
    const notificationId = uuidv4();
    const now = message.timestamp;
    const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${message.recipientId}`,
            SK: `NOTIFICATION#${now}#${notificationId}`,
            notificationId,
            recipientId: message.recipientId,
            type: message.type,
            actorId: message.actorId,
            resourceId: message.resourceId,
            resourceType: 'user',
            isRead: false,
            createdAt: now,
            ttl,
          },
        })
      );
    } catch (error) {
      console.error('Failed to save friend notification:', error);
      // Don't throw - notification failure shouldn't block friend action
    }
  }
}
