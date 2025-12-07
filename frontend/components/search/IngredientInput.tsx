'use client';

import { useState } from 'react';

interface IngredientInputProps {
  value: string[];
  onChange: (ingredients: string[]) => void;
}

export default function IngredientInput({ value, onChange }: IngredientInputProps) {
  const [input, setInput] = useState('');

  function handleAdd() {
    if (input.trim() && !value.includes(input.trim())) {
      onChange([...value, input.trim()]);
      setInput('');
    }
  }

  function handleRemove(ingredient: string) {
    onChange(value.filter(i => i !== ingredient));
  }

  function handleKeyPress(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Nhập thành phần (VD: Cá Rô, Tiêu)"
          className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleAdd}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Thêm
        </button>
      </div>

      {/* Tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(ingredient => (
            <div
              key={ingredient}
              className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full"
            >
              <span>{ingredient}</span>
              <button
                onClick={() => handleRemove(ingredient)}
                className="hover:text-blue-900"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

