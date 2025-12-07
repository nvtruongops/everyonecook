/**
 * CustomSectionsEditor Component
 * Manage custom profile sections in edit mode
 * Add/Edit/Delete sections and fields with privacy controls
 */

'use client';

import React, { useState } from 'react';

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

interface CustomSectionsEditorProps {
  sections: CustomSection[];
  onSectionsChange: (sections: CustomSection[]) => void;
  maxSections?: number;
  maxFieldsPerSection?: number;
  maxTotalFields?: number;
}

export default function CustomSectionsEditor({
  sections,
  onSectionsChange,
  maxSections = 5,
  maxFieldsPerSection = 5,
  maxTotalFields = 25,
}: CustomSectionsEditorProps) {
  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [addingFieldToSection, setAddingFieldToSection] = useState<string | null>(null);
  const [newFieldValue, setNewFieldValue] = useState('');
  const [deletingSection, setDeletingSection] = useState<string | null>(null);
  const [deletingField, setDeletingField] = useState<{
    sectionId: string;
    fieldId: string;
  } | null>(null);

  const totalFields = sections.reduce((sum, section) => sum + section.fields.length, 0);
  const canAddSection = sections.length < maxSections;
  const canAddField = (sectionId: string) => {
    const section = sections.find((s) => s.sectionId === sectionId);
    return section && section.fields.length < maxFieldsPerSection && totalFields < maxTotalFields;
  };

  const generateId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleAddSection = () => {
    if (!newSectionTitle.trim()) return;

    const newSection: CustomSection = {
      sectionId: generateId(),
      title: newSectionTitle.trim(),
      privacy: 'public',
      order: sections.length,
      fields: [],
    };

    onSectionsChange([...sections, newSection]);
    setNewSectionTitle('');
    setIsAddingSection(false);
  };

  const handleDeleteSection = (sectionId: string) => {
    onSectionsChange(sections.filter((s) => s.sectionId !== sectionId));
    setDeletingSection(null);
  };

  const handleUpdateSection = (sectionId: string, updates: Partial<CustomSection>) => {
    onSectionsChange(sections.map((s) => (s.sectionId === sectionId ? { ...s, ...updates } : s)));
  };

  const handleAddField = (sectionId: string) => {
    if (!newFieldValue.trim()) return;

    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section) return;

    const newField: CustomField = {
      fieldId: generateId(),
      value: newFieldValue.trim(),
      order: section.fields.length,
    };

    handleUpdateSection(sectionId, {
      fields: [...section.fields, newField],
    });

    setNewFieldValue('');
    setAddingFieldToSection(null);
  };

  const handleDeleteField = (sectionId: string, fieldId: string) => {
    const section = sections.find((s) => s.sectionId === sectionId);
    if (!section) return;

    handleUpdateSection(sectionId, {
      fields: section.fields.filter((f) => f.fieldId !== fieldId),
    });
    setDeletingField(null);
  };

  const PrivacySelector = ({
    value,
    onChange,
  }: {
    value: 'public' | 'friends' | 'private';
    onChange: (v: 'public' | 'friends' | 'private') => void;
  }) => (
    <div className="mt-2">
      <label className="text-xs text-gray-500 mb-1 block">Hiển thị với</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as 'public' | 'friends' | 'private')}
        className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:ring-1 focus:ring-emerald-500 focus:border-transparent bg-gray-50"
      >
        <option value="public">Công khai</option>
        <option value="friends">Bạn bè</option>
        <option value="private">Riêng tư</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Mục: {sections.length}/{maxSections} • Trường: {totalFields}/{maxTotalFields}
        </div>
      </div>

      {/* Existing Sections */}
      {sections.map((section) => (
        <div key={section.sectionId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          {/* Section Header - Editable inline */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              {/* Title - Click to edit */}
              {editingTitleId === section.sectionId ? (
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) =>
                    handleUpdateSection(section.sectionId, { title: e.target.value })
                  }
                  onBlur={() => setEditingTitleId(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') setEditingTitleId(null);
                  }}
                  maxLength={50}
                  className="w-full px-2 py-1 text-lg font-semibold border border-emerald-300 rounded focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  autoFocus
                />
              ) : (
                <h3
                  className="font-semibold text-gray-900 cursor-pointer hover:text-emerald-600 transition"
                  onClick={() => setEditingTitleId(section.sectionId)}
                  title="Nhấp để sửa tiêu đề"
                >
                  {section.title}
                </h3>
              )}

              {/* Privacy Selector */}
              <PrivacySelector
                value={section.privacy}
                onChange={(privacy) => handleUpdateSection(section.sectionId, { privacy })}
              />

              <p className="text-xs text-gray-500 mt-2">
                {section.fields.length} trường •{' '}
                {section.privacy === 'private'
                  ? 'Ẩn với tất cả'
                  : section.privacy === 'friends'
                    ? 'Chỉ bạn bè xem được'
                    : 'Mọi người xem được'}
              </p>

              {/* Warning for empty section */}
              {section.fields.length === 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Thêm ít nhất 1 trường để hiển thị trên hồ sơ
                </p>
              )}
            </div>

            {/* Delete Button */}
            <div className="ml-4">
              {deletingSection === section.sectionId ? (
                <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg">
                  <span className="text-sm text-red-700">Xóa?</span>
                  <button
                    onClick={() => handleDeleteSection(section.sectionId)}
                    className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Có
                  </button>
                  <button
                    onClick={() => setDeletingSection(null)}
                    className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                  >
                    Không
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeletingSection(section.sectionId)}
                  className="p-2 text-gray-400 hover:text-red-600 transition"
                  title="Xóa mục"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-2 mt-4">
            {section.fields.map((field) => (
              <div
                key={field.fieldId}
                className="bg-white border border-gray-200 rounded-md p-3 flex items-start justify-between"
              >
                <div className="flex-1">
                  <p className="text-sm text-gray-800">{field.value}</p>
                </div>

                {/* Delete Field */}
                {deletingField?.sectionId === section.sectionId &&
                deletingField?.fieldId === field.fieldId ? (
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => handleDeleteField(section.sectionId, field.fieldId)}
                      className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                    >
                      Xóa
                    </button>
                    <button
                      onClick={() => setDeletingField(null)}
                      className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() =>
                      setDeletingField({ sectionId: section.sectionId, fieldId: field.fieldId })
                    }
                    className="ml-2 p-1 text-gray-400 hover:text-red-600 transition"
                    title="Xóa trường"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}

            {/* Add Field Form - Simple textarea */}
            {addingFieldToSection === section.sectionId ? (
              <div className="bg-white border-2 border-emerald-200 rounded-md p-3 space-y-2">
                <textarea
                  value={newFieldValue}
                  onChange={(e) => setNewFieldValue(e.target.value)}
                  maxLength={200}
                  rows={2}
                  placeholder="Nhập nội dung (ví dụ: Tôi thích nấu món Việt Nam...)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 text-sm resize-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && newFieldValue.trim()) {
                      e.preventDefault();
                      handleAddField(section.sectionId);
                    }
                  }}
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      setAddingFieldToSection(null);
                      setNewFieldValue('');
                    }}
                    className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md text-sm"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={() => handleAddField(section.sectionId)}
                    disabled={!newFieldValue.trim()}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Thêm
                  </button>
                </div>
              </div>
            ) : (
              canAddField(section.sectionId) && (
                <button
                  onClick={() => setAddingFieldToSection(section.sectionId)}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-emerald-500 hover:text-emerald-600 transition"
                >
                  + Thêm trường ({section.fields.length}/{maxFieldsPerSection})
                </button>
              )
            )}
          </div>
        </div>
      ))}

      {/* Add New Section */}
      {isAddingSection ? (
        <div className="border-2 border-emerald-200 rounded-lg p-4 bg-emerald-50">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              maxLength={50}
              placeholder="Nhập tiêu đề mục (ví dụ: Xin chào, Món ăn, Kỹ năng)"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newSectionTitle.trim()) handleAddSection();
                if (e.key === 'Escape') {
                  setIsAddingSection(false);
                  setNewSectionTitle('');
                }
              }}
            />
            <button
              onClick={handleAddSection}
              disabled={!newSectionTitle.trim()}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Tạo
            </button>
            <button
              onClick={() => {
                setIsAddingSection(false);
                setNewSectionTitle('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        canAddSection && (
          <button
            onClick={() => setIsAddingSection(true)}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Thêm mục tùy chỉnh ({sections.length}/{maxSections})
          </button>
        )
      )}

      {/* Limits Warning */}
      {!canAddSection && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            Đã đạt tối đa {maxSections} mục. Xóa một mục để thêm mới.
          </p>
        </div>
      )}

      {/* Empty State */}
      {sections.length === 0 && !isAddingSection && (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
            />
          </svg>
          <h3 className="text-base font-medium text-gray-900 mb-1">Chưa có mục tùy chỉnh</h3>
          <p className="text-sm text-gray-600">
            Tạo các mục như "Xin chào", "Món ăn", "Kỹ năng" để cá nhân hóa hồ sơ của bạn
          </p>
        </div>
      )}
    </div>
  );
}
