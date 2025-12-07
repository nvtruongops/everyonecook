/**
 * Recipe Groups Types
 */

export interface RecipeGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  tags: string[];
  recipes: RecipeGroupRecipe[];
  totalRecipes?: number; // Computed field
  visibility?: 'public' | 'friends' | 'private'; // Privacy setting
  coverImage?: string; // Optional cover image
  createdAt: number;
  updatedAt: number;
}

export interface RecipeGroupRecipe {
  recipeId: string;
  recipeName?: string; // Recipe title
  order: number;
  addedAt: number;
  personalNotes?: string; // User notes
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  color: string;
  icon: string;
  tags: string[];
  visibility?: 'public' | 'friends' | 'private';
}

export const DEFAULT_GROUP_TEMPLATES = [
  { name: 'Breakfast', description: 'Morning recipes', color: 'yellow', icon: 'sun', tags: [] },
  { name: 'Lunch', description: 'Midday meals', color: 'green', icon: 'utensils', tags: [] },
  { name: 'Dinner', description: 'Evening recipes', color: 'blue', icon: 'moon', tags: [] },
];

export const GROUP_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

export const GROUP_ICONS = ['utensils', 'heart', 'star', 'sun', 'moon', 'leaf', 'fire'];

