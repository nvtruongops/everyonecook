'use client';

import React, { useState, useEffect } from 'react';
import { 
  NutritionRecommendation, 
  RecommendationFilters,
  nutritionRecommendationService 
} from '@/services/nutritionRecommendationService';
import { UserNutritionGoals } from '@/types/nutrition';
import { Recipe } from '@/types/recipe';
// SVG Icons as components
const Sparkles = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l1.5 1.5L5 6l1.5 1.5L5 9l1.5 1.5L5 12l1.5 1.5L5 15l1.5 1.5L5 18l1.5 1.5L5 21M19 3l-1.5 1.5L19 6l-1.5 1.5L19 9l-1.5 1.5L19 12l-1.5 1.5L19 15l-1.5 1.5L19 18l-1.5 1.5L19 21" />
  </svg>
);

const Heart = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const TrendingUp = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const Clock = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Users = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ChefHat = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 21h8M8 21V7a4 4 0 118 0v14M8 21H6a2 2 0 01-2-2v-2a2 2 0 012-2h2m8 6h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2" />
  </svg>
);

const Star = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const BookmarkPlus = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m-2-2h4" />
  </svg>
);

const Eye = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const ThumbsUp = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2v0a2 2 0 00-2 2v6.5L9 14M7 20l-2-1v-6a2 2 0 012-2h1m0 0V9a2 2 0 012-2h1" />
  </svg>
);

const ThumbsDown = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2v0a2 2 0 002-2v-6.5L15 10M17 4l2 1v6a2 2 0 01-2 2h-1m0 0v5a2 2 0 01-2 2h-1" />
  </svg>
);

const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

interface NutritionRecommendationsProps {
  userId: string;
  nutritionGoals?: UserNutritionGoals;
  currentProgress?: any;
  mealType?: string;
  onRecipeSave?: (recipe: Recipe) => void;
  onRecipeView?: (recipe: Recipe) => void;
}

interface RecommendationCardProps {
  recommendation: NutritionRecommendation;
  onSave: (recipe: Recipe) => void;
  onView: (recipe: Recipe) => void;
  onFeedback: (recommendationId: string, action: 'like' | 'dislike', feedback?: string) => void;
}

const RecommendationCard: React.FC<RecommendationCardProps> = ({
  recommendation,
  onSave,
  onView,
  onFeedback
}) => {
  const { recipe, nutritionProfile, score, reasoning, benefits, goalContribution } = recommendation;
  
  const [showDetails, setShowDetails] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<'like' | 'dislike' | null>(null);

  const handleFeedback = (action: 'like' | 'dislike') => {
    setFeedbackGiven(action);
    onFeedback(recommendation.id, action);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-orange-600 bg-orange-50';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 0.8) return 'Rất phù hợp';
    if (score >= 0.6) return 'Phù hợp';
    return 'Có thể phù hợp';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(score)}`}>
                {getScoreLabel(score)} ({Math.round(score * 100)}%)
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">{recipe.title}</h3>
            <p className="text-sm text-gray-600 mb-2">{recipe.description}</p>
            
            {/* Recipe metadata */}
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{recipe.prep_time_minutes + recipe.cook_time_minutes} phút</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>{recipe.servings} phần</span>
              </div>
              <div className="flex items-center gap-1">
                <ChefHat className="h-3 w-3" />
                <span className="capitalize">{recipe.cooking_method}</span>
              </div>
            </div>
          </div>
          
          {/* Nutrition summary */}
          <div className="ml-4 text-right">
            <div className="text-lg font-semibold text-gray-900">
              {nutritionProfile.caloriesPerServing} cal
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <div>Protein: {nutritionProfile.proteinG}g</div>
              <div>Carbs: {nutritionProfile.carbohydratesG}g</div>
              <div>Fat: {nutritionProfile.fatG}g</div>
            </div>
          </div>
        </div>
      </div>

      {/* Goal contribution */}
      <div className="px-4 py-3 bg-gray-50">
        <div className="text-xs font-medium text-gray-700 mb-2">Đóng góp vào mục tiêu hàng ngày:</div>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(goalContribution).map(([key, value]) => (
            <div key={key} className="text-center">
              <div className="text-xs font-medium text-gray-900">{value}%</div>
              <div className="text-xs text-gray-500 capitalize">{key}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reasoning and benefits */}
      <div className="p-4">
        <div className="mb-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Tại sao phù hợp:</div>
          <ul className="space-y-1">
            {reasoning.slice(0, showDetails ? reasoning.length : 2).map((reason, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                <Star className="h-3 w-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
          {reasoning.length > 2 && (
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:text-blue-700 mt-1"
            >
              {showDetails ? 'Thu gọn' : `Xem thêm ${reasoning.length - 2} lý do`}
            </button>
          )}
        </div>

        {showDetails && (
          <div className="mb-3">
            <div className="text-sm font-medium text-gray-700 mb-2">Lợi ích:</div>
            <ul className="space-y-1">
              {benefits.map((benefit, index) => (
                <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                  <Heart className="h-3 w-3 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onView(recipe)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Eye className="h-4 w-4" />
              Xem chi tiết
            </button>
            <button
              onClick={() => onSave(recipe)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
            >
              <BookmarkPlus className="h-4 w-4" />
              Lưu món
            </button>
          </div>
          
          {/* Feedback buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleFeedback('like')}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackGiven === 'like' 
                  ? 'text-green-600 bg-green-50' 
                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
              }`}
              disabled={feedbackGiven !== null}
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleFeedback('dislike')}
              className={`p-1.5 rounded-md transition-colors ${
                feedbackGiven === 'dislike' 
                  ? 'text-red-600 bg-red-50' 
                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
              }`}
              disabled={feedbackGiven !== null}
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NutritionRecommendations: React.FC<NutritionRecommendationsProps> = ({
  userId,
  nutritionGoals,
  currentProgress,
  mealType,
  onRecipeSave,
  onRecipeView
}) => {
  const [recommendations, setRecommendations] = useState<NutritionRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<RecommendationFilters>({
    dietaryRestrictions: nutritionGoals?.dietaryRestrictions || []
  });

  const loadRecommendations = async () => {
    try {
      setLoading(true);
      setError(null);

      let recs: NutritionRecommendation[];
      
      if (nutritionGoals && currentProgress) {
        // Get goal-based recommendations
        recs = await nutritionRecommendationService.getGoalBasedRecommendations(
          userId,
          currentProgress,
          mealType
        );
      } else {
        // Get general recommendations
        recs = await nutritionRecommendationService.generateRecommendations(
          userId,
          filters,
          8
        );
      }

      setRecommendations(recs);
    } catch (err) {
      console.error('Load recommendations error:', err);
      setError('Không thể tải gợi ý món ăn. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadRecommendations();
    }
  }, [userId, nutritionGoals, currentProgress, mealType, filters]);

  const handleRecipeSave = (recipe: Recipe) => {
    if (onRecipeSave) {
      onRecipeSave(recipe);
    }
    // Track interaction
    nutritionRecommendationService.trackRecommendationInteraction(
      userId,
      recipe.recipe_id,
      'save'
    );
  };

  const handleRecipeView = (recipe: Recipe) => {
    if (onRecipeView) {
      onRecipeView(recipe);
    }
    // Track interaction
    nutritionRecommendationService.trackRecommendationInteraction(
      userId,
      recipe.recipe_id,
      'view'
    );
  };

  const handleFeedback = (recommendationId: string, action: 'like' | 'dislike', feedback?: string) => {
    nutritionRecommendationService.trackRecommendationInteraction(
      userId,
      recommendationId,
      action === 'like' ? 'view' : 'dismiss',
      feedback
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">Gợi ý món ăn phù hợp</h2>
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-700 mb-2">
          <TrendingUp className="h-5 w-5" />
          <span className="font-medium">Lỗi tải gợi ý</span>
        </div>
        <p className="text-red-600 text-sm mb-3">{error}</p>
        <button
          onClick={loadRecommendations}
          className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Thử lại
        </button>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <Sparkles className="h-8 w-8 text-gray-400 mx-auto mb-3" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có gợi ý phù hợp</h3>
        <p className="text-gray-600 mb-4">
          Hãy thiết lập mục tiêu dinh dưỡng để nhận được gợi ý món ăn phù hợp với bạn.
        </p>
        <button
          onClick={loadRecommendations}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors mx-auto"
        >
          <RefreshCw className="h-4 w-4" />
          Tải lại gợi ý
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            Gợi ý món ăn phù hợp
            {mealType && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                cho {mealType}
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={loadRecommendations}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </button>
      </div>

      <div className="grid gap-4">
        {recommendations.map((recommendation) => (
          <RecommendationCard
            key={recommendation.id}
            recommendation={recommendation}
            onSave={handleRecipeSave}
            onView={handleRecipeView}
            onFeedback={handleFeedback}
          />
        ))}
      </div>

      {recommendations.length > 0 && (
        <div className="text-center pt-4">
          <p className="text-sm text-gray-500">
            Hiển thị {recommendations.length} gợi ý phù hợp nhất với bạn
          </p>
        </div>
      )}
    </div>
  );
};

export default NutritionRecommendations;
