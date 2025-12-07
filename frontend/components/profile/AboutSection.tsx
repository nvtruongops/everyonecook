'use client';

import React from 'react';

interface AboutSectionProps {
  profile: {
    full_name?: string;
    bio?: string;
    date_of_birth?: string;
    gender?: 'male' | 'female' | 'other' | '';
    country?: string;
    email?: string;
  };
  privacySettings?: {
    bio?: 'public' | 'friends' | 'private';
    email?: 'public' | 'friends' | 'private';
    date_of_birth?: 'public' | 'friends' | 'private';
    gender?: 'public' | 'friends' | 'private';
    country?: 'public' | 'friends' | 'private';
  };
  isOwnProfile: boolean;
  viewerRelationship?: 'self' | 'friend' | 'stranger';
}

const PrivacyIcon = ({ level }: { level: 'public' | 'friends' | 'private' }) => {
  const config = {
    public: { text: 'P', color: 'text-[#203d11]/60', title: 'Công khai' },
    friends: { text: 'F', color: 'text-[#975b1d]/60', title: 'Bạn bè' },
    private: { text: 'R', color: 'text-[#203d11]/40', title: 'Chỉ mình tôi' },
  };
  const { text, color, title } = config[level] || config.public;
  return <span className={`ml-2 text-xs font-medium ${color}`} title={title}>{text}</span>;
};

export default function AboutSection({
  profile,
  privacySettings = {},
  isOwnProfile,
  viewerRelationship = 'self',
}: AboutSectionProps) {
  // Helper to check if field should be visible
  const isFieldVisible = (fieldVisibility?: 'public' | 'friends' | 'private') => {
    // Owner always sees everything
    if (isOwnProfile || viewerRelationship === 'self') return true;

    // If no privacy setting, default to private (only owner sees)
    if (!fieldVisibility) return false;

    // Public: everyone can see
    if (fieldVisibility === 'public') return true;

    // Friends: only friends can see
    if (fieldVisibility === 'friends' && viewerRelationship === 'friend') return true;

    // Private: only owner can see
    return false;
  };

  const formatGender = (gender?: string) => {
    if (!gender) return null;
    const genderMap: Record<string, string> = {
      male: 'Nam',
      female: 'Nữ',
      other: 'Khác',
    };
    return genderMap[gender.toLowerCase()] || gender;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getCountryName = (code?: string) => {
    const countries: Record<string, string> = {
      VN: 'Việt Nam',
      US: 'Hoa Kỳ',
      GB: 'Vương quốc Anh',
      JP: 'Nhật Bản',
      KR: 'Hàn Quốc',
      CN: 'Trung Quốc',
      TH: 'Thái Lan',
      SG: 'Singapore',
      MY: 'Malaysia',
      ID: 'Indonesia',
      PH: 'Philippines',
      AU: 'Úc',
      CA: 'Canada',
      FR: 'Pháp',
      DE: 'Đức',
      IT: 'Ý',
      ES: 'Tây Ban Nha',
    };
    return code ? countries[code] || code : null;
  };

  // Count visible items for empty state check
  const hasVisibleContent =
    (profile.bio && isFieldVisible(privacySettings.bio)) ||
    (profile.country && isFieldVisible(privacySettings.country)) ||
    (profile.date_of_birth && isFieldVisible(privacySettings.date_of_birth)) ||
    (profile.gender && isFieldVisible(privacySettings.gender)) ||
    (profile.email && isFieldVisible(privacySettings.email));

  return (
    <div className="bg-white shadow-lg rounded-2xl p-6 mb-6 border border-[#203d11]/5">
      <h2 className="text-lg font-semibold text-[#203d11] mb-4">Giới thiệu</h2>
      <div className="space-y-4">
        {profile.bio && isFieldVisible(privacySettings.bio) && (
          <div className="bg-[#f5f0e8]/50 rounded-xl p-4">
            <div className="flex items-start justify-between">
              <p className="text-[#203d11]/80 leading-relaxed flex-1">{profile.bio}</p>
              {isOwnProfile && privacySettings.bio && <PrivacyIcon level={privacySettings.bio} />}
            </div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          {profile.date_of_birth && isFieldVisible(privacySettings.date_of_birth) && (
            <div className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-xl bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-[#203d11]">{formatDate(profile.date_of_birth)}</span>
                <p className="text-xs text-[#203d11]/50">Ngày sinh</p>
              </div>
              {isOwnProfile && privacySettings.date_of_birth && <PrivacyIcon level={privacySettings.date_of_birth} />}
            </div>
          )}
          {profile.gender && isFieldVisible(privacySettings.gender) && (
            <div className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-xl bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-[#203d11]">{formatGender(profile.gender)}</span>
                <p className="text-xs text-[#203d11]/50">Giới tính</p>
              </div>
              {isOwnProfile && privacySettings.gender && <PrivacyIcon level={privacySettings.gender} />}
            </div>
          )}
          {profile.country && isFieldVisible(privacySettings.country) && (
            <div className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-xl bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-[#203d11]">{getCountryName(profile.country)}</span>
                <p className="text-xs text-[#203d11]/50">Sống tại</p>
              </div>
              {isOwnProfile && privacySettings.country && <PrivacyIcon level={privacySettings.country} />}
            </div>
          )}
          {profile.email && isFieldVisible(privacySettings.email) && (
            <div className="flex items-center gap-3 py-2">
              <div className="w-10 h-10 rounded-xl bg-[#f5f0e8] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#203d11]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <span className="text-[#203d11]">{profile.email}</span>
                <p className="text-xs text-[#203d11]/50">Email</p>
              </div>
              {isOwnProfile && privacySettings.email && <PrivacyIcon level={privacySettings.email} />}
            </div>
          )}
        </div>

        {!hasVisibleContent && (
          <div className="text-center py-8 text-[#203d11]/50">
            <p className="text-sm">{isOwnProfile ? 'Hoàn thiện hồ sơ để mọi người hiểu thêm về bạn' : 'Không có thông tin công khai'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
