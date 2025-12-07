'use client';

/**
 * Nutrition Breakdown Component
 *
 * Displays per-ingredient nutrition breakdown from backend calculation.
 * Shows calories, protein, carbs, fat for each ingredient.
 */

interface IngredientNutrition {
  ingredient: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface NutritionBreakdownProps {
  breakdown: IngredientNutrition[];
  missingIngredients?: string[];
  className?: string;
}

export default function NutritionBreakdown({
  breakdown,
  missingIngredients,
  className = '',
}: NutritionBreakdownProps) {
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-4 ${className}`}>
      <h4 className="font-semibold text-slate-900 mb-3">Ingredient Breakdown</h4>

      <div className="space-y-2">
        {breakdown.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
          >
            <div className="flex-1">
              <div className="font-medium text-slate-800">{item.ingredient}</div>
              <div className="text-xs text-slate-500">{item.amount}</div>
            </div>
            <div className="flex gap-3 text-xs">
              <div className="text-center">
                <div className="font-semibold text-slate-900">{Math.round(item.calories)}</div>
                <div className="text-slate-500">cal</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-900">{item.protein?.toFixed(1) || 0}g</div>
                <div className="text-slate-500">protein</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-900">{item.carbs?.toFixed(1) || 0}g</div>
                <div className="text-slate-500">carbs</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-900">{item.fat?.toFixed(1) || 0}g</div>
                <div className="text-slate-500">fat</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {missingIngredients && missingIngredients.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-start gap-2 text-xs text-amber-600">
            <span>⚠️</span>
            <div>
              <span className="font-medium">Missing nutrition data:</span>{' '}
              {missingIngredients.join(', ')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
