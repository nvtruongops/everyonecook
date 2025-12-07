/**
 * Trending Service
 * API calls for weekly trending data
 */

export interface SearchTrendingItem {
  term: string;
  searchCount: number;
  weekId: string;
}

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

export interface AllTrendingResponse {
  weekId: string;
  topSearches: SearchTrendingItem[];
  topPosts: PostTrendingItem[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

/**
 * Get all trending data (combined)
 */
export async function getAllTrending(
  token: string,
  limit: number = 5
): Promise<AllTrendingResponse> {
  const response = await fetch(`${API_URL}/trending?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch trending data');
  }

  return response.json();
}

/**
 * Get top searches this week
 */
export async function getTrendingSearches(
  token: string,
  limit: number = 10
): Promise<{ items: SearchTrendingItem[]; weekId: string }> {
  const response = await fetch(`${API_URL}/trending/searches?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch trending searches');
  }

  return response.json();
}

/**
 * Get top liked posts this week
 */
export async function getTrendingPosts(
  token: string,
  limit: number = 10
): Promise<{ items: PostTrendingItem[]; weekId: string }> {
  const response = await fetch(`${API_URL}/trending/posts?limit=${limit}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch trending posts');
  }

  return response.json();
}

/**
 * Track a search event for trending
 */
export async function trackSearch(token: string, searchTerm: string): Promise<void> {
  await fetch(`${API_URL}/trending/track-search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ searchTerm }),
  });
}
