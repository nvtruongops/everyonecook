'use client';

import {
  NutritionProfile,
  formatNutritionValue,
  getConfidenceColor,
  getConfidenceLabel,
} from '@/types/nutrition';

interface NutritionDisplayProps {
  nutrition: NutritionProfile & {
    // Support both backend format (calories, protein) and frontend format (caloriesPerServing, proteinG)
    caloriesPerServing?: number;
    proteinG?: number;
    carbohydratesG?: number;
    fatG?: number;
    fiberG?: number;
    sugarG?: number;
    sodiumMg?: number;
    cholesterolMg?: number;
    vitaminAIU?: number;
    vitaminCMg?: number;
    calciumMg?: number;
    ironMg?: number;
    confidence?: number;
    calculationMethod?: string;
    servingSize?: string;
  };
  compact?: boolean;
  showConfidence?: boolean;
  className?: string;
}

export default function NutritionDisplay({
  nutrition,
  compact = false,
  showConfidence = true,
  className = '',
}: NutritionDisplayProps) {
  // Normalize nutrition data - support both backend and frontend formats
  const calories = nutrition.caloriesPerServing ?? nutrition.calories ?? 0;
  const protein = nutrition.proteinG ?? nutrition.protein ?? 0;
  const carbs = nutrition.carbohydratesG ?? nutrition.carbs ?? 0;
  const fat = nutrition.fatG ?? nutrition.fat ?? 0;
  const fiber = nutrition.fiberG ?? nutrition.fiber ?? 0;
  const sugar = nutrition.sugarG ?? nutrition.sugar ?? 0;
  const sodium = nutrition.sodiumMg ?? nutrition.sodium ?? 0;
  const cholesterol = nutrition.cholesterolMg ?? 0;
  const vitaminA = nutrition.vitaminAIU ?? 0;
  const vitaminC = nutrition.vitaminCMg ?? 0;
  const calcium = nutrition.calciumMg ?? 0;
  const iron = nutrition.ironMg ?? 0;
  const confidence = nutrition.confidence ?? 0.85;
  const calculationMethod = nutrition.calculationMethod ?? 'DICTIONARY_BASED';
  const servingSize = nutrition.servingSize ?? '1 portion';

  if (compact) {
    return (
      <div className={`bg-slate-50 rounded-lg p-3 ${className}`}>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="text-center">
            <div className="font-semibold text-slate-900">{Math.round(calories)}</div>
            <div className="text-slate-500">cal</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatNutritionValue(protein, 'g')}</div>
            <div className="text-slate-500">protein</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatNutritionValue(carbs, 'g')}</div>
            <div className="text-slate-500">carbs</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatNutritionValue(fat, 'g')}</div>
            <div className="text-slate-500">fat</div>
          </div>
        </div>

        {showConfidence && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
            <span className={`text-xs font-medium ${getConfidenceColor(confidence)}`}>
              {getConfidenceLabel(confidence)} confidence
            </span>
            <span className="text-xs text-slate-500">
              {calculationMethod === 'AI_CALCULATED'
                ? '🤖 AI'
                : calculationMethod === 'USER_INPUT'
                  ? '✏️ Manual'
                  : calculationMethod === 'DICTIONARY_BASED'
                    ? '📚 Dictionary'
                    : '🔧 Override'}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-slate-900">Nutrition Facts</h4>
        {showConfidence && (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${getConfidenceColor(confidence)}`}>
              {getConfidenceLabel(confidence)}
            </span>
            <span className="text-sm text-slate-500">
              {calculationMethod === 'AI_CALCULATED'
                ? '🤖'
                : calculationMethod === 'USER_INPUT'
                  ? '✏️'
                  : calculationMethod === 'DICTIONARY_BASED'
                    ? '📚'
                    : '🔧'}
            </span>
          </div>
        )}
      </div>

      {/* Main nutrients */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center py-2 border-b border-slate-100">
          <span className="font-medium text-slate-900">Calories</span>
          <span className="font-bold text-lg">{Math.round(calories)}</span>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-slate-900">
              {formatNutritionValue(protein, 'g')}g
            </div>
            <div className="text-slate-500">Protein</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatNutritionValue(carbs, 'g')}g</div>
            <div className="text-slate-500">Carbs</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-slate-900">{formatNutritionValue(fat, 'g')}g</div>
            <div className="text-slate-500">Fat</div>
          </div>
        </div>
      </div>

      {/* Additional nutrients */}
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">Fiber</span>
          <span className="font-medium">{formatNutritionValue(fiber, 'g')}g</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Sugar</span>
          <span className="font-medium">{formatNutritionValue(sugar, 'g')}g</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Sodium</span>
          <span className="font-medium">{formatNutritionValue(sodium, 'mg')}mg</span>
        </div>
        {cholesterol > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Cholesterol</span>
            <span className="font-medium">{formatNutritionValue(cholesterol, 'mg')}mg</span>
          </div>
        )}
        {vitaminA > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Vitamin A</span>
            <span className="font-medium">{formatNutritionValue(vitaminA, 'IU')}IU</span>
          </div>
        )}
        {vitaminC > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Vitamin C</span>
            <span className="font-medium">{formatNutritionValue(vitaminC, 'mg')}mg</span>
          </div>
        )}
        {calcium > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Calcium</span>
            <span className="font-medium">{formatNutritionValue(calcium, 'mg')}mg</span>
          </div>
        )}
        {iron > 0 && (
          <div className="flex justify-between">
            <span className="text-slate-600">Iron</span>
            <span className="font-medium">{formatNutritionValue(iron, 'mg')}mg</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-500">
        Per serving • {servingSize}
      </div>
    </div>
  );
}
