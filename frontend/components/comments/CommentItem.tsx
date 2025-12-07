/**
 * Comment Item Component
 * Display individual comment with nested replies
 */

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Comment, reportComment, CommentReportReason } from '@/services/comments';
import { useAuth } from '@/contexts/AuthContext';
import CommentInput from './CommentInput';

interface CommentItemProps {
  comment: Comment;
  postId: string;
  currentUserId?: string;
  onDelete?: (commentId: string) => void;
  onReplyCreated?: () => void;
  level?: number;
}

const REPORT_REASONS: { value: CommentReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Quấy rối' },
  { value: 'hate_speech', label: 'Ngôn từ thù địch' },
  { value: 'inappropriate', label: 'Nội dung không phù hợp' },
  { value: 'misinformation', label: 'Thông tin sai lệch' },
  { value: 'other', label: 'Khác' },
];

export default function CommentItem({
  comment,
  postId,
  currentUserId,
  onDelete,
  onReplyCreated,
  level = 0,
}: CommentItemProps) {
  const { token } = useAuth();
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<CommentReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  // Check if current user owns this comment
  // API may return user_id or authorId depending on the endpoint
  const commentUserId = comment.user_id || (comment as any).authorId;
  const isOwnComment = currentUserId && commentUserId && currentUserId === commentUserId;
  const maxNestingLevel = 2; // Limit nesting to 2 levels

  // Debug log - remove after testing
  console.log('[CommentItem] Debug:', {
    currentUserId,
    commentUserId,
    'comment.user_id': comment.user_id,
    isOwnComment,
    showReport: currentUserId && !isOwnComment,
  });

  const formatDate = (dateString: string) => {
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

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const commentId = comment.comment_id || comment.id;
    if (!commentId) return;

    setDeleting(true);
    try {
      onDelete(commentId);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete comment:', error);
      setDeleting(false);
    }
  };

  const handleReplyCreated = () => {
    setShowReplyInput(false);
    onReplyCreated?.();
  };

  const handleReport = async () => {
    if (!token) return;

    setReporting(true);
    try {
      const commentId = comment.comment_id || comment.id;
      await reportComment(token, postId, commentId, reportReason, reportDetails);
      setReportSuccess(true);
      setTimeout(() => {
        setShowReportModal(false);
        setReportSuccess(false);
        setReportReason('spam');
        setReportDetails('');
      }, 2000);
    } catch (error) {
      console.error('Failed to report comment:', error);
      alert('Không thể báo cáo bình luận. Vui lòng thử lại.');
    } finally {
      setReporting(false);
    }
  };

  // Parse @mentions and convert to links
  const renderContentWithMentions = (text: string | undefined) => {
    if (!text) return null;
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.substring(1);
        return (
          <Link
            key={index}
            href={`/users/${username}`}
            prefetch={false}
            className="text-blue-600 hover:underline font-medium"
          >
            {part}
          </Link>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className={`${level > 0 ? 'ml-8 mt-3' : ''}`}>
      <div className="flex gap-2">
        {/* Avatar */}
        <Link href={`/users/${comment.user_id}`} prefetch={false} className="flex-shrink-0">
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200">
            {comment.avatar_url ? (
              <Image
                src={comment.avatar_url}
                alt={comment.username || 'User'}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                <span className="text-sm font-bold text-white">
                  {(comment.username || 'U').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </Link>

        {/* Comment Content */}
        <div className="flex-1 min-w-0">
          <div className="bg-gray-100 rounded-lg px-3 py-2">
            <Link
              href={`/users/${comment.user_id}`}
              prefetch={false}
              className="font-semibold text-sm text-gray-900 hover:underline"
            >
              @{comment.username}
            </Link>
            <p className="text-sm text-gray-800 mt-1 break-words whitespace-pre-wrap">
              {renderContentWithMentions(comment.text)}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-1 px-2">
            <span className="text-xs text-gray-500">
              {formatDate(comment.created_at || comment.createdAt)}
            </span>

            {level < maxNestingLevel && (
              <button
                onClick={() => setShowReplyInput(!showReplyInput)}
                className="text-xs font-semibold text-gray-600 hover:text-blue-600 transition"
              >
                Reply
              </button>
            )}

            {comment.reply_count && comment.reply_count > 0 ? (
              <span className="text-xs text-gray-500">
                {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
              </span>
            ) : null}

            {/* Report button - show for other users' comments (only when logged in) */}
            {currentUserId && !isOwnComment && (
              <button
                onClick={() => setShowReportModal(true)}
                className="text-xs font-semibold text-gray-600 hover:text-orange-600 transition"
                title="Báo cáo bình luận"
              >
                Báo cáo
              </button>
            )}

            {isOwnComment && onDelete && (
              <div className="relative ml-auto">
                <button
                  onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                  className="text-xs font-semibold text-gray-600 hover:text-red-600 transition"
                >
                  Xóa
                </button>

                {showDeleteConfirm && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-48 z-10">
                    <p className="text-xs text-gray-700 mb-2">Xóa bình luận này?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition disabled:opacity-50"
                      >
                        {deleting ? 'Đang xóa...' : 'Xóa'}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs hover:bg-gray-300 transition"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Report Modal */}
          {showReportModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
                {reportSuccess ? (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg
                        className="w-8 h-8 text-green-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Đã gửi báo cáo</h3>
                    <p className="text-sm text-gray-600 mt-2">
                      Cảm ơn bạn đã báo cáo. Chúng tôi sẽ xem xét.
                    </p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Báo cáo bình luận</h3>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Lý do báo cáo
                      </label>
                      <select
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value as CommentReportReason)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {REPORT_REASONS.map((reason) => (
                          <option key={reason.value} value={reason.value}>
                            {reason.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Chi tiết (tùy chọn)
                      </label>
                      <textarea
                        value={reportDetails}
                        onChange={(e) => setReportDetails(e.target.value)}
                        placeholder="Mô tả thêm về vấn đề..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowReportModal(false);
                          setReportReason('spam');
                          setReportDetails('');
                        }}
                        className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleReport}
                        disabled={reporting}
                        className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition disabled:opacity-50"
                      >
                        {reporting ? 'Đang gửi...' : 'Gửi báo cáo'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Reply Input */}
          {showReplyInput && (
            <div className="mt-3">
              <CommentInput
                postId={postId}
                parentCommentId={comment.comment_id}
                placeholder={`Reply to @${comment.username}...`}
                onCommentCreated={handleReplyCreated}
                onCancel={() => setShowReplyInput(false)}
                autoFocus
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
