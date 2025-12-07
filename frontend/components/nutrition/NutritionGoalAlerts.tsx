'use client';

import React, { useState, useEffect } from 'react';
import { 
  UserNutritionGoals, 
  NutritionGoalProgress,
  calculateNutritionProgress
} from '@/types/nutrition';
import { nutritionGoalsService } from '@/services/nutritionGoalsService';
import { useAuth } from '@/contexts/AuthContext';

interface NutritionGoalAlertsProps {
  goals?: UserNutritionGoals | null;
  compact?: boolean;
}

interface Alert {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

export default function NutritionGoalAlerts({ goals, compact = false }: NutritionGoalAlertsProps) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && goals) {
      generateAlerts();
    } else {
      setLoading(false);
    }
  }, [user, goals]);

  const generateAlerts = async () => {
    if (!user || !goals) return;

    setLoading(true);
    const newAlerts: Alert[] = [];

    try {
      // Get today's progress
      const today = new Date().toISOString().split('T')[0];
      const todayProgress = await nutritionGoalsService.getNutritionProgress(user.sub, today);

      // Get recent progress (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const recentProgress = await nutritionGoalsService.getNutritionProgressRange(
        user.sub,
        weekAgo.toISOString().split('T')[0],
        today
      );

      // Generate alerts based on current progress
      if (todayProgress) {
        generateDailyAlerts(newAlerts, todayProgress, goals);
      }

      // Generate alerts based on weekly trends
      if (recentProgress.length > 0) {
        generateWeeklyAlerts(newAlerts, recentProgress, goals);
      }

      // Generate goal-specific alerts
      generateGoalAlerts(newAlerts, goals);

      setAlerts(newAlerts);
    } catch (error) {
      console.error('Error generating nutrition alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateDailyAlerts = (alerts: Alert[], progress: NutritionGoalProgress, goals: UserNutritionGoals) => {
    const caloriesProgress = calculateNutritionProgress(progress.caloriesConsumed, goals.dailyCaloriesTarget);
    const proteinProgress = calculateNutritionProgress(progress.proteinConsumed, goals.proteinTargetG);
    const sodiumProgress = calculateNutritionProgress(progress.sodiumConsumed, goals.sodiumTargetMg);

    // Calorie alerts
    if (caloriesProgress > 120) {
      alerts.push({
        id: 'calories-over',
        type: 'warning',
        title: 'Calories Over Target',
        message: `You've consumed ${Math.round(caloriesProgress)}% of your daily calorie goal. Consider lighter options for remaining meals.`,
        dismissible: true
      });
    } else if (caloriesProgress < 50 && new Date().getHours() > 18) {
      alerts.push({
        id: 'calories-under',
        type: 'info',
        title: 'Low Calorie Intake',
        message: `You've only consumed ${Math.round(caloriesProgress)}% of your daily calories. Make sure you're eating enough.`,
        dismissible: true
      });
    }

    // Protein alerts
    if (proteinProgress < 60 && new Date().getHours() > 15) {
      alerts.push({
        id: 'protein-low',
        type: 'info',
        title: 'Protein Goal Behind',
        message: `You're at ${Math.round(proteinProgress)}% of your protein goal. Consider adding protein-rich foods.`,
        action: {
          label: 'Find High-Protein Recipes',
          onClick: () => window.location.href = '/recipes?filter=high-protein'
        },
        dismissible: true
      });
    } else if (proteinProgress >= 90) {
      alerts.push({
        id: 'protein-good',
        type: 'success',
        title: 'Protein Goal Met!',
        message: `Great job! You've reached ${Math.round(proteinProgress)}% of your protein target.`,
        dismissible: true
      });
    }

    // Sodium alerts
    if (sodiumProgress > 80) {
      alerts.push({
        id: 'sodium-high',
        type: 'warning',
        title: 'High Sodium Intake',
        message: `You've consumed ${Math.round(sodiumProgress)}% of your daily sodium limit. Choose low-sodium options.`,
        dismissible: true
      });
    }

    // Meal timing alerts
    const currentHour = new Date().getHours();
    const mealsToday = progress.recipeContributions.length;
    
    if (currentHour > 12 && mealsToday === 0) {
      alerts.push({
        id: 'no-meals',
        type: 'warning',
        title: 'No Meals Logged',
        message: 'You haven\'t logged any meals today. Don\'t forget to track your nutrition!',
        action: {
          label: 'Log a Meal',
          onClick: () => window.location.href = '/recipes'
        },
        dismissible: true
      });
    }
  };

  const generateWeeklyAlerts = (alerts: Alert[], weekProgress: NutritionGoalProgress[], goals: UserNutritionGoals) => {
    if (weekProgress.length < 3) return; // Need at least 3 days of data

    const avgCalories = weekProgress.reduce((sum, day) => sum + day.caloriesConsumed, 0) / weekProgress.length;
    const avgProtein = weekProgress.reduce((sum, day) => sum + day.proteinConsumed, 0) / weekProgress.length;
    
    const caloriesAdherence = calculateNutritionProgress(avgCalories, goals.dailyCaloriesTarget);
    const proteinAdherence = calculateNutritionProgress(avgProtein, goals.proteinTargetG);

    // Weekly trends
    if (caloriesAdherence < 70) {
      alerts.push({
        id: 'weekly-calories-low',
        type: 'info',
        title: 'Weekly Calorie Trend',
        message: `Your average daily calories this week (${Math.round(avgCalories)}) are below your target. Consider more nutrient-dense foods.`,
        dismissible: true
      });
    }

    if (proteinAdherence > 110) {
      alerts.push({
        id: 'weekly-protein-high',
        type: 'success',
        title: 'Excellent Protein Intake',
        message: `You're consistently exceeding your protein goals this week. Keep it up!`,
        dismissible: true
      });
    }

    // Consistency alerts
    const daysWithGoodAdherence = weekProgress.filter(day => {
      const dayCalories = calculateNutritionProgress(day.caloriesConsumed, goals.dailyCaloriesTarget);
      return dayCalories >= 80 && dayCalories <= 120;
    }).length;

    if (daysWithGoodAdherence >= 5) {
      alerts.push({
        id: 'consistency-good',
        type: 'success',
        title: 'Great Consistency!',
        message: `You've stayed within your calorie goals for ${daysWithGoodAdherence} days this week.`,
        dismissible: true
      });
    }
  };

  const generateGoalAlerts = (alerts: Alert[], goals: UserNutritionGoals) => {
    // Health goal specific alerts
    if (goals.healthGoals.includes('Weight Loss')) {
      alerts.push({
        id: 'weight-loss-tip',
        type: 'info',
        title: 'Weight Loss Tip',
        message: 'Focus on high-protein, high-fiber foods to stay satisfied while maintaining a calorie deficit.',
        dismissible: true
      });
    }

    if (goals.healthGoals.includes('Muscle Building')) {
      alerts.push({
        id: 'muscle-building-tip',
        type: 'info',
        title: 'Muscle Building Tip',
        message: 'Aim for protein-rich meals after workouts and spread protein intake throughout the day.',
        dismissible: true
      });
    }

    // Dietary restriction reminders
    if (goals.dietaryRestrictions.includes('Low-Sodium')) {
      alerts.push({
        id: 'low-sodium-reminder',
        type: 'info',
        title: 'Low-Sodium Reminder',
        message: 'Check nutrition labels and choose fresh ingredients over processed foods.',
        dismissible: true
      });
    }
  };

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  };

  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.has(alert.id));

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-16 bg-gray-200 rounded"></div>
        <div className="h-16 bg-gray-200 rounded"></div>
      </div>
    );
  }

  if (!user || !goals || visibleAlerts.length === 0) {
    return null;
  }

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {visibleAlerts.slice(0, 2).map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border ${getAlertStyles(alert.type)} flex items-center justify-between`}
          >
            <div className="flex items-center space-x-2">
              <span>{getAlertIcon(alert.type)}</span>
              <div>
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs opacity-90">{alert.message}</p>
              </div>
            </div>
            
            {alert.dismissible && (
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-xs opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        
        {visibleAlerts.length > 2 && (
          <div className="text-center">
            <button className="text-sm text-blue-600 hover:text-blue-800">
              View {visibleAlerts.length - 2} more alerts
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Nutrition Alerts</h3>
      
      {visibleAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-4 rounded-lg border ${getAlertStyles(alert.type)}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <span className="text-lg">{getAlertIcon(alert.type)}</span>
              <div className="flex-1">
                <h4 className="font-medium">{alert.title}</h4>
                <p className="text-sm mt-1 opacity-90">{alert.message}</p>
                
                {alert.action && (
                  <button
                    onClick={alert.action.onClick}
                    className="mt-2 px-3 py-1 text-sm bg-white bg-opacity-20 rounded hover:bg-opacity-30 transition-colors"
                  >
                    {alert.action.label}
                  </button>
                )}
              </div>
            </div>
            
            {alert.dismissible && (
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-sm opacity-60 hover:opacity-100 ml-2"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
