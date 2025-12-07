/**
 * Comment List Component
 * Display all comments for a post with nested structure
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getComments as getCommentsApi,
  deleteComment as deleteCommentApi,
  Comment,
} from '@/lib/api/posts';
import CommentInput from './CommentInput';
import CommentItem from './CommentItem';

interface CommentListProps {
  postId: string;
  initialCommentCount?: number;
}

export default function CommentList({ postId, initialCommentCount = 0 }: CommentListProps) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [showInput, setShowInput] = useState(false);

  useEffect(() => {
    if (token) {
      loadComments();
    }
  }, [token, postId]);

  const loadComments = async (isLoadMore = false) => {
    if (!token) return;

    try {
      if (!isLoadMore) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const result = await getCommentsApi(postId, isLoadMore ? nextToken : undefined);

      // Organize comments into tree structure
      const commentMap = new Map<string, Comment & { replies?: Comment[] }>();
      const rootComments: (Comment & { replies?: Comment[] })[] = [];

      // First pass: create map of all comments
      result.comments.forEach((comment) => {
        commentMap.set(comment.comment_id, { ...comment, replies: [] });
      });

      // Second pass: organize into tree
      result.comments.forEach((comment) => {
        if (comment.parent_comment_id && commentMap.has(comment.parent_comment_id)) {
          const parent = commentMap.get(comment.parent_comment_id);
          parent?.replies?.push(commentMap.get(comment.comment_id)!);
        } else {
          rootComments.push(commentMap.get(comment.comment_id)!);
        }
      });

      if (isLoadMore) {
        setComments((prev) => [...prev, ...rootComments]);
      } else {
        setComments(rootComments);
      }

      setNextToken(result.nextToken);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleCommentCreated = () => {
    setShowInput(false);
    loadComments();
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!token) return;

    try {
      await deleteCommentApi(postId, commentId);
      // Reload comments after deletion
      loadComments();
    } catch (err) {
      throw err;
    }
  };

  const renderComment = (comment: Comment & { replies?: Comment[] }, level = 0) => {
    return (
      <div key={comment.comment_id}>
        <CommentItem
          comment={comment}
          postId={postId}
          currentUserId={user?.sub || user?.userId}
          onDelete={handleDeleteComment}
          onReplyCreated={() => loadComments()}
          level={level}
        />
        {comment.replies && comment.replies.length > 0 && (
          <div>{comment.replies.map((reply) => renderComment(reply, level + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div id={`comments-${postId}`} className="border-t border-gray-100 pt-4">
      {/* Comment Count Header */}
      <div className="px-4 mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          Comments {initialCommentCount > 0 && `(${initialCommentCount})`}
        </h3>
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Add Comment
          </button>
        )}
      </div>

      {/* Comment Input */}
      {showInput && (
        <div className="px-4 mb-4">
          <CommentInput
            postId={postId}
            onCommentCreated={handleCommentCreated}
            onCancel={() => setShowInput(false)}
            autoFocus
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="px-4 mb-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="px-4 py-8 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Comments List */}
          {comments.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-gray-500 text-sm">No comments yet</p>
              {!showInput && (
                <button
                  onClick={() => setShowInput(true)}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Be the first to comment
                </button>
              )}
            </div>
          ) : (
            <div className="px-4 space-y-4">
              {comments.map((comment) => renderComment(comment))}
            </div>
          )}

          {/* Load More Button */}
          {nextToken && (
            <div className="px-4 mt-4">
              <button
                onClick={() => loadComments(true)}
                disabled={loadingMore}
                className="w-full py-2 text-sm text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load more comments'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
