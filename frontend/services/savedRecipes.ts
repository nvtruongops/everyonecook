/**
 * Saved Recipes Service
 * API calls for recipe management
 */

// Use API Gateway directly (CORS configured on backend)
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api-dev.everyonecook.cloud';

export interface SavedRecipe {
  saved_id: string;
  recipe_name: string;
  recipe_description?: string;
  recipe_ingredients: any[];
  recipe_instructions?: string[];
  recipe_steps?: any[];
  prep_time?: number;
  cook_time?: number;
  total_time?: number;
  servings?: number;
  difficulty?: string;
  cuisine?: string;
  nutrition?: any;
  is_favorite: boolean;
  is_modified: boolean;
  personal_notes?: string;
  original_author_username?: string;
  source: 'ai' | 'manual' | 'saved' | 'user' | 'imported';
  source_detail?: string;
  created_at: string;
  updated_at?: string;
  // Images
  images?: {
    completed?: string; // Ảnh món hoàn thành
    steps?: string[][]; // Ảnh từng bước [stepIndex][imageIndex]
  };
  thumbnail?: string; // Thumbnail từ summary
}

export interface RecipeGroup {
  group_id: string;
  group_name: string;
  items?: SavedRecipe[];
  created_at: string;
}

export interface RecipesWithGroups {
  total: number;
  favorites: SavedRecipe[];
  groups: RecipeGroup[];
  others: SavedRecipe[];
}

// Token getter - will be set by AuthContext
let tokenGetter: (() => string | null) | null = null;
let usernameGetter: (() => string | null) | null = null;

export function setAuthGetters(
  getToken: () => string | null,
  getUsername: () => string | null
): void {
  tokenGetter = getToken;
  usernameGetter = getUsername;
}

function getToken(): string | null {
  return tokenGetter ? tokenGetter() : null;
}

function getUsername(): string | null {
  return usernameGetter ? usernameGetter() : null;
}

/**
 * Map backend recipe to frontend format
 *
 * Handles both:
 * - RecipeSummary (from list endpoint): has ingredientsCount, thumbnail
 * - RecipeEntity (from detail endpoint): has full ingredients array, images object
 */
function mapRecipe(r: any): SavedRecipe {
  // Handle ingredients - could be array (full) or just count (summary)
  let ingredients: any[] = [];
  if (Array.isArray(r.ingredients)) {
    ingredients = r.ingredients;
  } else if (typeof r.ingredientsCount === 'number') {
    // Summary format - create placeholder array for count display
    ingredients = Array(r.ingredientsCount).fill({ name: '' });
  }

  // Handle createdAt - could be timestamp number or ISO string
  let createdAt = r.createdAt;
  if (typeof createdAt === 'number') {
    createdAt = new Date(createdAt).toISOString();
  }

  let updatedAt = r.updatedAt;
  if (typeof updatedAt === 'number') {
    updatedAt = new Date(updatedAt).toISOString();
  }

  // Handle images - normalize to consistent format
  let images: { completed?: string; steps?: string[][] } | undefined;
  if (r.images) {
    images = {
      completed: r.images.completed,
      steps: r.images.steps || [],
    };
  }

  // Handle steps - could be array of strings or array of objects with images
  let steps: any[] = [];
  if (Array.isArray(r.steps)) {
    steps = r.steps.map((step: any, idx: number) => {
      if (typeof step === 'string') {
        return {
          stepNumber: idx + 1,
          description: step,
          images: images?.steps?.[idx] || [],
        };
      }
      return {
        stepNumber: step.stepNumber || idx + 1,
        description: step.description || step.instruction || step,
        duration: step.duration,
        images: step.images || images?.steps?.[idx] || [],
      };
    });
  }

  // Extract original author from attribution object (for saved/imported recipes)
  const originalAuthor =
    r.attribution?.originalAuthorUsername ||
    r.originalAuthor ||
    r.ownerUsername ||
    (r.source === 'saved' || r.source === 'imported' ? r.authorId : undefined);

  return {
    saved_id: r.recipeId,
    recipe_name: r.title || '',
    recipe_description: r.description,
    recipe_ingredients: ingredients,
    recipe_instructions: r.steps || [],
    recipe_steps: steps,
    prep_time: r.prepTime || 0,
    cook_time: r.cookingTime || r.cookTime || 0,
    total_time: r.totalTime || (r.prepTime || 0) + (r.cookingTime || 0),
    servings: r.servings || 2,
    difficulty: r.difficulty || 'medium',
    cuisine: r.cuisine,
    nutrition: r.nutrition,
    is_favorite: r.isFavorite || false,
    is_modified: r.isModified || false,
    personal_notes: r.personalNotes,
    original_author_username: originalAuthor,
    source: r.source || 'manual',
    source_detail: r.sourceDetail,
    created_at: createdAt,
    updated_at: updatedAt,
    images: images,
    thumbnail: r.thumbnail || images?.completed,
  };
}

/**
 * Get all recipes for current user
 *
 * IMPORTANT: userId should be Cognito sub (e.g., "abc-123-def-456"), NOT username
 * Recipes are stored with GSI1PK: USER#<userId>, so query must use userId
 *
 * @param token - JWT access token
 * @param userId - Cognito user ID (sub), NOT username
 */
export async function getAllRecipes(token?: string, userId?: string): Promise<SavedRecipe[]> {
  const authToken = token || getToken();
  const user = userId || getUsername();

  if (!authToken || !user) {
    console.warn('No auth token or userId found');
    return [];
  }

  try {
    const url = `${API_URL}/users/${user}/recipes`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store', // Disable browser cache - always get fresh data
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('Failed to fetch recipes:', error);
      return [];
    }

    const data = await response.json();
    const recipes = data.recipes || [];

    return recipes.map(mapRecipe);
  } catch (error) {
    console.error('Error fetching recipes:', error);
    return [];
  }
}

/**
 * Get single recipe by ID
 *
 * Backend returns: { recipe: RecipeDetails, duration: number }
 * Need to unwrap 'recipe' field before mapping
 */
export async function getRecipe(recipeId: string, token?: string): Promise<SavedRecipe | null> {
  const authToken = token || getToken();

  if (!authToken) {
    console.warn('No auth token found');
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/recipes/${recipeId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Backend wraps recipe in { recipe: {...}, duration: ... }
    const recipe = data.recipe || data;
    return mapRecipe(recipe);
  } catch (error) {
    console.error('Error fetching recipe:', error);
    return null;
  }
}

/**
 * Get recipes with groups
 *
 * @param token - JWT access token
 * @param userId - Cognito user ID (sub), NOT username
 */
export async function getRecipesWithGroups(
  token?: string,
  userId?: string
): Promise<RecipesWithGroups> {
  const recipes = await getAllRecipes(token, userId);

  const favorites = recipes.filter((r) => r.is_favorite);
  const others = recipes.filter((r) => !r.is_favorite);

  return {
    total: recipes.length,
    favorites,
    groups: [],
    others,
  };
}

/**
 * Create new recipe
 */
export async function saveRecipe(
  recipe: Partial<SavedRecipe>,
  token?: string
): Promise<SavedRecipe | null> {
  const authToken = token || getToken();

  if (!authToken) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch(`${API_URL}/recipes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: recipe.recipe_name,
        description: recipe.recipe_description,
        ingredients: recipe.recipe_ingredients,
        steps: recipe.recipe_instructions,
        source: recipe.source || 'manual',
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create recipe');
    }

    const r = await response.json();
    return mapRecipe(r);
  } catch (error) {
    console.error('Error creating recipe:', error);
    throw error;
  }
}

/**
 * Update recipe
 */
export async function updateRecipe(
  recipeId: string,
  updates: Partial<SavedRecipe>,
  token?: string
): Promise<void> {
  const authToken = token || getToken();

  if (!authToken) {
    throw new Error('Not authenticated');
  }

  try {
    // Build update body - only include fields that are provided
    const updateBody: Record<string, unknown> = {};

    if (updates.recipe_name !== undefined) {
      updateBody.title = updates.recipe_name;
    }
    if (updates.recipe_description !== undefined) {
      updateBody.description = updates.recipe_description;
    }
    if (updates.recipe_ingredients !== undefined) {
      updateBody.ingredients = updates.recipe_ingredients;
    }
    if (updates.recipe_steps !== undefined) {
      updateBody.steps = updates.recipe_steps;
    }
    if (updates.images !== undefined) {
      updateBody.images = updates.images;
    }
    if (updates.personal_notes !== undefined) {
      updateBody.personalNotes = updates.personal_notes;
    }

    const response = await fetch(`${API_URL}/recipes/${recipeId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update recipe');
    }
  } catch (error) {
    console.error('Error updating recipe:', error);
    throw error;
  }
}

/**
 * Delete recipe
 */
export async function deleteRecipe(recipeId: string, token?: string): Promise<void> {
  const authToken = token || getToken();

  if (!authToken) {
    throw new Error('Not authenticated');
  }

  try {
    const response = await fetch(`${API_URL}/recipes/${recipeId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete recipe');
    }
  } catch (error) {
    console.error('Error deleting recipe:', error);
    throw error;
  }
}

/**
 * Toggle favorite status
 * @param savedId - Recipe ID
 * @param token - Auth token
 * @param newStatus - New favorite status (true = favorite, false = not favorite)
 */
export async function toggleFavorite(savedId: string, token?: string, newStatus?: boolean): Promise<void> {
  const authToken = token || getToken();
  if (!authToken) throw new Error('Not authenticated');

  try {
    // If newStatus not provided, we need to fetch current status (fallback)
    let favoriteStatus = newStatus;
    if (favoriteStatus === undefined) {
      const recipe = await getRecipe(savedId, authToken);
      if (!recipe) throw new Error('Recipe not found');
      favoriteStatus = !recipe.is_favorite;
    }

    const response = await fetch(`${API_URL}/recipes/${savedId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: favoriteStatus }),
    });

    if (!response.ok) {
      const responseData = await response.json();
      throw new Error(responseData.error?.message || responseData.error || 'Failed to toggle favorite');
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    throw error;
  }
}

/**
 * Create recipe group
 */
export async function createGroup(name: string, token?: string): Promise<RecipeGroup> {
  // TODO: Implement when backend supports groups
  return {
    group_id: Date.now().toString(),
    group_name: name,
    created_at: new Date().toISOString(),
  };
}

/**
 * Delete recipe group
 */
export async function deleteGroup(groupId: string, token?: string): Promise<void> {
  // TODO: Implement when backend supports groups
  console.log('Delete group:', groupId);
}

/**
 * Add recipe to group
 */
export async function addToGroup(groupId: string, savedId: string, token?: string): Promise<void> {
  // TODO: Implement when backend supports groups
  console.log('Add to group:', groupId, savedId);
}

/**
 * Remove recipe from group
 */
export async function removeFromGroup(
  groupId: string,
  savedId: string,
  token?: string
): Promise<void> {
  // TODO: Implement when backend supports groups
  console.log('Remove from group:', groupId, savedId);
}
