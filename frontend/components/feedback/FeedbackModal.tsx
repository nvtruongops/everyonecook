'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  createFeedback,
  getMyFeedbacks,
  getFeedbackDetail,
  replyToFeedback,
  Feedback,
  FeedbackWithReplies,
} from '@/services/feedback';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: Props) {
  const { token, refreshToken } = useAuth();
  const [tab, setTab] = useState<'create' | 'history'>('create');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selected, setSelected] = useState<FeedbackWithReplies | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const getToken = async () => token || (await refreshToken());

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const loadFeedbacks = async () => {
    setLoadingHistory(true);
    try {
      const t = await getToken();
      if (t) setFeedbacks((await getMyFeedbacks(t)).feedbacks);
    } catch {
      // Ignore errors
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load feedbacks when modal opens (for count display)
  useEffect(() => {
    if (isOpen && token) {
      loadFeedbacks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, token]);
  const loadDetail = async (id: string) => {
    try {
      const t = await getToken();
      if (t) setSelected(await getFeedbackDetail(id, t));
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const t = await getToken();
      if (!t) {
        setError('Vui lòng đăng nhập lại');
        return;
      }
      await createFeedback({ title, content }, t);
      setSuccess('Góp ý đã được gửi!');
      setTitle('');
      setContent('');
      setTimeout(() => {
        setTab('history');
        loadFeedbacks();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      const t = await getToken();
      if (t) {
        await replyToFeedback(selected.feedbackId, reply, t);
        setReply('');
        await loadDetail(selected.feedbackId);
      }
    } catch {
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100000] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-[#203d11]/5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#203d11]/10">
          <h2 className="text-xl font-bold text-[#203d11]">Góp ý</h2>
          <button onClick={onClose} className="p-2 hover:bg-[#f5f0e8] rounded-full transition-all" title="Đóng">
            <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex border-b border-[#203d11]/10">
          <button
            onClick={() => {
              setTab('create');
              setSelected(null);
            }}
            className={`flex-1 py-3 text-sm font-medium transition-all ${tab === 'create' ? 'text-[#203d11] border-b-2 border-[#203d11]' : 'text-[#203d11]/50 hover:text-[#203d11]'}`}
          >
            Gửi góp ý
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-3 text-sm font-medium transition-all ${tab === 'history' ? 'text-[#203d11] border-b-2 border-[#203d11]' : 'text-[#203d11]/50 hover:text-[#203d11]'}`}
          >
            Phản hồi ({feedbacks.length})
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {tab === 'create' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>
              )}
              {success && (
                <div className="p-3 bg-[#203d11]/10 text-[#203d11] rounded-xl text-sm">
                  {success}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Tiêu đề</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Nhập tiêu đề góp ý..."
                  className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                  required
                  minLength={5}
                  maxLength={200}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Nội dung</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Mô tả chi tiết góp ý..."
                  rows={5}
                  className="w-full p-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all resize-none"
                  required
                  minLength={10}
                  maxLength={2000}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 transition-all"
              >
                {loading ? 'Đang gửi...' : 'Gửi góp ý'}
              </button>
            </form>
          ) : selected ? (
            <div className="space-y-4">
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-2 text-[#203d11]/70 hover:text-[#203d11] transition-all"
              >
                ← Quay lại
              </button>
              <div className="bg-[#f5f0e8]/50 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-[#203d11]">{selected.title}</h3>
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${selected.status === 'closed' ? 'bg-[#203d11]/10 text-[#203d11]' : 'bg-[#975b1d]/10 text-[#975b1d]'}`}
                  >
                    {selected.status === 'closed' ? 'Đã đóng' : 'Đang xử lý'}
                  </span>
                </div>
                <p className="text-[#203d11]/70 text-sm whitespace-pre-wrap">{selected.content}</p>
                <p className="text-xs text-[#203d11]/40 mt-2">
                  {new Date(selected.createdAt).toLocaleString('vi-VN')}
                </p>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold text-[#203d11]">Phản hồi ({selected.replyCount})</h4>
                {selected.replies.map((r) => (
                  <div
                    key={r.replyId}
                    className={`p-3 rounded-xl ${r.isAdmin ? 'bg-[#203d11]/5 ml-4' : 'bg-[#f5f0e8]/50 mr-4'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-sm font-medium ${r.isAdmin ? 'text-[#203d11]' : 'text-[#975b1d]'}`}
                      >
                        {r.isAdmin ? 'Admin' : r.username}
                      </span>
                      <span className="text-xs text-[#203d11]/40">
                        {new Date(r.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="text-sm text-[#203d11]/70 whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
              {selected.status !== 'closed' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Nhập phản hồi..."
                    className="flex-1 h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all"
                  />
                  <button
                    onClick={handleReply}
                    disabled={sending || !reply.trim()}
                    className="px-6 h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:opacity-50 transition-all"
                  >
                    {sending ? '...' : 'Gửi'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="text-center py-8 text-[#203d11]/50">Đang tải...</div>
              ) : !feedbacks.length ? (
                <div className="text-center py-8 text-[#203d11]/50">
                  <p>Bạn chưa có góp ý nào</p>
                  <button
                    onClick={() => setTab('create')}
                    className="mt-2 text-[#975b1d] hover:text-[#203d11] transition-all"
                  >
                    Gửi góp ý đầu tiên
                  </button>
                </div>
              ) : (
                feedbacks.map((f) => (
                  <button
                    key={f.feedbackId}
                    onClick={() => loadDetail(f.feedbackId)}
                    className="w-full text-left p-4 bg-[#f5f0e8]/50 rounded-xl hover:bg-[#f5f0e8] transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-[#203d11] line-clamp-1">{f.title}</h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${f.status === 'closed' ? 'bg-[#203d11]/10 text-[#203d11]' : 'bg-[#975b1d]/10 text-[#975b1d]'}`}
                      >
                        {f.status === 'closed' ? 'Đã đóng' : 'Đang xử lý'}
                      </span>
                    </div>
                    <p className="text-sm text-[#203d11]/60 mt-1 line-clamp-2">{f.content}</p>
                    <p className="text-xs text-[#203d11]/40 mt-2">
                      {new Date(f.createdAt).toLocaleString('vi-VN')}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
