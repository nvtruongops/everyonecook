/**
 * Recipe Groups Service
 */

import { RecipeGroup, RecipeGroupRecipe } from '@/types/recipeGroups';
import * as recipesApi from '@/lib/api/recipes';
import { useAuth } from '@/contexts/AuthContext';

// Helper to get username from AuthContext
function getUsername(): string {
  // This assumes AuthContext is available in React tree
  // For non-hook usage, you may need to pass username explicitly
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { user } = useAuth();
    return user?.username || '';
  } catch {
    return '';
  }
}

export const recipeGroupsService = {
  // Get all groups for user
  getGroups: async (username?: string): Promise<RecipeGroup[]> => {
    const user = username || getUsername();
    const res = await recipesApi.listUserRecipes(user);
    return res.data?.groups || [];
  },

  // Get user groups (alias)
  getUserGroups: async (): Promise<RecipeGroup[]> => {
    const username = getUsername();
    const res = await recipesApi.listUserRecipes(username);
    return res.data?.groups || [];
  },

  // Get single group
  getGroup: async (groupId: string): Promise<RecipeGroup> => {
    // TODO: Implement API call to get group by ID
    return {} as RecipeGroup;
  },

  // Create new group
  createGroup: async (group: any): Promise<RecipeGroup> => {
    const username = getUsername();
    const res = await recipesApi.createRecipeGroup(username, group);
    return res.data;
  },

  // Update group
  updateGroup: async (groupId: string, group: any): Promise<RecipeGroup> => {
    // TODO: Implement API call to update group
    return {} as RecipeGroup;
  },

  // Delete group
  deleteGroup: async (groupId: string): Promise<void> => {
    // TODO: Implement API call to delete group
  },

  // Get available recipes (not in any group)
  getAvailableRecipes: async (): Promise<any[]> => {
    // TODO: Implement API call
    return [];
  },

  // Add recipes to group
  addRecipesToGroup: async (groupId: string, recipeIds: string[]): Promise<void> => {
    // TODO: Implement API call
  },

  // Remove recipe from group
  removeRecipeFromGroup: async (groupId: string, recipeId: string): Promise<void> => {
    // TODO: Implement API call
  },

  // Reorder recipes in group
  reorderRecipesInGroup: async (groupId: string, recipeIds: string[]): Promise<void> => {
    // TODO: Implement API call
  },

  // Share group
  shareGroup: async (groupId: string): Promise<{ shareUrl: string; shareCode: string }> => {
    // TODO: Implement API call
    return { shareUrl: '', shareCode: '' };
  },

  // Duplicate group
  duplicateGroup: async (groupId: string, newName: string): Promise<RecipeGroup> => {
    // TODO: Implement API call
    return {} as RecipeGroup;
  },
};

