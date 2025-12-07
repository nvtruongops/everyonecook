/**
 * Trending Handlers
 *
 * API handlers for weekly trending:
 * - Top searches (combined)
 * - Top liked posts
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { TrendingService } from '../services/trending.service';

const trendingService = new TrendingService();

function createResponse(statusCode: number, body: any): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

/**
 * Get all trending data
 * GET /trending
 */
export async function getAllTrending(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '5', 10);
    const result = await trendingService.getAllTrending(limit);
    return createResponse(200, result);
  } catch (error: any) {
    console.error('Error getting all trending:', error);
    return createResponse(500, { error: error.message || 'Failed to get trending data' });
  }
}

/**
 * Get top searches this week
 * GET /trending/searches
 */
export async function getTrendingSearches(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '10', 10);
    const result = await trendingService.getTopSearches(limit);
    return createResponse(200, result);
  } catch (error: any) {
    console.error('Error getting trending searches:', error);
    return createResponse(500, { error: error.message || 'Failed to get trending searches' });
  }
}

/**
 * Get top liked posts this week
 * GET /trending/posts
 */
export async function getTrendingPosts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const limit = parseInt(event.queryStringParameters?.limit || '10', 10);
    const result = await trendingService.getTopLikedPosts(limit);
    return createResponse(200, result);
  } catch (error: any) {
    console.error('Error getting trending posts:', error);
    return createResponse(500, { error: error.message || 'Failed to get trending posts' });
  }
}

/**
 * Track a search event
 * POST /trending/track-search
 * Body: { searchTerm: string }
 */
export async function trackSearch(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const body = JSON.parse(event.body || '{}');
    const { searchTerm } = body;

    if (!searchTerm) {
      return createResponse(400, { error: 'searchTerm is required' });
    }

    await trendingService.trackSearch(searchTerm);
    return createResponse(200, { success: true });
  } catch (error: any) {
    console.error('Error tracking search:', error);
    return createResponse(500, { error: error.message || 'Failed to track search' });
  }
}

/**
 * Cleanup previous week trending data
 * DELETE /trending/cleanup
 * Admin only - deletes all trending data from previous week
 */
export async function cleanupTrending(_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const result = await trendingService.cleanupPreviousWeek();
    return createResponse(200, {
      success: true,
      message: `Cleaned up trending data for week ${result.weekId}`,
      deletedSearches: result.deletedSearches,
      deletedPosts: result.deletedPosts,
    });
  } catch (error: any) {
    console.error('Error cleaning up trending:', error);
    return createResponse(500, { error: error.message || 'Failed to cleanup trending data' });
  }
}

/**
 * Scheduled cleanup handler for EventBridge
 * Triggered every Monday at 00:00 UTC
 */
export async function scheduledCleanup(): Promise<void> {
  try {
    const result = await trendingService.cleanupPreviousWeek();
    console.log('Scheduled cleanup completed:', result);
  } catch (error) {
    console.error('Scheduled cleanup failed:', error);
    throw error;
  }
}
