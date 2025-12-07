'use client';

interface Props {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy',
  onConfirm,
  onCancel,
  type = 'danger',
}: Props) {
  const colors: Record<string, string> = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-[#975b1d] hover:bg-[#7a4a17]',
    info: 'bg-[#203d11] hover:bg-[#2a5016]',
  };
  const icons: Record<string, string> = { danger: '⚠️', warning: '⚡', info: 'ℹ️' };

  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-down">
      <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 max-w-sm">
        <div className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <div
              className={`flex-shrink-0 w-8 h-8 ${type === 'danger' ? 'bg-red-100' : 'bg-[#f5f0e8]'} rounded-full flex items-center justify-center`}
            >
              {icons[type]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#203d11]">{message}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs text-[#203d11] hover:text-[#975b1d] font-medium transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              className={`px-3 py-1.5 text-xs text-white ${colors[type]} rounded-xl font-medium transition-all`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
