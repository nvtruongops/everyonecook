'use client';

import React, { useState, useEffect } from 'react';
import { RecipeGroup } from '../../types/recipeGroups';
import { recipeGroupsService } from '../../services/recipeGroupsService';
import Toast from '../ui/Toast';
import DragDropRecipeManager from './DragDropRecipeManager';

interface RecipeGroupDetailProps {
  groupId: string;
  onBack: () => void;
}

export default function RecipeGroupDetail({ groupId, onBack }: RecipeGroupDetailProps) {
  const [group, setGroup] = useState<RecipeGroup | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    visibility: 'private' | 'friends' | 'public';
  }>({
    name: '',
    description: '',
    visibility: 'private'
  });
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadGroup();
  }, [groupId]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadGroup = async () => {
    try {
      setLoading(true);
      const groupData = await recipeGroupsService.getGroup(groupId);
      setGroup(groupData);
      setEditForm({
        name: groupData.name,
        description: groupData.description || '',
        visibility: groupData.visibility
      });
    } catch (error: any) {
      console.error('Error loading group:', error);
      showToast('Failed to load recipe group', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!group || !editForm.name.trim()) return;

    try {
      const updatedGroup = await recipeGroupsService.updateGroup(group.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        visibility: editForm.visibility
      });
      
      setGroup(updatedGroup);
      setEditing(false);
      showToast('Group updated successfully', 'success');
    } catch (error: any) {
      console.error('Error updating group:', error);
      showToast('Failed to update group', 'error');
    }
  };

  const handleShare = async () => {
    if (!group) return;

    try {
      const shareData = await recipeGroupsService.shareGroup(group.id);
      await navigator.clipboard.writeText(shareData.shareUrl);
      showToast('Share link copied to clipboard!', 'success');
    } catch (error: any) {
      console.error('Error sharing group:', error);
      showToast('Failed to generate share link', 'error');
    }
  };

  const handleDuplicate = async () => {
    if (!group) return;

    try {
      const newName = `${group.name} (Copy)`;
      await recipeGroupsService.duplicateGroup(group.id, newName);
      showToast('Group duplicated successfully!', 'success');
    } catch (error: any) {
      console.error('Error duplicating group:', error);
      showToast('Failed to duplicate group', 'error');
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public': return '🌍';
      case 'friends': return '👥';
      case 'private':
      default: return '🔒';
    }
  };

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case 'public': return 'Public';
      case 'friends': return 'Friends Only';
      case 'private':
      default: return 'Private';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">❌</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Group not found</h3>
        <p className="text-gray-600 mb-6">The recipe group you're looking for doesn't exist or has been deleted.</p>
        <button
          onClick={onBack}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Back to Groups
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Header */}
      <div className="mb-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Groups
        </button>

        {/* Group header */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Group icon */}
              <div
                className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl font-bold"
                style={{ backgroundColor: group.color }}
              >
                {group.icon}
              </div>

              {/* Group info */}
              <div className="flex-1">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                      maxLength={50}
                      className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 border-blue-500 focus:outline-none"
                    />
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Add a description..."
                      maxLength={200}
                      rows={2}
                      className="w-full text-gray-600 bg-transparent border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={editForm.visibility}
                      onChange={(e) => setEditForm(prev => ({ ...prev, visibility: e.target.value as any }))}
                      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="private">🔒 Private</option>
                      <option value="friends">👥 Friends Only</option>
                      <option value="public">🌍 Public</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">{group.name}</h1>
                    {group.description && (
                      <p className="text-gray-600 mb-2">{group.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <span>{getVisibilityIcon(group.visibility)}</span>
                        <span>{getVisibilityLabel(group.visibility)}</span>
                      </div>
                      <span>{group.totalRecipes} recipes</span>
                      <span>Created {new Date(group.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )}

                {/* Tags */}
                {group.tags.length > 0 && !editing && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {group.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editForm.name.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
                  >
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Edit group"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={handleShare}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Share group"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                    </svg>
                  </button>
                  
                  <button
                    onClick={handleDuplicate}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                    title="Duplicate group"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recipe Management */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <DragDropRecipeManager
          group={group}
          onGroupUpdated={setGroup}
        />
      </div>
    </div>
  );
}
