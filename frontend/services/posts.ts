/**
 * Posts Service
 * API calls for social posts
 */

export interface Post {
  postId: string;
  authorId: string;
  postType: 'quick' | 'recipe_share';
  recipeId?: string;
  title: string;
  caption: string;
  images: {
    type: 'quick' | 'recipe';
    quickImages?: string[];
    recipeImages?: string[];
  };
  ingredients?: string[];
  servings?: number;
  cookingTime?: number;
  difficulty?: string;
  privacyLevel: 'public' | 'friends' | 'private';
  tags: string[];
  likes: number;
  comments: number;
  shares: number;
  views: number;
  status: 'active' | 'under_review' | 'hidden';
  createdAt: string;
  updatedAt: string;
}

export interface PostsResponse {
  posts: Post[];
  nextToken?: string;
  hasMore: boolean;
}

/**
 * Get posts by user ID
 * GET /users/{userId}/posts
 */
export async function getUserPosts(
  token: string,
  userId: string,
  limit: number = 20,
  nextToken?: string
): Promise<PostsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (nextToken) {
    params.append('nextToken', nextToken);
  }

  const response = await fetch(`${apiUrl}/users/${userId}/posts?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch posts');
  }

  const result = await response.json();
  return {
    posts: result.posts || [],
    nextToken: result.nextToken,
    hasMore: result.hasMore || false,
  };
}

/**
 * Comment interface
 */
export interface Comment {
  commentId: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get comments for a post
 * GET /posts/{postId}/comments
 */
export async function getComments(
  token: string,
  postId: string,
  limit: number = 50,
  nextToken?: string
): Promise<{ comments: Comment[]; nextToken?: string; hasMore: boolean }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (nextToken) {
    params.append('nextToken', nextToken);
  }

  const response = await fetch(`${apiUrl}/posts/${postId}/comments?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch comments');
  }

  const result = await response.json();
  return {
    comments: result.comments || [],
    nextToken: result.nextToken,
    hasMore: result.hasMore || false,
  };
}

/**
 * Create a comment on a post
 * POST /posts/{postId}/comments
 */
export async function createComment(
  token: string,
  postId: string,
  content: string
): Promise<Comment> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create comment');
  }

  const result = await response.json();
  // Backend returns { message, comment }
  return result.comment || result;
}

/**
 * Delete a comment
 * DELETE /posts/{postId}/comments/{commentId}
 */
export async function deleteComment(
  token: string,
  postId: string,
  commentId: string
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/comments/${commentId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete comment');
  }
}

/**
 * Add a reaction to a post
 * POST /posts/{postId}/reactions
 *
 * Backend expects: targetId, targetType, reactionType in body
 * Note: Backend is idempotent - if same reaction exists, returns existing
 */
export async function addReaction(
  token: string,
  postId: string,
  reactionType: 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/reactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetId: postId,
      targetType: 'post',
      reactionType,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to add reaction');
  }
}

/**
 * Remove a reaction from a post
 * DELETE /posts/{postId}/reactions
 *
 * Backend expects: targetId, targetType in body
 * Note: 404 is treated as success (reaction already removed or never existed)
 */
export async function removeReaction(token: string, postId: string): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/reactions`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetId: postId,
      targetType: 'post',
    }),
  });

  // 404 means reaction doesn't exist - treat as success (idempotent)
  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to remove reaction');
  }
}

/**
 * Delete a post
 * DELETE /posts/{postId}
 */
export async function deletePost(token: string, postId: string): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete post');
  }
}

/**
 * Update a post (title only)
 * PUT /posts/{postId}
 *
 * Edit restrictions:
 * - Owner can only edit TITLE (content field)
 * - Privacy level can be changed
 */
export async function updatePost(
  token: string,
  postId: string,
  data: {
    title?: string;
    privacyLevel?: 'public' | 'friends' | 'private';
  }
): Promise<Post> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update post');
  }

  const result = await response.json();
  return result.post;
}

/**
 * Create a new post
 * POST /posts
 */
export async function createPost(
  token: string,
  postData: {
    postType: 'quick' | 'recipe_share';
    recipeId?: string;
    title: string;
    caption: string;
    images: {
      type: 'quick' | 'recipe';
      quickImages?: string[];
      recipeImages?: string[];
    };
    ingredients?: string[];
    servings?: number;
    cookingTime?: number;
    difficulty?: string;
    privacyLevel: 'public' | 'friends' | 'private';
    tags: string[];
  }
): Promise<Post> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create post');
  }

  return response.json();
}

/**
 * Upload result containing both temp key and final URL
 */
export interface UploadResult {
  tempKey: string; // S3 key in temp folder (for backend to move)
  imageUrl: string; // Final CDN URL (after post is created)
}

/**
 * Upload post image using presigned URL
 *
 * Flow:
 * 1. Get presigned URL from backend → uploads to posts/temp/{userId}/
 * 2. Upload file directly to S3 temp folder
 * 3. Return tempKey for backend to move when post is created
 * 4. If user cancels, S3 lifecycle auto-deletes temp files after 24h
 *
 * POST /posts/upload-image
 */
export async function uploadPostImage(token: string, file: File): Promise<UploadResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  // Step 1: Get presigned URL from backend
  const presignedResponse = await fetch(`${apiUrl}/posts/upload-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  if (!presignedResponse.ok) {
    const error = await presignedResponse.json();
    throw new Error(error.error || 'Failed to get upload URL');
  }

  const { uploadUrl, tempKey, imageUrl } = await presignedResponse.json();

  // Step 2: Upload file directly to S3 temp folder
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload image to storage');
  }

  // Return both tempKey (for backend) and imageUrl (for display after post created)
  return { tempKey, imageUrl };
}

/**
 * Get a single post by ID
 * GET /posts/{postId}
 */
export async function getPost(token: string, postId: string): Promise<Post | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch post');
  }

  const result = await response.json();
  return result.post || result;
}

/**
 * Get feed posts (public + friends)
 * GET /feed
 */
export async function getFeed(
  token: string,
  limit: number = 20,
  nextToken?: string
): Promise<PostsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';
  const params = new URLSearchParams({
    limit: limit.toString(),
  });

  if (nextToken) {
    params.append('nextToken', nextToken);
  }

  const response = await fetch(`${apiUrl}/feed?${params}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch feed');
  }

  const result = await response.json();
  return {
    posts: result.posts || [],
    nextToken: result.nextToken,
    hasMore: result.hasMore || false,
  };
}

/**
 * Report reason types
 */
export type ReportReason =
  | 'spam'
  | 'inappropriate'
  | 'harassment'
  | 'violence'
  | 'hate_speech'
  | 'misinformation'
  | 'copyright'
  | 'other';

/**
 * Report a post
 * POST /posts/{postId}/report
 */
export async function reportPost(
  token: string,
  postId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason, details }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to report post');
  }
}

/**
 * Share a post (like Facebook share)
 * POST /api/posts/{postId}/share (via Next.js proxy)
 *
 * Creates a NEW post with reference to original post:
 * - postType: 'shared'
 * - sharedPost: contains reference to original post
 * - If original post is deleted, shared post shows "Post không khả dụng"
 */
export async function sharePost(
  token: string,
  postId: string,
  caption?: string,
  privacy?: 'public' | 'friends' | 'private'
): Promise<{ message: string; post: Post }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const response = await fetch(`${apiUrl}/posts/${postId}/share`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      caption,
      privacy: privacy || 'public',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Không thể chia sẻ bài viết');
  }

  return response.json();
}

/**
 * Post stats response from polling endpoint
 */
export interface PostStats {
  likes_count: number;
  comments_count: number;
  user_reaction?: string;
}

export interface PostsStatsResponse {
  stats: Record<string, PostStats>;
}

/**
 * Get stats for multiple posts (optimized for polling)
 * POST /posts/stats
 *
 * @param token - Auth token (optional for public posts)
 * @param postIds - Array of post IDs to get stats for (max 50)
 * @returns Stats for each post
 */
export async function getPostsStats(
  token: string | null,
  postIds: string[]
): Promise<PostsStatsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${apiUrl}/posts/stats`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ postIds }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to fetch posts stats');
  }

  return response.json();
}
