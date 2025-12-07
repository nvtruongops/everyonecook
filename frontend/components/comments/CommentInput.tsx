/**
 * Comment Input Component
 * Input form with @mention autocomplete
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createComment } from '@/services/comments';
import { searchUsersForMention } from '@/services/comments';
import Image from 'next/image';

interface CommentInputProps {
  postId: string;
  parentCommentId?: string;
  placeholder?: string;
  onCommentCreated?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

interface MentionSuggestion {
  user_id: string;
  username: string;
  avatar_url?: string;
}

export default function CommentInput({
  postId,
  parentCommentId,
  placeholder = 'Write a comment...',
  onCommentCreated,
  onCancel,
  autoFocus = false,
}: CommentInputProps) {
  const { token, user } = useAuth();
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentions, setMentions] = useState<MentionSuggestion[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Handle @mention detection and autocomplete
  useEffect(() => {
    const checkForMention = async () => {
      const cursorPosition = inputRef.current?.selectionStart || 0;
      const textBeforeCursor = content.substring(0, cursorPosition);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

      if (mentionMatch && token) {
        const query = mentionMatch[1];
        setMentionQuery(query);
        setShowMentions(true);

        if (query.length > 0) {
          try {
            const result = await searchUsersForMention(token, query);
            setMentions(result.users);
            setSelectedMentionIndex(0);
          } catch (err) {
            console.error('Failed to search users:', err);
            setMentions([]);
          }
        } else {
          setMentions([]);
        }
      } else {
        setShowMentions(false);
        setMentions([]);
      }
    };

    const debounceTimer = setTimeout(checkForMention, 200);
    return () => clearTimeout(debounceTimer);
  }, [content, token]);

  const insertMention = (username: string) => {
    const cursorPosition = inputRef.current?.selectionStart || 0;
    const textBeforeCursor = content.substring(0, cursorPosition);
    const textAfterCursor = content.substring(cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      const beforeMention = textBeforeCursor.substring(0, mentionMatch.index);
      const newContent = `${beforeMention}@${username} ${textAfterCursor}`;
      setContent(newContent);
      setShowMentions(false);
      setMentions([]);

      // Set cursor position after mention
      setTimeout(() => {
        const newPosition = beforeMention.length + username.length + 2;
        inputRef.current?.setSelectionRange(newPosition, newPosition);
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && mentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentions.length) % mentions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentions[selectedMentionIndex].username);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
        setMentions([]);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !content.trim()) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await createComment(token, postId, {
        content: content.trim(),
        parent_comment_id: parentCommentId,
      });

      setContent('');
      setShowMentions(false);
      setMentions([]);
      onCommentCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          {/* User Avatar */}
          <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 mt-1">
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
              <span className="text-sm font-bold text-white">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Input Field */}
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
              maxLength={500}
            />

            {/* Mention Autocomplete */}
            {showMentions && mentions.length > 0 && (
              <div className="absolute z-20 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {mentions.map((mention, index) => (
                  <button
                    key={mention.user_id}
                    type="button"
                    onClick={() => insertMention(mention.username)}
                    className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-100 transition ${
                      index === selectedMentionIndex ? 'bg-blue-50' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                      {mention.avatar_url ? (
                        <Image
                          src={mention.avatar_url}
                          alt={mention.username}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                          <span className="text-sm font-bold text-white">
                            {mention.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      @{mention.username}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <p className="mt-1 text-sm text-red-600">{error}</p>
            )}

            {/* Actions */}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {content.length}/500 • Press Enter to post
              </span>
              <div className="flex gap-2">
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || !content.trim()}
                  className="px-4 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

