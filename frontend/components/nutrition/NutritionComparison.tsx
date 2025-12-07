'use client';

import { useState } from 'react';
import { NutritionProfile, formatNutritionValue } from '@/types/nutrition';

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

interface NutritionComparisonProps {
  recipes: SavedRecipe[];
  onClose: () => void;
  onExport?: () => void;
}

interface NutritionMetric {
  key: keyof NutritionProfile;
  label: string;
  unit: string;
  getValue: (nutrition: NutritionProfile) => number;
}

const NUTRITION_METRICS: NutritionMetric[] = [
  {
    key: 'caloriesPerServing',
    label: 'Calories',
    unit: '',
    getValue: (n) => n.caloriesPerServing
  },
  {
    key: 'proteinG',
    label: 'Protein',
    unit: 'g',
    getValue: (n) => n.proteinG
  },
  {
    key: 'carbohydratesG',
    label: 'Carbohydrates',
    unit: 'g',
    getValue: (n) => n.carbohydratesG
  },
  {
    key: 'fatG',
    label: 'Fat',
    unit: 'g',
    getValue: (n) => n.fatG
  },
  {
    key: 'fiberG',
    label: 'Fiber',
    unit: 'g',
    getValue: (n) => n.fiberG
  },
  {
    key: 'sugarG',
    label: 'Sugar',
    unit: 'g',
    getValue: (n) => n.sugarG
  },
  {
    key: 'sodiumMg',
    label: 'Sodium',
    unit: 'mg',
    getValue: (n) => n.sodiumMg
  },
  {
    key: 'cholesterolMg',
    label: 'Cholesterol',
    unit: 'mg',
    getValue: (n) => n.cholesterolMg
  },
  {
    key: 'vitaminAIU',
    label: 'Vitamin A',
    unit: 'IU',
    getValue: (n) => n.vitaminAIU
  },
  {
    key: 'vitaminCMg',
    label: 'Vitamin C',
    unit: 'mg',
    getValue: (n) => n.vitaminCMg
  },
  {
    key: 'calciumMg',
    label: 'Calcium',
    unit: 'mg',
    getValue: (n) => n.calciumMg
  },
  {
    key: 'ironMg',
    label: 'Iron',
    unit: 'mg',
    getValue: (n) => n.ironMg
  }
];

export default function NutritionComparison({ recipes, onClose, onExport }: NutritionComparisonProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'caloriesPerServing', 'proteinG', 'carbohydratesG', 'fatG'
  ]);

  const recipesWithNutrition = recipes.filter(recipe => recipe.nutrition);

  const getMetricComparison = (metric: NutritionMetric) => {
    const values = recipesWithNutrition.map(recipe => ({
      recipe,
      value: metric.getValue(recipe.nutrition!)
    }));

    const sortedValues = [...values].sort((a, b) => b.value - a.value);
    const best = sortedValues[0];
    const worst = sortedValues[sortedValues.length - 1];

    return { values, best, worst };
  };

  const getValueColor = (recipe: SavedRecipe, metric: NutritionMetric, value: number) => {
    const { best, worst } = getMetricComparison(metric);
    
    if (recipe.recipe_id === best.recipe.recipe_id) {
      // For calories, sodium, cholesterol, sugar - lower is better
      if (['caloriesPerServing', 'sodiumMg', 'cholesterolMg', 'sugarG'].includes(metric.key)) {
        return value === worst.value ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50';
      }
      // For protein, fiber, vitamins - higher is better
      return 'text-green-700 bg-green-50';
    }
    
    if (recipe.recipe_id === worst.recipe.recipe_id) {
      if (['caloriesPerServing', 'sodiumMg', 'cholesterolMg', 'sugarG'].includes(metric.key)) {
        return value === best.value ? 'text-red-700 bg-red-50' : 'text-green-700 bg-green-50';
      }
      return 'text-red-700 bg-red-50';
    }
    
    return 'text-slate-700 bg-slate-50';
  };

  const handleMetricToggle = (metricKey: string) => {
    setSelectedMetrics(prev => 
      prev.includes(metricKey)
        ? prev.filter(k => k !== metricKey)
        : [...prev, metricKey]
    );
  };

  const exportComparison = () => {
    const data = {
      recipes: recipesWithNutrition.map(recipe => ({
        title: recipe.title,
        nutrition: selectedMetrics.reduce((acc, metricKey) => {
          const metric = NUTRITION_METRICS.find(m => m.key === metricKey);
          if (metric && recipe.nutrition) {
            acc[metric.label] = `${formatNutritionValue(metric.getValue(recipe.nutrition), metric.unit)}${metric.unit}`;
          }
          return acc;
        }, {} as Record<string, string>)
      })),
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-comparison-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (onExport) onExport();
  };

  if (recipesWithNutrition.length === 0) {
    return (
      <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Nutrition Data</h3>
            <p className="text-slate-600 mb-4">
              The selected recipes don't have nutrition information. Please calculate nutrition for the recipes first.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Nutrition Comparison</h2>
            <p className="text-emerald-100 text-sm">
              Comparing {recipesWithNutrition.length} recipes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportComparison}
              className="px-3 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition text-sm font-medium"
            >
              Export
            </button>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex h-[calc(90vh-80px)]">
          {/* Metric Selection Sidebar */}
          <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto">
            <h3 className="font-semibold text-slate-900 mb-3">Select Metrics</h3>
            <div className="space-y-2">
              {NUTRITION_METRICS.map(metric => (
                <label key={metric.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric.key)}
                    onChange={() => handleMetricToggle(metric.key)}
                    className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700">{metric.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Comparison Table */}
          <div className="flex-1 overflow-auto">
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 font-semibold text-slate-900 sticky left-0 bg-white z-10">
                        Recipe
                      </th>
                      {selectedMetrics.map(metricKey => {
                        const metric = NUTRITION_METRICS.find(m => m.key === metricKey);
                        return (
                          <th key={metricKey} className="text-center py-3 px-4 font-semibold text-slate-900 min-w-[100px]">
                            {metric?.label}
                            {metric?.unit && <span className="text-xs text-slate-500 block">({metric.unit})</span>}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {recipesWithNutrition.map(recipe => (
                      <tr key={recipe.recipe_id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-900 sticky left-0 bg-white z-10 border-r border-slate-200">
                          <div>
                            <div className="font-medium truncate max-w-[200px]" title={recipe.title}>
                              {recipe.title}
                            </div>
                            {recipe.servings && (
                              <div className="text-xs text-slate-500">
                                {recipe.servings} servings
                              </div>
                            )}
                          </div>
                        </td>
                        {selectedMetrics.map(metricKey => {
                          const metric = NUTRITION_METRICS.find(m => m.key === metricKey);
                          if (!metric || !recipe.nutrition) return <td key={metricKey}></td>;
                          
                          const value = metric.getValue(recipe.nutrition);
                          const colorClass = getValueColor(recipe, metric, value);
                          
                          return (
                            <td key={metricKey} className="py-3 px-4 text-center">
                              <span className={`inline-block px-2 py-1 rounded text-sm font-medium ${colorClass}`}>
                                {formatNutritionValue(value, metric.unit)}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="mt-6 p-4 bg-slate-50 rounded-lg">
                <h4 className="font-semibold text-slate-900 mb-2">Legend</h4>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-green-50 border border-green-200 rounded"></span>
                    <span className="text-slate-600">Best value</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-red-50 border border-red-200 rounded"></span>
                    <span className="text-slate-600">Worst value</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 bg-slate-50 border border-slate-200 rounded"></span>
                    <span className="text-slate-600">Neutral value</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  * For calories, sodium, cholesterol, and sugar, lower values are highlighted as better.
                  For protein, fiber, and vitamins, higher values are highlighted as better.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
