// Recipe Model - TypeScript interfaces for recipe domain

export type RecipeSource = 'ai' | 'manual' | 'saved';

/**
 * Processed Ingredient - Chuẩn hóa format nguyên liệu
 *
 * Flow: User nhập tiếng Việt → normalize → lookup Dictionary → lấy English + Nutrition
 */
export interface ProcessedIngredient {
  vietnamese: string; // "Thịt Ba Chỉ" - Giữ nguyên input từ user
  normalized: string; // "thit-ba-chi" - Auto generate
  english: string; // "pork-belly" - Từ Dictionary hoặc AI
  category?: string; // "meat" - Từ Dictionary
  amount?: string; // "200g"
  notes?: string; // "Thái mỏng"
  nutrition?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
  };
  source?: 'dictionary' | 'cache' | 'ai' | 'unknown'; // Nguồn dữ liệu (cache = Translation Cache 1 năm)
}

/**
 * Recipe Step
 */
export interface RecipeStep {
  stepNumber: number;
  description: string;
  duration?: number; // minutes
  images?: string[];
}

/**
 * Recipe Nutrition (tổng hợp từ ingredients)
 */
export interface RecipeNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  servings?: number; // Nutrition per serving
}

export interface Recipe {
  recipeId: string;
  ownerUsername: string;
  title: string;
  description?: string;
  ingredients: ProcessedIngredient[]; // Chuẩn hóa format
  steps: RecipeStep[]; // Chuẩn hóa format
  images?: {
    completed?: string; // Ảnh món hoàn thành
    steps?: string[]; // Ảnh từng bước
  };
  servings?: number;
  cookingTime?: number; // minutes
  difficulty?: 'easy' | 'medium' | 'hard';
  nutrition?: RecipeNutrition;
  source: RecipeSource;
  originalAuthor?: string;
  originalRecipeId?: string;
  isShared?: boolean;
  sharedPostId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeGroup {
  groupId: string;
  ownerUsername: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecipeLink {
  username: string;
  recipeId: string;
  savedAt: string;
  // ...other fields as needed
}
