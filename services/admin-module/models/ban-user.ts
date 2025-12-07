/**
 * Ban User Types
 *
 * Type definitions for ban operations.
 */

export interface BanSchedule {
  PK: string; // BAN_SCHEDULE#{userId}
  SK: string; // UNBAN_TASK
  userId: string;
  banExpiresAt: number;
  ttl: number; // DynamoDB TTL (seconds)
  entityType: 'BAN_SCHEDULE';
}

export interface UserProfile {
  PK: string; // USER#{userId}
  SK: string; // PROFILE
  userId: string;
  username: string;
  email: string;

  // Ban fields
  isBanned: boolean;
  banReason?: string;
  bannedAt?: number;
  bannedBy?: string;
  banDuration?: number; // days (0 = permanent)
  banExpiresAt?: number | null; // null = permanent

  // Activity fields
  isActive: boolean;
  lastLoginAt: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;

  // Other fields...
  [key: string]: any;
}

export type BanType = 'temporary' | 'permanent';

export function getBanType(banDuration: number): BanType {
  return banDuration === 0 ? 'permanent' : 'temporary';
}

export function createBanSchedule(userId: string, banExpiresAt: number): BanSchedule {
  return {
    PK: `BAN_SCHEDULE#${userId}`,
    SK: 'UNBAN_TASK',
    userId,
    banExpiresAt,
    ttl: Math.floor(banExpiresAt / 1000), // DynamoDB TTL (seconds)
    entityType: 'BAN_SCHEDULE',
  };
}
