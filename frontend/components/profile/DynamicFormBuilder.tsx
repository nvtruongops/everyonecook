'use client';

import React, { useState } from 'react';
import { CustomField, CustomSection, DynamicFormBuilderProps } from '@/types/profile';

export default function DynamicFormBuilder({
  section,
  sectionId,
  onFieldAdd,
  onFieldUpdate,
  onFieldDelete,
  onFieldReorder,
  remainingFieldsCount,
  maxFieldsPerSection = 10
}: DynamicFormBuilderProps) {
  const [isAddingField, setIsAddingField] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);

  const fieldEntries = Object.entries(section.fields);
  const canAddField = remainingFieldsCount > 0 && fieldEntries.length < maxFieldsPerSection;

  const handleAddField = (field: CustomField) => {
    onFieldAdd(field);
    setIsAddingField(false);
  };

  const handleUpdateField = (fieldId: string, field: CustomField) => {
    onFieldUpdate(fieldId, field);
    setEditingFieldId(null);
  };

  const handleDragStart = (e: React.DragEvent, fieldId: string) => {
    setDraggedFieldId(fieldId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetFieldId: string) => {
    e.preventDefault();
    
    if (!draggedFieldId || draggedFieldId === targetFieldId) {
      setDraggedFieldId(null);
      return;
    }

    const fieldIds = fieldEntries.map(([id]) => id);
    const draggedIndex = fieldIds.indexOf(draggedFieldId);
    const targetIndex = fieldIds.indexOf(targetFieldId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedFieldId(null);
      return;
    }

    // Reorder the fields
    const newFieldIds = [...fieldIds];
    newFieldIds.splice(draggedIndex, 1);
    newFieldIds.splice(targetIndex, 0, draggedFieldId);

    if (onFieldReorder) {
      onFieldReorder(newFieldIds);
    }

    setDraggedFieldId(null);
  };

  return (
    <div className="space-y-4">
      {/* Field limit warning */}
      {remainingFieldsCount <= 2 && remainingFieldsCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-yellow-800 text-sm">
            You have {remainingFieldsCount} field{remainingFieldsCount === 1 ? '' : 's'} remaining across all sections.
          </p>
        </div>
      )}

      {/* Existing fields */}
      <div className="space-y-3">
        {fieldEntries.map(([fieldId, field]) => (
          <div
            key={fieldId}
            className={`border border-gray-200 rounded-lg p-4 transition-all ${
              draggedFieldId === fieldId ? 'opacity-50' : ''
            }`}
            draggable={onFieldReorder !== undefined}
            onDragStart={(e) => handleDragStart(e, fieldId)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, fieldId)}
          >
            {editingFieldId === fieldId ? (
              <FieldEditor
                field={field}
                onSave={(updatedField) => handleUpdateField(fieldId, updatedField)}
                onCancel={() => setEditingFieldId(null)}
              />
            ) : (
              <div className="flex items-start gap-3">
                {/* Drag handle */}
                {onFieldReorder && (
                  <div className="cursor-move text-gray-400 mt-1" title="Drag to reorder">
                    ⋮⋮
                  </div>
                )}

                {/* Field content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-900">{field.label}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      field.privacy === 'public' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {field.privacy === 'public' ? '👁️ Public' : '👥 Friends'}
                    </span>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed">{field.value}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingFieldId(fieldId)}
                    className="text-gray-500 hover:text-blue-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onFieldDelete(fieldId)}
                    className="text-gray-500 hover:text-red-600"
                    title="Delete field"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new field */}
      {canAddField && (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
          {isAddingField ? (
            <FieldEditor
              field={null}
              onSave={handleAddField}
              onCancel={() => setIsAddingField(false)}
            />
          ) : (
            <button
              onClick={() => setIsAddingField(true)}
              className="w-full text-gray-600 hover:text-gray-800 py-2"
            >
              + Add Field to {section.title}
            </button>
          )}
        </div>
      )}

      {/* No more fields allowed */}
      {!canAddField && (
        <div className="text-center py-4 text-gray-500 text-sm">
          {remainingFieldsCount === 0 
            ? 'Maximum total fields reached (15 across all sections)'
            : `Maximum fields per section reached (${maxFieldsPerSection})`
          }
        </div>
      )}

      {/* Empty state */}
      {fieldEntries.length === 0 && !isAddingField && (
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">
            <div className="text-4xl mb-2">📝</div>
            <p className="text-sm">No fields in this section yet</p>
            <p className="text-xs">Add your first field to personalize this section</p>
          </div>
        </div>
      )}
    </div>
  );
}

interface FieldEditorProps {
  field: CustomField | null;
  onSave: (field: CustomField) => void;
  onCancel: () => void;
}

function FieldEditor({ field, onSave, onCancel }: FieldEditorProps) {
  const [label, setLabel] = useState(field?.label || '');
  const [value, setValue] = useState(field?.value || '');
  const [privacy, setPrivacy] = useState<'public' | 'friends'>(field?.privacy || 'friends');
  const [errors, setErrors] = useState<{ label?: string; value?: string }>({});

  const validateField = () => {
    const newErrors: { label?: string; value?: string } = {};

    if (!label.trim()) {
      newErrors.label = 'Label is required';
    } else if (label.length > 30) {
      newErrors.label = 'Label must be 30 characters or less';
    }

    if (!value.trim()) {
      newErrors.value = 'Value is required';
    } else if (value.length > 200) {
      newErrors.value = 'Value must be 200 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateField()) {
      return;
    }

    onSave({
      label: label.trim(),
      value: value.trim(),
      privacy
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Field Label <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g., Favorite Cuisine, Cooking Style, Dietary Preference"
          maxLength={30}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.label ? 'border-red-500' : 'border-gray-300'
          }`}
          autoFocus
        />
        {errors.label && (
          <p className="text-red-500 text-xs mt-1">{errors.label}</p>
        )}
        <p className="text-gray-500 text-xs mt-1">
          {label.length}/30 characters
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Field Value <span className="text-red-500">*</span>
        </label>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g., I love spicy Vietnamese food and traditional cooking methods that bring out authentic flavors"
          maxLength={200}
          rows={3}
          className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.value ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.value && (
          <p className="text-red-500 text-xs mt-1">{errors.value}</p>
        )}
        <p className="text-gray-500 text-xs mt-1">
          {value.length}/200 characters
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Privacy Setting
        </label>
        <select
          value={privacy}
          onChange={(e) => setPrivacy(e.target.value as 'public' | 'friends')}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="friends">👥 Friends Only - Only your friends can see this</option>
          <option value="public">👁️ Public - Anyone can see this</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {field ? 'Update Field' : 'Add Field'}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
