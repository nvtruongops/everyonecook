'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserById, updatePrivacySettings } from '@/lib/api/users';
import type { PrivacySettings } from '@/types';

type PrivacyLevel = 'public' | 'friends' | 'private';

export default function PrivacySettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [settings, setSettings] = useState<PrivacySettings>({
    fullName: 'public',
    email: 'private',
    birthday: 'private',
    gender: 'private',
    country: 'public',
    bio: 'public',
    avatarUrl: 'public',
    backgroundUrl: 'public',
    statistics: 'public',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadPrivacySettings();
  }, []);

  const loadPrivacySettings = async () => {
    if (!user?.userId) {
      setError('Chưa đăng nhập');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await getUserById(user.userId);
      if (res.success && res.data?.privacySettings) setSettings(res.data.privacySettings);
    } catch (err: any) {
      setError(err.message || 'Không thể tải cài đặt');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.userId) {
      setError('Chưa đăng nhập');
      return;
    }
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const res = await updatePrivacySettings(user.userId, settings);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => router.push(`/users/${user.userId}`), 2000);
      } else throw new Error(res.error?.message || 'Không thể lưu');
    } catch (err: any) {
      setError(err.message || 'Không thể lưu cài đặt');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof PrivacySettings, value: PrivacyLevel) =>
    setSettings((prev) => ({ ...prev, [field]: value }));

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]" />
      </div>
    );

  const fields = [
    { key: 'fullName', label: 'Họ tên', desc: 'Tên hiển thị của bạn' },
    { key: 'email', label: 'Email', desc: 'Địa chỉ email' },
    { key: 'birthday', label: 'Ngày sinh', desc: 'Ngày sinh của bạn' },
    { key: 'gender', label: 'Giới tính', desc: 'Giới tính của bạn' },
    { key: 'country', label: 'Quốc gia', desc: 'Nơi bạn sống' },
    { key: 'bio', label: 'Giới thiệu', desc: 'Mô tả về bạn' },
    { key: 'avatarUrl', label: 'Ảnh đại diện', desc: 'Ảnh hồ sơ' },
    { key: 'backgroundUrl', label: 'Ảnh nền', desc: 'Ảnh bìa hồ sơ' },
    { key: 'statistics', label: 'Thống kê', desc: 'Số bài viết, bạn bè' },
  ] as const;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-8">
      <div className="max-w-[1200px] mx-auto px-4">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🛡️</div>
            <div>
              <h1 className="text-3xl font-bold text-[#203d11]">Cài đặt quyền riêng tư</h1>
              <p className="mt-1 text-[#203d11]/70">
                Kiểm soát ai có thể xem thông tin hồ sơ của bạn
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 p-4 bg-[#f5f0e8]/50 border border-[#203d11]/10 rounded-2xl">
          <span className="font-semibold text-[#203d11]">ℹ️ Mức độ quyền riêng tư:</span>
          <ul className="mt-2 list-inside list-disc text-sm text-[#203d11]/80">
            <li>
              <strong>Công khai:</strong> Mọi người đều có thể xem
            </li>
            <li>
              <strong>Bạn bè:</strong> Chỉ bạn bè mới xem được
            </li>
            <li>
              <strong>Riêng tư:</strong> Chỉ bạn mới xem được
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-[#203d11]/5 p-6">
          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
              <span className="text-green-600">✓</span>
              <span className="text-green-700 text-sm font-medium">
                Đã lưu! Đang chuyển hướng...
              </span>
            </div>
          )}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
              <span className="text-red-600">⚠️</span>
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {fields.map((field) => (
              <div key={field.key} className="border-b border-[#203d11]/10 pb-6 last:border-0">
                <div className="mb-3">
                  <label htmlFor={field.key} className="text-base font-semibold text-[#203d11]">
                    {field.label}
                  </label>
                  <p className="mt-1 text-sm text-[#203d11]/60">{field.desc}</p>
                </div>
                <select
                  id={field.key}
                  value={settings[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value as PrivacyLevel)}
                  disabled={saving}
                  className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl focus:border-[#975b1d] focus:outline-none text-[#203d11] font-medium"
                >
                  <option value="public">🌍 Công khai - Mọi người đều xem được</option>
                  <option value="friends">👥 Bạn bè - Chỉ bạn bè xem được</option>
                  <option value="private">🔒 Riêng tư - Chỉ bạn xem được</option>
                </select>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-12 bg-[#203d11] text-white rounded-xl font-semibold hover:bg-[#2a5016] disabled:bg-gray-400 transition"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
            <button
              onClick={() => router.back()}
              disabled={saving}
              className="px-6 h-12 border-2 border-[#203d11]/20 text-[#203d11] rounded-xl font-semibold hover:bg-[#f5f0e8] transition"
            >
              Hủy
            </button>
          </div>
        </div>

        <div className="mt-6 bg-[#975b1d]/5 border border-[#975b1d]/20 rounded-2xl p-6">
          <h3 className="mb-2 font-bold text-[#975b1d]">💡 Mẹo bảo mật</h3>
          <ul className="space-y-1 text-sm text-[#975b1d]/80">
            <li>• Giữ thông tin nhạy cảm (email, ngày sinh) ở chế độ riêng tư</li>
            <li>• Đặt hồ sơ công khai để kết nối với nhiều người hơn</li>
            <li>• Bạn có thể thay đổi cài đặt này bất cứ lúc nào</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
