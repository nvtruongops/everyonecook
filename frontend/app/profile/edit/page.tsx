'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AvatarUpload from '@/components/profile/AvatarUpload';
import BackgroundUploader from '@/components/profile/BackgroundUploader';
import BackgroundDisplay from '@/components/profile/BackgroundDisplay';
import CustomSectionsEditor from '@/components/profile/CustomSectionsEditor';

interface CustomField { fieldId: string; value: string; order: number }
interface CustomSection { sectionId: string; title: string; description?: string; privacy: 'public' | 'friends' | 'private'; order: number; fields: CustomField[] }
interface ProfileData { avatar_url?: string; username?: string; full_name?: string; bio?: string; date_of_birth?: string; gender?: 'male' | 'female' | 'other' | ''; country?: string; background_url?: string; email?: string }
interface PrivacySettings { bio: 'public' | 'friends' | 'private'; email: 'public' | 'friends' | 'private'; date_of_birth: 'public' | 'friends' | 'private'; gender: 'public' | 'friends' | 'private'; country: 'public' | 'friends' | 'private'; avatar_url: 'public' | 'friends' | 'private'; background_url: 'public' | 'friends' | 'private' }

const defaultPrivacy: PrivacySettings = { bio: 'public', email: 'private', date_of_birth: 'private', gender: 'private', country: 'public', avatar_url: 'public', background_url: 'public' };

function ProfileEditContent() {
  const [profile, setProfile] = useState<ProfileData>({});
  const [editProfile, setEditProfile] = useState<ProfileData>({});
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(defaultPrivacy);
  const [originalPrivacy, setOriginalPrivacy] = useState<PrivacySettings>(defaultPrivacy);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [originalSections, setOriginalSections] = useState<CustomSection[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, token, avatarUrl: contextAvatarUrl, updateAvatar } = useAuth();
  const updateAvatarRef = useRef(updateAvatar);
  useEffect(() => { updateAvatarRef.current = updateAvatar; }, [updateAvatar]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token || !user) return;
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const profileRes = await fetch(`${API_URL}/users/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (profileRes.ok) {
          const data = await profileRes.json();
          const p = data.data?.profile || data.data || {};
          const mapped: ProfileData = { avatar_url: p.avatar_url || p.avatarUrl, username: p.username, full_name: p.full_name || p.fullName, bio: p.bio, date_of_birth: p.date_of_birth || p.dateOfBirth, gender: p.gender, country: p.country, background_url: p.background_url || p.backgroundUrl, email: p.email };
          setProfile(mapped);
          setEditProfile(mapped);
          if (mapped.avatar_url && mapped.avatar_url !== contextAvatarUrl) updateAvatarRef.current(mapped.avatar_url);
        }
        try {
          const privacyRes = await fetch(`${API_URL}/users/profile/privacy`, { headers: { Authorization: `Bearer ${token}` } });
          if (privacyRes.ok) {
            const d = await privacyRes.json();
            const p = d.data?.privacy || d.data || {};
            const loaded = { bio: p.bio || 'public', email: p.email || 'private', date_of_birth: p.birthday || 'private', gender: p.gender || 'private', country: p.country || 'public', avatar_url: p.avatarUrl || 'public', background_url: p.backgroundUrl || 'public' };
            setPrivacySettings(loaded);
            setOriginalPrivacy(loaded);
          }
        } catch {}
        try {
          const sectionsRes = await fetch(`${API_URL}/users/profile/custom-sections`, { headers: { Authorization: `Bearer ${token}` } });
          if (sectionsRes.ok) { const d = await sectionsRes.json(); const sections = d.data?.sections || []; setCustomSections(sections); setOriginalSections(JSON.parse(JSON.stringify(sections))); }
        } catch {}
      } catch { setError('Không thể tải hồ sơ'); }
    };
    fetchProfile();
  }, [token, user?.userId, contextAvatarUrl]);

  const handleSave = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
      const profileChanged = editProfile.full_name !== profile.full_name || editProfile.bio !== profile.bio || editProfile.date_of_birth !== profile.date_of_birth || editProfile.gender !== profile.gender || editProfile.country !== profile.country;
      const privacyChanged = JSON.stringify(privacySettings) !== JSON.stringify(originalPrivacy);
      if (profileChanged) {
        const res = await fetch(`${API_URL}/users/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ full_name: editProfile.full_name, bio: editProfile.bio, date_of_birth: editProfile.date_of_birth || undefined, gender: editProfile.gender || undefined, country: editProfile.country || undefined }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Không thể cập nhật hồ sơ'); }
      }
      if (privacyChanged) {
        const res = await fetch(`${API_URL}/users/profile/privacy`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ bio: privacySettings.bio, email: privacySettings.email, birthday: privacySettings.date_of_birth, gender: privacySettings.gender, country: privacySettings.country, avatarUrl: privacySettings.avatar_url, backgroundUrl: privacySettings.background_url }) });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Không thể cập nhật quyền riêng tư'); }
        setOriginalPrivacy({ ...privacySettings });
      }
      // Save custom sections - handle create, update, delete
      const originalIds = new Set(originalSections.map(s => s.sectionId));
      const currentIds = new Set(customSections.map(s => s.sectionId));
      // Delete removed sections
      for (const orig of originalSections) {
        if (!currentIds.has(orig.sectionId) && !orig.sectionId.startsWith('temp-')) {
          await fetch(`${API_URL}/users/profile/custom-sections/${orig.sectionId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        }
      }
      // Create new sections and update existing
      for (const section of customSections) {
        if (section.sectionId.startsWith('temp-')) {
          // Create new section
          const createRes = await fetch(`${API_URL}/users/profile/custom-sections`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: section.title, privacy: section.privacy }) });
          if (createRes.ok) {
            const d = await createRes.json();
            const newSectionId = d.data?.section?.sectionId || d.section?.sectionId;
            if (newSectionId) {
              // Add fields to new section
              for (const field of section.fields) {
                await fetch(`${API_URL}/users/profile/custom-sections/${newSectionId}/fields`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ value: field.value }) });
              }
            }
          }
        } else if (originalIds.has(section.sectionId)) {
          // Update existing section
          const orig = originalSections.find(s => s.sectionId === section.sectionId);
          if (orig && (orig.title !== section.title || orig.privacy !== section.privacy)) {
            await fetch(`${API_URL}/users/profile/custom-sections/${section.sectionId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ title: section.title, privacy: section.privacy }) });
          }
          // Handle fields - delete removed, add new
          const origFieldIds = new Set(orig?.fields.map(f => f.fieldId) || []);
          const currFieldIds = new Set(section.fields.map(f => f.fieldId));
          for (const origField of (orig?.fields || [])) {
            if (!currFieldIds.has(origField.fieldId) && !origField.fieldId.startsWith('temp-')) {
              await fetch(`${API_URL}/users/profile/custom-sections/${section.sectionId}/fields/${origField.fieldId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            }
          }
          for (const field of section.fields) {
            if (field.fieldId.startsWith('temp-')) {
              await fetch(`${API_URL}/users/profile/custom-sections/${section.sectionId}/fields`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ value: field.value }) });
            }
          }
        }
      }
      setProfile(editProfile);
      setSuccess('Cập nhật hồ sơ thành công!');
      setTimeout(() => router.push('/profile'), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ'); }
    finally { setLoading(false); }
  };

  const PrivacySelector = ({ field, label }: { field: keyof PrivacySettings; label: string }) => (
    <div className="mt-1.5">
      <label className="text-xs text-[#203d11]/60 mb-1 block">{label}</label>
      <select value={privacySettings[field]} onChange={(e) => setPrivacySettings((prev) => ({ ...prev, [field]: e.target.value as any }))} className="text-sm px-3 py-1.5 border border-[#203d11]/20 rounded-lg focus:ring-1 focus:ring-[#975b1d] bg-[#f5f0e8]/50">
        <option value="public">Công khai</option>
        <option value="friends">Bạn bè</option>
        <option value="private">Riêng tư</option>
      </select>
    </div>
  );

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f0e8] to-white py-24 pb-12">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/profile" className="p-2 hover:bg-[#f5f0e8] rounded-full transition">
              <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <h1 className="text-2xl font-bold text-[#203d11]">Chỉnh sửa hồ sơ</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => router.push('/profile')} className="px-4 py-2 h-12 text-[#203d11] hover:bg-[#f5f0e8] rounded-xl transition font-semibold">Hủy</button>
            <button onClick={handleSave} disabled={loading} className="px-6 py-2 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition font-semibold">{loading ? 'Đang lưu...' : 'Lưu'}</button>
          </div>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl"><p className="text-sm text-red-800">{error}</p></div>}
        {success && <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-2xl"><p className="text-sm text-green-800">{success}</p></div>}

        <div className="bg-white shadow-xl rounded-2xl overflow-hidden mb-6 border border-[#203d11]/5">
          <div className="relative">
            {profile.background_url ? (
              <BackgroundDisplay backgroundUrl={profile.background_url} variant="profile" className="w-full" />
            ) : (
              <div className="w-full bg-gradient-to-r from-[#203d11]/10 to-[#975b1d]/10" style={{ aspectRatio: '16/9', maxHeight: '350px' }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white/80 rounded-full flex items-center justify-center mx-auto mb-3"><span className="text-2xl font-bold text-[#203d11]">+</span></div>
                    <p className="text-sm font-medium text-[#203d11]/70">Chưa có ảnh nền</p>
                  </div>
                </div>
              </div>
            )}
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2">
              <div className="border-4 border-white shadow-lg rounded-full bg-white">
                <AvatarUpload key={profile.avatar_url || 'avatar'} currentAvatarUrl={profile.avatar_url} onUploadSuccess={async (url) => { setProfile((p) => ({ ...p, avatar_url: url })); setEditProfile((p) => ({ ...p, avatar_url: url })); updateAvatar(url); setSuccess('Đã cập nhật ảnh đại diện!'); setTimeout(() => setSuccess(''), 3000); }} />
              </div>
            </div>
          </div>
          <div className="pt-20 pb-6 px-6">
            <div className="text-center mb-6">
              <p className="text-xs text-[#203d11]/50">Nhấn vào ảnh đại diện để thay đổi</p>
            </div>
            <div className="border-t border-[#203d11]/10 pt-6">
              <h3 className="text-base font-semibold text-[#203d11] mb-2">Ảnh nền</h3>
              <p className="text-sm text-[#203d11]/60 mb-4">Đề xuất: 1200 x 675 pixels (tỉ lệ 16:9)</p>
              <BackgroundUploader currentBackground={profile.background_url} onUploadSuccess={(url) => { setProfile((p) => ({ ...p, background_url: url })); setEditProfile((p) => ({ ...p, background_url: url })); setSuccess('Đã cập nhật ảnh nền!'); setTimeout(() => setSuccess(''), 3000); }} onUploadError={(e: string) => setError(e)} />
            </div>
          </div>
        </div>

        <div className="bg-white shadow-xl rounded-2xl p-6 mb-6 border border-[#203d11]/5">
          <h2 className="text-lg font-bold text-[#203d11] mb-6">Thông tin cơ bản</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-[#203d11] mb-2">Họ và tên <span className="text-red-500">*</span></label>
              <input type="text" value={editProfile.full_name || ''} onChange={(e) => setEditProfile((p) => ({ ...p, full_name: e.target.value }))} className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all" placeholder="Nhập họ và tên" />
              <p className="text-xs text-[#203d11]/50 mt-2">Luôn công khai (cần thiết để tìm kiếm)</p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#203d11] mb-2">Giới thiệu</label>
              <textarea rows={4} maxLength={500} value={editProfile.bio || ''} onChange={(e) => setEditProfile((p) => ({ ...p, bio: e.target.value }))} className="w-full p-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] placeholder-[#203d11]/40 focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all resize-none" placeholder="Giới thiệu về bản thân..." />
              <div className="flex items-center justify-between mt-2">
                <PrivacySelector field="bio" label="Hiển thị với" />
                <p className="text-xs text-[#203d11]/50">{(editProfile.bio || '').length}/500</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Ngày sinh</label>
                <input type="date" value={editProfile.date_of_birth || ''} onChange={(e) => setEditProfile((p) => ({ ...p, date_of_birth: e.target.value }))} className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all" />
                <PrivacySelector field="date_of_birth" label="Hiển thị với" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#203d11] mb-2">Giới tính</label>
                <select value={editProfile.gender || ''} onChange={(e) => setEditProfile((p) => ({ ...p, gender: e.target.value as any }))} className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all">
                  <option value="">Không muốn nói</option>
                  <option value="male">Nam</option>
                  <option value="female">Nữ</option>
                  <option value="other">Khác</option>
                </select>
                <PrivacySelector field="gender" label="Hiển thị với" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#203d11] mb-2">Quốc gia</label>
              <select value={editProfile.country || ''} onChange={(e) => setEditProfile((p) => ({ ...p, country: e.target.value }))} className="w-full h-12 px-4 bg-[#f5f0e8]/50 border-2 border-transparent rounded-xl text-[#203d11] focus:border-[#975b1d] focus:bg-white focus:outline-none transition-all">
                <option value="">Chọn quốc gia</option>
                <option value="VN">Vietnam</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="JP">Japan</option>
                <option value="KR">South Korea</option>
                <option value="CN">China</option>
                <option value="TH">Thailand</option>
                <option value="SG">Singapore</option>
                <option value="MY">Malaysia</option>
                <option value="ID">Indonesia</option>
                <option value="PH">Philippines</option>
                <option value="AU">Australia</option>
                <option value="CA">Canada</option>
                <option value="FR">France</option>
                <option value="DE">Germany</option>
              </select>
              <PrivacySelector field="country" label="Hiển thị với" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#203d11] mb-2">Email</label>
              <input type="email" value={editProfile.email || user?.email || ''} disabled className="w-full h-12 px-4 bg-[#f5f0e8]/30 border-2 border-[#203d11]/10 rounded-xl text-[#203d11]/50 cursor-not-allowed" />
              <p className="text-xs text-[#203d11]/50 mt-2">Không thể thay đổi email tại đây</p>
              <PrivacySelector field="email" label="Hiển thị với" />
            </div>
          </div>
        </div>

        <div className="bg-white shadow-xl rounded-2xl p-6 mb-6 border border-[#203d11]/5">
          <h2 className="text-lg font-bold text-[#203d11] mb-2">Mục tùy chỉnh</h2>
          <p className="text-sm text-[#203d11]/60 mb-6">Thêm các mục tùy chỉnh để giới thiệu sở thích nấu ăn, chế độ ăn uống hoặc bất kỳ thông tin nào khác.</p>
          <CustomSectionsEditor sections={customSections} onSectionsChange={setCustomSections} maxSections={5} maxFieldsPerSection={5} maxTotalFields={25} />
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={() => router.push('/profile')} className="px-6 py-2.5 h-12 text-[#203d11] hover:bg-[#f5f0e8] rounded-xl transition font-semibold">Hủy</button>
          <button onClick={handleSave} disabled={loading} className="px-6 py-2.5 h-12 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 transition font-semibold">{loading ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProfileEditPage() {
  return <ProtectedRoute><ProfileEditContent /></ProtectedRoute>;
}
