'use client';

import { useState, useEffect } from 'react';
import { NutritionProfile, createEmptyNutritionProfile, validateNutritionProfile, NUTRITION_RANGES } from '@/types/nutrition';
import { nutritionService } from '@/services/nutritionService';

interface SavedRecipe {
  recipe_id: string;
  title: string;
  description?: string;
  ingredients: Array<{
    ingredient_name: string;
    quantity: string;
    unit?: string;
  }>;
  instructions: Array<{
    step_number: number;
    description: string;
  }>;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  servings?: number;
  cuisine_type?: string;
  is_ai_generated?: boolean;
  created_at: string;
  nutrition?: NutritionProfile;
}

interface NutritionEditModalProps {
  recipe: SavedRecipe;
  onClose: () => void;
  onSave: (recipe: SavedRecipe, nutrition: NutritionProfile) => void;
}

interface NutritionAuditEntry {
  timestamp: Date;
  action: 'created' | 'updated' | 'recalculated';
  method: 'AI_CALCULATED' | 'USER_INPUT' | 'MANUAL_OVERRIDE';
  previousValues?: Partial<NutritionProfile>;
  newValues: Partial<NutritionProfile>;
  confidence?: number;
}

export default function NutritionEditModal({ recipe, onClose, onSave }: NutritionEditModalProps) {
  const [nutritionData, setNutritionData] = useState<Partial<NutritionProfile>>(
    recipe.nutrition || createEmptyNutritionProfile()
  );
  const [originalData, setOriginalData] = useState<Partial<NutritionProfile> | null>(recipe.nutrition || null);
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [showConfirmRecalculate, setShowConfirmRecalculate] = useState(false);
  const [auditTrail, setAuditTrail] = useState<NutritionAuditEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'edit' | 'audit'>('edit');

  useEffect(() => {
    // Initialize audit trail with current data
    if (recipe.nutrition) {
      setAuditTrail([{
        timestamp: recipe.nutrition.lastCalculated || new Date(),
        action: 'created',
        method: recipe.nutrition.calculationMethod,
        newValues: recipe.nutrition,
        confidence: recipe.nutrition.confidence
      }]);
    }
  }, [recipe.nutrition]);

  const handleInputChange = (field: keyof NutritionProfile, value: string) => {
    const numValue = parseFloat(value) || 0;
    setNutritionData(prev => ({
      ...prev,
      [field]: numValue
    }));
  };

  const handleSave = async () => {
    const validation = validateNutritionProfile(nutritionData);
    
    if (!validation.valid) {
      alert(`Validation errors:\n${validation.errors.join('\n')}`);
      return;
    }

    try {
      setLoading(true);

      const updatedNutrition: NutritionProfile = {
        ...nutritionData,
        id: recipe.nutrition?.id,
        recipeId: recipe.recipe_id,
        calculationMethod: originalData ? 'MANUAL_OVERRIDE' : 'USER_INPUT',
        confidence: 1.0,
        lastCalculated: new Date(),
        servingSize: nutritionData.servingSize || '1 portion',
        servingsPerRecipe: recipe.servings || 1
      } as NutritionProfile;

      // Save to backend
      await nutritionService.saveNutritionProfile(recipe.recipe_id, updatedNutrition);

      // Add to audit trail
      const auditEntry: NutritionAuditEntry = {
        timestamp: new Date(),
        action: originalData ? 'updated' : 'created',
        method: updatedNutrition.calculationMethod,
        previousValues: originalData || undefined,
        newValues: updatedNutrition
      };
      setAuditTrail(prev => [...prev, auditEntry]);

      // Update recipe
      const updatedRecipe = { ...recipe, nutrition: updatedNutrition };
      onSave(updatedRecipe, updatedNutrition);
      onClose();
    } catch (error) {
      console.error('Error saving nutrition data:', error);
      alert('Failed to save nutrition data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (!recipe.ingredients) {
      alert('Cannot recalculate: recipe ingredients not available');
      return;
    }

    try {
      setRecalculating(true);
      setShowConfirmRecalculate(false);

      const recalculatedNutrition = await nutritionService.calculateAndSaveNutrition(
        recipe.recipe_id,
        recipe.ingredients,
        recipe.servings || 1
      );

      // Add to audit trail
      const auditEntry: NutritionAuditEntry = {
        timestamp: new Date(),
        action: 'recalculated',
        method: 'AI_CALCULATED',
        previousValues: nutritionData,
        newValues: recalculatedNutrition,
        confidence: recalculatedNutrition.confidence
      };
      setAuditTrail(prev => [...prev, auditEntry]);

      setNutritionData(recalculatedNutrition);
      setOriginalData(nutritionData);
    } catch (error) {
      console.error('Error recalculating nutrition:', error);
      alert('Failed to recalculate nutrition. Please try again.');
    } finally {
      setRecalculating(false);
    }
  };

  const hasChanges = () => {
    if (!originalData) return true; // New nutrition data
    
    return Object.keys(nutritionData).some(key => {
      const field = key as keyof NutritionProfile;
      return nutritionData[field] !== originalData[field];
    });
  };

  const formatAuditValue = (value: any, field: string) => {
    if (typeof value === 'number') {
      if (field.includes('Mg') || field.includes('IU')) {
        return `${value.toFixed(1)}${field.includes('Mg') ? 'mg' : 'IU'}`;
      }
      return field === 'caloriesPerServing' ? Math.round(value).toString() : value.toFixed(1);
    }
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Edit Nutrition Information</h2>
            <p className="text-emerald-100 text-sm">{recipe.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === 'edit'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Edit Values
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition ${
                activeTab === 'audit'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Audit Trail ({auditTrail.length})
            </button>
          </nav>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {activeTab === 'edit' ? (
            <div className="space-y-6">
              {/* Action Buttons */}
              <div className="flex gap-3 pb-4 border-b border-slate-200">
                <button
                  onClick={() => setShowConfirmRecalculate(true)}
                  disabled={recalculating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
                >
                  {recalculating ? 'Recalculating...' : 'Recalculate with AI'}
                </button>
                {hasChanges() && (
                  <span className="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm">
                    Unsaved changes
                  </span>
                )}
              </div>

              {/* Nutrition Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Macronutrients */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Macronutrients</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Calories per serving *
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.caloriesPerServing.min}
                      max={NUTRITION_RANGES.caloriesPerServing.max}
                      value={nutritionData.caloriesPerServing || ''}
                      onChange={(e) => handleInputChange('caloriesPerServing', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Protein (g)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.proteinG.min}
                      max={NUTRITION_RANGES.proteinG.max}
                      step="0.1"
                      value={nutritionData.proteinG || ''}
                      onChange={(e) => handleInputChange('proteinG', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Carbohydrates (g)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.carbohydratesG.min}
                      max={NUTRITION_RANGES.carbohydratesG.max}
                      step="0.1"
                      value={nutritionData.carbohydratesG || ''}
                      onChange={(e) => handleInputChange('carbohydratesG', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fat (g)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.fatG.min}
                      max={NUTRITION_RANGES.fatG.max}
                      step="0.1"
                      value={nutritionData.fatG || ''}
                      onChange={(e) => handleInputChange('fatG', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Fiber (g)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.fiberG.min}
                      max={NUTRITION_RANGES.fiberG.max}
                      step="0.1"
                      value={nutritionData.fiberG || ''}
                      onChange={(e) => handleInputChange('fiberG', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Sugar (g)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.sugarG.min}
                      max={NUTRITION_RANGES.sugarG.max}
                      step="0.1"
                      value={nutritionData.sugarG || ''}
                      onChange={(e) => handleInputChange('sugarG', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Micronutrients */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-900">Micronutrients</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Sodium (mg)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.sodiumMg.min}
                      max={NUTRITION_RANGES.sodiumMg.max}
                      value={nutritionData.sodiumMg || ''}
                      onChange={(e) => handleInputChange('sodiumMg', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Cholesterol (mg)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.cholesterolMg.min}
                      max={NUTRITION_RANGES.cholesterolMg.max}
                      value={nutritionData.cholesterolMg || ''}
                      onChange={(e) => handleInputChange('cholesterolMg', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Vitamin A (IU)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.vitaminAIU.min}
                      max={NUTRITION_RANGES.vitaminAIU.max}
                      value={nutritionData.vitaminAIU || ''}
                      onChange={(e) => handleInputChange('vitaminAIU', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Vitamin C (mg)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.vitaminCMg.min}
                      max={NUTRITION_RANGES.vitaminCMg.max}
                      step="0.1"
                      value={nutritionData.vitaminCMg || ''}
                      onChange={(e) => handleInputChange('vitaminCMg', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Calcium (mg)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.calciumMg.min}
                      max={NUTRITION_RANGES.calciumMg.max}
                      value={nutritionData.calciumMg || ''}
                      onChange={(e) => handleInputChange('calciumMg', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Iron (mg)
                    </label>
                    <input
                      type="number"
                      min={NUTRITION_RANGES.ironMg.min}
                      max={NUTRITION_RANGES.ironMg.max}
                      step="0.1"
                      value={nutritionData.ironMg || ''}
                      onChange={(e) => handleInputChange('ironMg', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Audit Trail Tab */
            <div className="space-y-4">
              <h3 className="font-semibold text-slate-900">Nutrition Data History</h3>
              
              {auditTrail.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No audit trail available
                </div>
              ) : (
                <div className="space-y-4">
                  {auditTrail.map((entry, index) => (
                    <div key={index} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            entry.action === 'created' ? 'bg-green-100 text-green-700' :
                            entry.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {entry.action}
                          </span>
                          <span className="text-sm text-slate-600">
                            {entry.method === 'AI_CALCULATED' ? '🤖 AI Calculated' :
                             entry.method === 'USER_INPUT' ? '✏️ User Input' :
                             '🔧 Manual Override'}
                          </span>
                          {entry.confidence && (
                            <span className="text-xs text-slate-500">
                              Confidence: {Math.round(entry.confidence * 100)}%
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {entry.timestamp.toLocaleString()}
                        </span>
                      </div>
                      
                      {entry.previousValues && (
                        <div className="text-sm">
                          <p className="font-medium text-slate-700 mb-1">Changes:</p>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {Object.entries(entry.newValues).map(([key, newValue]) => {
                              const oldValue = entry.previousValues?.[key as keyof NutritionProfile];
                              if (oldValue !== newValue && typeof newValue === 'number') {
                                return (
                                  <div key={key} className="flex justify-between">
                                    <span className="text-slate-600">{key}:</span>
                                    <span>
                                      <span className="text-red-600">{formatAuditValue(oldValue, key)}</span>
                                      {' → '}
                                      <span className="text-green-600">{formatAuditValue(newValue, key)}</span>
                                    </span>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          {activeTab === 'edit' && (
            <button
              onClick={handleSave}
              disabled={loading || !hasChanges()}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Recalculate Confirmation Modal */}
        {showConfirmRecalculate && (
          <div className="absolute inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirm Recalculation</h3>
              <p className="text-slate-600 mb-4">
                This will replace all current nutrition values with AI-calculated ones. Your manual changes will be lost.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmRecalculate(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecalculate}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  Recalculate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
