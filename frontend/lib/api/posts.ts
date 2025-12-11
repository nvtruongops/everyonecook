/**
 * Posts API Service
 *
 * Social posts and interactions endpoints
 */

import apiClient from './client';
import type { ApiResponse, Comment, PaginatedResponse } from '@/types';
import type { Post } from '@/types/posts';

// Re-export Comment type for convenience
export type { Comment } from '@/types';

/**
 * Get social feed
 */
export async function getFeed(nextToken?: string): Promise<ApiResponse<PaginatedResponse<Post>>> {
  const response = await apiClient.get('/feed', {
    params: { nextToken },
  });
  return response.data;
}

/**
 * Get post by ID
 */
export async function getPostById(postId: string): Promise<ApiResponse<Post>> {
  const { authService } = await import('@/services/auth-service');
  const token = await authService.getAccessToken(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      success: false,
      error: {
        code: data.code || 'FETCH_ERROR',
        message: data.error || 'Failed to fetch post',
      },
    };
  }

  // Transform backend response to match frontend Post type
  const rawPost = data.post || data;
  const transformedPost: Post = {
    postId: rawPost.postId || rawPost.post_id,
    post_id: rawPost.postId || rawPost.post_id,
    authorId: rawPost.authorId || rawPost.user_id || '',
    user_id: rawPost.authorId || rawPost.user_id,
    username: rawPost.username || rawPost.authorName || 'Unknown',
    user_avatar: rawPost.user_avatar || rawPost.authorAvatar,
    content: rawPost.title || rawPost.content || '',
    images: rawPost.images?.quickImages || rawPost.images || [],
    privacy: rawPost.privacyLevel || rawPost.privacy || 'public',
    likeCount: rawPost.likes || rawPost.likeCount || 0,
    likes_count: rawPost.likes || rawPost.likeCount || 0,
    commentCount: rawPost.comments || rawPost.commentCount || 0,
    comments_count: rawPost.comments || rawPost.commentCount || 0,
    shares_count: rawPost.shares || rawPost.shares_count || 0,
    user_reaction: rawPost.user_reaction,
    createdAt: rawPost.createdAt || Date.now(),
    created_at: rawPost.createdAt || Date.now(),
    updatedAt: rawPost.updatedAt || Date.now(),
    recipeData: rawPost.recipeData,
    recipe_id: rawPost.recipeId,
    // Shared post data
    postType: rawPost.postType,
    sharedPost: rawPost.sharedPost,
  };

  return {
    success: true,
    data: transformedPost,
  };
}

/**
 * Create new post
 *
 * @param data.content - Post content/title
 * @param data.images - Final CDN URLs for display (optional)
 * @param data.tempImageKeys - S3 temp keys for backend to move to permanent (optional)
 * @param data.recipeId - Recipe ID if sharing a recipe (optional)
 * @param data.privacy - Privacy level
 */
export async function createPost(data: {
  content: string;
  images?: string[];
  tempImageKeys?: string[];
  recipeId?: string;
  privacy: 'public' | 'friends' | 'private';
}): Promise<ApiResponse<Post>> {
  const response = await apiClient.post('/posts', data);
  return response.data;
}

/**
 * Update post
 */
export async function updatePost(postId: string, data: Partial<Post>): Promise<ApiResponse<Post>> {
  const response = await apiClient.put(`/posts/${postId}`, data);
  return response.data;
}

/**
 * Delete post
 */
export async function deletePost(postId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/posts/${postId}`);
  return response.data;
}

/**
 * Like post
 */
export async function likePost(postId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.post(`/posts/${postId}/like`);
  return response.data;
}

/**
 * Unlike post
 */
export async function unlikePost(postId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/posts/${postId}/like`);
  return response.data;
}

/**
 * Get post comments
 */
export async function getComments(
  postId: string,
  nextToken?: string
): Promise<ApiResponse<PaginatedResponse<Comment>>> {
  const response = await apiClient.get(`/posts/${postId}/comments`, {
    params: { nextToken },
  });
  return response.data;
}

/**
 * Create comment
 */
export async function createComment(
  postId: string,
  content: string
): Promise<ApiResponse<Comment>> {
  const response = await apiClient.post(`/posts/${postId}/comments`, { content });
  return response.data;
}

/**
 * Delete comment
 */
export async function deleteComment(postId: string, commentId: string): Promise<ApiResponse<void>> {
  const response = await apiClient.delete(`/posts/${postId}/comments/${commentId}`);
  return response.data;
}

/**
 * Get user's posts
 */
export async function getUserPosts(
  userId: string,
  nextToken?: string
): Promise<ApiResponse<PaginatedResponse<Post>>> {
  const response = await apiClient.get(`/users/${userId}/posts`, {
    params: { nextToken },
  });
  return response.data;
}
