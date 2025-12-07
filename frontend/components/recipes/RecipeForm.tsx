'use client';

import { useState } from 'react';

interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
  notes?: string;
}

interface Instruction {
  step_number: number;
  description: string;
  duration_minutes?: number;
}

interface RecipeFormProps {
  initialData?: {
    recipe_name?: string;
    recipe_ingredients?: Ingredient[];
    recipe_instructions?: Instruction[];
  };
  onSave: (data: RecipeFormData) => void;
  onCancel: () => void;
}

export interface RecipeFormData {
  recipe_name: string;
  recipe_ingredients: Ingredient[];
  recipe_instructions: Instruction[];
}

const UNITS = ['g', 'kg', 'ml', 'l', 'thìa', 'muỗng', 'cốc', 'trái', 'củ', 'miếng'];

export default function RecipeForm({ initialData, onSave, onCancel }: RecipeFormProps) {
  const [recipeName, setRecipeName] = useState(initialData?.recipe_name || '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(
    initialData?.recipe_ingredients || [{ name: '', quantity: '', unit: 'g' }]
  );
  const [instructions, setInstructions] = useState<Instruction[]>(
    initialData?.recipe_instructions || [{ step_number: 1, description: '' }]
  );

  // Ingredient handlers
  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: 'g' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  // Instruction handlers
  const addInstruction = () => {
    setInstructions([
      ...instructions,
      { step_number: instructions.length + 1, description: '' }
    ]);
  };

  const removeInstruction = (index: number) => {
    const updated = instructions
      .filter((_, i) => i !== index)
      .map((inst, i) => ({ ...inst, step_number: i + 1 }));
    setInstructions(updated);
  };

  const updateInstruction = (index: number, field: keyof Instruction, value: string | number) => {
    const updated = [...instructions];
    updated[index] = { ...updated[index], [field]: value };
    setInstructions(updated);
  };

  const handleSubmit = () => {
    // Validate
    if (!recipeName.trim()) {
      alert('Vui lòng nhập tên món');
      return;
    }

    const validIngredients = ingredients.filter(ing => ing.name.trim() && ing.quantity.trim());
    if (validIngredients.length === 0) {
      alert('Vui lòng nhập ít nhất 1 thành phần');
      return;
    }

    const validInstructions = instructions.filter(inst => inst.description.trim());
    if (validInstructions.length === 0) {
      alert('Vui lòng nhập ít nhất 1 bước nấu');
      return;
    }

    onSave({
      recipe_name: recipeName,
      recipe_ingredients: validIngredients,
      recipe_instructions: validInstructions
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-3xl mx-auto">
      {/* Recipe Name */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tên món:
        </label>
        <input
          type="text"
          value={recipeName}
          onChange={(e) => setRecipeName(e.target.value)}
          placeholder="VD: Gà kho gừng"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Ingredients */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Thành phần:
        </label>
        <div className="space-y-3">
          {ingredients.map((ingredient, index) => (
            <div key={index} className="flex items-center gap-2">
              {/* Name */}
              <input
                type="text"
                value={ingredient.name}
                onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                placeholder="Thịt gà"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              {/* Quantity */}
              <input
                type="text"
                value={ingredient.quantity}
                onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                placeholder="500"
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              {/* Unit */}
              <select
                value={ingredient.unit}
                onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {UNITS.map(unit => (
                  <option key={unit} value={unit}>{unit}</option>
                ))}
              </select>
              
              {/* Remove */}
              {ingredients.length > 1 && (
                <button
                  onClick={() => removeIngredient(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          onClick={addIngredient}
          className="mt-3 flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Thêm thành phần
        </button>
      </div>

      {/* Instructions */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Bước nấu:
        </label>
        <div className="space-y-3">
          {instructions.map((instruction, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold text-sm">
                  {instruction.step_number}
                </span>
                
                <div className="flex-1">
                  {/* Description */}
                  <textarea
                    value={instruction.description}
                    onChange={(e) => updateInstruction(index, 'description', e.target.value)}
                    placeholder="Mô tả bước nấu..."
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
                
                {/* Remove */}
                {instructions.length > 1 && (
                  <button
                    onClick={() => removeInstruction(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        <button
          onClick={addInstruction}
          className="mt-3 flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Thêm bước
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Hủy
        </button>
        <button
          onClick={handleSubmit}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Lưu công thức
        </button>
      </div>
    </div>
  );
}

