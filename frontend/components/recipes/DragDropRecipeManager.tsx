'use client';

import React, { useState, useEffect } from 'react';
import { RecipeGroup, RecipeGroupRecipe } from '../../types/recipeGroups';
import { recipeGroupsService } from '../../services/recipeGroupsService';
import Toast from '../ui/Toast';

interface DragDropRecipeManagerProps {
  group: RecipeGroup;
  onGroupUpdated: (updatedGroup: RecipeGroup) => void;
}

interface AvailableRecipe {
  recipe_id: string;
  title: string;
  description?: string;
  image_url?: string;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
}

export default function DragDropRecipeManager({ group, onGroupUpdated }: DragDropRecipeManagerProps) {
  const [availableRecipes, setAvailableRecipes] = useState<AvailableRecipe[]>([]);
  const [selectedRecipes, setSelectedRecipes] = useState<string[]>([]);
  const [draggedRecipe, setDraggedRecipe] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (showAddModal) {
      loadAvailableRecipes();
    }
  }, [showAddModal]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadAvailableRecipes = async () => {
    try {
      setLoading(true);
      const recipes = await recipeGroupsService.getAvailableRecipes();
      // Filter out recipes already in the group
      const groupRecipeIds = new Set(group.recipes.map(r => r.recipeId));
      const available = recipes.filter(recipe => !groupRecipeIds.has(recipe.recipe_id));
      setAvailableRecipes(available);
    } catch (error: any) {
      console.error('Error loading recipes:', error);
      showToast('Failed to load available recipes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRecipes = async () => {
    if (selectedRecipes.length === 0) return;

    try {
      setLoading(true);
      await recipeGroupsService.addRecipesToGroup(group.id, selectedRecipes);
      
      // Update the group with new recipes
      const updatedGroup = { ...group };
      const newRecipes = availableRecipes
        .filter(recipe => selectedRecipes.includes(recipe.recipe_id))
        .map((recipe, index) => ({
          recipeId: recipe.recipe_id,
          recipeName: recipe.title,
          addedAt: new Date().toISOString(),
          order: group.recipes.length + index,
          personalNotes: ''
        }));

      updatedGroup.recipes = [...updatedGroup.recipes, ...newRecipes];
      updatedGroup.totalRecipes = updatedGroup.recipes.length;
      
      onGroupUpdated(updatedGroup);
      setSelectedRecipes([]);
      setShowAddModal(false);
      showToast(`Added ${selectedRecipes.length} recipe(s) to group`, 'success');
    } catch (error: any) {
      console.error('Error adding recipes:', error);
      showToast('Failed to add recipes to group', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecipe = async (recipeId: string) => {
    if (!confirm('Are you sure you want to remove this recipe from the group?')) {
      return;
    }

    try {
      await recipeGroupsService.removeRecipeFromGroup(group.id, recipeId);
      
      const updatedGroup = { ...group };
      updatedGroup.recipes = updatedGroup.recipes.filter(r => r.recipeId !== recipeId);
      updatedGroup.totalRecipes = updatedGroup.recipes.length;
      
      onGroupUpdated(updatedGroup);
      showToast('Recipe removed from group', 'success');
    } catch (error: any) {
      console.error('Error removing recipe:', error);
      showToast('Failed to remove recipe from group', 'error');
    }
  };

  const handleDragStart = (e: React.DragEvent, recipeId: string) => {
    setDraggedRecipe(recipeId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (!draggedRecipe) return;

    const draggedIndex = group.recipes.findIndex(r => r.recipeId === draggedRecipe);
    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      setDraggedRecipe(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder recipes
    const newRecipes = [...group.recipes];
    const [draggedItem] = newRecipes.splice(draggedIndex, 1);
    newRecipes.splice(dropIndex, 0, draggedItem);

    // Update order numbers
    const reorderedRecipes = newRecipes.map((recipe, index) => ({
      ...recipe,
      order: index
    }));

    try {
      const orderedRecipeIds = reorderedRecipes.map(r => r.recipeId);
      await recipeGroupsService.reorderRecipesInGroup(group.id, orderedRecipeIds);
      
      const updatedGroup = { ...group, recipes: reorderedRecipes };
      onGroupUpdated(updatedGroup);
      showToast('Recipes reordered successfully', 'success');
    } catch (error: any) {
      console.error('Error reordering recipes:', error);
      showToast('Failed to reorder recipes', 'error');
    }

    setDraggedRecipe(null);
    setDragOverIndex(null);
  };

  const handleRecipeToggle = (recipeId: string) => {
    setSelectedRecipes(prev =>
      prev.includes(recipeId)
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId]
    );
  };

  const filteredAvailableRecipes = availableRecipes.filter(recipe =>
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (minutes?: number) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <Toast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Manage Recipes</h3>
          <p className="text-gray-600 text-sm">
            Drag and drop to reorder • {group.recipes.length} recipe(s) in this group
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <span className="text-lg">+</span>
          Add Recipes
        </button>
      </div>

      {/* Recipe List */}
      {group.recipes.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="text-gray-400 text-4xl mb-2">📝</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No recipes in this group</h3>
          <p className="text-gray-600 mb-4">Add some recipes to get started</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Add Your First Recipe
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {group.recipes
            .sort((a, b) => a.order - b.order)
            .map((recipe, index) => (
              <div
                key={recipe.recipeId}
                draggable
                onDragStart={(e) => handleDragStart(e, recipe.recipeId)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                className={`bg-white border rounded-lg p-4 cursor-move transition ${
                  draggedRecipe === recipe.recipeId
                    ? 'opacity-50'
                    : dragOverIndex === index
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Drag Handle */}
                  <div className="text-gray-400 cursor-move">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>

                  {/* Recipe Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 truncate">{recipe.recipeName}</h4>
                    <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                      <span>Added {new Date(recipe.addedAt).toLocaleDateString()}</span>
                      {recipe.personalNotes && (
                        <span className="truncate">Note: {recipe.personalNotes}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemoveRecipe(recipe.recipeId)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Remove from group"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Add Recipes Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Add Recipes to Group</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Search */}
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Search recipes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4 overflow-y-auto max-h-[50vh]">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : filteredAvailableRecipes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 text-4xl mb-2">📝</div>
                  <p className="text-gray-600">
                    {searchQuery ? 'No recipes match your search' : 'No available recipes to add'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAvailableRecipes.map((recipe) => (
                    <div
                      key={recipe.recipe_id}
                      className={`p-3 border rounded-lg cursor-pointer transition ${
                        selectedRecipes.includes(recipe.recipe_id)
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleRecipeToggle(recipe.recipe_id)}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedRecipes.includes(recipe.recipe_id)}
                          onChange={() => handleRecipeToggle(recipe.recipe_id)}
                          className="w-4 h-4 text-blue-600"
                        />
                        
                        {recipe.image_url && (
                          <img
                            src={recipe.image_url}
                            alt={recipe.title}
                            className="w-12 h-12 object-cover rounded-lg"
                          />
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">{recipe.title}</h4>
                          {recipe.description && (
                            <p className="text-sm text-gray-600 line-clamp-1">{recipe.description}</p>
                          )}
                          <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                            {recipe.prep_time_minutes && (
                              <span>Prep: {formatTime(recipe.prep_time_minutes)}</span>
                            )}
                            {recipe.cook_time_minutes && (
                              <span>Cook: {formatTime(recipe.cook_time_minutes)}</span>
                            )}
                            {recipe.servings && (
                              <span>{recipe.servings} servings</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {selectedRecipes.length > 0 && (
                  <span>{selectedRecipes.length} recipe(s) selected</span>
                )}
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddRecipes}
                  disabled={selectedRecipes.length === 0 || loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  )}
                  Add {selectedRecipes.length > 0 ? `${selectedRecipes.length} ` : ''}Recipe{selectedRecipes.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
