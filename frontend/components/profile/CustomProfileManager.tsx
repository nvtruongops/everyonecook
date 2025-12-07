'use client';

import React, { useState, useEffect } from 'react';
import { Toast } from '@/components/ui';
import { CustomProfile, CustomField, CustomSection, CustomProfileManagerProps } from '@/types/profile';
import ProfileService from '@/services/profileService';
import DynamicFormBuilder from './DynamicFormBuilder';

export default function CustomProfileManager({ 
  userId, 
  maxSections = 5, 
  maxTotalFields = 15, 
  onProfileUpdate 
}: CustomProfileManagerProps) {
  const [profile, setProfile] = useState<CustomProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);

  useEffect(() => {
    loadCustomProfile();
  }, [userId]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadCustomProfile = async () => {
    try {
      setLoading(true);
      const data = await ProfileService.getCustomProfile();
      setProfile(data);
      
      // Expand all sections by default
      if (data.sections) {
        setExpandedSections(new Set(Object.keys(data.sections)));
      }

      // Call onProfileUpdate if provided
      if (onProfileUpdate) {
        onProfileUpdate(data);
      }
    } catch (error: any) {
      console.error('Error loading custom profile:', error);
      showToast(error.message || 'Failed to load custom profile sections', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createSection = async () => {
    const validation = ProfileService.validateSectionTitle(newSectionTitle);
    if (!validation.isValid) {
      showToast(validation.errors[0], 'error');
      return;
    }

    try {
      const updatedProfile = await ProfileService.createSection(newSectionTitle);
      setProfile(updatedProfile);
      setNewSectionTitle('');
      
      // Expand the new section
      const newSectionId = Object.keys(updatedProfile.sections).find(id => 
        !expandedSections.has(id)
      );
      if (newSectionId) {
        setExpandedSections(prev => new Set([...prev, newSectionId]));
      }

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Section created successfully', 'success');
    } catch (error: any) {
      console.error('Error creating section:', error);
      showToast(error.message || 'Failed to create section', 'error');
    }
  };

  const updateSection = async (sectionId: string, title: string) => {
    const validation = ProfileService.validateSectionTitle(title);
    if (!validation.isValid) {
      showToast(validation.errors[0], 'error');
      return;
    }

    try {
      const updatedProfile = await ProfileService.updateSection(sectionId, title);
      setProfile(updatedProfile);
      setEditingSection(null);

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Section updated successfully', 'success');
    } catch (error: any) {
      console.error('Error updating section:', error);
      showToast(error.message || 'Failed to update section', 'error');
    }
  };

  const deleteSection = async (sectionId: string) => {
    if (!confirm('Are you sure you want to delete this section? All fields in this section will be removed.')) {
      return;
    }

    try {
      const updatedProfile = await ProfileService.deleteSection(sectionId);
      setProfile(updatedProfile);
      
      // Remove from expanded sections
      setExpandedSections(prev => {
        const newSet = new Set(prev);
        newSet.delete(sectionId);
        return newSet;
      });

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Section deleted successfully', 'success');
    } catch (error: any) {
      console.error('Error deleting section:', error);
      showToast(error.message || 'Failed to delete section', 'error');
    }
  };

  const handleFieldAdd = async (sectionId: string, field: CustomField) => {
    const validation = ProfileService.validateField(field);
    if (!validation.isValid) {
      showToast(validation.errors[0], 'error');
      return;
    }

    try {
      const updatedProfile = await ProfileService.addField(sectionId, field);
      setProfile(updatedProfile);

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Field added successfully', 'success');
    } catch (error: any) {
      console.error('Error adding field:', error);
      showToast(error.message || 'Failed to add field', 'error');
    }
  };

  const handleFieldUpdate = async (sectionId: string, fieldId: string, field: CustomField) => {
    const validation = ProfileService.validateField(field);
    if (!validation.isValid) {
      showToast(validation.errors[0], 'error');
      return;
    }

    try {
      const updatedProfile = await ProfileService.updateField(sectionId, fieldId, field);
      setProfile(updatedProfile);

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Field updated successfully', 'success');
    } catch (error: any) {
      console.error('Error updating field:', error);
      showToast(error.message || 'Failed to update field', 'error');
    }
  };

  const handleFieldDelete = async (sectionId: string, fieldId: string) => {
    if (!confirm('Are you sure you want to delete this field?')) {
      return;
    }

    try {
      const updatedProfile = await ProfileService.deleteField(sectionId, fieldId);
      setProfile(updatedProfile);

      if (onProfileUpdate) {
        onProfileUpdate(updatedProfile);
      }
      
      showToast('Field deleted successfully', 'success');
    } catch (error: any) {
      console.error('Error deleting field:', error);
      showToast(error.message || 'Failed to delete field', 'error');
    }
  };

  const handleSectionReorder = async (sectionIds: string[]) => {
    // This would be implemented when backend supports section reordering
    // For now, we'll just update the local state
    if (!profile) return;

    const reorderedSections: { [key: string]: CustomSection } = {};
    sectionIds.forEach((sectionId, index) => {
      if (profile.sections[sectionId]) {
        reorderedSections[sectionId] = {
          ...profile.sections[sectionId],
          order: index
        };
      }
    });

    const updatedProfile = {
      ...profile,
      sections: reorderedSections
    };

    setProfile(updatedProfile);
    
    if (onProfileUpdate) {
      onProfileUpdate(updatedProfile);
    }
  };

  const handleSectionDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSectionId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSectionDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleSectionDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault();
    
    if (!draggedSectionId || draggedSectionId === targetSectionId || !profile) {
      setDraggedSectionId(null);
      return;
    }

    const sectionEntries = Object.entries(profile.sections).sort(([, a], [, b]) => a.order - b.order);
    const sectionIds = sectionEntries.map(([id]) => id);
    
    const draggedIndex = sectionIds.indexOf(draggedSectionId);
    const targetIndex = sectionIds.indexOf(targetSectionId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSectionId(null);
      return;
    }

    // Reorder the sections
    const newSectionIds = [...sectionIds];
    newSectionIds.splice(draggedIndex, 1);
    newSectionIds.splice(targetIndex, 0, draggedSectionId);

    handleSectionReorder(newSectionIds);
    setDraggedSectionId(null);
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-label="Loading custom profile">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const sectionsCount = profile ? Object.keys(profile.sections).length : 0;
  const fieldsCount = profile?.customFieldsCount || 0;
  const remainingFields = maxTotalFields - fieldsCount;

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-6">
      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Header with stats */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Custom Profile Sections</h2>
          <p className="text-gray-600 mt-1">
            Personalize your profile with custom sections and fields for better AI recommendations
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500">
            Sections: {sectionsCount}/{maxSections}
          </div>
          <div className="text-sm text-gray-500">
            Fields: {fieldsCount}/{maxTotalFields}
          </div>
        </div>
      </div>

      {/* Limits warning */}
      {(sectionsCount >= maxSections || fieldsCount >= maxTotalFields) && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800 text-sm">
            {sectionsCount >= maxSections && `You've reached the maximum of ${maxSections} sections. `}
            {fieldsCount >= maxTotalFields && `You've reached the maximum of ${maxTotalFields} total fields. `}
            Delete existing items to add new ones.
          </p>
        </div>
      )}

      {/* Create new section */}
      {sectionsCount < maxSections && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <span className="text-blue-500 mr-2">+</span>
            Add New Section
          </h3>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Section title (max 50 characters)"
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              maxLength={50}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={createSection}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Existing sections */}
      {profile && Object.entries(profile.sections)
        .sort(([, a], [, b]) => a.order - b.order)
        .map(([sectionId, section]) => (
          <div 
            key={sectionId} 
            className={`bg-white border border-gray-200 rounded-lg transition-all ${
              draggedSectionId === sectionId ? 'opacity-50' : ''
            }`}
            draggable
            onDragStart={(e) => handleSectionDragStart(e, sectionId)}
            onDragOver={handleSectionDragOver}
            onDrop={(e) => handleSectionDrop(e, sectionId)}
          >
            {/* Section header */}
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Drag handle */}
                  <div className="cursor-move text-gray-400" title="Drag to reorder sections">
                    ⋮⋮
                  </div>
                  <button
                    onClick={() => toggleSection(sectionId)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    {expandedSections.has(sectionId) ? '▼' : '▶'}
                  </button>
                  {editingSection === sectionId ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        defaultValue={section.title}
                        maxLength={50}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            updateSection(sectionId, e.currentTarget.value);
                          } else if (e.key === 'Escape') {
                            setEditingSection(null);
                          }
                        }}
                        autoFocus
                        className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget.parentElement?.querySelector('input');
                          if (input) updateSection(sectionId, input.value);
                        }}
                        className="px-2 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingSection(null)}
                        className="px-2 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <h3 
                      className="text-lg font-semibold cursor-pointer hover:text-blue-600"
                      onClick={() => toggleSection(sectionId)}
                    >
                      {section.title}
                    </h3>
                  )}
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-full text-sm">
                    {Object.keys(section.fields).length} fields
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingSection(sectionId)}
                    className="p-1 text-gray-500 hover:text-blue-600"
                    title="Edit section"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => deleteSection(sectionId)}
                    className="p-1 text-gray-500 hover:text-red-600"
                    title="Delete section"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>

            {/* Section content */}
            {expandedSections.has(sectionId) && (
              <div className="p-4">
                <DynamicFormBuilder
                  section={section}
                  sectionId={sectionId}
                  onFieldAdd={(field) => handleFieldAdd(sectionId, field)}
                  onFieldUpdate={(fieldId, field) => handleFieldUpdate(sectionId, fieldId, field)}
                  onFieldDelete={(fieldId) => handleFieldDelete(sectionId, fieldId)}
                  remainingFieldsCount={remainingFields}
                  maxFieldsPerSection={10}
                />
              </div>
            )}
          </div>
        ))}

      {/* Empty state */}
      {(!profile || Object.keys(profile.sections).length === 0) && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <div className="text-gray-500 mb-4">
            <div className="text-4xl mb-2">📝</div>
            <p className="text-lg">No custom sections yet</p>
            <p className="text-sm">Create your first section to personalize your profile</p>
          </div>
        </div>
      )}
    </div>
  );
}


