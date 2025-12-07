'use client';

import { useRouter } from 'next/navigation';
import RecipeImage from '@/components/ui/RecipeImage';

interface RecipeCardProps {
  recipe: {
    recipe_id: string;
    title: string;
    description?: string;
    image_url?: string;
    prep_time_minutes?: number;
    cook_time_minutes?: number;
    servings?: number;
    cuisine_type?: string;
    is_ai_generated?: boolean;
    ingredients?: Array<{ ingredient_name: string }>;
    instructions?: Array<{ step_number: number }>;
  };
  priority?: boolean;
  onAction?: (recipeId: string, action: 'view' | 'save' | 'share') => void;
}

/**
 * RecipeCard component with optimized image loading
 * 
 * Features:
 * - Responsive layout (single column on mobile, grid on desktop)
 * - Optimized recipe images
 * - Touch-friendly action buttons
 * - Proper spacing for mobile
 */
export default function RecipeCard({ recipe, priority = false, onAction }: RecipeCardProps) {
  const router = useRouter();
  const totalTime = (recipe.prep_time_minutes || 0) + (recipe.cook_time_minutes || 0);

  const handleView = () => {
    if (onAction) {
      onAction(recipe.recipe_id, 'view');
    } else {
      router.push(`/recipes/${recipe.recipe_id}`);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Recipe Image */}
      {recipe.image_url && (
        <RecipeImage
          src={recipe.image_url}
          alt={recipe.title}
          priority={priority}
          aspectRatio="video"
        />
      )}

      {/* Recipe Content */}
      <div className="p-4">
        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
          {recipe.title}
        </h3>

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {recipe.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-3">
          {recipe.is_ai_generated && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              🤖 AI
            </span>
          )}
          {recipe.cuisine_type && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {recipe.cuisine_type}
            </span>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
          {totalTime > 0 && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{totalTime} phút</span>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{recipe.servings} người</span>
            </div>
          )}
          {recipe.ingredients && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>{recipe.ingredients.length}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={handleView}
          className="w-full h-11 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
        >
          Xem chi tiết
        </button>
      </div>
    </div>
  );
}

