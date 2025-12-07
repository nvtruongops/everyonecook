/**
 * Profile Handlers
 *
 * Implements user profile operations:
 * - Get own profile (full access)
 * - Get other user's profile (with privacy filtering)
 * - Update profile (editable fields only)
 * - Upload avatar (presigned URL)
 * - Upload background (presigned URL)
 *
 * @module handlers/profile
 * @see .kiro/specs/project-restructure/user-profile-design.md - Profile Management
 * @see .kiro/specs/project-restructure/user-profile-privacy.md - Privacy Filtering
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { UserProfile, ProfileUpdateRequest } from '../models/user.model';
import { PrivacySettings, DEFAULT_PRIVACY_SETTINGS } from '../models/privacy.model';
import {
  getUserProfile,
  getPrivacySettings,
  updateUserProfile,
  updateAvatarUrl,
  updateBackgroundUrl,
  determineRelationship,
} from '../services/profile.service';
import { filterProfileByPrivacy } from '../services/privacy-filter.service';
import {
  sanitizeInput,
  validateFullName,
  validateBio,
  validateFileType,
  validateFileSize,
} from '../utils/validation';
import { checkRateLimit, RATE_LIMITS } from '../utils/rate-limiter';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-southeast-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables
const TABLE_NAME = process.env.TABLE_NAME || 'EveryoneCook-dev-v2';
const CONTENT_BUCKET = process.env.CONTENT_BUCKET || 'everyonecook-content-dev';
const CDN_DOMAIN = process.env.CDN_DOMAIN || 'cdn-dev.everyonecook.cloud';

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Max file sizes
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_BACKGROUND_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Get own profile handler
 *
 * Returns full profile with privacy settings (no filtering)
 * Auto-creates profile if it doesn't exist (for users created before PostConfirmation trigger)
 *
 * @param userId - Authenticated user ID from JWT
 * @returns Full profile and privacy settings
 */
export async function getOwnProfile(
  userId: string
): Promise<{ profile: UserProfile; privacy: PrivacySettings }> {
  // Get profile
  let profile = await getUserProfile(userId);

  // Auto-create profile if not found (backward compatibility)
  if (!profile) {
    console.log('[getOwnProfile] Profile not found, creating default profile for userId:', userId);

    const now = Date.now();
    const defaultProfile = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `USERNAME#temp_${userId.substring(0, 8)}`,
      GSI1SK: 'PROFILE',
      userId,
      username: `temp_${userId.substring(0, 8)}`,
      email: '',
      fullName: '',
      avatarUrl: '',
      bio: '',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      isBanned: false,
      lastLoginAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: defaultProfile,
      })
    );

    // Get the newly created profile
    profile = await getUserProfile(userId);
    if (!profile) {
      throw new Error('Failed to create profile');
    }
  }

  // Get privacy settings
  let privacy = await getPrivacySettings(userId);

  // Auto-create privacy settings if not found
  if (!privacy) {
    console.log(
      '[getOwnProfile] Privacy settings not found, creating defaults for userId:',
      userId
    );

    // Use correct flat structure with PrivacyLevel values (not booleans)
    // This matches the format expected by filterProfileByPrivacy()
    const now = Date.now();
    const defaultPrivacy = {
      PK: `USER#${userId}`,
      SK: 'PRIVACY_SETTINGS',
      entityType: 'PRIVACY_SETTINGS',
      userId,
      // Field-level privacy using PrivacyLevel values
      fullName: 'public', // Required for search (cannot be changed)
      email: 'private', // Private by default
      birthday: 'private', // Private by default
      gender: 'private', // Private by default
      country: 'public', // Public for discovery
      bio: 'public', // Public by default
      avatarUrl: 'public', // Public by default
      backgroundUrl: 'public', // Public by default
      savedRecipes: 'private', // Always private (like bookmarks)
      createdAt: now,
      updatedAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: defaultPrivacy,
      })
    );

    privacy = await getPrivacySettings(userId);
    if (!privacy) {
      throw new Error('Failed to create privacy settings');
    }
  }

  return { profile, privacy };
}

/**
 * Get other user's profile response
 */
export interface OtherUserProfileResponse {
  profile: Partial<UserProfile>;
  is_friend: boolean;
  relationship: 'self' | 'friend' | 'stranger' | 'blocked';
  stats: {
    friend_count: number;
    post_count: number;
  };
  privacy?: {
    bio: string;
    email: string;
    birthday: string;
    gender: string;
    country: string;
    avatarUrl: string;
    backgroundUrl: string;
  };
}

/**
 * Get other user's profile handler
 *
 * Returns filtered profile based on privacy settings and relationship
 *
 * SECURITY: Does NOT auto-create profiles for arbitrary user IDs.
 * Only getOwnProfile should auto-create (for authenticated users on first login).
 * This prevents database pollution from invalid/random user IDs.
 *
 * @param targetUserId - Target user ID
 * @param viewerId - Viewer user ID (null for anonymous)
 * @returns Filtered profile with relationship info
 * @throws Error if profile not found (404)
 */
export async function getOtherUserProfile(
  targetUserId: string,
  viewerId: string | null
): Promise<OtherUserProfileResponse> {
  // Get profile - DO NOT auto-create for other users
  const profile = await getUserProfile(targetUserId);

  // Return 404 if profile doesn't exist
  // This is the correct behavior - we should NOT create profiles for arbitrary IDs
  if (!profile) {
    console.log('[getOtherUserProfile] Profile not found for userId:', targetUserId);
    const error = new Error('User not found');
    (error as any).statusCode = 404;
    throw error;
  }

  // Get privacy settings - use defaults if not found (but don't create in DB)
  const existingPrivacy = await getPrivacySettings(targetUserId);

  // Use default privacy settings if not found (read-only, don't persist)
  let privacy: PrivacySettings;
  if (existingPrivacy) {
    privacy = existingPrivacy;
  } else {
    console.log(
      '[getOtherUserProfile] Privacy settings not found, using defaults for userId:',
      targetUserId
    );
    const now = Date.now();
    privacy = {
      userId: targetUserId,
      ...DEFAULT_PRIVACY_SETTINGS,
      createdAt: now,
      updatedAt: now,
    };
  }

  // Determine relationship
  const relationship = await determineRelationship(targetUserId, viewerId);

  // Map relationship to frontend-friendly format
  const relationshipMap: Record<string, 'self' | 'friend' | 'stranger' | 'blocked'> = {
    self: 'self',
    friend: 'friend',
    stranger: 'stranger',
    blocked: 'blocked',
  };
  const mappedRelationship = relationshipMap[relationship] || 'stranger';

  // Filter profile
  const filteredProfile = filterProfileByPrivacy(profile, privacy, relationship);

  // Query user stats (friends count and posts count)
  const stats = await getUserStats(targetUserId);

  return {
    profile: filteredProfile,
    is_friend: relationship === 'friend',
    relationship: mappedRelationship,
    stats,
    // Only include privacy settings that are visible to the viewer
    privacy: {
      bio: privacy.bio || 'public',
      email: privacy.email || 'private',
      birthday: privacy.birthday || 'private',
      gender: privacy.gender || 'private',
      country: privacy.country || 'public',
      avatarUrl: privacy.avatarUrl || 'public',
      backgroundUrl: privacy.backgroundUrl || 'public',
    },
  };
}

/**
 * Get user stats (friends count and posts count)
 * @param userId - User ID to get stats for
 * @returns Stats object with friend_count and post_count
 */
export async function getUserStats(
  userId: string
): Promise<{ friend_count: number; post_count: number }> {
  try {
    // Query accepted friendships count
    const friendsResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: '#status = :accepted',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'FRIEND#',
          ':accepted': 'accepted',
        },
        Select: 'COUNT',
      })
    );

    // Query posts count - Posts are stored with PK=POST#{postId}, authorId=userId
    // Need to query GSI2 for both public and private posts

    // 1. Count public posts (GSI2PK = POST#PUBLIC, filter by authorId)
    const publicPostsResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        FilterExpression: 'authorId = :authorId',
        ExpressionAttributeValues: {
          ':pk': 'POST#PUBLIC',
          ':authorId': userId,
        },
        Select: 'COUNT',
      })
    );

    // 2. Count private/friends posts (GSI2PK = POST#{userId})
    const privatePostsResult = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `POST#${userId}`,
        },
        Select: 'COUNT',
      })
    );

    const totalPosts = (publicPostsResult.Count || 0) + (privatePostsResult.Count || 0);

    return {
      friend_count: friendsResult.Count || 0,
      post_count: totalPosts,
    };
  } catch (error) {
    console.error('[getUserStats] Error querying stats:', error);
    return { friend_count: 0, post_count: 0 };
  }
}

/**
 * Update profile handler
 *
 * Updates editable fields only (fullName, bio, birthday, gender, country)
 *
 * @param userId - Authenticated user ID from JWT
 * @param updates - Profile fields to update
 * @returns Updated profile
 */
export async function updateProfile(
  userId: string,
  updates: ProfileUpdateRequest
): Promise<UserProfile> {
  // Check rate limit
  const rateLimitExceeded = await checkRateLimit(userId, RATE_LIMITS.PROFILE_UPDATE);
  if (rateLimitExceeded) {
    throw new Error('Rate limit exceeded. Maximum 10 updates per 15 minutes.');
  }

  // Validate and sanitize inputs
  if (updates.fullName !== undefined) {
    updates.fullName = sanitizeInput(updates.fullName);
    validateFullName(updates.fullName);
  }

  if (updates.bio !== undefined) {
    updates.bio = sanitizeInput(updates.bio);
    validateBio(updates.bio);
  }

  // Update profile
  return await updateUserProfile(userId, updates);
}

/**
 * Upload avatar handler
 *
 * Generates presigned URL for S3 upload
 *
 * @param userId - Authenticated user ID from JWT
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL and CloudFront URL
 */
export async function uploadAvatar(
  userId: string,
  contentType: string,
  fileSize: number
): Promise<{ uploadUrl: string; avatarUrl: string }> {
  // Check rate limit
  const rateLimitExceeded = await checkRateLimit(userId, RATE_LIMITS.AVATAR_UPLOAD);
  if (rateLimitExceeded) {
    throw new Error('Rate limit exceeded. Maximum 10 uploads per day.');
  }

  // Validate file type
  validateFileType(contentType, ALLOWED_IMAGE_TYPES);

  // Validate file size
  validateFileSize(fileSize, MAX_AVATAR_SIZE);

  // Generate S3 key (fixed filename to overwrite previous avatar)
  const extension = contentType.split('/')[1];
  const s3Key = `avatars/${userId}/avatar.${extension}`;

  // Generate presigned URL
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: s3Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

  // CloudFront URL with cache busting parameter
  const timestamp = Date.now();
  const avatarUrl = `https://${CDN_DOMAIN}/${s3Key}?v=${timestamp}`;

  // Update profile with new avatar URL
  await updateAvatarUrl(userId, avatarUrl);

  return { uploadUrl, avatarUrl };
}

/**
 * Upload background handler
 *
 * Generates presigned URL for S3 upload
 *
 * @param userId - Authenticated user ID from JWT
 * @param contentType - File MIME type
 * @param fileSize - File size in bytes
 * @returns Presigned URL and CloudFront URL
 */
export async function uploadBackground(
  userId: string,
  contentType: string,
  fileSize: number
): Promise<{ uploadUrl: string; backgroundUrl: string }> {
  // Check rate limit
  const rateLimitExceeded = await checkRateLimit(userId, RATE_LIMITS.BACKGROUND_UPLOAD);
  if (rateLimitExceeded) {
    throw new Error('Rate limit exceeded. Maximum 10 uploads per day.');
  }

  // Validate file type
  validateFileType(contentType, ALLOWED_IMAGE_TYPES);

  // Validate file size
  validateFileSize(fileSize, MAX_BACKGROUND_SIZE);

  // Generate S3 key (fixed filename to overwrite previous background)
  const extension = contentType.split('/')[1];
  const s3Key = `backgrounds/${userId}/background.${extension}`;

  // Generate presigned URL
  const command = new PutObjectCommand({
    Bucket: CONTENT_BUCKET,
    Key: s3Key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes

  // CloudFront URL with cache busting parameter
  const timestamp = Date.now();
  const backgroundUrl = `https://${CDN_DOMAIN}/${s3Key}?v=${timestamp}`;

  // Update profile with new background URL
  await updateBackgroundUrl(userId, backgroundUrl);

  return { uploadUrl, backgroundUrl };
}
