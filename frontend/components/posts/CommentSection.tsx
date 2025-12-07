'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getComments, createComment, deleteComment, Comment } from '@/services/posts';
import CachedAvatar from '@/components/ui/CachedAvatar';
import { useAvatarPreload } from '@/hooks/useAvatarPreload';

import ReportCommentModal from './ReportCommentModal';

interface CommentSectionProps {
  postId: string;
  onCommentCountChange?: (count: number) => void;
  highlightCommentId?: string | null;
}

export default function CommentSection({
  postId,
  onCommentCountChange,
  highlightCommentId,
}: CommentSectionProps) {
  const { token, user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ username: string; commentId: string } | null>(
    null
  );
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Preload comment avatars
  useAvatarPreload(comments, (c) => c.authorAvatar);

  // Notify parent of comment count changes
  const updateCommentCount = useCallback(
    (count: number) => {
      onCommentCountChange?.(count);
    },
    [onCommentCountChange]
  );

  // Load comments on mount and poll every 10 seconds for real-time updates
  useEffect(() => {
    if (!token) return;

    loadComments(false); // Initial load with loading spinner

    // Poll every 10 seconds for new comments from other users
    const interval = setInterval(() => {
      loadComments(true); // Polling without loading spinner
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, token]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll to highlighted comment when loaded
  useEffect(() => {
    if (highlightCommentId && comments.length > 0 && !loading) {
      const commentEl = commentRefs.current.get(highlightCommentId);
      if (commentEl) {
        setTimeout(() => {
          commentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    }
  }, [highlightCommentId, comments, loading]);

  // Sort comments by createdAt (newest first)
  const sortCommentsByTime = (commentsToSort: Comment[]): Comment[] => {
    return [...commentsToSort].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA; // Descending (newest first)
    });
  };

  const loadComments = async (isPolling = false) => {
    if (!token) return;

    // Only show loading spinner on initial load, not polling
    if (!isPolling) setLoading(true);

    try {
      const result = await getComments(token, postId);
      const sortedComments = sortCommentsByTime(result.comments || []);

      // Merge with optimistic comments (temp-* IDs) to preserve them during polling
      setComments((prev) => {
        const optimisticComments = prev.filter((c) => c.commentId.startsWith('temp-'));
        const serverCommentIds = new Set(sortedComments.map((c) => c.commentId));

        // Keep optimistic comments that haven't been confirmed by server yet
        const pendingOptimistic = optimisticComments.filter(
          (c) => !serverCommentIds.has(c.commentId)
        );

        return sortCommentsByTime([...sortedComments, ...pendingOptimistic]);
      });

      updateCommentCount(sortedComments.length);
      setError(null);
    } catch (err) {
      // Don't show error for polling failures
      if (!isPolling) {
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  };

  // Handle reply to a comment
  const handleReply = (username: string, commentId: string) => {
    setReplyingTo({ username, commentId });
    setNewComment(`@${username} `);
    inputRef.current?.focus();
  };

  // Open report modal for a comment
  const openReportModal = (commentId: string) => {
    setOpenMenuId(null);
    setReportingCommentId(commentId);
  };

  // Cancel reply
  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  const handleSubmit = async () => {
    if (!token || !user || !newComment.trim() || submitting) return;

    const commentContent = newComment.trim();
    const tempId = `temp-${Date.now()}`;

    // Clear reply state
    setReplyingTo(null);

    // Optimistic update: Add comment immediately
    const optimisticComment: Comment = {
      commentId: tempId,
      postId,
      authorId: user.sub || user.userId || '',
      authorName: user.fullName || user.username || user.email || 'You',
      authorAvatar: user.avatarUrl,
      content: commentContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add new comment at the end (newest)
    setComments((prev) => sortCommentsByTime([...prev, optimisticComment]));
    updateCommentCount(comments.length + 1);
    setNewComment('');
    setSubmitting(true);
    setError(null);

    try {
      const createdComment = await createComment(token, postId, commentContent);

      // Replace temp comment with real one and re-sort
      setComments((prev) => {
        const updated = prev.map((c) =>
          c.commentId === tempId
            ? {
                ...optimisticComment,
                ...createdComment,
                // Ensure we have commentId (use temp if not returned)
                commentId: createdComment.commentId || tempId,
                // Ensure we have all display fields
                authorName: createdComment.authorName || optimisticComment.authorName,
                authorAvatar: createdComment.authorAvatar || optimisticComment.authorAvatar,
              }
            : c
        );
        return sortCommentsByTime(updated);
      });
    } catch (err) {
      // Revert optimistic update on error
      setComments((prev) => prev.filter((c) => c.commentId !== tempId));
      updateCommentCount(comments.length);
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!token || deletingId) return;
    setOpenMenuId(null);

    // Find the comment to delete (for potential revert)
    const commentToDelete = comments.find((c) => c.commentId === commentId);
    if (!commentToDelete) return;

    // Optimistic update: Remove comment immediately
    setComments((prev) => prev.filter((c) => c.commentId !== commentId));
    updateCommentCount(comments.length - 1);
    setDeletingId(commentId);

    try {
      await deleteComment(token, postId, commentId);
    } catch (err) {
      // Revert optimistic update on error
      setComments((prev) => {
        // Insert back at original position (approximate - at end)
        return [...prev, commentToDelete];
      });
      updateCommentCount(comments.length);
      setError(err instanceof Error ? err.message : 'Failed to delete comment');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('vi-VN');
  };

  return (
    <div className="border-t border-[#203d11]/10 pt-3 mt-3">
      {/* Comment Form */}
      <div className="mb-4">
        {/* Reply indicator */}
        {replyingTo && (
          <div className="flex items-center gap-2 mb-2 ml-10 text-xs text-[#203d11]/60">
            <span>
              Đang trả lời <span className="text-[#975b1d] font-medium">@{replyingTo.username}</span>
            </span>
            <button
              onClick={cancelReply}
              className="text-[#203d11]/40 hover:text-[#203d11]"
              title="Hủy trả lời"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-shrink-0 pb-1">
            <CachedAvatar
              isCurrentUser
              alt={user?.fullName || user?.email || 'User avatar'}
              fallbackText={user?.fullName}
              size="sm"
            />
          </div>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyingTo ? `Trả lời @${replyingTo.username}...` : 'Viết bình luận...'}
              rows={1}
              className="w-full px-4 py-2 pr-10 bg-[#f5f0e8]/50 rounded-2xl text-sm text-[#203d11] placeholder:text-[#203d11]/50 focus:outline-none focus:ring-2 focus:ring-[#975b1d] resize-none overflow-hidden"
              style={{ minHeight: '40px', maxHeight: '120px' }}
              disabled={submitting}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyingTo) {
                  cancelReply();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              className="absolute right-2 bottom-2 p-1.5 text-[#203d11] hover:text-[#975b1d] disabled:text-[#203d11]/30 disabled:cursor-not-allowed transition-colors"
              title="Gửi bình luận"
            >
              <svg className={`w-5 h-5 ${submitting ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-xs text-[#203d11]/40 mt-1 ml-10">
          Nhấn Enter để xuống dòng, click gửi để đăng
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Comments List */}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
        </div>
      ) : comments.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-4">No comments yet</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const commentId = comment.commentId;
            const authorId = comment.authorId;
            const authorName = comment.authorName || 'Unknown User';
            const content = comment.content;
            const createdAt = comment.createdAt;
            const isOwner = user?.sub === authorId;
            const isHighlighted = highlightCommentId === commentId;

            return (
              <div
                key={commentId}
                ref={(el) => {
                  if (el) commentRefs.current.set(commentId, el);
                }}
                className={`flex gap-2 group transition-all duration-500 ${isHighlighted ? 'bg-yellow-50 -mx-2 px-2 py-1 rounded-lg ring-2 ring-yellow-300' : ''}`}
              >
                <div className="flex-shrink-0">
                  <CachedAvatar
                    src={comment.authorAvatar}
                    alt={`${authorName} avatar`}
                    fallbackText={authorName}
                    size="sm"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="bg-gray-100 rounded-2xl px-3 py-2 relative">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <span className="font-medium text-sm text-gray-900">{authorName}</span>
                        <p className="text-sm text-[#203d11] break-words whitespace-pre-wrap">
                          {/* Highlight @mentions */}
                          {content.split(/(@\w+)/g).map((part, i) =>
                            part.startsWith('@') ? (
                              <span key={i} className="text-[#975b1d] font-medium">
                                {part}
                              </span>
                            ) : (
                              part
                            )
                          )}
                        </p>
                      </div>
                      <div className="relative" ref={openMenuId === commentId ? menuRef : null}>
                        <button
                          onClick={() => setOpenMenuId(openMenuId === commentId ? null : commentId)}
                          className="p-1 text-[#203d11]/40 hover:text-[#203d11] opacity-0 group-hover:opacity-100 transition-opacity"
                          title="More options"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                          </svg>
                        </button>
                        {openMenuId === commentId && (
                          <div className="absolute right-0 top-6 bg-white border border-[#203d11]/10 rounded-xl shadow-lg py-1 z-10 min-w-[120px]">
                            {isOwner ? (
                              <button
                                onClick={() => handleDelete(commentId)}
                                className="w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                Xóa
                              </button>
                            ) : (
                              <button
                                onClick={() => openReportModal(commentId)}
                                className="w-full px-3 py-1.5 text-left text-sm text-[#975b1d] hover:bg-[#f5f0e8] flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                                </svg>
                                Báo cáo
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-3 mt-1">
                    <span className="text-xs text-[#203d11]/50">{formatTime(createdAt)}</span>
                    {!isOwner && (
                      <button
                        onClick={() => handleReply(authorName, commentId)}
                        className="text-xs text-[#203d11]/50 hover:text-[#975b1d] font-medium"
                      >
                        Trả lời
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Comment Modal */}
      <ReportCommentModal
        postId={postId}
        commentId={reportingCommentId || ''}
        isOpen={!!reportingCommentId}
        onClose={() => setReportingCommentId(null)}
      />
    </div>
  );
}
