'use client';

import { useState } from 'react';
import { NutritionProfile, NUTRITION_RANGES, validateNutritionValue, createEmptyNutritionProfile } from '@/types/nutrition';

interface ManualNutritionInputProps {
  nutritionData: Partial<NutritionProfile>;
  onNutritionDataChange: (data: Partial<NutritionProfile>) => void;
  servings: number;
}

interface NutritionField {
  key: keyof NutritionProfile;
  label: string;
  unit: string;
  placeholder: string;
  category: 'macro' | 'micro';
  description: string;
  dailyValue?: number; // For reference
}

const NUTRITION_FIELDS: NutritionField[] = [
  // Macronutrients
  {
    key: 'caloriesPerServing',
    label: 'Calories',
    unit: 'kcal',
    placeholder: '250',
    category: 'macro',
    description: 'Tổng năng lượng từ thức ăn',
    dailyValue: 2000
  },
  {
    key: 'proteinG',
    label: 'Protein',
    unit: 'g',
    placeholder: '15.5',
    category: 'macro',
    description: 'Protein giúp xây dựng và sửa chữa cơ bắp',
    dailyValue: 50
  },
  {
    key: 'carbohydratesG',
    label: 'Carbohydrates',
    unit: 'g',
    placeholder: '30.2',
    category: 'macro',
    description: 'Carbs cung cấp năng lượng chính cho cơ thể',
    dailyValue: 300
  },
  {
    key: 'fatG',
    label: 'Fat',
    unit: 'g',
    placeholder: '8.5',
    category: 'macro',
    description: 'Chất béo cần thiết cho hấp thụ vitamin',
    dailyValue: 65
  },
  {
    key: 'fiberG',
    label: 'Fiber',
    unit: 'g',
    placeholder: '3.2',
    category: 'macro',
    description: 'Chất xơ giúp tiêu hóa và kiểm soát đường huyết',
    dailyValue: 25
  },
  {
    key: 'sugarG',
    label: 'Sugar',
    unit: 'g',
    placeholder: '5.1',
    category: 'macro',
    description: 'Đường tự nhiên và đường thêm vào',
    dailyValue: 50
  },
  // Micronutrients
  {
    key: 'sodiumMg',
    label: 'Sodium',
    unit: 'mg',
    placeholder: '300',
    category: 'micro',
    description: 'Natri cần thiết nhưng không nên quá nhiều',
    dailyValue: 2300
  },
  {
    key: 'cholesterolMg',
    label: 'Cholesterol',
    unit: 'mg',
    placeholder: '25',
    category: 'micro',
    description: 'Cholesterol từ thực phẩm động vật',
    dailyValue: 300
  },
  {
    key: 'vitaminAIU',
    label: 'Vitamin A',
    unit: 'IU',
    placeholder: '500',
    category: 'micro',
    description: 'Vitamin A tốt cho mắt và hệ miễn dịch',
    dailyValue: 5000
  },
  {
    key: 'vitaminCMg',
    label: 'Vitamin C',
    unit: 'mg',
    placeholder: '15',
    category: 'micro',
    description: 'Vitamin C tăng cường miễn dịch',
    dailyValue: 90
  },
  {
    key: 'calciumMg',
    label: 'Calcium',
    unit: 'mg',
    placeholder: '100',
    category: 'micro',
    description: 'Canxi tốt cho xương và răng',
    dailyValue: 1000
  },
  {
    key: 'ironMg',
    label: 'Iron',
    unit: 'mg',
    placeholder: '2.5',
    category: 'micro',
    description: 'Sắt cần thiết cho máu và vận chuyển oxy',
    dailyValue: 18
  }
];

export default function ManualNutritionInput({
  nutritionData,
  onNutritionDataChange,
  servings
}: ManualNutritionInputProps) {
  const [showHelpers, setShowHelpers] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showReferenceGuide, setShowReferenceGuide] = useState(false);

  const handleNutritionChange = (field: keyof NutritionProfile, value: string) => {
    const numValue = parseFloat(value) || 0;
    
    // Validate the value
    const isValid = validateNutritionValue(field as keyof typeof NUTRITION_RANGES, numValue);
    
    // Update validation errors
    const newErrors = { ...validationErrors };
    if (!isValid && value !== '') {
      const range = NUTRITION_RANGES[field as keyof typeof NUTRITION_RANGES];
      newErrors[field] = `Giá trị phải từ ${range.min} đến ${range.max}`;
    } else {
      delete newErrors[field];
    }
    setValidationErrors(newErrors);

    // Update nutrition data
    const updatedData = {
      ...nutritionData,
      [field]: numValue
    };
    onNutritionDataChange(updatedData);
  };

  const calculateDailyValuePercentage = (field: NutritionField, value: number): number => {
    if (!field.dailyValue || value === 0) return 0;
    return Math.round((value / field.dailyValue) * 100);
  };

  const macroFields = NUTRITION_FIELDS.filter(f => f.category === 'macro');
  const microFields = NUTRITION_FIELDS.filter(f => f.category === 'micro');

  const getTotalCaloriesFromMacros = (): number => {
    const protein = (nutritionData.proteinG || 0) * 4; // 4 cal per gram
    const carbs = (nutritionData.carbohydratesG || 0) * 4; // 4 cal per gram
    const fat = (nutritionData.fatG || 0) * 9; // 9 cal per gram
    return Math.round(protein + carbs + fat);
  };

  const calorieDiscrepancy = Math.abs((nutritionData.caloriesPerServing || 0) - getTotalCaloriesFromMacros());

  const autoCalculateCalories = () => {
    const calculatedCalories = getTotalCaloriesFromMacros();
    if (calculatedCalories > 0) {
      handleNutritionChange('caloriesPerServing', calculatedCalories.toString());
    }
  };

  const resetAllFields = () => {
    const emptyData = createEmptyNutritionProfile();
    onNutritionDataChange(emptyData);
    setValidationErrors({});
  };

  const hasAnyData = Object.values(nutritionData).some(value => 
    typeof value === 'number' && value > 0
  );

  return (
    <div className="space-y-6">
      {/* Header with helpers toggle */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-slate-900">
          Nhập thông tin dinh dưỡng (cho 1 khẩu phần)
        </h4>
        <div className="flex items-center gap-2">
          {hasAnyData && (
            <button
              type="button"
              onClick={resetAllFields}
              className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Xóa tất cả
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHelpers(!showHelpers)}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {showHelpers ? 'Ẩn hướng dẫn' : 'Hiện hướng dẫn'}
          </button>
        </div>
      </div>

      {/* Nutrition helpers */}
      {showHelpers && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <h5 className="font-medium text-blue-900">💡 Hướng dẫn nhập liệu</h5>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>Nguồn tham khảo:</strong> Nhãn dinh dưỡng trên bao bì, USDA FoodData Central, hoặc các app đếm calories</p>
            <p><strong>Mẹo:</strong> Nếu không có thông tin chính xác, hãy ước tính dựa trên nguyên liệu chính</p>
            <p><strong>Calories:</strong> Nên khớp với tổng từ protein (4 cal/g) + carbs (4 cal/g) + fat (9 cal/g)</p>
          </div>
        </div>
      )}

      {/* Calorie validation warning */}
      {calorieDiscrepancy > 20 && nutritionData.caloriesPerServing && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-sm font-medium">
                Calories không khớp: {nutritionData.caloriesPerServing} vs {getTotalCaloriesFromMacros()} (từ macro)
              </span>
            </div>
            <button
              type="button"
              onClick={autoCalculateCalories}
              className="text-sm text-amber-700 hover:text-amber-800 font-medium underline"
            >
              Tự động tính
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Macronutrients */}
        <div className="space-y-4">
          <h5 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2">
            Chất dinh dưỡng chính (Macronutrients)
          </h5>
          
          {macroFields.map((field) => {
            const value = nutritionData[field.key] as number || 0;
            const percentage = calculateDailyValuePercentage(field, value);
            const hasError = validationErrors[field.key];
            
            return (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {field.label} ({field.unit})
                  </label>
                  {field.dailyValue && value > 0 && (
                    <span className="text-xs text-slate-500">
                      {percentage}% DV
                    </span>
                  )}
                </div>
                
                <div className="relative">
                  <input
                    type="number"
                    min={NUTRITION_RANGES[field.key as keyof typeof NUTRITION_RANGES]?.min || 0}
                    max={NUTRITION_RANGES[field.key as keyof typeof NUTRITION_RANGES]?.max || 1000}
                    step={field.key === 'caloriesPerServing' ? '1' : '0.1'}
                    value={value || ''}
                    onChange={(e) => handleNutritionChange(field.key, e.target.value)}
                    onFocus={() => setActiveField(field.key)}
                    onBlur={() => setActiveField(null)}
                    placeholder={field.placeholder}
                    className={`w-full px-3 py-2 pr-8 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                      hasError ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  {value > 0 && (
                    <button
                      type="button"
                      onClick={() => handleNutritionChange(field.key, '0')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Daily value progress bar */}
                  {field.dailyValue && value > 0 && (
                    <div className="mt-1 w-full bg-slate-200 rounded-full h-1">
                      <div 
                        className={`h-1 rounded-full transition-all ${
                          percentage > 100 ? 'bg-red-500' : percentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Field description when active */}
                {activeField === field.key && (
                  <p className="text-xs text-slate-600 italic">
                    {field.description}
                  </p>
                )}

                {/* Validation error */}
                {hasError && (
                  <p className="text-xs text-red-600">{hasError}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Micronutrients */}
        <div className="space-y-4">
          <h5 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-2">
            Chất dinh dưỡng vi lượng (Micronutrients)
          </h5>
          
          {microFields.map((field) => {
            const value = nutritionData[field.key] as number || 0;
            const percentage = calculateDailyValuePercentage(field, value);
            const hasError = validationErrors[field.key];
            
            return (
              <div key={field.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {field.label} ({field.unit})
                  </label>
                  {field.dailyValue && value > 0 && (
                    <span className="text-xs text-slate-500">
                      {percentage}% DV
                    </span>
                  )}
                </div>
                
                <div className="relative">
                  <input
                    type="number"
                    min={NUTRITION_RANGES[field.key as keyof typeof NUTRITION_RANGES]?.min || 0}
                    max={NUTRITION_RANGES[field.key as keyof typeof NUTRITION_RANGES]?.max || 10000}
                    step={field.unit === 'mg' || field.unit === 'IU' ? '1' : '0.1'}
                    value={value || ''}
                    onChange={(e) => handleNutritionChange(field.key, e.target.value)}
                    onFocus={() => setActiveField(field.key)}
                    onBlur={() => setActiveField(null)}
                    placeholder={field.placeholder}
                    className={`w-full px-3 py-2 pr-8 text-sm border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent ${
                      hasError ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  {value > 0 && (
                    <button
                      type="button"
                      onClick={() => handleNutritionChange(field.key, '0')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                  
                  {/* Daily value progress bar */}
                  {field.dailyValue && value > 0 && (
                    <div className="mt-1 w-full bg-slate-200 rounded-full h-1">
                      <div 
                        className={`h-1 rounded-full transition-all ${
                          percentage > 100 ? 'bg-red-500' : percentage > 75 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Field description when active */}
                {activeField === field.key && (
                  <p className="text-xs text-slate-600 italic">
                    {field.description}
                  </p>
                )}

                {/* Validation error */}
                {hasError && (
                  <p className="text-xs text-red-600">{hasError}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Nutrition summary */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <h5 className="font-medium text-slate-900 mb-3">Tóm tắt dinh dưỡng</h5>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="text-center p-2 bg-white rounded border">
            <div className="font-semibold text-slate-900">{nutritionData.caloriesPerServing || 0}</div>
            <div className="text-xs text-slate-600">Calories</div>
          </div>
          <div className="text-center p-2 bg-white rounded border">
            <div className="font-semibold text-slate-900">{nutritionData.proteinG || 0}g</div>
            <div className="text-xs text-slate-600">Protein</div>
          </div>
          <div className="text-center p-2 bg-white rounded border">
            <div className="font-semibold text-slate-900">{nutritionData.carbohydratesG || 0}g</div>
            <div className="text-xs text-slate-600">Carbs</div>
          </div>
          <div className="text-center p-2 bg-white rounded border">
            <div className="font-semibold text-slate-900">{nutritionData.fatG || 0}g</div>
            <div className="text-xs text-slate-600">Fat</div>
          </div>
        </div>
        
        {servings > 1 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-600">
              <strong>Tổng cho {servings} khẩu phần:</strong> {Math.round((nutritionData.caloriesPerServing || 0) * servings)} calories
            </p>
          </div>
        )}
      </div>

      {/* Reference guide */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h5 className="font-medium text-emerald-900">📚 Tham khảo nhanh</h5>
          <button
            type="button"
            onClick={() => setShowReferenceGuide(!showReferenceGuide)}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {showReferenceGuide ? 'Thu gọn' : 'Xem chi tiết'}
          </button>
        </div>
        <div className="text-xs text-emerald-800 space-y-1">
          <p><strong>DV (Daily Value):</strong> % khuyến nghị hàng ngày cho người trưởng thành</p>
          <p><strong>Màu thanh tiến độ:</strong> Xanh (tốt) → Vàng (cao) → Đỏ (quá cao)</p>
          <p><strong>Nguồn tin cậy:</strong> USDA, nhãn sản phẩm, MyFitnessPal, Cronometer</p>
        </div>
        
        {showReferenceGuide && (
          <div className="mt-4 pt-4 border-t border-emerald-200">
            <h6 className="font-medium text-emerald-900 mb-3">📖 Hướng dẫn chi tiết</h6>
            <div className="space-y-4 text-xs text-emerald-800">
              
              {/* Macronutrient guide */}
              <div>
                <div className="font-semibold block mb-2">Chất dinh dưỡng chính (Macronutrients):</div>
                <div className="space-y-1 ml-2">
                  <p><strong>Calories:</strong> 1g protein = 4 cal, 1g carbs = 4 cal, 1g fat = 9 cal</p>
                  <p><strong>Protein:</strong> Thịt (20-25g/100g), Cá (18-22g/100g), Trứng (13g/100g)</p>
                  <p><strong>Carbohydrates:</strong> Cơm (28g/100g), Bánh mì (50g/100g), Khoai tây (17g/100g)</p>
                  <p><strong>Fat:</strong> Dầu ăn (100g/100g), Bơ (81g/100g), Hạt (50-70g/100g)</p>
                  <p><strong>Fiber:</strong> Rau xanh (2-4g/100g), Trái cây (2-10g/100g), Ngũ cốc nguyên hạt (6-15g/100g)</p>
                </div>
              </div>

              {/* Micronutrient guide */}
              <div>
                <div className="font-semibold block mb-2">Chất dinh dưỡng vi lượng (Micronutrients):</div>
                <div className="space-y-1 ml-2">
                  <p><strong>Sodium:</strong> Muối (40,000mg/100g), Nước mắm (15,000mg/100ml), Thực phẩm chế biến cao</p>
                  <p><strong>Vitamin A:</strong> Cà rót (16,700 IU/100g), Gan (53,000 IU/100g), Rau xanh đậm</p>
                  <p><strong>Vitamin C:</strong> Cam (53mg/100g), Ớt chuông đỏ (190mg/100g), Kiwi (93mg/100g)</p>
                  <p><strong>Calcium:</strong> Sữa (125mg/100ml), Phô mai (700mg/100g), Rau cải xanh</p>
                  <p><strong>Iron:</strong> Thịt đỏ (2-3mg/100g), Gan (18mg/100g), Rau bina (2.7mg/100g)</p>
                </div>
              </div>

              {/* Estimation tips */}
              <div>
                <div className="font-semibold block mb-2">Mẹo ước tính:</div>
                <div className="space-y-1 ml-2">
                  <p><strong>Khi không có thông tin chính xác:</strong> Tìm thực phẩm tương tự trên USDA hoặc app đếm calories</p>
                  <p><strong>Món ăn hỗn hợp:</strong> Ước tính từng nguyên liệu chính, bỏ qua gia vị nhỏ</p>
                  <p><strong>Phương pháp nấu:</strong> Chiên/rán tăng 20-50% calories, luộc/hấp giữ nguyên</p>
                  <p><strong>Kiểm tra logic:</strong> Món ăn có thịt thường 15-30g protein/100g</p>
                </div>
              </div>

              {/* Common serving sizes */}
              <div>
                <div className="font-semibold block mb-2">Khẩu phần thông thường:</div>
                <div className="space-y-1 ml-2">
                  <p><strong>Cơm:</strong> 1 chén (150g) ≈ 200 calories</p>
                  <p><strong>Thịt:</strong> 1 miếng (100g) ≈ 200-300 calories</p>
                  <p><strong>Rau:</strong> 1 chén (100g) ≈ 20-50 calories</p>
                  <p><strong>Dầu ăn:</strong> 1 muỗng canh (15ml) ≈ 120 calories</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
