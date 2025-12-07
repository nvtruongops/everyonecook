/**
 * Input Validation Schemas
 *
 * Type-safe validation using Zod for admin operations.
 * Prevents XSS, injection, and type confusion attacks.
 */

import { z } from 'zod';

// Re-export moderation schemas
export {
  ReviewPostSchema,
  DeletePostSchema,
  RestorePostSchema,
  GetReportedPostsSchema,
  type ReviewPostRequest,
  type DeletePostRequest,
  type RestorePostRequest,
  type GetReportedPostsQuery,
} from './moderation';

/**
 * Ban Duration Unit Type
 */
export type BanDurationUnit = 'minutes' | 'hours' | 'days';

/**
 * Ban User Request Schema
 *
 * Validates ban user request payload.
 * Supports flexible duration with unit (minutes, hours, days).
 */
export const BanUserSchema = z.object({
  targetUserId: z.string().uuid('Target user ID must be a valid UUID').describe('User ID to ban'),

  banReason: z
    .string()
    .min(5, 'Ban reason must be at least 5 characters')
    .max(500, 'Ban reason must not exceed 500 characters')
    .trim()
    .describe('Reason for banning the user'),

  banDuration: z
    .number()
    .int('Ban duration must be an integer')
    .min(0, 'Ban duration must be 0 (permanent) or positive')
    .describe('Ban duration value (0 = permanent)'),

  banDurationUnit: z
    .enum(['minutes', 'hours', 'days'])
    .optional()
    .default('days')
    .describe('Unit for ban duration'),
});

/**
 * Convert ban duration to milliseconds
 */
export function banDurationToMs(duration: number, unit: BanDurationUnit = 'days'): number {
  if (duration === 0) return 0; // Permanent ban

  switch (unit) {
    case 'minutes':
      return duration * 60 * 1000;
    case 'hours':
      return duration * 60 * 60 * 1000;
    case 'days':
      return duration * 24 * 60 * 60 * 1000;
    default:
      return duration * 24 * 60 * 60 * 1000;
  }
}

/**
 * Format ban duration for display
 */
export function formatBanDuration(duration: number, unit: BanDurationUnit = 'days'): string {
  if (duration === 0) return 'Vĩnh viễn';

  const unitLabels: Record<BanDurationUnit, string> = {
    minutes: 'phút',
    hours: 'giờ',
    days: 'ngày',
  };

  return `${duration} ${unitLabels[unit]}`;
}

export type BanUserRequest = z.infer<typeof BanUserSchema>;

/**
 * Unban User Request Schema
 *
 * Validates unban user request payload.
 */
export const UnbanUserSchema = z.object({
  targetUserId: z.string().uuid('Target user ID must be a valid UUID').describe('User ID to unban'),

  unbanReason: z
    .string()
    .min(10, 'Unban reason must be at least 10 characters')
    .max(500, 'Unban reason must not exceed 500 characters')
    .trim()
    .optional()
    .describe('Optional reason for unbanning'),
});

export type UnbanUserRequest = z.infer<typeof UnbanUserSchema>;

/**
 * Get Banned Users Query Schema
 *
 * Validates query parameters for listing banned users.
 */
export const GetBannedUsersSchema = z.object({
  banType: z
    .enum(['all', 'temporary', 'permanent'])
    .optional()
    .default('all')
    .describe('Filter by ban type'),

  limit: z
    .number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20)
    .describe('Number of results to return'),

  lastEvaluatedKey: z.string().optional().describe('Pagination token from previous request'),
});

export type GetBannedUsersQuery = z.infer<typeof GetBannedUsersSchema>;

/**
 * Cleanup Inactive Users Query Schema
 *
 * Validates query parameters for cleanup operation.
 */
export const CleanupInactiveUsersSchema = z.object({
  dryRun: z
    .boolean()
    .optional()
    .default(true)
    .describe('If true, only list users without deleting'),

  inactiveDays: z
    .number()
    .int('Inactive days must be an integer')
    .min(90, 'Inactive days must be at least 90')
    .max(365, 'Inactive days cannot exceed 365')
    .optional()
    .default(90)
    .describe('Number of days of inactivity before cleanup'),
});

export type CleanupInactiveUsersQuery = z.infer<typeof CleanupInactiveUsersSchema>;

/**
 * Validation Error
 *
 * Custom error for validation failures.
 */
export class ValidationError extends Error {
  statusCode: number;
  code: string;
  errors: z.ZodError['errors'];

  constructor(zodError: z.ZodError) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
    this.errors = zodError.errors;
  }
}

/**
 * Validate Input
 *
 * Generic validation function using Zod schemas.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(error);
    }
    throw error;
  }
}
