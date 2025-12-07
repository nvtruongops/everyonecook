'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { sharePost } from '@/services/posts';

interface Props {
  postId: string;
  onShared?: (post?: any) => void;
  shareCount?: number;
}

export default function ShareButton({ postId, onShared, shareCount = 0 }: Props) {
  const { token } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'private'>('public');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShare = async () => {
    if (!token) {
      setError('Bạn cần đăng nhập để chia sẻ');
      return;
    }
    const validId = typeof postId === 'string' ? postId : String(postId);
    if (!validId || validId === '[object Object]') {
      setError('Không thể xác định bài viết');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await sharePost(token, validId, caption.trim() || undefined, privacy);
      setShowModal(false);
      setCaption('');
      setPrivacy('public');
      onShared?.(result.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể chia sẻ');
    } finally {
      setLoading(false);
    }
  };

  const privacyOpts = [
    { v: 'public', l: 'Công khai', c: 'bg-[#203d11]/10 border-[#203d11] text-[#203d11]' },
    { v: 'friends', l: 'Bạn bè', c: 'bg-[#975b1d]/10 border-[#975b1d] text-[#975b1d]' },
    { v: 'private', l: 'Riêng tư', c: 'bg-[#f5f0e8] border-[#203d11]/30 text-[#203d11]' },
  ];

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-2 text-[#203d11]/70 hover:bg-[#f5f0e8] rounded-xl transition-all"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="text-sm font-medium">{shareCount > 0 ? shareCount : 'Chia sẻ'}</span>
      </button>
      {showModal && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#203d11]/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-[#203d11]">Chia sẻ bài viết</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-[#203d11]/40 hover:text-[#203d11] hover:bg-[#f5f0e8] rounded-full transition-all"
              >
                ✕
              </button>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#203d11] mb-2">
                Ai có thể xem?
              </label>
              <div className="flex gap-2">
                {privacyOpts.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setPrivacy(o.v as any)}
                    className={`flex-1 px-3 py-2 text-sm rounded-xl border-2 transition-all ${privacy === o.v ? o.c : 'border-[#203d11]/10 text-[#203d11]/60 hover:bg-[#f5f0e8]'}`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#203d11] mb-2">
                Viết gì đó (tùy chọn)
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Chia sẻ suy nghĩ..."
                className="w-full p-3 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all resize-none"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-[#203d11]/40 mt-1 text-right">{caption.length}/500</p>
            </div>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={loading}
                className="flex-1 px-4 py-2.5 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl hover:bg-[#f5f0e8] transition-all font-medium disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                onClick={handleShare}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] transition-all font-medium disabled:opacity-50"
              >
                {loading ? 'Đang chia sẻ...' : 'Chia sẻ ngay'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
