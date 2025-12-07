'use client';

import React, { useState } from 'react';
import { 
  NutritionRecommendation,
  UserNutritionPattern 
} from '@/services/nutritionRecommendationService';
import { UserNutritionGoals } from '@/types/nutrition';
// SVG Icons as components
const Brain = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const Target = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
  </svg>
);

const TrendingUp = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const Heart = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

const Zap = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const Shield = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const Info = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronDown = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUp = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const Star = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
  </svg>
);

const Award = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
  </svg>
);

const Activity = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

interface RecommendationExplanationProps {
  recommendation: NutritionRecommendation;
  nutritionGoals?: UserNutritionGoals;
  nutritionPattern?: UserNutritionPattern;
  currentProgress?: any;
}

interface ExplanationSection {
  title: string;
  icon: React.ReactNode;
  items: string[];
  color: string;
}

const RecommendationExplanation: React.FC<RecommendationExplanationProps> = ({
  recommendation,
  nutritionGoals,
  nutritionPattern,
  currentProgress
}) => {
  const [expanded, setExpanded] = useState(false);
  const { recipe, nutritionProfile, score, reasoning, benefits, goalContribution } = recommendation;

  // Generate detailed explanations
  const generateDetailedExplanations = (): ExplanationSection[] => {
    const sections: ExplanationSection[] = [];

    // Nutrition alignment section
    if (nutritionGoals) {
      const nutritionItems: string[] = [];
      
      if (goalContribution.calories > 15 && goalContribution.calories < 35) {
        nutritionItems.push(`Cung cấp ${goalContribution.calories}% lượng calo cần thiết trong ngày`);
      }
      
      if (goalContribution.protein > 20) {
        nutritionItems.push(`Giàu protein (${nutritionProfile.proteinG}g) - ${goalContribution.protein}% nhu cầu hàng ngày`);
      }
      
      if (nutritionProfile.fiberG > 5) {
        nutritionItems.push(`Chứa ${nutritionProfile.fiberG}g chất xơ, tốt cho tiêu hóa`);
      }
      
      if (nutritionProfile.sodiumMg < 600) {
        nutritionItems.push(`Ít natri (${nutritionProfile.sodiumMg}mg), tốt cho tim mạch`);
      }

      if (nutritionItems.length > 0) {
        sections.push({
          title: 'Phù hợp với mục tiêu dinh dưỡng',
          icon: <Target className="h-4 w-4" />,
          items: nutritionItems,
          color: 'text-green-600 bg-green-50'
        });
      }
    }

    // Health benefits section
    const healthItems: string[] = [];
    
    if (nutritionProfile.vitaminCMg > 20) {
      healthItems.push(`Giàu vitamin C (${nutritionProfile.vitaminCMg}mg) - tăng cường miễn dịch`);
    }
    
    if (nutritionProfile.ironMg > 3) {
      healthItems.push(`Chứa sắt (${nutritionProfile.ironMg}mg) - ngăn ngừa thiếu máu`);
    }
    
    if (nutritionProfile.calciumMg > 100) {
      healthItems.push(`Cung cấp canxi (${nutritionProfile.calciumMg}mg) - tốt cho xương`);
    }
    
    if (recipe.cooking_method === 'steam' || recipe.cooking_method === 'boil') {
      healthItems.push('Phương pháp nấu ít dầu mỡ, giữ nguyên chất dinh dưỡng');
    }

    if (healthItems.length > 0) {
      sections.push({
        title: 'Lợi ích sức khỏe',
        icon: <Heart className="h-4 w-4" />,
        items: healthItems,
        color: 'text-red-600 bg-red-50'
      });
    }

    // Personal preferences section
    if (nutritionPattern) {
      const preferenceItems: string[] = [];
      
      if (nutritionPattern.preferredCuisines.includes(recipe.cuisine_type)) {
        preferenceItems.push(`Thuộc ẩm thực ${recipe.cuisine_type} mà bạn yêu thích`);
      }
      
      if (nutritionPattern.preferredMealTypes.includes(recipe.meal_type)) {
        preferenceItems.push(`Phù hợp với thời gian ${recipe.meal_type} bạn thường ăn`);
      }
      
      const commonIngredients = recipe.ingredients.filter(ing => 
        nutritionPattern.commonIngredients.some(common => 
          ing.ingredient_name.toLowerCase().includes(common.toLowerCase())
        )
      );
      
      if (commonIngredients.length > 0) {
        preferenceItems.push(`Chứa ${commonIngredients.length} nguyên liệu bạn thường dùng`);
      }

      if (preferenceItems.length > 0) {
        sections.push({
          title: 'Phù hợp với sở thích',
          icon: <Star className="h-4 w-4" />,
          items: preferenceItems,
          color: 'text-purple-600 bg-purple-50'
        });
      }
    }

    // Dietary goals section
    if (nutritionGoals?.healthGoals && nutritionGoals.healthGoals.length > 0) {
      const goalItems: string[] = [];
      
      if (nutritionGoals.healthGoals.includes('weight-loss') && nutritionProfile.caloriesPerServing < 400) {
        goalItems.push('Ít calo, hỗ trợ mục tiêu giảm cân');
      }
      
      if (nutritionGoals.healthGoals.includes('muscle-gain') && nutritionProfile.proteinG > 25) {
        goalItems.push('Giàu protein, hỗ trợ tăng cơ bắp');
      }
      
      if (nutritionGoals.healthGoals.includes('heart-health') && nutritionProfile.sodiumMg < 500) {
        goalItems.push('Ít natri, tốt cho sức khỏe tim mạch');
      }
      
      if (nutritionGoals.healthGoals.includes('diabetes-management') && nutritionProfile.sugarG < 10) {
        goalItems.push('Ít đường, phù hợp với quản lý đường huyết');
      }

      if (goalItems.length > 0) {
        sections.push({
          title: 'Hỗ trợ mục tiêu sức khỏe',
          icon: <Shield className="h-4 w-4" />,
          items: goalItems,
          color: 'text-blue-600 bg-blue-50'
        });
      }
    }

    // Timing and convenience section
    const convenienceItems: string[] = [];
    const totalTime = recipe.prep_time_minutes + recipe.cook_time_minutes;
    
    if (totalTime <= 30) {
      convenienceItems.push(`Nhanh chóng (${totalTime} phút) - phù hợp khi bận rộn`);
    }
    
    if (recipe.servings > 1) {
      convenienceItems.push(`Có thể chia ${recipe.servings} phần - tiết kiệm thời gian`);
    }
    
    if (recipe.ingredients.length <= 8) {
      convenienceItems.push(`Ít nguyên liệu (${recipe.ingredients.length} loại) - dễ chuẩn bị`);
    }

    if (convenienceItems.length > 0) {
      sections.push({
        title: 'Tiện lợi và thực tế',
        icon: <Zap className="h-4 w-4" />,
        items: convenienceItems,
        color: 'text-orange-600 bg-orange-50'
      });
    }

    return sections;
  };

  const explanationSections = generateDetailedExplanations();
  const scorePercentage = Math.round(score * 100);
  
  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-orange-600';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 0.8) return <Award className="h-5 w-5" />;
    if (score >= 0.6) return <TrendingUp className="h-5 w-5" />;
    return <Activity className="h-5 w-5" />;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <Brain className="h-5 w-5 text-purple-500" />
            <div>
              <h3 className="font-medium text-gray-900">Tại sao AI gợi ý món này?</h3>
              <p className="text-sm text-gray-600">
                Phân tích chi tiết về độ phù hợp với bạn
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 ${getScoreColor(score)}`}>
              {getScoreIcon(score)}
              <span className="font-semibold">{scorePercentage}%</span>
            </div>
            {expanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </button>
      </div>

      {/* Quick summary */}
      {!expanded && (
        <div className="p-4">
          <div className="space-y-2">
            {reasoning.slice(0, 2).map((reason, index) => (
              <div key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>{reason}</span>
              </div>
            ))}
            {reasoning.length > 2 && (
              <p className="text-xs text-gray-500 mt-2">
                Nhấn để xem thêm {reasoning.length - 2} lý do khác...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Detailed explanation */}
      {expanded && (
        <div className="p-4 space-y-4">
          {/* Score breakdown */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Award className={`h-4 w-4 ${getScoreColor(score)}`} />
              <span className="text-sm font-medium text-gray-700">
                Điểm phù hợp: {scorePercentage}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  score >= 0.8 ? 'bg-green-500' : 
                  score >= 0.6 ? 'bg-yellow-500' : 'bg-orange-500'
                }`}
                style={{ width: `${scorePercentage}%` }}
              />
            </div>
          </div>

          {/* Detailed sections */}
          {explanationSections.map((section, index) => (
            <div key={index} className="space-y-2">
              <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${section.color}`}>
                {section.icon}
                <span className="text-sm font-medium">{section.title}</span>
              </div>
              <ul className="space-y-1 ml-6">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="w-1 h-1 bg-gray-400 rounded-full mt-2 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Benefits summary */}
          {benefits.length > 0 && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Lợi ích chính</span>
              </div>
              <ul className="space-y-1">
                {benefits.map((benefit, index) => (
                  <li key={index} className="text-sm text-green-700 flex items-start gap-2">
                    <span className="w-1 h-1 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI note */}
          <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
            <div className="flex items-start gap-2">
              <Brain className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-purple-700">
                <p className="font-medium mb-1">Ghi chú từ AI:</p>
                <p>
                  Gợi ý này được tạo dựa trên phân tích mục tiêu dinh dưỡng, sở thích ẩm thực 
                  và tiến độ hiện tại của bạn. Độ chính xác sẽ được cải thiện theo thời gian 
                  dựa trên phản hồi của bạn.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecommendationExplanation;
