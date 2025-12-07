/**
 * Feed Service
 *
 * Business logic for social feed generation and ranking
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import { Post } from '../models/post.model';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Use DYNAMODB_TABLE for consistency across all modules
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Feed result with pagination
 */
interface FeedResult {
  posts: Post[];
  lastKey?: Record<string, unknown>;
}

/**
 * User data for feed ranking
 */
interface UserData {
  username: string;
  friends: string[];
  savedRecipes: Array<{ ingredients: string[] }>;
}

/**
 * Feed Service Class
 */
export class FeedService {
  /**
   * Get personalized feed for user (Facebook-like privacy)
   *
   * Privacy rules:
   * - Own posts: ALL (public, friends, private) always visible
   * - Friends' posts: public + friends visible
   * - Others' posts: only public visible
   *
   * Sorted by time (newest first)
   *
   * @param userId - Cognito sub (UUID) - used as authorId in posts
   */
  async getPersonalizedFeed(
    userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<FeedResult> {
    try {
      // 1. Get user data (friends list)
      const userData = await this.getUserData(userId);

      // 2. Get user's OWN posts (all privacy levels)
      const ownPosts = await this.getOwnPosts(userId, limit);

      // 3. Get friends' posts (public + friends privacy)
      const friendPosts = await this.getFriendsPosts(userData.friends, limit * 2);

      // 4. Get public posts from others
      const publicPosts = await this.getPublicPosts(limit);

      // 5. Combine and deduplicate
      const allPosts = this.deduplicatePosts([...ownPosts, ...friendPosts, ...publicPosts]);

      // 6. Apply privacy filtering (Facebook-like)
      const visiblePosts = await this.filterPostsByPrivacy(allPosts, userId, userData.friends);

      // 7. Sort by time (newest first) - NOT by score
      const sortedPosts = visiblePosts.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // 8. Simple pagination (in-memory)
      const startIndex = lastKey ? (lastKey.index as number) : 0;
      const endIndex = startIndex + limit;
      const paginatedPosts = sortedPosts.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        lastKey: endIndex < sortedPosts.length ? { index: endIndex } : undefined,
      };
    } catch (error) {
      console.error('Error in getPersonalizedFeed:', error);
      return {
        posts: [],
        lastKey: undefined,
      };
    }
  }

  /**
   * Get trending feed (sorted by engagement)
   * @param userId - Cognito sub (UUID)
   */
  async getTrendingFeed(
    userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<FeedResult> {
    // Query GSI3 for trending posts
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'POST#TRENDING',
        },
        ScanIndexForward: false, // Sort by engagement descending
        Limit: limit * 2, // Get more for filtering
        ExclusiveStartKey: lastKey,
      })
    );

    const posts = (result.Items || []) as Post[];

    // Get user's friends for privacy filtering
    const friends = await this.getUserFriends(userId);

    // Apply privacy filtering
    const visiblePosts = await this.filterPostsByPrivacy(posts, userId, friends);

    // Paginate
    const paginatedPosts = visiblePosts.slice(0, limit);

    return {
      posts: paginatedPosts,
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Get friends feed (only friends' posts)
   * @param userId - Cognito sub (UUID)
   */
  async getFriendsFeed(
    userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<FeedResult> {
    // 1. Get user's friends
    const friends = await this.getUserFriends(userId);

    if (friends.length === 0) {
      return { posts: [] };
    }

    // 2. Get posts from friends
    const friendPosts = await this.getFriendsPosts(friends, limit * 2);

    // 3. Apply privacy filtering (should all be visible since they're friends)
    const visiblePosts = await this.filterPostsByPrivacy(friendPosts, userId, friends);

    // 4. Sort by recency
    const sortedPosts = visiblePosts.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Simple pagination
    const startIndex = lastKey ? (lastKey.index as number) : 0;
    const endIndex = startIndex + limit;
    const paginatedPosts = sortedPosts.slice(startIndex, endIndex);

    return {
      posts: paginatedPosts,
      lastKey: endIndex < sortedPosts.length ? { index: endIndex } : undefined,
    };
  }

  /**
   * Get discover feed (public posts only)
   * @param userId - Cognito sub (UUID)
   */
  async getDiscoverFeed(
    userId: string,
    limit: number = 20,
    lastKey?: Record<string, unknown>
  ): Promise<FeedResult> {
    // Query GSI2 for public posts
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'POST#PUBLIC',
        },
        ScanIndexForward: false, // Sort by timestamp descending
        Limit: limit,
        ExclusiveStartKey: lastKey,
      })
    );

    const posts = (result.Items || []) as Post[];

    // Filter out hidden posts and posts from blocked users
    const visiblePosts = await this.filterHiddenAndBlocked(posts, userId);

    return {
      posts: visiblePosts,
      lastKey: result.LastEvaluatedKey,
    };
  }

  /**
   * Calculate feed score for ranking
   * Score components:
   * - Recency (0-40 points)
   * NOTE: Score-based ranking removed - now using time-based sorting
   */

  /**
   * Get user data for feed
   * @param userId - Cognito sub (UUID)
   */
  private async getUserData(userId: string): Promise<UserData> {
    // Get user's friends
    const friends = await this.getUserFriends(userId);

    // Get user's saved recipes (for interest alignment)
    // For now, return empty array - can be enhanced later
    const savedRecipes: Array<{ ingredients: string[] }> = [];

    return {
      username: userId, // Using userId as identifier
      friends,
      savedRecipes,
    };
  }

  /**
   * Get user's friends list
   * @param userId - Cognito sub (UUID)
   */
  private async getUserFriends(userId: string): Promise<string[]> {
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
        ProjectionExpression: 'friendId',
      })
    );

    return (result.Items || []).map((item) => item.friendId);
  }

  /**
   * Get user's own posts (all privacy levels)
   * @param userId - Cognito sub (UUID) - matches authorId in posts
   */
  private async getOwnPosts(userId: string, limit: number): Promise<Post[]> {
    // Query user's non-public posts (friends + private)
    // GSI2PK = POST#{authorId} for non-public posts
    const privatePostsResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `POST#${userId}`,
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    // Query user's public posts with pagination
    // DynamoDB applies Limit BEFORE FilterExpression, so we need to paginate
    // to find all posts by this user among all public posts
    const publicPosts: Post[] = [];
    let publicPaginationKey: Record<string, unknown> | undefined = undefined;
    const maxIterations = 5; // Safety limit
    let iterations = 0;
    let hasMorePublicPosts = true;

    while (hasMorePublicPosts && iterations < maxIterations && publicPosts.length < limit) {
      const publicQueryResult: QueryCommandOutput = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          FilterExpression: 'authorId = :authorId',
          ExpressionAttributeValues: {
            ':pk': 'POST#PUBLIC',
            ':authorId': userId,
          },
          ScanIndexForward: false,
          Limit: 100, // Scan more items per iteration
          ExclusiveStartKey: publicPaginationKey,
        })
      );

      publicPosts.push(...((publicQueryResult.Items || []) as Post[]));
      publicPaginationKey = publicQueryResult.LastEvaluatedKey;
      hasMorePublicPosts = !!publicPaginationKey;
      iterations++;
    }

    return [...((privatePostsResult.Items || []) as Post[]), ...publicPosts];
  }

  /**
   * Get posts from friends (public + friends privacy)
   * Friends can see: public posts + friends-only posts
   */
  private async getFriendsPosts(friendIds: string[], limit: number): Promise<Post[]> {
    if (friendIds.length === 0) {
      return [];
    }

    // Query posts for each friend (up to first 10 friends for performance)
    const limitedFriends = friendIds.slice(0, 10);
    const perFriendLimit = Math.ceil(limit / limitedFriends.length);

    const postPromises = limitedFriends.map(async (friendId) => {
      // Get friend's non-public posts (friends privacy - visible to friends)
      const friendsOnlyResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          FilterExpression: 'privacyLevel = :friends', // Only friends privacy, not private
          ExpressionAttributeValues: {
            ':pk': `POST#${friendId}`,
            ':friends': 'friends',
          },
          ScanIndexForward: false,
          Limit: perFriendLimit,
        })
      );

      // Get friend's public posts
      const publicResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :pk',
          FilterExpression: 'authorId = :authorId',
          ExpressionAttributeValues: {
            ':pk': 'POST#PUBLIC',
            ':authorId': friendId,
          },
          ScanIndexForward: false,
          Limit: perFriendLimit,
        })
      );

      return [
        ...((friendsOnlyResult.Items || []) as Post[]),
        ...((publicResult.Items || []) as Post[]),
      ];
    });

    const results = await Promise.all(postPromises);
    return results.flat();
  }

  /**
   * Get public posts
   */
  private async getPublicPosts(limit: number): Promise<Post[]> {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'POST#PUBLIC',
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (result.Items || []) as Post[];
  }

  /**
   * Deduplicate posts by postId
   */
  private deduplicatePosts(posts: Post[]): Post[] {
    const seen = new Set<string>();
    return posts.filter((post) => {
      if (seen.has(post.postId)) {
        return false;
      }
      seen.add(post.postId);
      return true;
    });
  }

  /**
   * Filter posts by privacy settings
   */
  private async filterPostsByPrivacy(
    posts: Post[],
    viewerId: string,
    viewerFriends: string[]
  ): Promise<Post[]> {
    const filtered = await Promise.all(
      posts.map(async (post) => {
        const canView = await this.canViewPost(post, viewerId, viewerFriends);
        return canView ? post : null;
      })
    );

    return filtered.filter((post) => post !== null) as Post[];
  }

  /**
   * Check if viewer can view post based on privacy settings
   */
  private async canViewPost(
    post: Post,
    viewerId: string,
    viewerFriends: string[]
  ): Promise<boolean> {
    // Hidden posts cannot be viewed by anyone (including author)
    // Author can only view hidden posts via violations page
    if (post.status === 'hidden') {
      return false;
    }

    // Author can always view own non-hidden posts
    if (post.authorId === viewerId) {
      return true;
    }

    // Public posts visible to all
    if (post.privacyLevel === 'public') {
      return true;
    }

    // Private posts only visible to author
    if (post.privacyLevel === 'private') {
      return false;
    }

    // Friends posts visible to friends
    if (post.privacyLevel === 'friends') {
      return viewerFriends.includes(post.authorId);
    }

    return false;
  }

  /**
   * Filter out hidden posts and posts from blocked users
   */
  private async filterHiddenAndBlocked(posts: Post[], viewerId: string): Promise<Post[]> {
    // Get blocked users
    const blockedUsers = await this.getBlockedUsers(viewerId);

    return posts.filter((post) => {
      // Filter hidden posts
      if (post.status === 'hidden') {
        return false;
      }

      // Filter posts from blocked users
      if (blockedUsers.includes(post.authorId)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get list of blocked users
   */
  private async getBlockedUsers(userId: string): Promise<string[]> {
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
        ProjectionExpression: 'friendId',
      })
    );

    return (result.Items || []).map((item) => item.friendId);
  }
}
