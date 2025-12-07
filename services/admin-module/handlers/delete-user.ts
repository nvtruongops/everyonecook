/**
 * Delete User Handler (CASCADE DELETE)
 *
 * Admin endpoint to permanently delete a user and ALL related data.
 * This is useful for cleaning up test users and their data.
 *
 * DELETE /admin/users/:userId
 * Query: { cascade: true, reason: "Test user cleanup" }
 *
 * CAUTION: This is a destructive operation that cannot be undone!
 * It will delete:
 * - User profile and authentication
 * - All posts and comments
 * - All reactions and likes
 * - All friendships and follows
 * - All uploaded files
 * - All notifications
 * - All analytics data
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole, getAdminUserId, getRequestIP } from '../middleware/admin-auth';
import { AuditLogService } from '../services/audit-log.service';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  BatchWriteCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const cognitoClient = new CognitoIdentityProviderClient({});
const s3Client = new S3Client({});

const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || '';

const auditLogService = new AuditLogService();

interface DeleteUserStats {
  userProfile: boolean;
  cognitoUser: boolean;
  postsDeleted: number;
  commentsDeleted: number;
  reactionsDeleted: number;
  friendshipsDeleted: number;
  notificationsDeleted: number;
  recipesDeleted: number;
  filesDeleted: number;
  analyticsDeleted: number;
  totalItemsDeleted: number;
}

/**
 * Delete User Handler (with CASCADE)
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;

  try {
    // 1. Authorization check
    requireAdminRole(event);
    const adminUserId = getAdminUserId(event);
    const ipAddress = getRequestIP(event);

    // 2. Get userId from path
    const userId = event.pathParameters?.userId;
    if (!userId) {
      return createSuccessResponse(400, { error: 'userId is required' }, correlationId);
    }

    // 3. Check cascade flag
    const cascade = event.queryStringParameters?.cascade === 'true';
    const reason = event.queryStringParameters?.reason || 'Admin deletion';
    const dryRun = event.queryStringParameters?.dryRun === 'true';

    if (!cascade) {
      return createSuccessResponse(
        400,
        {
          error: 'Cascade delete required',
          message: 'Add ?cascade=true to confirm deletion of user and ALL related data',
        },
        correlationId
      );
    }

    // 4. Get user profile
    const userProfile = await getUserProfile(userId);
    if (!userProfile) {
      return createSuccessResponse(404, { error: 'User not found' }, correlationId);
    }

    const stats: DeleteUserStats = {
      userProfile: false,
      cognitoUser: false,
      postsDeleted: 0,
      commentsDeleted: 0,
      reactionsDeleted: 0,
      friendshipsDeleted: 0,
      notificationsDeleted: 0,
      recipesDeleted: 0,
      filesDeleted: 0,
      analyticsDeleted: 0,
      totalItemsDeleted: 0,
    };

    if (!dryRun) {
      // 5. Delete all user data (CASCADE)
      await deleteUserPosts(userId, stats);
      await deleteUserComments(userId, stats);
      await deleteUserReactions(userId, stats);
      await deleteUserFriendships(userId, stats);
      await deleteUserNotifications(userId, stats);
      await deleteUserRecipes(userId, stats);
      await deleteUserFiles(userId, stats);
      await deleteUserAnalytics(userId, stats);
      await deleteUserProfile(userId, stats);

      // 6. Delete from Cognito (use username, not userId/sub)
      const cognitoUsername = userProfile.username || userId;
      await deleteCognitoUser(cognitoUsername, stats);

      // 7. Log audit action
      const adminProfile = await getUserProfile(adminUserId);
      const adminUsername = adminProfile?.username || 'Unknown Admin';

      await auditLogService.logAction({
        adminUserId,
        adminUsername,
        action: 'DELETE_USER_CASCADE',
        targetUserId: userId,
        targetUsername: userProfile.username,
        reason,
        ipAddress,
        userAgent: event.headers['User-Agent'],
        metadata: {
          cascade: true,
          stats,
        },
      });
    }

    // 8. Return success response
    return createSuccessResponse(
      200,
      {
        message: dryRun
          ? 'Dry run completed - no changes made'
          : 'User and all related data deleted successfully',
        userId,
        username: userProfile.username,
        email: userProfile.email,
        dryRun,
        cascade,
        reason,
        stats,
      },
      correlationId
    );
  } catch (error) {
    return handleError(error, correlationId);
  }
}

/**
 * Get user profile
 */
async function getUserProfile(userId: string): Promise<any | null> {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
    })
  );
  return result.Item || null;
}

/**
 * Delete user's posts
 * Posts are stored with PK = POST#postId, not USER#userId
 * Need to query GSI2 to find all posts by authorId
 */
async function deleteUserPosts(userId: string, stats: DeleteUserStats): Promise<void> {
  const allPosts: any[] = [];

  // 1. Query private/friends posts (GSI2PK = POST#{userId})
  const privatePosts = await queryGSI2Items(`POST#${userId}`);
  allPosts.push(...privatePosts);

  // 2. Query public posts (GSI2PK = POST#PUBLIC, filter by authorId)
  const publicPosts = await queryPublicPostsByAuthor(userId);
  allPosts.push(...publicPosts);

  // 3. Delete each post and its related data (comments, reactions on the post)
  for (const post of allPosts) {
    const postId = post.postId;
    if (!postId) continue;

    // Delete comments ON this post
    const postComments = await queryItems(`POST#${postId}`, 'COMMENT#');
    await batchDeleteItems(postComments);
    stats.commentsDeleted += postComments.length;
    stats.totalItemsDeleted += postComments.length;

    // Delete reactions ON this post
    const postReactions = await queryItems(`POST#${postId}`, 'REACTION#');
    await batchDeleteItems(postReactions);
    stats.reactionsDeleted += postReactions.length;
    stats.totalItemsDeleted += postReactions.length;

    // Delete ingredient indexes (for recipe_share posts)
    const ingredientIndexes = await queryItems(`POST#${postId}`, 'INGREDIENT#');
    await batchDeleteItems(ingredientIndexes);
    stats.totalItemsDeleted += ingredientIndexes.length;

    // Delete the post itself
    await batchDeleteItems([post]);

    // Delete S3 files for this post
    await deletePostS3Files(postId);
  }

  stats.postsDeleted = allPosts.length;
  stats.totalItemsDeleted += allPosts.length;
  console.log(`Deleted ${allPosts.length} posts for user ${userId}`);
}

/**
 * Delete user's comments (comments BY the user on other posts)
 * Note: Comments ON user's posts are deleted in deleteUserPosts
 * 
 * Comments are stored with:
 * - PK: POST#{postId}, SK: COMMENT#{commentId}
 * - GSI1PK: USER#{userId}, GSI1SK: COMMENT#{timestamp}
 */
async function deleteUserComments(userId: string, stats: DeleteUserStats): Promise<void> {
  // Query GSI1 to find all comments BY this user
  const params: any = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': `USER#${userId}`,
      ':sk': 'COMMENT#',
    },
  };

  const comments: any[] = [];
  let lastEvaluatedKey;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    const result = await dynamoDB.send(new QueryCommand(params));
    comments.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (comments.length > 0) {
    // Delete each comment (need PK/SK from main table)
    await batchDeleteItems(comments);
    stats.commentsDeleted += comments.length;
    stats.totalItemsDeleted += comments.length;
    console.log(`Deleted ${comments.length} comments BY user ${userId} on other posts`);
  }
}

/**
 * Delete user's reactions (reactions BY the user on other posts)
 * Note: Reactions ON user's posts are deleted in deleteUserPosts
 * 
 * Reactions are stored with:
 * - PK: POST#{postId} or COMMENT#{commentId}
 * - SK: REACTION#{userId}
 * 
 * Since SK contains userId, we can scan with filter
 */
async function deleteUserReactions(userId: string, stats: DeleteUserStats): Promise<void> {
  // Scan for all reactions BY this user (SK = REACTION#{userId})
  const params: any = {
    TableName: TABLE_NAME,
    FilterExpression: 'SK = :sk',
    ExpressionAttributeValues: {
      ':sk': `REACTION#${userId}`,
    },
  };

  const reactions: any[] = [];
  let lastEvaluatedKey;
  const maxIterations = 50; // Safety limit for scan
  let iterations = 0;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
    const result = await dynamoDB.send(new ScanCommand(params));
    reactions.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    iterations++;
  } while (lastEvaluatedKey && iterations < maxIterations);

  if (reactions.length > 0) {
    await batchDeleteItems(reactions);
    stats.reactionsDeleted += reactions.length;
    stats.totalItemsDeleted += reactions.length;
    console.log(`Deleted ${reactions.length} reactions BY user ${userId}`);
  }
}

/**
 * Delete user's friendships (both directions)
 * Also delete reverse friendships (other users' FRIEND# records pointing to this user)
 */
async function deleteUserFriendships(userId: string, stats: DeleteUserStats): Promise<void> {
  // 1. Get user's friendships
  const friendships = await queryItems(`USER#${userId}`, 'FRIEND#');
  const follows = await queryItems(`USER#${userId}`, 'FOLLOW#');

  // 2. Delete reverse friendships (other users' records pointing to this user)
  const reverseFriendships: any[] = [];
  for (const friendship of friendships) {
    // Extract friend's userId from SK (FRIEND#{friendId})
    const friendId = friendship.SK?.replace('FRIEND#', '');
    if (friendId) {
      // Get the reverse record
      const reverseRecord = await getItem(`USER#${friendId}`, `FRIEND#${userId}`);
      if (reverseRecord) {
        reverseFriendships.push(reverseRecord);
      }
    }
  }

  const totalFriendships = [...friendships, ...follows, ...reverseFriendships];
  stats.friendshipsDeleted = totalFriendships.length;
  await batchDeleteItems(totalFriendships);
  stats.totalItemsDeleted += totalFriendships.length;
  console.log(`Deleted ${totalFriendships.length} friendships for user ${userId}`);
}

/**
 * Delete user's notifications
 */
async function deleteUserNotifications(userId: string, stats: DeleteUserStats): Promise<void> {
  const notifications = await queryItems(`USER#${userId}`, 'NOTIFICATION#');
  stats.notificationsDeleted = notifications.length;
  await batchDeleteItems(notifications);
  stats.totalItemsDeleted += notifications.length;
}

/**
 * Delete user's recipes (from GSI1)
 */
async function deleteUserRecipes(userId: string, stats: DeleteUserStats): Promise<void> {
  try {
    // Query recipes using GSI1 (GSI1PK = USER#userId, GSI1SK begins_with RECIPE#)
    const params: any = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'RECIPE#',
      },
    };

    const items: any[] = [];
    let lastEvaluatedKey;

    do {
      if (lastEvaluatedKey) {
        params.ExclusiveStartKey = lastEvaluatedKey;
      }
      const result = await dynamoDB.send(new QueryCommand(params));
      items.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Delete each recipe (need to use PK/SK from main table)
    for (const item of items) {
      if (item.recipeId) {
        const recipeItems = await queryItems(`RECIPE#${item.recipeId}`);
        await batchDeleteItems(recipeItems);
      }
    }

    stats.recipesDeleted = items.length;
    stats.totalItemsDeleted += items.length;
    console.log(`Deleted ${items.length} recipes for user ${userId}`);
  } catch (error) {
    console.error('Error deleting user recipes:', error);
  }
}

/**
 * Delete user's uploaded files from S3
 * Deletes files from all user-related prefixes: avatars, backgrounds, recipes, posts
 */
async function deleteUserFiles(userId: string, stats: DeleteUserStats): Promise<void> {
  try {
    // All possible S3 prefixes for user files
    const prefixes = [
      `avatars/${userId}/`,
      `backgrounds/${userId}/`,
      `recipes/${userId}/`,
      `posts/${userId}/`,
      `posts/temp/${userId}/`,
      `uploads/${userId}/`,
    ];

    let totalDeleted = 0;

    for (const prefix of prefixes) {
      const listResult = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: CONTENT_BUCKET,
          Prefix: prefix,
        })
      );

      if (listResult.Contents && listResult.Contents.length > 0) {
        const objects = listResult.Contents.map((obj) => ({ Key: obj.Key! }));
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: CONTENT_BUCKET,
            Delete: { Objects: objects },
          })
        );
        totalDeleted += objects.length;
        console.log(`Deleted ${objects.length} files from ${prefix}`);
      }
    }

    stats.filesDeleted = totalDeleted;
  } catch (error) {
    console.error('Error deleting user files:', error);
  }
}

/**
 * Delete user's analytics data
 */
async function deleteUserAnalytics(userId: string, stats: DeleteUserStats): Promise<void> {
  const analytics = await queryItems(`USER#${userId}`, 'ANALYTICS#');
  stats.analyticsDeleted = analytics.length;
  await batchDeleteItems(analytics);
  stats.totalItemsDeleted += analytics.length;
}

/**
 * Delete user profile
 */
async function deleteUserProfile(userId: string, stats: DeleteUserStats): Promise<void> {
  const profileItems = await queryItems(`USER#${userId}`);
  await batchDeleteItems(profileItems);
  stats.userProfile = true;
  stats.totalItemsDeleted += profileItems.length;
}

/**
 * Delete user from Cognito
 * Note: Cognito AdminDeleteUserCommand requires the actual username, not the userId (sub)
 */
async function deleteCognitoUser(username: string, stats: DeleteUserStats): Promise<void> {
  try {
    console.log('Deleting Cognito user:', { username, userPoolId: USER_POOL_ID });
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
      })
    );
    stats.cognitoUser = true;
    console.log('Cognito user deleted successfully:', { username });
  } catch (error: any) {
    console.error('Error deleting Cognito user:', {
      username,
      errorName: error.name,
      errorMessage: error.message,
    });
    if (error.name !== 'UserNotFoundException') {
      throw error; // Re-throw to surface the error
    }
  }
}

/**
 * Query items from GSI2 (for posts)
 */
async function queryGSI2Items(gsi2pk: string): Promise<any[]> {
  const params: any = {
    TableName: TABLE_NAME,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :pk',
    ExpressionAttributeValues: {
      ':pk': gsi2pk,
    },
  };

  const items: any[] = [];
  let lastEvaluatedKey;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }
    const result = await dynamoDB.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Query public posts by author (using GSI2 with filter)
 */
async function queryPublicPostsByAuthor(userId: string): Promise<any[]> {
  const items: any[] = [];
  let lastEvaluatedKey;
  const maxIterations = 20; // Safety limit
  let iterations = 0;

  do {
    const params: any = {
      TableName: TABLE_NAME,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      FilterExpression: 'authorId = :authorId',
      ExpressionAttributeValues: {
        ':pk': 'POST#PUBLIC',
        ':authorId': userId,
      },
      Limit: 100,
    };

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamoDB.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    iterations++;
  } while (lastEvaluatedKey && iterations < maxIterations);

  return items;
}

/**
 * Get a single item from DynamoDB
 */
async function getItem(pk: string, sk: string): Promise<any | null> {
  const result = await dynamoDB.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    })
  );
  return result.Item || null;
}

/**
 * Delete S3 files for a specific post
 */
async function deletePostS3Files(postId: string): Promise<void> {
  try {
    const listResult = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: CONTENT_BUCKET,
        Prefix: `posts/${postId}/`,
      })
    );

    if (listResult.Contents && listResult.Contents.length > 0) {
      const objects = listResult.Contents.map((obj) => ({ Key: obj.Key! }));
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: CONTENT_BUCKET,
          Delete: { Objects: objects },
        })
      );
      console.log(`Deleted ${objects.length} S3 files for post ${postId}`);
    }
  } catch (error) {
    console.error(`Error deleting S3 files for post ${postId}:`, error);
  }
}

/**
 * Query items from DynamoDB
 */
async function queryItems(pk: string, skPrefix?: string): Promise<any[]> {
  const params: any = {
    TableName: TABLE_NAME,
    KeyConditionExpression: skPrefix ? 'PK = :pk AND begins_with(SK, :sk)' : 'PK = :pk',
    ExpressionAttributeValues: skPrefix
      ? {
          ':pk': pk,
          ':sk': skPrefix,
        }
      : {
          ':pk': pk,
        },
  };

  const items: any[] = [];
  let lastEvaluatedKey;

  do {
    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamoDB.send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Batch delete items from DynamoDB (max 25 per batch)
 */
async function batchDeleteItems(items: any[]): Promise<void> {
  if (items.length === 0) return;

  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  for (const batch of batches) {
    await dynamoDB.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map((item) => ({
            DeleteRequest: {
              Key: {
                PK: item.PK,
                SK: item.SK,
              },
            },
          })),
        },
      })
    );
  }
}
