/**
 * Profile Service - Business logic for user profile operations
 *
 * @module services/profile
 * @see .kiro/specs/project-restructure/user-profile-design.md - Profile Management
 * @see .kiro/specs/project-restructure/database-architecture.md - User Profile Entity
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { UserProfile, ProfileUpdateRequest } from '../models/user.model';
import { PrivacySettings, RelationshipType } from '../models/privacy.model';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

/**
 * Get user profile by userId (Cognito sub)
 *
 * Direct access using userId as PK:
 * - PK: USER#{userId} (Cognito sub - guaranteed unique)
 * - SK: PROFILE
 *
 * @param userId - User ID (Cognito sub)
 * @returns User profile or null if not found
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `USER#${userId}`,
        SK: 'PROFILE',
      },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      console.log(`[getUserProfile] Profile not found for userId: ${userId}`);
      return null;
    }

    return mapDynamoDBItemToProfile(response.Item);
  } catch (error) {
    console.error('[getUserProfile] Error:', error);
    throw error;
  }
}

/**
 * Get user profile by username (via GSI1)
 *
 * Uses Global Secondary Index GSI1 to lookup user by username
 * GSI1PK = "USERNAME#{username}" -> Returns USER#{userId}
 * Then fetches full profile using userId
 *
 * @param username - Username to search for
 * @returns User profile or null if not found
 */
export async function getUserProfileByUsername(username: string): Promise<UserProfile | null> {
  // Step 1: Query GSI1 to find userId by username
  const queryCommand = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :username',
    ExpressionAttributeValues: {
      ':username': `USERNAME#${username.toLowerCase()}`,
    },
    Limit: 1,
  });

  const queryResponse = await docClient.send(queryCommand);

  if (!queryResponse.Items || queryResponse.Items.length === 0) {
    return null; // Username not found
  }

  // Step 2: Extract userId from GSI1SK
  const item = queryResponse.Items[0];
  const userId = item.GSI1SK.replace('USER#', '');

  // Step 3: Get full profile using userId
  return getUserProfile(userId);
}

/**
 * Get privacy settings by userId
 *
 * Handles multiple data formats:
 * 1. Legacy nested structure (fieldPrivacy object from post-confirmation trigger)
 * 2. Legacy boolean structure (showXxx fields from old auto-create)
 * 3. New flat structure (PrivacyLevel values)
 *
 * @param userId - User ID (Cognito sub)
 * @returns Privacy settings or null if not found
 */
export async function getPrivacySettings(userId: string): Promise<PrivacySettings | null> {
  const command = new GetCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PRIVACY_SETTINGS',
    },
  });

  const response = await docClient.send(command);

  if (!response.Item) {
    return null;
  }

  const item = response.Item;

  // Handle legacy nested structure (from post-confirmation trigger)
  if (item.fieldPrivacy) {
    console.log('[getPrivacySettings] Converting legacy nested fieldPrivacy structure');
    return {
      userId,
      fullName: item.fieldPrivacy.fullName || 'public',
      email: item.fieldPrivacy.email || 'private',
      birthday: item.fieldPrivacy.birthday || 'private',
      gender: item.fieldPrivacy.gender || 'private',
      country: item.fieldPrivacy.country || 'public',
      bio: item.fieldPrivacy.bio || 'public',
      avatarUrl: item.fieldPrivacy.avatarUrl || 'public',
      backgroundUrl: item.fieldPrivacy.backgroundUrl || 'public',
      savedRecipes: item.fieldPrivacy.savedRecipes || 'private',
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    } as PrivacySettings;
  }

  // Handle legacy boolean structure (showXxx fields from old auto-create)
  // Convert boolean to PrivacyLevel: true -> 'public', false -> 'private'
  if (item.showEmail !== undefined || item.showBirthday !== undefined) {
    console.log('[getPrivacySettings] Converting legacy boolean structure');
    return {
      userId,
      fullName: 'public', // Always public
      email: item.showEmail ? 'public' : 'private',
      birthday: item.showBirthday ? 'public' : 'private',
      gender: item.showGender ? 'public' : 'private',
      country: item.showCountry ? 'public' : 'private',
      bio: 'public', // Default public
      avatarUrl: 'public', // Default public
      backgroundUrl: 'public', // Default public
      savedRecipes: 'private', // Always private
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    } as PrivacySettings;
  }

  // New flat structure - ensure all fields have defaults
  return {
    userId: item.userId || userId,
    fullName: item.fullName || 'public',
    email: item.email || 'private',
    birthday: item.birthday || 'private',
    gender: item.gender || 'private',
    country: item.country || 'public',
    bio: item.bio || 'public',
    avatarUrl: item.avatarUrl || 'public',
    backgroundUrl: item.backgroundUrl || 'public',
    savedRecipes: item.savedRecipes || 'private',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  } as PrivacySettings;
}

/**
 * Update user profile
 *
 * @param userId - User ID (Cognito sub)
 * @param updates - Profile fields to update
 * @returns Updated profile
 */
export async function updateUserProfile(
  userId: string,
  updates: ProfileUpdateRequest
): Promise<UserProfile> {
  // Build update expression
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  // Add updatedAt timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = Date.now();

  // Add editable fields
  if (updates.fullName !== undefined) {
    updateExpressions.push('#fullName = :fullName');
    expressionAttributeNames['#fullName'] = 'fullName';
    expressionAttributeValues[':fullName'] = updates.fullName;
  }

  if (updates.bio !== undefined) {
    updateExpressions.push('#bio = :bio');
    expressionAttributeNames['#bio'] = 'bio';
    expressionAttributeValues[':bio'] = updates.bio;
  }

  if (updates.birthday !== undefined) {
    updateExpressions.push('#birthday = :birthday');
    expressionAttributeNames['#birthday'] = 'birthday';
    expressionAttributeValues[':birthday'] = updates.birthday;
  }

  if (updates.gender !== undefined) {
    updateExpressions.push('#gender = :gender');
    expressionAttributeNames['#gender'] = 'gender';
    expressionAttributeValues[':gender'] = updates.gender;
  }

  if (updates.country !== undefined) {
    updateExpressions.push('#country = :country');
    expressionAttributeNames['#country'] = 'country';
    expressionAttributeValues[':country'] = updates.country;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);

  if (!response.Attributes) {
    throw new Error('Failed to update profile');
  }

  return mapDynamoDBItemToProfile(response.Attributes);
}

/**
 * Update avatar URL
 *
 * @param userId - User ID (Cognito sub)
 * @param avatarUrl - CloudFront URL for avatar
 * @returns Updated profile
 */
export async function updateAvatarUrl(userId: string, avatarUrl: string): Promise<UserProfile> {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
    UpdateExpression: 'SET #avatarUrl = :avatarUrl, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#avatarUrl': 'avatarUrl',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':avatarUrl': avatarUrl,
      ':updatedAt': Date.now(),
    },
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);

  if (!response.Attributes) {
    throw new Error('Failed to update avatar URL');
  }

  return mapDynamoDBItemToProfile(response.Attributes);
}

/**
 * Update background URL
 *
 * @param userId - User ID (Cognito sub)
 * @param backgroundUrl - CloudFront URL for background
 * @returns Updated profile
 */
export async function updateBackgroundUrl(
  userId: string,
  backgroundUrl: string
): Promise<UserProfile> {
  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
    },
    UpdateExpression: 'SET #backgroundUrl = :backgroundUrl, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#backgroundUrl': 'backgroundUrl',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':backgroundUrl': backgroundUrl,
      ':updatedAt': Date.now(),
    },
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);

  if (!response.Attributes) {
    throw new Error('Failed to update background URL');
  }

  return mapDynamoDBItemToProfile(response.Attributes);
}

/**
 * Determine relationship between two users
 *
 * IMPORTANT: Checks BOTH directions of friendship because:
 * - When A sends request to B and B accepts, TWO records are created:
 *   1. USER#A -> FRIEND#B (original request)
 *   2. USER#B -> FRIEND#A (reverse record on accept)
 * - If only one record exists (due to race condition or bug), we still recognize friendship
 *
 * Block Logic:
 * - If either user blocked the other → Return BLOCKED
 * - Blocked users cannot see profile, search results, or any content
 *
 * @param userId - Target user ID (person being viewed)
 * @param viewerId - Viewer user ID (person viewing, can be null for anonymous)
 * @returns Relationship type
 */
export async function determineRelationship(
  userId: string,
  viewerId: string | null
): Promise<RelationshipType> {
  console.log('[determineRelationship] Input:', { userId, viewerId, TABLE_NAME });

  // Anonymous user
  if (!viewerId) {
    console.log('[determineRelationship] Anonymous user -> STRANGER');
    return RelationshipType.STRANGER;
  }

  // Self
  if (userId === viewerId) {
    console.log('[determineRelationship] Self -> SELF');
    return RelationshipType.SELF;
  }

  // Check BOTH directions of relationship
  // This handles cases where only one direction record exists
  console.log('[determineRelationship] Checking friendship records...');
  console.log(`  PK1: USER#${userId}, SK1: FRIEND#${viewerId}`);
  console.log(`  PK2: USER#${viewerId}, SK2: FRIEND#${userId}`);

  const [targetToViewer, viewerToTarget] = await Promise.all([
    docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${userId}`,
          SK: `FRIEND#${viewerId}`,
        },
      })
    ),
    docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          PK: `USER#${viewerId}`,
          SK: `FRIEND#${userId}`,
        },
      })
    ),
  ]);

  const record1 = targetToViewer.Item;
  const record2 = viewerToTarget.Item;

  console.log('[determineRelationship] Records found:');
  console.log('  record1 (target->viewer):', record1 ? JSON.stringify(record1) : 'NOT FOUND');
  console.log('  record2 (viewer->target):', record2 ? JSON.stringify(record2) : 'NOT FOUND');

  // Check blocked (either direction)
  // If target blocked viewer OR viewer blocked target → BLOCKED
  if (record1?.status === 'blocked' || record2?.status === 'blocked') {
    console.log('[determineRelationship] -> BLOCKED');
    return RelationshipType.BLOCKED;
  }

  // Check friend (either direction has accepted status)
  // This ensures friendship is recognized even if only one record exists
  if (record1?.status === 'accepted' || record2?.status === 'accepted') {
    console.log('[determineRelationship] -> FRIEND');
    return RelationshipType.FRIEND;
  }

  console.log('[determineRelationship] -> STRANGER');
  return RelationshipType.STRANGER;
}

/**
 * Update privacy settings
 *
 * Note: fullName and savedRecipes are FIXED and cannot be updated
 * - fullName: Always PUBLIC (required for search)
 * - savedRecipes: Always PRIVATE (like bookmarks)
 *
 * @param userId - User ID
 * @param updates - Privacy fields to update
 * @returns Updated privacy settings
 */
export async function updatePrivacySettings(
  userId: string,
  updates: Partial<PrivacySettings>
): Promise<PrivacySettings> {
  // Validate: fullName and savedRecipes cannot be changed
  if (updates.fullName !== undefined) {
    throw new Error('fullName privacy is fixed to PUBLIC and cannot be changed');
  }
  if (updates.savedRecipes !== undefined) {
    throw new Error('savedRecipes privacy is fixed to PRIVATE and cannot be changed');
  }

  // Build update expression for FLAT structure (not nested in fieldPrivacy)
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};
  const removeExpressions: string[] = [];

  // Add updatedAt timestamp
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = Date.now();

  // Add userId if not exists (for new records)
  updateExpressions.push('#userId = :userId');
  expressionAttributeNames['#userId'] = 'userId';
  expressionAttributeValues[':userId'] = userId;

  // Add privacy fields (excluding fullName and savedRecipes which are fixed)
  const privacyFields: Array<
    keyof Omit<PrivacySettings, 'userId' | 'createdAt' | 'updatedAt' | 'fullName' | 'savedRecipes'>
  > = ['email', 'birthday', 'gender', 'country', 'bio', 'avatarUrl', 'backgroundUrl'];

  for (const field of privacyFields) {
    if (updates[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = updates[field];
    }
  }

  // Remove legacy fieldPrivacy if it exists (migration)
  removeExpressions.push('#fieldPrivacy');
  expressionAttributeNames['#fieldPrivacy'] = 'fieldPrivacy';

  let updateExpression = `SET ${updateExpressions.join(', ')}`;
  if (removeExpressions.length > 0) {
    updateExpression += ` REMOVE ${removeExpressions.join(', ')}`;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      PK: `USER#${userId}`,
      SK: 'PRIVACY_SETTINGS',
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });

  const response = await docClient.send(command);

  if (!response.Attributes) {
    throw new Error('Failed to update privacy settings');
  }

  // Return clean flat structure
  return {
    userId: response.Attributes.userId,
    fullName: response.Attributes.fullName || 'public',
    email: response.Attributes.email,
    birthday: response.Attributes.birthday,
    gender: response.Attributes.gender,
    country: response.Attributes.country,
    bio: response.Attributes.bio,
    avatarUrl: response.Attributes.avatarUrl,
    backgroundUrl: response.Attributes.backgroundUrl,
    savedRecipes: response.Attributes.savedRecipes || 'private',
    createdAt: response.Attributes.createdAt,
    updatedAt: response.Attributes.updatedAt,
  } as PrivacySettings;
}

/**
 * Map DynamoDB item to UserProfile
 *
 * @param item - DynamoDB item
 * @returns User profile
 */
function mapDynamoDBItemToProfile(item: Record<string, any>): UserProfile {
  return {
    userId: item.userId,
    username: item.username,
    email: item.email,
    fullName: item.fullName,
    avatarUrl: item.avatarUrl,
    backgroundUrl: item.backgroundUrl,
    bio: item.bio,
    birthday: item.birthday,
    gender: item.gender,
    country: item.country,
    isActive: item.isActive,
    isBanned: item.isBanned,
    isSuspended: item.isSuspended,
    lastLoginAt: item.lastLoginAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}
