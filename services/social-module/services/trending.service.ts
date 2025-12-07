/**
 * Trending Service
 *
 * Weekly trending for:
 * 1. Top Searches - Keywords searched most
 * 2. Top Posts - Posts with most likes
 *
 * Reset: 00:00 Monday weekly
 * TTL: 14 days (keep 1 week backup)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const TTL_DAYS = 7; // Only keep current week data

/**
 * Search trending item
 */
export interface SearchTrendingItem {
  term: string;
  searchCount: number;
  weekId: string;
}

/**
 * Post trending item
 */
export interface PostTrendingItem {
  postId: string;
  title: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  image?: string;
  likesThisWeek: number;
  weekId: string;
}

/**
 * Trending result
 */
interface TrendingResult<T> {
  items: T[];
  weekId: string;
}

export class TrendingService {
  /**
   * Get current week ID (ISO week format: YYYY-Www)
   */
  getCurrentWeekId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const weekNum = this.getISOWeekNumber(now);
    return `${year}-W${weekNum.toString().padStart(2, '0')}`;
  }

  private getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private getTTL(): number {
    return Math.floor(Date.now() / 1000) + TTL_DAYS * 24 * 60 * 60;
  }

  private normalizeSearchTerm(term: string): string {
    return term
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-');
  }

  // ============================================
  // TRACK SEARCH
  // ============================================

  /**
   * Track a search event (combined - no type distinction)
   */
  async trackSearch(searchTerm: string): Promise<void> {
    const weekId = this.getCurrentWeekId();
    const normalized = this.normalizeSearchTerm(searchTerm);
    const pk = `TRENDING#SEARCH#${weekId}`;
    const sk = `TERM#${normalized}`;

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `
            SET searchCount = if_not_exists(searchCount, :zero) + :one,
                term = :term,
                weekId = :weekId,
                updatedAt = :now,
                #ttl = :ttl,
                GSI4PK = :gsi4pk,
                GSI4SK = :gsi4sk
          `,
          ExpressionAttributeNames: {
            '#ttl': 'ttl',
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':term': searchTerm,
            ':weekId': weekId,
            ':now': Date.now(),
            ':ttl': this.getTTL(),
            ':gsi4pk': pk,
            ':gsi4sk': `COUNT#${Date.now()}`,
          },
        })
      );

      // Update GSI4SK with actual count for sorting
      const item = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
        })
      );

      if (item.Item) {
        const count = item.Item.searchCount || 0;
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
            UpdateExpression: 'SET GSI4SK = :gsi4sk',
            ExpressionAttributeValues: {
              ':gsi4sk': `COUNT#${String(count).padStart(10, '0')}`,
            },
          })
        );
      }
    } catch (error) {
      console.error('Error tracking search:', error);
    }
  }

  // ============================================
  // TRACK POST LIKE
  // ============================================

  async trackPostLike(
    postId: string,
    title: string,
    authorId: string,
    authorName: string,
    authorAvatar?: string,
    image?: string
  ): Promise<void> {
    const weekId = this.getCurrentWeekId();
    const pk = `TRENDING#LIKES#${weekId}`;
    const sk = `POST#${postId}`;

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
          UpdateExpression: `
            SET likesThisWeek = if_not_exists(likesThisWeek, :zero) + :one,
                postId = :postId,
                title = :title,
                authorId = :authorId,
                authorName = :authorName,
                weekId = :weekId,
                updatedAt = :now,
                #ttl = :ttl,
                GSI4PK = :gsi4pk
                ${authorAvatar ? ', authorAvatar = :authorAvatar' : ''}
                ${image ? ', image = :image' : ''}
          `,
          ExpressionAttributeNames: {
            '#ttl': 'ttl',
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':postId': postId,
            ':title': title,
            ':authorId': authorId,
            ':authorName': authorName,
            ':weekId': weekId,
            ':now': Date.now(),
            ':ttl': this.getTTL(),
            ':gsi4pk': pk,
            ...(authorAvatar && { ':authorAvatar': authorAvatar }),
            ...(image && { ':image': image }),
          },
        })
      );

      // Update GSI4SK with actual count for sorting
      const item = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
        })
      );

      if (item.Item) {
        const count = item.Item.likesThisWeek || 0;
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
            UpdateExpression: 'SET GSI4SK = :gsi4sk',
            ExpressionAttributeValues: {
              ':gsi4sk': `LIKES#${String(count).padStart(10, '0')}`,
            },
          })
        );
      }
    } catch (error) {
      console.error('Error tracking post like:', error);
    }
  }

  async untrackPostLike(postId: string): Promise<void> {
    const weekId = this.getCurrentWeekId();
    const pk = `TRENDING#LIKES#${weekId}`;
    const sk = `POST#${postId}`;

    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
          UpdateExpression: 'SET likesThisWeek = likesThisWeek - :one',
          ConditionExpression: 'attribute_exists(PK) AND likesThisWeek > :zero',
          ExpressionAttributeValues: {
            ':one': 1,
            ':zero': 0,
          },
        })
      );

      // Update GSI4SK
      const item = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { PK: pk, SK: sk },
        })
      );

      if (item.Item) {
        const count = Math.max(0, item.Item.likesThisWeek || 0);
        await docClient.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { PK: pk, SK: sk },
            UpdateExpression: 'SET GSI4SK = :gsi4sk',
            ExpressionAttributeValues: {
              ':gsi4sk': `LIKES#${String(count).padStart(10, '0')}`,
            },
          })
        );
      }
    } catch (error) {
      console.error('Error untracking post like:', error);
    }
  }

  // ============================================
  // GET TRENDING
  // ============================================

  /**
   * Get top searches this week (combined)
   */
  async getTopSearches(limit: number = 10): Promise<TrendingResult<SearchTrendingItem>> {
    const weekId = this.getCurrentWeekId();
    const pk = `TRENDING#SEARCH#${weekId}`;

    try {
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI4',
          KeyConditionExpression: 'GSI4PK = :pk AND begins_with(GSI4SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':prefix': 'COUNT#',
          },
          ScanIndexForward: false,
          Limit: limit,
        })
      );

      const items = (result.Items || []).map((item) => ({
        term: item.term,
        searchCount: item.searchCount || 0,
        weekId: item.weekId,
      }));

      return { items, weekId };
    } catch (error) {
      console.error('Error getting top searches:', error);
      return { items: [], weekId };
    }
  }

  /**
   * Get top liked posts this week
   * Enriches posts with user info if authorName is missing or "Unknown"
   * Filters out deleted posts
   */
  async getTopLikedPosts(limit: number = 10): Promise<TrendingResult<PostTrendingItem>> {
    const weekId = this.getCurrentWeekId();
    const pk = `TRENDING#LIKES#${weekId}`;

    try {
      // Fetch more items to account for deleted posts
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'GSI4',
          KeyConditionExpression: 'GSI4PK = :pk AND begins_with(GSI4SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': pk,
            ':prefix': 'LIKES#',
          },
          ScanIndexForward: false,
          Limit: limit * 2, // Fetch extra to account for deleted posts
        })
      );

      // Enrich posts with user info and validate post exists
      const enrichedItems = await Promise.all(
        (result.Items || []).map(async (item) => {
          let authorName = item.authorName;
          let authorAvatar = item.authorAvatar;

          // Check if post still exists
          try {
            const postResult = await docClient.send(
              new GetCommand({
                TableName: TABLE_NAME,
                Key: { PK: `POST#${item.postId}`, SK: 'METADATA' },
              })
            );

            // Post doesn't exist or is deleted
            if (!postResult.Item || postResult.Item.status === 'deleted') {
              return null;
            }
          } catch (postError) {
            console.error('Error checking post existence:', postError);
            return null;
          }

          // Fetch user info if authorName is missing or "Unknown"
          if ((!authorName || authorName === 'Unknown') && item.authorId) {
            try {
              const userResult = await docClient.send(
                new GetCommand({
                  TableName: TABLE_NAME,
                  Key: { PK: `USER#${item.authorId}`, SK: 'PROFILE' },
                })
              );
              if (userResult.Item) {
                authorName = userResult.Item.username || userResult.Item.userId || 'Unknown';
                authorAvatar = authorAvatar || userResult.Item.avatarUrl;

                // Update trending record with correct authorName for future queries
                if (authorName !== 'Unknown') {
                  await docClient.send(
                    new UpdateCommand({
                      TableName: TABLE_NAME,
                      Key: { PK: pk, SK: `POST#${item.postId}` },
                      UpdateExpression:
                        'SET authorName = :authorName' +
                        (authorAvatar ? ', authorAvatar = :authorAvatar' : ''),
                      ExpressionAttributeValues: {
                        ':authorName': authorName,
                        ...(authorAvatar && { ':authorAvatar': authorAvatar }),
                      },
                    })
                  );
                }
              }
            } catch (userError) {
              console.error('Error fetching user for trending post:', userError);
            }
          }

          return {
            postId: item.postId,
            title: item.title || '',
            authorId: item.authorId,
            authorName: authorName || 'Unknown',
            authorAvatar: authorAvatar,
            image: item.image,
            likesThisWeek: item.likesThisWeek || 0,
            weekId: item.weekId,
          };
        })
      );

      // Filter out null items (deleted posts) and limit to requested count
      const items = enrichedItems
        .filter((item) => item !== null)
        .slice(0, limit) as PostTrendingItem[];

      return { items, weekId };
    } catch (error) {
      console.error('Error getting top liked posts:', error);
      return { items: [], weekId };
    }
  }

  /**
   * Get all trending data (combined)
   */
  async getAllTrending(limit: number = 5): Promise<{
    weekId: string;
    topSearches: SearchTrendingItem[];
    topPosts: PostTrendingItem[];
  }> {
    const [searches, posts] = await Promise.all([
      this.getTopSearches(limit),
      this.getTopLikedPosts(limit),
    ]);

    return {
      weekId: this.getCurrentWeekId(),
      topSearches: searches.items,
      topPosts: posts.items,
    };
  }

  // ============================================
  // CLEANUP OLD WEEK DATA
  // ============================================

  /**
   * Get previous week ID
   */
  getPreviousWeekId(): string {
    const now = new Date();
    now.setDate(now.getDate() - 7);
    const year = now.getFullYear();
    const weekNum = this.getISOWeekNumber(now);
    return `${year}-W${weekNum.toString().padStart(2, '0')}`;
  }

  /**
   * Delete all trending data for a specific week
   * Called automatically when new week starts
   */
  async deleteWeekData(weekId: string): Promise<{ deletedSearches: number; deletedPosts: number }> {
    const { DeleteCommand, QueryCommand: QC } = await import('@aws-sdk/lib-dynamodb');
    
    let deletedSearches = 0;
    let deletedPosts = 0;

    try {
      // Delete search trending data
      const searchPk = `TRENDING#SEARCH#${weekId}`;
      const searchItems = await docClient.send(
        new QC({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': searchPk },
        })
      );

      for (const item of searchItems.Items || []) {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: item.PK, SK: item.SK },
          })
        );
        deletedSearches++;
      }

      // Delete post trending data
      const postPk = `TRENDING#LIKES#${weekId}`;
      const postItems = await docClient.send(
        new QC({
          TableName: TABLE_NAME,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: { ':pk': postPk },
        })
      );

      for (const item of postItems.Items || []) {
        await docClient.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { PK: item.PK, SK: item.SK },
          })
        );
        deletedPosts++;
      }

      console.log(`Deleted trending data for week ${weekId}: ${deletedSearches} searches, ${deletedPosts} posts`);
    } catch (error) {
      console.error('Error deleting week data:', error);
    }

    return { deletedSearches, deletedPosts };
  }

  /**
   * Cleanup previous week data
   * Should be called at the start of new week (e.g., via scheduled Lambda)
   */
  async cleanupPreviousWeek(): Promise<{ weekId: string; deletedSearches: number; deletedPosts: number }> {
    const previousWeekId = this.getPreviousWeekId();
    const result = await this.deleteWeekData(previousWeekId);
    return { weekId: previousWeekId, ...result };
  }
}
