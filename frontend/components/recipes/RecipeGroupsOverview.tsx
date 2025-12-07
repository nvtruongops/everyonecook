'use client';

import React, { useState, useEffect } from 'react';
import { RecipeGroup } from '../../types/recipeGroups';
import { recipeGroupsService } from '../../services/recipeGroupsService';
import Toast from '../ui/Toast';
import GroupCreationFlow from './GroupCreationFlow';
import RecipeGroupCard from './RecipeGroupCard';

interface RecipeGroupsOverviewProps {
  onGroupSelect?: (groupId: string) => void;
}

type DisplayMode = 'grid' | 'list';
type SortBy = 'newest' | 'name' | 'recipe_count';

export default function RecipeGroupsOverview({ onGroupSelect }: RecipeGroupsOverviewProps) {
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [showCreateFlow, setShowCreateFlow] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      const groupsData = await recipeGroupsService.getUserGroups();
      setGroups(groupsData);
    } catch (error: any) {
      console.error('Error loading groups:', error);
      showToast('Failed to load recipe groups', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupCreated = (newGroup: RecipeGroup) => {
    setGroups(prev => [newGroup, ...prev]);
    setShowCreateFlow(false);
    showToast('Recipe group created successfully!', 'success');
  };

  const handleGroupDeleted = async (groupId: string) => {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) {
      return;
    }

    try {
      await recipeGroupsService.deleteGroup(groupId);
      setGroups(prev => prev.filter(g => g.id !== groupId));
      showToast('Recipe group deleted successfully', 'success');
    } catch (error: any) {
      console.error('Error deleting group:', error);
      showToast('Failed to delete recipe group', 'error');
    }
  };

  const handleGroupDuplicated = async (groupId: string) => {
    try {
      const originalGroup = groups.find(g => g.id === groupId);
      const newName = `${originalGroup?.name} (Copy)`;
      const duplicatedGroup = await recipeGroupsService.duplicateGroup(groupId, newName);
      setGroups(prev => [duplicatedGroup, ...prev]);
      showToast('Recipe group duplicated successfully!', 'success');
    } catch (error: any) {
      console.error('Error duplicating group:', error);
      showToast('Failed to duplicate recipe group', 'error');
    }
  };

  const handleGroupShared = async (groupId: string) => {
    try {
      const shareData = await recipeGroupsService.shareGroup(groupId);
      await navigator.clipboard.writeText(shareData.shareUrl);
      showToast('Share link copied to clipboard!', 'success');
    } catch (error: any) {
      console.error('Error sharing group:', error);
      showToast('Failed to generate share link', 'error');
    }
  };

  // Filter and sort groups
  const filteredAndSortedGroups = groups
    .filter(group => 
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recipe_count':
          return b.totalRecipes - a.totalRecipes;
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Recipe Groups</h1>
          <p className="text-gray-600 mt-2">
            Organize your recipes into custom collections
          </p>
        </div>
        <button
          onClick={() => setShowCreateFlow(true)}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          <span className="text-lg">+</span>
          Create Group
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search groups by name, description, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="newest">Newest First</option>
          <option value="name">Name A-Z</option>
          <option value="recipe_count">Most Recipes</option>
        </select>

        {/* Display Mode */}
        <div className="flex border border-gray-300 rounded-lg overflow-hidden">
          <button
            onClick={() => setDisplayMode('grid')}
            className={`px-4 py-2 ${
              displayMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onClick={() => setDisplayMode('list')}
            className={`px-4 py-2 ${
              displayMode === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Groups Display */}
      {filteredAndSortedGroups.length === 0 ? (
        <div className="text-center py-12">
          {searchQuery ? (
            <div>
              <div className="text-gray-400 text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No groups found</h3>
              <p className="text-gray-600">Try adjusting your search terms</p>
            </div>
          ) : (
            <div>
              <div className="text-gray-400 text-6xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No recipe groups yet</h3>
              <p className="text-gray-600 mb-6">Create your first group to organize your recipes</p>
              <button
                onClick={() => setShowCreateFlow(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Create Your First Group
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className={
          displayMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            : 'space-y-4'
        }>
          {filteredAndSortedGroups.map((group) => (
            <RecipeGroupCard
              key={group.id}
              group={group}
              displayMode={displayMode}
              onSelect={() => onGroupSelect?.(group.id)}
              onDelete={() => handleGroupDeleted(group.id)}
              onDuplicate={() => handleGroupDuplicated(group.id)}
              onShare={() => handleGroupShared(group.id)}
            />
          ))}
        </div>
      )}

      {/* Group Creation Flow Modal */}
      {showCreateFlow && (
        <GroupCreationFlow
          onGroupCreated={handleGroupCreated}
          onCancel={() => setShowCreateFlow(false)}
        />
      )}
    </div>
  );
}
