'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { addReaction, removeReaction } from '@/services/posts';

interface Props {
  postId: string;
  likeCount: number;
  commentCount: number;
  userReaction?: 'like' | 'love' | 'wow';
  onReactionChange?: () => void;
  onCommentClick?: () => void;
}

const reactionLabels: Record<string, string> = { like: 'Like', love: 'Love', wow: 'Wow' };

export default function ReactionButtons({
  postId,
  likeCount,
  commentCount,
  userReaction: initial,
  onReactionChange,
  onCommentClick,
}: Props) {
  const { token } = useAuth();
  const [reaction, setReaction] = useState(initial);
  const [count, setCount] = useState(likeCount);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReaction = async (type: 'like' | 'love' | 'wow') => {
    if (!token || loading) return;
    setLoading(true);
    const prev = reaction,
      prevCount = count;
    try {
      if (reaction === type) {
        setReaction(undefined);
        setCount(count - 1);
        await removeReaction(token, postId);
      } else {
        if (!reaction) setCount(count + 1);
        setReaction(type);
        await addReaction(token, postId, type);
      }
      setShowPicker(false);
      onReactionChange?.();
    } catch {
      setReaction(prev);
      setCount(prevCount);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-2">
      <div className="flex items-center gap-4 mb-2 text-sm text-[#203d11]/60">
        {count > 0 && (
          <span>
            {count} {count === 1 ? 'reaction' : 'reactions'}
          </span>
        )}
        {commentCount > 0 && (
          <span>
            {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-[#203d11]/10">
        <div className="relative flex-1">
          <button
            onClick={() => setShowPicker(!showPicker)}
            className={`w-full py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-medium ${reaction ? 'text-[#203d11] bg-[#f5f0e8]' : 'text-[#203d11]/70 hover:bg-[#f5f0e8]'}`}
          >
            <svg className="w-5 h-5" fill={reaction ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
            <span className="text-sm">
              {reaction ? reactionLabels[reaction] : 'Like'}
            </span>
          </button>
          {showPicker && (
            <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-[#203d11]/10 p-2 flex gap-1 z-10">
              {Object.entries(reactionLabels).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => handleReaction(type as 'like' | 'love' | 'wow')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-all ${reaction === type ? 'bg-[#203d11] text-white' : 'hover:bg-[#f5f0e8] text-[#203d11]'}`}
                  title={type}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={onCommentClick}
          className="flex-1 py-2 px-4 rounded-xl flex items-center justify-center gap-2 text-[#203d11]/70 hover:bg-[#f5f0e8] transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm font-medium">Comment</span>
        </button>
      </div>
    </div>
  );
}
