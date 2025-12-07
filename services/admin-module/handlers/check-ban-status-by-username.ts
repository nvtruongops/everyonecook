/**
 * Check Ban Status By Username Handler
 * Public endpoint to check if a user is banned by username.
 * Auto-unbans user if ban has expired.
 * GET /users/ban-status?username=xxx
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { BanService } from '../services/ban.service';

const dynamoClient = new DynamoDBClient({ region: 'ap-southeast-1' });
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';
const banService = new BanService();

export interface BanStatusResponse {
  isBanned: boolean;
  userId?: string;
  username?: string;
  banReason?: string;
  bannedAt?: number;
  banExpiresAt?: number | null;
  banDurationDisplay?: string;
  remainingTime?: string;
  canAppeal: boolean;
  // Violation info
  violationType?: string;
  violationContent?: string;
  reportCount?: number;
  postId?: string;
  commentId?: string;
  // Appeal status
  appealStatus?: 'pending' | 'approved' | 'rejected';
  appealReviewNotes?: string;
  appealReviewedAt?: number;
  appealReviewedByUsername?: string;
}

function calculateRemainingTime(banExpiresAt: number | null): string {
  if (!banExpiresAt) return 'Vĩnh viễn';
  const now = Date.now();
  const remaining = banExpiresAt - now;
  if (remaining <= 0) return 'Đã hết hạn';
  const minutes = Math.floor(remaining / (60 * 1000));
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  if (days > 0) {
    const remainingHours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    return `${days} ngày ${remainingHours} giờ`;
  }
  if (hours > 0) {
    const remainingMinutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    return `${hours} giờ ${remainingMinutes} phút`;
  }
  return `${minutes} phút`;
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext.requestId;
  try {
    const username = event.queryStringParameters?.username;
    if (!username) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Username is required' }),
      };
    }

    console.log('[CheckBanStatus] username:', username, 'table:', TABLE_NAME);
    const gsi1pk = 'USERNAME#' + username.toLowerCase();

    const result = await dynamoDB.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': gsi1pk },
        Limit: 1,
      })
    );

    const profile = result.Items?.[0];

    if (!profile) {
      console.log('[CheckBanStatus] user not found');
      return createSuccessResponse(200, { isBanned: false, canAppeal: false }, correlationId);
    }

    const userId = profile.PK?.replace('USER#', '') || profile.userId;
    console.log('[CheckBanStatus] profile:', {
      username: profile.username,
      isBanned: profile.isBanned,
      banExpiresAt: profile.banExpiresAt,
    });

    // Check if ban has expired - auto unban
    if (profile.isBanned && profile.banExpiresAt && profile.banExpiresAt < Date.now()) {
      console.log('[CheckBanStatus] Ban expired, auto-unbanning user:', userId);
      try {
        await banService.unbanUser({
          targetUserId: userId,
          source: 'auto',
        });
        console.log('[CheckBanStatus] Auto-unban successful');
      } catch (unbanError) {
        console.error('[CheckBanStatus] Auto-unban failed:', unbanError);
        // Still return isBanned: false since ban expired
      }
      return createSuccessResponse(200, { isBanned: false, canAppeal: false }, correlationId);
    }

    const response: BanStatusResponse = {
      isBanned: profile.isBanned || false,
      userId,
      username: profile.username,
      canAppeal: profile.isBanned || false,
    };

    if (profile.isBanned) {
      response.banReason = profile.banReason;
      response.bannedAt = profile.bannedAt;
      response.banExpiresAt = profile.banExpiresAt;
      response.banDurationDisplay = profile.banDurationDisplay || 'Không xác định';
      response.remainingTime = calculateRemainingTime(profile.banExpiresAt);

      // Try to get violation details - only for current ban
      try {
        const violationResult = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `USER#${userId}`,
              ':sk': 'VIOLATION#',
            },
            ScanIndexForward: false,
            Limit: 10, // Get more to filter by bannedAt
          })
        );

        // Filter violation that matches current ban (created after bannedAt - 1 minute tolerance)
        const bannedAt = profile.bannedAt || 0;
        const violation = violationResult.Items?.find(
          (v) => v.createdAt && v.createdAt >= bannedAt - 60000
        );
        if (violation) {
          (response as any).violationType = violation.violationType;
          (response as any).postId = violation.postId;
          (response as any).commentId = violation.commentId;

          // Get content preview and report count
          if (violation.postId) {
            // Get post content
            try {
              const postResult = await dynamoDB.send(
                new QueryCommand({
                  TableName: TABLE_NAME,
                  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                  ExpressionAttributeValues: {
                    ':pk': `POST#${violation.postId}`,
                    ':sk': 'META',
                  },
                  Limit: 1,
                })
              );
              const post = postResult.Items?.[0];
              if (post) {
                const content = post.caption || post.title || '';
                (response as any).violationContent =
                  content.length > 200 ? content.substring(0, 200) + '...' : content;
              }
            } catch (postError) {
              console.warn('[CheckBanStatus] Failed to get post content:', postError);
            }

            // Get report count
            const reportResult = await dynamoDB.send(
              new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                  ':pk': `POST#${violation.postId}`,
                  ':sk': 'REPORT#',
                },
                Select: 'COUNT',
              })
            );
            (response as any).reportCount = reportResult.Count || 0;
          } else if (violation.commentId) {
            // Get comment content
            try {
              const commentResult = await dynamoDB.send(
                new QueryCommand({
                  TableName: TABLE_NAME,
                  KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                  ExpressionAttributeValues: {
                    ':pk': `COMMENT#${violation.commentId}`,
                    ':sk': 'META',
                  },
                  Limit: 1,
                })
              );
              const comment = commentResult.Items?.[0];
              if (comment) {
                const content = comment.content || '';
                (response as any).violationContent =
                  content.length > 200 ? content.substring(0, 200) + '...' : content;
              }
            } catch (commentError) {
              console.warn('[CheckBanStatus] Failed to get comment content:', commentError);
            }

            // Get report count
            const reportResult = await dynamoDB.send(
              new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                  ':pk': `COMMENT#${violation.commentId}`,
                  ':sk': 'REPORT#',
                },
                Select: 'COUNT',
              })
            );
            (response as any).reportCount = reportResult.Count || 0;
          }
        }
      } catch (violationError) {
        console.warn('[CheckBanStatus] Failed to get violation details:', violationError);
      }

      // Get appeal status - only for current ban (created after bannedAt)
      try {
        const appealResult = await dynamoDB.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `USER#${userId}`,
              ':sk': 'APPEAL#',
            },
            ScanIndexForward: false,
            Limit: 10, // Get more to filter by bannedAt
          })
        );

        // Filter appeal that belongs to current ban (created after bannedAt - 1 minute tolerance)
        const bannedAt = profile.bannedAt || 0;
        console.log('[CheckBanStatus] Finding appeal for current ban, bannedAt:', bannedAt);
        console.log(
          '[CheckBanStatus] All appeals:',
          appealResult.Items?.map((a) => ({
            createdAt: a.createdAt,
            status: a.status,
          }))
        );

        const appeal = appealResult.Items?.find(
          (a) => a.createdAt && a.createdAt >= bannedAt - 60000
        );

        console.log('[CheckBanStatus] Matched appeal for current ban:', appeal ? 'found' : 'none');

        if (appeal) {
          (response as any).appealStatus = appeal.status;
          if (appeal.status === 'approved' || appeal.status === 'rejected') {
            (response as any).appealReviewNotes = appeal.reviewNotes;
            (response as any).appealReviewedAt = appeal.reviewedAt;
            (response as any).appealReviewedByUsername = appeal.reviewedByUsername;
          }
          // Can only appeal if no pending appeal exists for current ban
          response.canAppeal = appeal.status !== 'pending';
        } else {
          // No appeal for current ban - user can appeal
          response.canAppeal = true;
          // Clear any appeal status from response since no appeal for current ban
          delete (response as any).appealStatus;
          delete (response as any).appealReviewNotes;
          delete (response as any).appealReviewedAt;
          delete (response as any).appealReviewedByUsername;
        }
      } catch (appealError) {
        console.warn('[CheckBanStatus] Failed to get appeal status:', appealError);
      }
    }

    return createSuccessResponse(200, response, correlationId);
  } catch (error) {
    console.error('[CheckBanStatus] Error:', error);
    return handleError(error, correlationId);
  }
}
