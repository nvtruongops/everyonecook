'use client';
import { useEffect } from 'react';

interface Props {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'success', onClose, duration = 3000 }: Props) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [duration, onClose]);

  const colors: Record<string, string> = {
    success: 'bg-[#203d11]',
    error: 'bg-red-600',
    info: 'bg-[#975b1d]',
  };
  const icons: Record<string, string> = { success: '✓', error: '✕', info: 'ℹ' };

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-in">
      <div
        className={`${colors[type]} text-white px-6 py-4 rounded-xl shadow-xl flex items-center gap-3 min-w-[300px]`}
      >
        <span className="text-lg">{icons[type]}</span>
        <span className="flex-1 font-medium">{message}</span>
        <button onClick={onClose} className="hover:bg-white/20 rounded p-1 transition-all">
          ✕
        </button>
      </div>
    </div>
  );
}
