'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserNutritionGoals, 
  NutritionGoalProgress,
  calculateNutritionProgress,
  getProgressColor
} from '@/types/nutrition';
import { nutritionGoalsService } from '@/services/nutritionGoalsService';
import { useAuth } from '@/contexts/AuthContext';

interface NutritionProgressReportsProps {
  goals?: UserNutritionGoals | null;
}

type ReportPeriod = 'week' | 'month';

interface ProgressSummary {
  period: string;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFiber: number;
  avgSodium: number;
  daysWithData: number;
  totalDays: number;
  adherenceScore: number;
}

interface ChartData {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  target: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export default function NutritionProgressReports({ goals }: NutritionProgressReportsProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ReportPeriod>('week');
  const [progressData, setProgressData] = useState<NutritionGoalProgress[]>([]);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);

  useEffect(() => {
    if (user && goals) {
      loadProgressData();
    }
  }, [user, goals, period]);

  const loadProgressData = async () => {
    if (!user || !goals) return;

    setLoading(true);
    setError(null);

    try {
      const endDate = new Date();
      const startDate = new Date();
      
      if (period === 'week') {
        startDate.setDate(endDate.getDate() - 7);
      } else {
        startDate.setDate(endDate.getDate() - 30);
      }

      const data = await nutritionGoalsService.getNutritionProgressRange(
        user.sub,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      setProgressData(data);
      calculateSummary(data, startDate, endDate);
      prepareChartData(data, startDate, endDate);
    } catch (err: any) {
      setError(err.message || 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const calculateSummary = (data: NutritionGoalProgress[], startDate: Date, endDate: Date) => {
    if (!goals) return;

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysWithData = data.length;

    if (daysWithData === 0) {
      setSummary({
        period: period === 'week' ? 'This Week' : 'This Month',
        avgCalories: 0,
        avgProtein: 0,
        avgCarbs: 0,
        avgFat: 0,
        avgFiber: 0,
        avgSodium: 0,
        daysWithData: 0,
        totalDays,
        adherenceScore: 0
      });
      return;
    }

    const totals = data.reduce((acc, day) => ({
      calories: acc.calories + day.caloriesConsumed,
      protein: acc.protein + day.proteinConsumed,
      carbs: acc.carbs + day.carbsConsumed,
      fat: acc.fat + day.fatConsumed,
      fiber: acc.fiber + day.fiberConsumed,
      sodium: acc.sodium + day.sodiumConsumed
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 });

    const averages = {
      avgCalories: totals.calories / daysWithData,
      avgProtein: totals.protein / daysWithData,
      avgCarbs: totals.carbs / daysWithData,
      avgFat: totals.fat / daysWithData,
      avgFiber: totals.fiber / daysWithData,
      avgSodium: totals.sodium / daysWithData
    };

    // Calculate adherence score (how close to targets on average)
    const adherenceScores = [
      Math.min(100, calculateNutritionProgress(averages.avgCalories, goals.dailyCaloriesTarget)),
      Math.min(100, calculateNutritionProgress(averages.avgProtein, goals.proteinTargetG)),
      Math.min(100, calculateNutritionProgress(averages.avgCarbs, goals.carbsTargetG)),
      Math.min(100, calculateNutritionProgress(averages.avgFat, goals.fatTargetG)),
      Math.min(100, calculateNutritionProgress(averages.avgFiber, goals.fiberTargetG))
    ];

    const adherenceScore = adherenceScores.reduce((sum, score) => sum + score, 0) / adherenceScores.length;

    setSummary({
      period: period === 'week' ? 'This Week' : 'This Month',
      ...averages,
      daysWithData,
      totalDays,
      adherenceScore: Math.round(adherenceScore)
    });
  };

  const prepareChartData = (data: NutritionGoalProgress[], startDate: Date, endDate: Date) => {
    if (!goals) return;

    const chartPoints: ChartData[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayData = data.find(d => d.date === dateStr);

      chartPoints.push({
        date: dateStr,
        calories: dayData?.caloriesConsumed || 0,
        protein: dayData?.proteinConsumed || 0,
        carbs: dayData?.carbsConsumed || 0,
        fat: dayData?.fatConsumed || 0,
        target: {
          calories: goals.dailyCaloriesTarget,
          protein: goals.proteinTargetG,
          carbs: goals.carbsTargetG,
          fat: goals.fatTargetG
        }
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    setChartData(chartPoints);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getAdherenceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAdherenceBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (!user) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Please sign in to view progress reports</p>
      </div>
    );
  }

  if (!goals) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600 mb-4">Set up your nutrition goals to view progress reports</p>
        <button
          onClick={() => window.location.href = '/nutrition/goals'}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Set Up Goals
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={loadProgressData}
            className="mt-2 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Progress Reports</h2>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setPeriod('week')}
            className={`px-4 py-2 rounded-md ${
              period === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-md ${
              period === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className={`p-4 rounded-lg ${getAdherenceBgColor(summary.adherenceScore)}`}>
            <h3 className="text-sm font-medium text-gray-700 mb-1">Adherence Score</h3>
            <p className={`text-2xl font-bold ${getAdherenceColor(summary.adherenceScore)}`}>
              {summary.adherenceScore}%
            </p>
            <p className="text-xs text-gray-600">
              {summary.daysWithData} of {summary.totalDays} days logged
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Avg Calories</h3>
            <p className="text-2xl font-bold text-blue-600">
              {Math.round(summary.avgCalories)}
            </p>
            <p className="text-xs text-gray-600">
              Target: {goals.dailyCaloriesTarget} kcal
            </p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Avg Protein</h3>
            <p className="text-2xl font-bold text-green-600">
              {Math.round(summary.avgProtein)}g
            </p>
            <p className="text-xs text-gray-600">
              Target: {goals.proteinTargetG}g
            </p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <h3 className="text-sm font-medium text-gray-700 mb-1">Avg Carbs</h3>
            <p className="text-2xl font-bold text-purple-600">
              {Math.round(summary.avgCarbs)}g
            </p>
            <p className="text-xs text-gray-600">
              Target: {goals.carbsTargetG}g
            </p>
          </div>
        </div>
      )}

      {/* Simple Chart Visualization */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Progress</h3>
        
        {chartData.length > 0 ? (
          <div className="space-y-4">
            {/* Calories Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Calories</h4>
              <div className="flex items-end space-x-1 h-32 bg-gray-50 p-4 rounded-lg">
                {chartData.map((day, index) => {
                  const height = Math.max(5, (day.calories / day.target.calories) * 100);
                  const isOverTarget = day.calories > day.target.calories;
                  
                  return (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full ${isOverTarget ? 'bg-red-400' : 'bg-blue-400'} rounded-t`}
                        style={{ height: `${Math.min(height, 100)}%` }}
                        title={`${formatDate(day.date)}: ${Math.round(day.calories)} / ${day.target.calories} kcal`}
                      />
                      <span className="text-xs text-gray-600 mt-1 transform rotate-45 origin-left">
                        {formatDate(day.date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Macros Chart */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Macronutrients</h4>
              <div className="grid grid-cols-3 gap-4">
                {/* Protein */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Protein (g)</p>
                  <div className="flex items-end space-x-1 h-20 bg-green-50 p-2 rounded">
                    {chartData.map((day, index) => {
                      const height = Math.max(5, (day.protein / day.target.protein) * 100);
                      return (
                        <div
                          key={index}
                          className="flex-1 bg-green-400 rounded-t"
                          style={{ height: `${Math.min(height, 100)}%` }}
                          title={`${formatDate(day.date)}: ${Math.round(day.protein)}g`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Carbs */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Carbs (g)</p>
                  <div className="flex items-end space-x-1 h-20 bg-purple-50 p-2 rounded">
                    {chartData.map((day, index) => {
                      const height = Math.max(5, (day.carbs / day.target.carbs) * 100);
                      return (
                        <div
                          key={index}
                          className="flex-1 bg-purple-400 rounded-t"
                          style={{ height: `${Math.min(height, 100)}%` }}
                          title={`${formatDate(day.date)}: ${Math.round(day.carbs)}g`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Fat */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Fat (g)</p>
                  <div className="flex items-end space-x-1 h-20 bg-yellow-50 p-2 rounded">
                    {chartData.map((day, index) => {
                      const height = Math.max(5, (day.fat / day.target.fat) * 100);
                      return (
                        <div
                          key={index}
                          className="flex-1 bg-yellow-400 rounded-t"
                          style={{ height: `${Math.min(height, 100)}%` }}
                          title={`${formatDate(day.date)}: ${Math.round(day.fat)}g`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-600">No data available for the selected period</p>
            <p className="text-sm text-gray-500 mt-1">
              Start logging recipes to see your progress charts
            </p>
          </div>
        )}
      </div>

      {/* Insights */}
      {summary && summary.daysWithData > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Insights</h3>
          <div className="space-y-2 text-sm text-blue-800">
            {summary.adherenceScore >= 80 && (
              <p>🎉 Great job! You're consistently meeting your nutrition goals.</p>
            )}
            {summary.adherenceScore < 60 && (
              <p>💪 Keep going! Try logging more meals to better track your progress.</p>
            )}
            {summary.avgCalories < goals.dailyCaloriesTarget * 0.8 && (
              <p>⚡ You might be under-eating. Consider adding more nutrient-dense foods.</p>
            )}
            {summary.avgProtein < goals.proteinTargetG * 0.8 && (
              <p>🥩 Try to include more protein-rich foods in your meals.</p>
            )}
            {summary.daysWithData < summary.totalDays * 0.5 && (
              <p>📝 Log more meals to get better insights into your nutrition patterns.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
