/**
 * Get Detailed Stats Handler
 *
 * Admin endpoint to retrieve detailed statistics with time-based filtering.
 *
 * GET /admin/stats/detailed?period=day|week|month&date=2025-12-04
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireAdminRole } from '../middleware/admin-auth';
import { handleError, createSuccessResponse } from '../utils/error-handler';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const dynamoDB = DynamoDBDocumentClient.from(dynamoClient);
const TABLE_NAME = process.env.DYNAMODB_TABLE || 'EveryoneCook';

type Period = 'day' | 'week' | 'month' | 'custom';
const VN_OFFSET = 7 * 60 * 60 * 1000;

interface TimeRange {
  start: number;
  end: number;
}
interface HourlyData {
  hour: number;
  count: number;
}
interface DailyData {
  date: string;
  count: number;
}

interface DetailedStats {
  period: Period;
  timeRange: { start: string; end: string };
  activeUsers: { total: number; hourly?: HourlyData[]; daily?: DailyData[] };
  newUsers: { total: number; hourly?: HourlyData[]; daily?: DailyData[] };
  posts: { total: number; hourly?: HourlyData[]; daily?: DailyData[] };
  reports: {
    total: number;
    posts: number;
    comments: number;
    hourly?: HourlyData[];
    daily?: DailyData[];
  };
}

/**
 * Get time range based on period (Vietnam timezone UTC+7)
 */
function getTimeRange(period: Period, customDate?: string): TimeRange {
  const now = new Date();
  let start: number;
  let end: number;

  if (period === 'custom' && customDate) {
    // Custom date: parse YYYY-MM-DD and get full day in VN timezone
    const [year, month, day] = customDate.split('-').map(Number);
    const startOfDayVN = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endOfDayVN = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
    start = startOfDayVN.getTime() - VN_OFFSET;
    end = endOfDayVN.getTime() - VN_OFFSET;
    return { start, end };
  }

  end = now.getTime();

  switch (period) {
    case 'day': {
      const nowVN = new Date(now.getTime() + VN_OFFSET);
      const startOfDayVN = new Date(nowVN);
      startOfDayVN.setUTCHours(0, 0, 0, 0);
      start = startOfDayVN.getTime() - VN_OFFSET;
      break;
    }
    case 'week': {
      const nowVN = new Date(now.getTime() + VN_OFFSET);
      const startOfDayVN = new Date(nowVN);
      startOfDayVN.setUTCHours(0, 0, 0, 0);
      start = startOfDayVN.getTime() - VN_OFFSET - 6 * 24 * 60 * 60 * 1000;
      break;
    }
    case 'month': {
      const nowVN = new Date(now.getTime() + VN_OFFSET);
      const startOfDayVN = new Date(nowVN);
      startOfDayVN.setUTCHours(0, 0, 0, 0);
      start = startOfDayVN.getTime() - VN_OFFSET - 29 * 24 * 60 * 60 * 1000;
      break;
    }
    default:
      start = end - 24 * 60 * 60 * 1000;
  }

  return { start, end };
}

/**
 * Group activity logs by hour - count UNIQUE users per hour
 * Uses activity logs for accurate hourly tracking
 */
function groupActiveUsersByHour(activityLogs: { userId: string; hour: number }[]): HourlyData[] {
  const hourlyUsers: Map<number, Set<string>> = new Map();

  for (let h = 0; h < 24; h++) {
    hourlyUsers.set(h, new Set());
  }

  for (const { userId, hour } of activityLogs) {
    hourlyUsers.get(hour)?.add(userId);
  }

  return Array.from(hourlyUsers.entries())
    .map(([hour, users]) => ({ hour, count: users.size }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Group activity logs by day - count UNIQUE users per day
 * Uses activity logs for accurate daily tracking
 */
function groupActiveUsersByDay(
  activityLogs: { userId: string; date: string }[],
  range: TimeRange
): DailyData[] {
  const dailyUsers: Map<string, Set<string>> = new Map();

  const startDateVN = new Date(range.start + VN_OFFSET);
  const endDateVN = new Date(range.end + VN_OFFSET);
  for (let d = new Date(startDateVN); d <= endDateVN; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyUsers.set(dateStr, new Set());
  }

  for (const { userId, date } of activityLogs) {
    if (dailyUsers.has(date)) {
      dailyUsers.get(date)?.add(userId);
    }
  }

  return Array.from(dailyUsers.entries())
    .map(([date, users]) => ({ date, count: users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Group user registrations by hour - count UNIQUE new users per hour
 * Uses timestamp for new user tracking
 */
function groupNewUsersByHour(
  userLogins: { userId: string; timestamp: number }[],
  range: TimeRange
): HourlyData[] {
  const hourlyUsers: Map<number, Set<string>> = new Map();

  for (let h = 0; h < 24; h++) {
    hourlyUsers.set(h, new Set());
  }

  for (const { userId, timestamp } of userLogins) {
    if (timestamp >= range.start && timestamp <= range.end) {
      const vnTime = new Date(timestamp + VN_OFFSET);
      const hour = vnTime.getUTCHours();
      hourlyUsers.get(hour)?.add(userId);
    }
  }

  return Array.from(hourlyUsers.entries())
    .map(([hour, users]) => ({ hour, count: users.size }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Group user registrations by day - count UNIQUE new users per day
 * Uses timestamp for new user tracking
 */
function groupNewUsersByDay(
  userLogins: { userId: string; timestamp: number }[],
  range: TimeRange
): DailyData[] {
  const dailyUsers: Map<string, Set<string>> = new Map();

  const startDateVN = new Date(range.start + VN_OFFSET);
  const endDateVN = new Date(range.end + VN_OFFSET);
  for (let d = new Date(startDateVN); d <= endDateVN; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    dailyUsers.set(dateStr, new Set());
  }

  for (const { userId, timestamp } of userLogins) {
    if (timestamp >= range.start && timestamp <= range.end) {
      const vnTime = new Date(timestamp + VN_OFFSET);
      const dateStr = vnTime.toISOString().split('T')[0];
      dailyUsers.get(dateStr)?.add(userId);
    }
  }

  return Array.from(dailyUsers.entries())
    .map(([date, users]) => ({ date, count: users.size }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetch activity logs from DynamoDB for a date range
 * Activity logs are stored as: PK=ACTIVITY_LOG#<date>, SK=<hour>#<userId>
 */
async function fetchActivityLogs(
  dynamoDB: DynamoDBDocumentClient,
  tableName: string,
  range: TimeRange
): Promise<{ userId: string; hour: number; date: string }[]> {
  const startDateVN = new Date(range.start + VN_OFFSET);
  const endDateVN = new Date(range.end + VN_OFFSET);
  const logs: { userId: string; hour: number; date: string }[] = [];

  // Query each date in the range
  for (let d = new Date(startDateVN); d <= endDateVN; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];

    try {
      const result = await dynamoDB.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `ACTIVITY_LOG#${dateStr}`,
          },
          ProjectionExpression: 'userId, #h, #d',
          ExpressionAttributeNames: {
            '#h': 'hour',
            '#d': 'date',
          },
        })
      );

      for (const item of result.Items || []) {
        logs.push({
          userId: item.userId as string,
          hour: item.hour as number,
          date: item.date as string,
        });
      }
    } catch (error) {
      console.warn(`Failed to fetch activity logs for ${dateStr}:`, error);
    }
  }

  return logs;
}

/**
 * Group timestamps by hour (for posts, reports, etc.)
 */
function groupByHour(timestamps: number[], range: TimeRange): HourlyData[] {
  const hourly: Map<number, number> = new Map();
  for (let h = 0; h < 24; h++) hourly.set(h, 0);

  for (const ts of timestamps) {
    if (ts >= range.start && ts <= range.end) {
      const vnTime = new Date(ts + VN_OFFSET);
      const hour = vnTime.getUTCHours();
      hourly.set(hour, (hourly.get(hour) || 0) + 1);
    }
  }

  return Array.from(hourly.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Group timestamps by day (for posts, reports, etc.)
 */
function groupByDay(timestamps: number[], range: TimeRange): DailyData[] {
  const daily: Map<string, number> = new Map();

  const startDateVN = new Date(range.start + VN_OFFSET);
  const endDateVN = new Date(range.end + VN_OFFSET);
  for (let d = new Date(startDateVN); d <= endDateVN; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    daily.set(dateStr, 0);
  }

  for (const ts of timestamps) {
    if (ts >= range.start && ts <= range.end) {
      const vnTime = new Date(ts + VN_OFFSET);
      const dateStr = vnTime.toISOString().split('T')[0];
      daily.set(dateStr, (daily.get(dateStr) || 0) + 1);
    }
  }

  return Array.from(daily.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const toTimestamp = (value: string | number | undefined): number | null => {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ts = new Date(value).getTime();
    return isNaN(ts) ? null : ts;
  }
  return null;
};

/**
 * Get Detailed Stats Handler
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const correlationId = event.requestContext?.requestId || `stats-${Date.now()}`;
  console.log('[GetDetailedStats] Starting handler', { correlationId });

  try {
    requireAdminRole(event);

    const period = (event.queryStringParameters?.period as Period) || 'day';
    const customDate = event.queryStringParameters?.date;
    const range = getTimeRange(period === 'custom' || customDate ? 'custom' : period, customDate);

    console.log('[GetDetailedStats] Period:', period, 'Date:', customDate, 'Range:', range);

    // Fetch data in parallel
    const [usersData, postsData, reportsData, activityLogs] = await Promise.all([
      dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'SK = :sk',
          ExpressionAttributeValues: { ':sk': 'PROFILE' },
          ProjectionExpression: 'userId, username, createdAt, lastLoginAt, lastActivityAt, #r',
          ExpressionAttributeNames: { '#r': 'role' },
        })
      ),
      dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
          ExpressionAttributeValues: { ':pk': 'POST#', ':sk': 'METADATA' },
          ProjectionExpression: 'postId, createdAt',
        })
      ),
      dynamoDB.send(
        new ScanCommand({
          TableName: TABLE_NAME,
          FilterExpression: 'begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':sk': 'REPORT#' },
          ProjectionExpression: 'reportId, createdAt, postId, commentId',
        })
      ),
      // Fetch activity logs for accurate hourly/daily tracking
      fetchActivityLogs(dynamoDB, TABLE_NAME, range),
    ]);

    // Filter out admin users from stats
    const users = (usersData.Items || []).filter(
      (u) => u.role !== 'admin' && u.username !== 'admin'
    );
    const posts = postsData.Items || [];
    const reports = reportsData.Items || [];

    // Get admin user IDs to exclude from activity logs
    const adminUserIds = new Set(
      (usersData.Items || [])
        .filter((u) => u.role === 'admin' || u.username === 'admin')
        .map((u) => u.userId as string)
    );

    // Get valid user IDs (users with profiles, excluding admins)
    const validUserIds = new Set(users.map((u) => u.userId as string));

    // Active users - use activity logs for accurate hourly tracking
    // Activity logs record each hour a user was active (not just the last activity)
    // Fallback to lastActivityAt for users who were active before activity logging was implemented
    // Filter out admin users AND users without profiles from activity logs
    const filteredActivityLogs = activityLogs.filter(
      (log) => !adminUserIds.has(log.userId) && validUserIds.has(log.userId)
    );
    const activeUserIdsFromLogs = new Set(filteredActivityLogs.map((log) => log.userId));

    // Also include users with lastActivityAt in range but not in logs (backward compatibility)
    // These users were active before activity logging was implemented
    const usersWithRecentActivity = users.filter((u) => {
      const activityTime = u.lastActivityAt || u.lastLoginAt;
      return activityTime && activityTime >= range.start && activityTime <= range.end;
    });

    // Add fallback users to activity logs for chart display
    // This ensures users with only lastActivityAt are shown in the correct hour
    const combinedActivityLogs = [...filteredActivityLogs];
    for (const user of usersWithRecentActivity) {
      // Only add if user is not already in activity logs
      if (!activeUserIdsFromLogs.has(user.userId as string)) {
        const activityTime = (user.lastActivityAt || user.lastLoginAt) as number;
        const vnTime = new Date(activityTime + VN_OFFSET);
        const date = vnTime.toISOString().split('T')[0];
        const hour = vnTime.getUTCHours();

        combinedActivityLogs.push({
          userId: user.userId as string,
          hour,
          date,
        });
      }
      activeUserIdsFromLogs.add(user.userId as string);
    }

    // Count unique active users in the entire range
    const uniqueActiveUserIds = activeUserIdsFromLogs;

    // New users - collect userId + timestamp pairs (exclude admins)
    const newUserLogins = users
      .filter((u) => u.createdAt && u.createdAt >= range.start && u.createdAt <= range.end)
      .map((u) => ({ userId: u.userId as string, timestamp: u.createdAt as number }));

    const uniqueNewUserIds = new Set(newUserLogins.map((u) => u.userId));

    // Posts
    const postTimes = posts
      .map((p) => toTimestamp(p.createdAt))
      .filter((ts): ts is number => ts !== null && ts >= range.start && ts <= range.end);

    // Reports
    const reportTimes = reports
      .map((r) => toTimestamp(r.createdAt))
      .filter((ts): ts is number => ts !== null && ts >= range.start && ts <= range.end);

    const postReports = reports.filter((r) => {
      const ts = toTimestamp(r.createdAt);
      return r.postId && !r.commentId && ts !== null && ts >= range.start && ts <= range.end;
    });
    const commentReports = reports.filter((r) => {
      const ts = toTimestamp(r.createdAt);
      return r.commentId && ts !== null && ts >= range.start && ts <= range.end;
    });

    // Use hourly view for day period, daily view for week/month
    const effectivePeriod = customDate ? 'day' : period;
    const isHourlyView = effectivePeriod === 'day';

    const stats: DetailedStats = {
      period: effectivePeriod,
      timeRange: {
        start: new Date(range.start).toISOString(),
        end: new Date(range.end).toISOString(),
      },
      activeUsers: {
        total: uniqueActiveUserIds.size,
        ...(isHourlyView
          ? { hourly: groupActiveUsersByHour(combinedActivityLogs) }
          : { daily: groupActiveUsersByDay(combinedActivityLogs, range) }),
      },
      newUsers: {
        total: uniqueNewUserIds.size,
        ...(isHourlyView
          ? { hourly: groupNewUsersByHour(newUserLogins, range) }
          : { daily: groupNewUsersByDay(newUserLogins, range) }),
      },
      posts: {
        total: postTimes.length,
        ...(isHourlyView
          ? { hourly: groupByHour(postTimes, range) }
          : { daily: groupByDay(postTimes, range) }),
      },
      reports: {
        total: reportTimes.length,
        posts: postReports.length,
        comments: commentReports.length,
        ...(isHourlyView
          ? { hourly: groupByHour(reportTimes, range) }
          : { daily: groupByDay(reportTimes, range) }),
      },
    };

    return createSuccessResponse(200, stats, correlationId);
  } catch (error) {
    console.error('[GetDetailedStats] Handler error:', error);
    return handleError(error, correlationId);
  }
}
