'use client';

import React from 'react';

interface CustomField {
  fieldId: string;
  value: string;
  order: number;
}

interface CustomSection {
  sectionId: string;
  title: string;
  description?: string;
  privacy: 'public' | 'friends' | 'private';
  order: number;
  fields: CustomField[];
}

interface CustomSectionViewProps {
  section: CustomSection;
  isOwnProfile?: boolean;
}

export default function CustomSectionView({ section, isOwnProfile = false }: CustomSectionViewProps) {
  const sortedFields = [...section.fields].sort((a, b) => a.order - b.order);

  if (section.privacy === 'private' && !isOwnProfile) return null;

  const getPrivacyLabel = () => {
    if (!isOwnProfile) return null;
    const config = {
      private: { text: 'R', color: 'text-[#203d11]/40', title: 'Chỉ mình tôi' },
      friends: { text: 'F', color: 'text-[#975b1d]/60', title: 'Bạn bè' },
      public: { text: 'P', color: 'text-[#203d11]/60', title: 'Công khai' },
    };
    const { text, color, title } = config[section.privacy] || config.public;
    return <span className={`text-xs font-medium ${color} ml-2`} title={title}>{text}</span>;
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl p-6 mb-6 border border-[#203d11]/5">
      <h2 className="text-lg font-semibold text-[#203d11] flex items-center">
        {section.title}
        {getPrivacyLabel()}
      </h2>
      {sortedFields.length > 0 && (
        <div className="space-y-3 mt-4">
          {sortedFields.map((field) => (
            <div key={field.fieldId} className="border-l-2 border-[#203d11]/20 pl-4">
              <p className="text-[#203d11]/80">{field.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
