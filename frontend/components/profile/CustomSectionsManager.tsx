/**
 * CustomSectionsManager Component
 * Wrapper for CustomSectionsEditor with API integration
 * Handles loading, error states, and API calls
 */

'use client';

import React, { useState } from 'react';
import { useCustomSections } from '@/hooks/useCustomSections';

interface CustomSectionsManagerProps {
  token: string;
  maxSections?: number;
  maxFieldsPerSection?: number;
  maxTotalFields?: number;
}

export default function CustomSectionsManager({
  token,
  maxSections = 5,
  maxFieldsPerSection = 10,
  maxTotalFields = 30,
}: CustomSectionsManagerProps) {
  const {
    sections,
    loading,
    error,
    createSection,
    updateSection,
    deleteSection,
    addField,
    updateField,
    deleteField,
  } = useCustomSections(token);

  const [isAddingSection, setIsAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [addingFieldToSection, setAddingFieldToSection] = useState<string | null>(null);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [newFieldPrivacy, setNewFieldPrivacy] = useState<'public' | 'friends' | 'private'>(
    'private'
  );
  const [actionLoading, setActionLoading] = useState(false);

  const totalFields = sections.reduce((sum, section) => sum + section.fields.length, 0);
  const canAddSection = sections.length < maxSections;
  const canAddField = (sectionId: string) => {
    const section = sections.find((s) => s.sectionId === sectionId);
    return section && section.fields.length < maxFieldsPerSection && totalFields < maxTotalFields;
  };

  // Handle create section
  const handleCreateSection = async () => {
    if (!newSectionTitle.trim()) {
      alert('Section title is required');
      return;
    }

    if (newSectionTitle.length > 50) {
      alert('Section title must be 50 characters or less');
      return;
    }

    try {
      setActionLoading(true);
      await createSection(newSectionTitle.trim());
      setNewSectionTitle('');
      setIsAddingSection(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create section');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle update section
  const handleUpdateSection = async (sectionId: string) => {
    if (!editingTitle.trim()) {
      alert('Section title cannot be empty');
      return;
    }

    if (editingTitle.length > 50) {
      alert('Section title must be 50 characters or less');
      return;
    }

    try {
      setActionLoading(true);
      await updateSection(sectionId, editingTitle.trim());
      setEditingSectionId(null);
      setEditingTitle('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update section');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete section
  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('Are you sure you want to delete this section? All fields will be removed.')) {
      return;
    }

    try {
      setActionLoading(true);
      await deleteSection(sectionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete section');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle add field
  const handleAddField = async (sectionId: string) => {
    if (!newFieldLabel.trim() || !newFieldValue.trim()) {
      alert('Field label and value are required');
      return;
    }

    if (newFieldLabel.length > 100) {
      alert('Field label must be 100 characters or less');
      return;
    }

    try {
      setActionLoading(true);
      await addField(sectionId, {
        label: newFieldLabel.trim(),
        type: 'text',
        value: newFieldValue.trim(),
        privacy: newFieldPrivacy,
        required: false,
      });
      setNewFieldLabel('');
      setNewFieldValue('');
      setNewFieldPrivacy('private');
      setAddingFieldToSection(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add field');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle delete field
  const handleDeleteField = async (sectionId: string, fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) {
      return;
    }

    try {
      setActionLoading(true);
      await deleteField(sectionId, fieldId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete field');
    } finally {
      setActionLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Sections: {sections.length}/{maxSections} • Fields: {totalFields}/{maxTotalFields}
        </div>
      </div>

      {/* Existing Sections */}
      {sections.map((section) => (
        <div key={section.sectionId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          {/* Section Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              {editingSectionId === section.sectionId ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    maxLength={50}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                    placeholder="Section title"
                    disabled={actionLoading}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateSection(section.sectionId)}
                      disabled={actionLoading}
                      className="px-3 py-1 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {actionLoading ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingSectionId(null);
                        setEditingTitle('');
                      }}
                      disabled={actionLoading}
                      className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="font-semibold text-gray-900">{section.title}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-500">
                      {section.fields.length} field{section.fields.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {editingSectionId !== section.sectionId && (
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    setEditingSectionId(section.sectionId);
                    setEditingTitle(section.title);
                  }}
                  disabled={actionLoading}
                  className="p-2 text-gray-600 hover:text-emerald-600 transition disabled:opacity-50"
                  title="Edit section"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteSection(section.sectionId)}
                  disabled={actionLoading}
                  className="p-2 text-gray-600 hover:text-red-600 transition disabled:opacity-50"
                  title="Delete section"
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
              </div>
            )}
          </div>

          {/* Fields */}
          <div className="space-y-2 mt-4">
            {section.fields.map((field) => (
              <div
                key={field.fieldId}
                className="bg-white border border-gray-200 rounded-md p-3 flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900">{field.label}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        field.privacy === 'public'
                          ? 'bg-green-100 text-green-800'
                          : field.privacy === 'friends'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {field.privacy === 'public'
                        ? '👁️ Public'
                        : field.privacy === 'friends'
                          ? '👥 Friends'
                          : '🔒 Private'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{String(field.value)}</p>
                </div>
                <button
                  onClick={() => handleDeleteField(section.sectionId, field.fieldId)}
                  disabled={actionLoading}
                  className="ml-2 p-1 text-gray-400 hover:text-red-600 transition disabled:opacity-50"
                  title="Delete field"
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
              </div>
            ))}

            {/* Add Field Form */}
            {addingFieldToSection === section.sectionId ? (
              <div className="bg-white border-2 border-emerald-200 rounded-md p-3 space-y-3">
                <input
                  type="text"
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  maxLength={100}
                  placeholder="Field label (e.g., Favorite Cuisine)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  disabled={actionLoading}
                />
                <textarea
                  value={newFieldValue}
                  onChange={(e) => setNewFieldValue(e.target.value)}
                  rows={2}
                  placeholder="Field value (e.g., Vietnamese, Italian, Japanese)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  disabled={actionLoading}
                />
                <select
                  value={newFieldPrivacy}
                  onChange={(e) =>
                    setNewFieldPrivacy(e.target.value as 'public' | 'friends' | 'private')
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
                  disabled={actionLoading}
                >
                  <option value="private">🔒 Private - Only you can see</option>
                  <option value="friends">👥 Friends - Only friends can see</option>
                  <option value="public">👁️ Public - Everyone can see</option>
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddField(section.sectionId)}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {actionLoading ? 'Adding...' : 'Add Field'}
                  </button>
                  <button
                    onClick={() => {
                      setAddingFieldToSection(null);
                      setNewFieldLabel('');
                      setNewFieldValue('');
                      setNewFieldPrivacy('private');
                    }}
                    disabled={actionLoading}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              canAddField(section.sectionId) && (
                <button
                  onClick={() => setAddingFieldToSection(section.sectionId)}
                  disabled={actionLoading}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:border-emerald-500 hover:text-emerald-600 transition disabled:opacity-50"
                >
                  + Add Field to {section.title}
                </button>
              )
            )}
          </div>
        </div>
      ))}

      {/* Add New Section */}
      {isAddingSection ? (
        <div className="border-2 border-emerald-200 rounded-lg p-4 bg-emerald-50 space-y-3">
          <h3 className="font-semibold text-gray-900">Add New Section</h3>
          <input
            type="text"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            maxLength={50}
            placeholder="Section title (e.g., My Cooking Journey)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500"
            disabled={actionLoading}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreateSection}
              disabled={actionLoading}
              className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
            >
              {actionLoading ? 'Creating...' : 'Create Section'}
            </button>
            <button
              onClick={() => {
                setIsAddingSection(false);
                setNewSectionTitle('');
              }}
              disabled={actionLoading}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        canAddSection && (
          <button
            onClick={() => setIsAddingSection(true)}
            disabled={actionLoading}
            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Custom Section ({sections.length}/{maxSections})
          </button>
        )
      )}

      {/* Limits Warning */}
      {!canAddSection && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You've reached the maximum of {maxSections} sections. Delete a section to add a new one.
          </p>
        </div>
      )}

      {totalFields >= maxTotalFields && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You've reached the maximum of {maxTotalFields} total fields. Delete some fields to add
            new ones.
          </p>
        </div>
      )}

      {/* Empty State */}
      {sections.length === 0 && !isAddingSection && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg
            className="w-16 h-16 text-gray-400 mx-auto mb-4"
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">No custom sections yet</h3>
          <p className="text-gray-600 mb-4">Create custom sections to personalize your profile</p>
          <p className="text-sm text-gray-500">
            Examples: "My Cooking Journey", "Dietary Preferences", "Favorite Cuisines"
          </p>
        </div>
      )}
    </div>
  );
}
