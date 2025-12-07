'use client';

import React, { useState } from 'react';
import { RecipeGroup, CreateGroupRequest, DEFAULT_GROUP_TEMPLATES, GROUP_COLORS, GROUP_ICONS } from '../../types/recipeGroups';
import { recipeGroupsService } from '../../services/recipeGroupsService';

interface GroupCreationFlowProps {
  onGroupCreated: (group: RecipeGroup) => void;
  onCancel: () => void;
}

type CreationStep = 'basic_info' | 'appearance' | 'recipes' | 'visibility';

interface GroupFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  visibility: 'private' | 'friends' | 'public';
  tags: string[];
  selectedRecipes: string[];
}

export default function GroupCreationFlow({ onGroupCreated, onCancel }: GroupCreationFlowProps) {
  const [currentStep, setCurrentStep] = useState<CreationStep>('basic_info');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableRecipes, setAvailableRecipes] = useState<any[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const [formData, setFormData] = useState<GroupFormData>({
    name: '',
    description: '',
    color: GROUP_COLORS[0],
    icon: GROUP_ICONS[0],
    visibility: 'private',
    tags: [],
    selectedRecipes: []
  });

  const steps: { key: CreationStep; title: string; description: string }[] = [
    { key: 'basic_info', title: 'Basic Info', description: 'Name and description' },
    { key: 'appearance', title: 'Appearance', description: 'Color and icon' },
    { key: 'recipes', title: 'Recipes', description: 'Add recipes (optional)' },
    { key: 'visibility', title: 'Visibility', description: 'Who can see this group' }
  ];

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);

  const loadAvailableRecipes = async () => {
    if (availableRecipes.length > 0) return;
    
    try {
      setLoadingRecipes(true);
      const recipes = await recipeGroupsService.getAvailableRecipes();
      setAvailableRecipes(recipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      setLoadingRecipes(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 'basic_info' && !formData.name.trim()) {
      setError('Group name is required');
      return;
    }

    if (currentStep === 'recipes') {
      loadAvailableRecipes();
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].key);
      setError(null);
    }
  };

  const handlePrevious = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].key);
      setError(null);
    }
  };

  const handleTemplateSelect = (template: typeof DEFAULT_GROUP_TEMPLATES[0]) => {
    setFormData(prev => ({
      ...prev,
      name: template.name,
      description: template.description,
      color: template.color,
      icon: template.icon,
      tags: [...template.tags]
    }));
  };

  const handleTagAdd = (tag: string) => {
    if (tag.trim() && !formData.tags.includes(tag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag.trim()]
      }));
    }
  };

  const handleTagRemove = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const handleRecipeToggle = (recipeId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedRecipes: prev.selectedRecipes.includes(recipeId)
        ? prev.selectedRecipes.filter(id => id !== recipeId)
        : [...prev.selectedRecipes, recipeId]
    }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setError(null);

      const groupData: CreateGroupRequest = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        color: formData.color,
        icon: formData.icon,
        visibility: formData.visibility,
        tags: formData.tags
      };

      const newGroup = await recipeGroupsService.createGroup(groupData);

      // Add selected recipes if any
      if (formData.selectedRecipes.length > 0) {
        await recipeGroupsService.addRecipesToGroup(newGroup.id, formData.selectedRecipes);
        // Update the group object with recipe count
        newGroup.totalRecipes = formData.selectedRecipes.length;
      }

      onGroupCreated(newGroup);
    } catch (error: any) {
      console.error('Error creating group:', error);
      setError(error.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'basic_info':
        return (
          <div className="space-y-6">
            {/* Templates */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Quick Start Templates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DEFAULT_GROUP_TEMPLATES.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => handleTemplateSelect(template)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-left transition"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{template.icon}</span>
                      <span className="font-medium">{template.name}</span>
                    </div>
                    <p className="text-sm text-gray-600">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Or Create Custom</h3>
              
              {/* Group Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Weekend Cooking, Family Favorites"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-500 text-xs mt-1">{formData.name.length}/50 characters</p>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this group is for..."
                  maxLength={200}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-500 text-xs mt-1">{formData.description.length}/200 characters</p>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (Optional)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {tag}
                      <button
                        onClick={() => handleTagRemove(tag)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Add tags (press Enter)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTagAdd(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Group Color
              </label>
              <div className="grid grid-cols-8 gap-2">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData(prev => ({ ...prev, color }))}
                    className={`w-10 h-10 rounded-lg border-2 ${
                      formData.color === color ? 'border-gray-900' : 'border-gray-300'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            {/* Icon Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Group Icon
              </label>
              <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
                {GROUP_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setFormData(prev => ({ ...prev, icon }))}
                    className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl ${
                      formData.icon === icon ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Preview
              </label>
              <div className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg">
                <div
                  className="w-16 h-16 rounded-lg flex items-center justify-center text-white text-2xl"
                  style={{ backgroundColor: formData.color }}
                >
                  {formData.icon}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{formData.name || 'Group Name'}</h3>
                  {formData.description && (
                    <p className="text-gray-600 text-sm">{formData.description}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );

      case 'recipes':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Add Recipes (Optional)</h3>
              <p className="text-gray-600 mb-4">
                You can add recipes now or skip this step and add them later.
              </p>
            </div>

            {loadingRecipes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : availableRecipes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📝</div>
                <p className="text-gray-600">No saved recipes found</p>
                <p className="text-gray-500 text-sm">Save some recipes first to add them to groups</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {availableRecipes.map((recipe) => (
                  <div
                    key={recipe.recipe_id}
                    className={`p-3 border rounded-lg cursor-pointer transition ${
                      formData.selectedRecipes.includes(recipe.recipe_id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleRecipeToggle(recipe.recipe_id)}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formData.selectedRecipes.includes(recipe.recipe_id)}
                        onChange={() => handleRecipeToggle(recipe.recipe_id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{recipe.title}</h4>
                        {recipe.description && (
                          <p className="text-sm text-gray-600 line-clamp-1">{recipe.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formData.selectedRecipes.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-blue-800 text-sm">
                  {formData.selectedRecipes.length} recipe(s) selected
                </p>
              </div>
            )}
          </div>
        );

      case 'visibility':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Who can see this group?</h3>
              <p className="text-gray-600 mb-4">
                Choose who can view and access your recipe group.
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  value: 'private' as const,
                  icon: '🔒',
                  title: 'Private',
                  description: 'Only you can see this group'
                },
                {
                  value: 'friends' as const,
                  icon: '👥',
                  title: 'Friends Only',
                  description: 'Only your friends can see this group'
                },
                {
                  value: 'public' as const,
                  icon: '🌍',
                  title: 'Public',
                  description: 'Anyone can see this group'
                }
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition ${
                    formData.visibility === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={option.value}
                    checked={formData.visibility === option.value}
                    onChange={(e) => setFormData(prev => ({ ...prev, visibility: e.target.value as any }))}
                    className="w-4 h-4 text-blue-600"
                  />
                  <div className="text-2xl">{option.icon}</div>
                  <div>
                    <div className="font-medium text-gray-900">{option.title}</div>
                    <div className="text-sm text-gray-600">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Group Summary</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <div>Name: {formData.name}</div>
                {formData.description && <div>Description: {formData.description}</div>}
                <div>Recipes: {formData.selectedRecipes.length}</div>
                <div>Visibility: {formData.visibility}</div>
                {formData.tags.length > 0 && (
                  <div>Tags: {formData.tags.join(', ')}</div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Create Recipe Group</h2>
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-4">
            {steps.map((step, index) => (
              <React.Fragment key={step.key}>
                <div className={`flex items-center gap-2 ${
                  index <= currentStepIndex ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    index <= currentStepIndex ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <span className="text-sm font-medium">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-px ${
                    index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {renderStepContent()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentStepIndex === 0}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            
            {currentStepIndex === steps.length - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={loading || !formData.name.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                Create Group
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentStep === 'basic_info' && !formData.name.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
