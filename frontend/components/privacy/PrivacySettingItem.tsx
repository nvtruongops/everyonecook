/**
 * Privacy Setting Item Component
 * Individual privacy control with level selector
 */

'use client';

import { PrivacyLevel } from '@/services/privacy';

interface PrivacySettingItemProps {
  label: string;
  description: string;
  hint?: string;
  currentLevel: PrivacyLevel;
  onChange: (level: PrivacyLevel) => void;
  disabled?: boolean;
}

const privacyLevels: { value: PrivacyLevel; label: string; icon: string; description: string }[] = [
  {
    value: 'public',
    label: 'Public',
    icon: '🌍',
    description: 'Anyone can see this',
  },
  {
    value: 'friends',
    label: 'Friends',
    icon: '👥',
    description: 'Only your friends can see this',
  },
  {
    value: 'private',
    label: 'Private',
    icon: '🔒',
    description: 'Only you can see this',
  },
];

export default function PrivacySettingItem({
  label,
  description,
  hint,
  currentLevel,
  onChange,
  disabled = false,
}: PrivacySettingItemProps) {
  return (
    <div className="border-b border-gray-200 last:border-0 py-4 sm:py-6">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">{label}</h3>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
        {hint && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-2">
              <svg
                className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-xs sm:text-sm text-blue-800">{hint}</p>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Level Options */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {privacyLevels.map((level) => (
          <button
            key={level.value}
            onClick={() => !disabled && onChange(level.value)}
            disabled={disabled}
            className={`min-h-[44px] p-4 border-2 rounded-lg transition flex flex-col items-start text-left ${
              currentLevel === level.value
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{level.icon}</span>
              <div>
                <h4 className="font-semibold text-gray-900 text-sm sm:text-base">{level.label}</h4>
                {currentLevel === level.value && (
                  <span className="text-xs text-blue-600 font-medium">Current</span>
                )}
              </div>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">{level.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

