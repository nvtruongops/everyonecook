'use client';

import { useState, useEffect } from 'react';
import { NutritionOption, NutritionProfile, createEmptyNutritionProfile } from '@/types/nutrition';
import ManualNutritionInput from './ManualNutritionInput';

interface NutritionOptionsStepProps {
  selectedOption: NutritionOption;
  onOptionChange: (option: NutritionOption) => void;
  nutritionData: Partial<NutritionProfile> | null;
  onNutritionDataChange: (data: Partial<NutritionProfile>) => void;
  servings: number;
  calculating: boolean;
  onCalculate: () => Promise<void>;
  calculationError: string | null;
}

export default function NutritionOptionsStep({
  selectedOption,
  onOptionChange,
  nutritionData,
  onNutritionDataChange,
  servings,
  calculating,
  onCalculate,
  calculationError
}: NutritionOptionsStepProps) {
  const [localNutritionData, setLocalNutritionData] = useState<Partial<NutritionProfile>>(
    nutritionData || createEmptyNutritionProfile()
  );

  useEffect(() => {
    if (nutritionData) {
      setLocalNutritionData(nutritionData);
    }
  }, [nutritionData]);

  const handleOptionSelect = (option: NutritionOption) => {
    onOptionChange(option);
    
    // If switching to AI Auto, trigger calculation
    if (option === NutritionOption.AI_AUTO) {
      onCalculate();
    }
    
    // If switching to manual input, initialize empty data
    if (option === NutritionOption.MANUAL_INPUT && !nutritionData) {
      const emptyData = createEmptyNutritionProfile();
      emptyData.servingsPerRecipe = servings;
      setLocalNutritionData(emptyData);
      onNutritionDataChange(emptyData);
    }
  };

  const handleNutritionChange = (field: keyof NutritionProfile, value: string) => {
    const numValue = parseFloat(value) || 0;
    const updatedData = {
      ...localNutritionData,
      [field]: numValue
    };
    setLocalNutritionData(updatedData);
    onNutritionDataChange(updatedData);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          Thông tin dinh dưỡng
        </h3>
        <p className="text-sm text-slate-600">
          Chọn cách bạn muốn thêm thông tin dinh dưỡng cho món ăn này
        </p>
      </div>

      {/* Option Selection */}
      <div className="space-y-3">
        {/* AI Auto Calculate Option */}
        <label className="flex items-start gap-3 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:border-emerald-300 transition">
          <input
            type="radio"
            name="nutritionOption"
            value={NutritionOption.AI_AUTO}
            checked={selectedOption === NutritionOption.AI_AUTO}
            onChange={() => handleOptionSelect(NutritionOption.AI_AUTO)}
            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-slate-900">🤖 Tính toán tự động bằng AI</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">
                Khuyến nghị
              </span>
            </div>
            <p className="text-sm text-slate-600">
              AI sẽ phân tích nguyên liệu và tự động tính toán thông tin dinh dưỡng chính xác
            </p>
            {selectedOption === NutritionOption.AI_AUTO && calculating && (
              <div className="mt-3 flex items-center gap-2 text-sm text-emerald-600">
                <div className="animate-spin w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full"></div>
                Đang tính toán dinh dưỡng...
              </div>
            )}
            {selectedOption === NutritionOption.AI_AUTO && calculationError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{calculationError}</p>
                <button
                  onClick={onCalculate}
                  className="mt-2 text-sm text-red-700 hover:text-red-800 font-medium"
                >
                  Thử lại
                </button>
              </div>
            )}
          </div>
        </label>

        {/* Manual Input Option */}
        <label className="flex items-start gap-3 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:border-emerald-300 transition">
          <input
            type="radio"
            name="nutritionOption"
            value={NutritionOption.MANUAL_INPUT}
            checked={selectedOption === NutritionOption.MANUAL_INPUT}
            onChange={() => handleOptionSelect(NutritionOption.MANUAL_INPUT)}
            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-slate-900">✏️ Nhập thủ công</span>
            </div>
            <p className="text-sm text-slate-600">
              Tự nhập thông tin dinh dưỡng nếu bạn đã biết hoặc muốn kiểm soát chính xác
            </p>
          </div>
        </label>

        {/* Skip Option */}
        <label className="flex items-start gap-3 p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:border-emerald-300 transition">
          <input
            type="radio"
            name="nutritionOption"
            value={NutritionOption.SKIP}
            checked={selectedOption === NutritionOption.SKIP}
            onChange={() => handleOptionSelect(NutritionOption.SKIP)}
            className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-slate-900">⏭️ Bỏ qua</span>
            </div>
            <p className="text-sm text-slate-600">
              Lưu món ăn mà không có thông tin dinh dưỡng, có thể thêm sau
            </p>
          </div>
        </label>
      </div>

      {/* Manual Input Form */}
      {selectedOption === NutritionOption.MANUAL_INPUT && (
        <div className="mt-6">
          <ManualNutritionInput
            nutritionData={localNutritionData}
            onNutritionDataChange={(data) => {
              setLocalNutritionData(data);
              onNutritionDataChange(data);
            }}
            servings={servings}
          />
        </div>
      )}

      {/* AI Calculation Results */}
      {selectedOption === NutritionOption.AI_AUTO && nutritionData && !calculating && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-emerald-700 font-medium">✅ Đã tính toán xong</span>
            {nutritionData.confidence && (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                Độ tin cậy: {Math.round(nutritionData.confidence * 100)}%
              </span>
            )}
          </div>
          
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
        </div>
      )}
    </div>
  );
}
