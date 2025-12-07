'use client';

import { useState } from 'react';

export interface NutritionFilterOptions {
  calorieRange: [number, number];
  proteinMin: number;
  carbsMax: number;
  fatMax: number;
  sortBy: 'calories' | 'protein' | 'carbs' | 'fat' | 'created_at';
  sortOrder: 'asc' | 'desc';
}

interface NutritionFilterProps {
  filters: NutritionFilterOptions;
  onFiltersChange: (filters: NutritionFilterOptions) => void;
  onReset: () => void;
  className?: string;
}

export default function NutritionFilter({ 
  filters, 
  onFiltersChange, 
  onReset,
  className = '' 
}: NutritionFilterProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleFilterChange = (key: keyof NutritionFilterOptions, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  const handleCalorieRangeChange = (index: 0 | 1, value: number) => {
    const newRange: [number, number] = [...filters.calorieRange];
    newRange[index] = value;
    handleFilterChange('calorieRange', newRange);
  };

  const hasActiveFilters = 
    filters.calorieRange[0] > 0 || 
    filters.calorieRange[1] < 2000 ||
    filters.proteinMin > 0 ||
    filters.carbsMax < 300 ||
    filters.fatMax < 100;

  return (
    <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-slate-900">Nutrition Filters</h3>
          {hasActiveFilters && (
            <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={onReset}
              className="text-sm text-slate-500 hover:text-slate-700 transition"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-500 hover:text-slate-700 transition"
          >
            <svg 
              className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Sort Options - Always visible */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[120px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort by</label>
            <select
              value={filters.sortBy}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="created_at">Date Created</option>
              <option value="calories">Calories</option>
              <option value="protein">Protein</option>
              <option value="carbs">Carbohydrates</option>
              <option value="fat">Fat</option>
            </select>
          </div>
          <div className="flex-1 min-w-[100px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Order</label>
            <select
              value={filters.sortOrder}
              onChange={(e) => handleFilterChange('sortOrder', e.target.value as 'asc' | 'desc')}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              <option value="desc">High to Low</option>
              <option value="asc">Low to High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Calorie Range */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Calories per serving: {filters.calorieRange[0]} - {filters.calorieRange[1]}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max="1000"
                step="25"
                value={filters.calorieRange[0]}
                onChange={(e) => handleCalorieRangeChange(0, parseInt(e.target.value))}
                className="flex-1"
              />
              <input
                type="range"
                min="100"
                max="2000"
                step="25"
                value={filters.calorieRange[1]}
                onChange={(e) => handleCalorieRangeChange(1, parseInt(e.target.value))}
                className="flex-1"
              />
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0</span>
              <span>2000+</span>
            </div>
          </div>

          {/* Protein Minimum */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Minimum protein: {filters.proteinMin}g
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={filters.proteinMin}
              onChange={(e) => handleFilterChange('proteinMin', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0g</span>
              <span>100g+</span>
            </div>
          </div>

          {/* Carbs Maximum */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Maximum carbs: {filters.carbsMax}g
            </label>
            <input
              type="range"
              min="0"
              max="300"
              step="10"
              value={filters.carbsMax}
              onChange={(e) => handleFilterChange('carbsMax', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0g</span>
              <span>300g+</span>
            </div>
          </div>

          {/* Fat Maximum */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Maximum fat: {filters.fatMax}g
            </label>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={filters.fatMax}
              onChange={(e) => handleFilterChange('fatMax', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>0g</span>
              <span>100g+</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
