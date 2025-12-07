'use client';

import React, { useState } from 'react';
import { RecipeGroup } from '@/types/recipeGroups';

interface RecipeGroupCardProps {
  group: RecipeGroup;
  displayMode: 'grid' | 'list';
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onShare: () => void;
}

export default function RecipeGroupCard({
  group,
  displayMode,
  onSelect,
  onDelete,
  onDuplicate,
  onShare
}: RecipeGroupCardProps) {
  const [showActions, setShowActions] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return '🌍';
      case 'friends':
        return '👥';
      case 'private':
      default:
        return '🔒';
    }
  };

  const getVisibilityLabel = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return 'Public';
      case 'friends':
        return 'Friends';
      case 'private':
      default:
        return 'Private';
    }
  };

  if (displayMode === 'list') {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            {/* Icon and Color */}
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: group.color }}
            >
              {group.icon}
            </div>

            {/* Group Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 
                  className="text-lg font-semibold text-gray-900 truncate cursor-pointer hover:text-blue-600"
                  onClick={onSelect}
                >
                  {group.name}
                </h3>
                <span className="text-sm text-gray-500">
                  {getVisibilityIcon(group.visibility)}
                </span>
              </div>
              {group.description && (
                <p className="text-sm text-gray-600 truncate mb-2">{group.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500">
                <span>{group.totalRecipes} recipes</span>
                <span>Created {formatDate(group.createdAt)}</span>
                {group.tags.length > 0 && (
                  <div className="flex gap-1">
                    {group.tags.slice(0, 2).map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {group.tags.length > 2 && (
                      <span className="text-xs text-gray-500">+{group.tags.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {showActions && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    onSelect();
                    setShowActions(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  View Group
                </button>
                <button
                  onClick={() => {
                    onShare();
                    setShowActions(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Share Group
                </button>
                <button
                  onClick={() => {
                    onDuplicate();
                    setShowActions(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Duplicate Group
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setShowActions(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-lg"
                >
                  Delete Group
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Grid mode
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Cover Image or Color Header */}
      <div
        className="h-32 relative"
        style={{
          backgroundColor: group.coverImage ? 'transparent' : group.color,
          backgroundImage: group.coverImage ? `url(${group.coverImage})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Icon */}
        <div className="absolute top-4 left-4">
          <div className="w-12 h-12 bg-white bg-opacity-90 rounded-lg flex items-center justify-center text-xl">
            {group.icon}
          </div>
        </div>

        {/* Visibility indicator */}
        <div className="absolute top-4 right-4">
          <div className="bg-white bg-opacity-90 rounded-full px-2 py-1 text-xs flex items-center gap-1">
            <span>{getVisibilityIcon(group.visibility)}</span>
            <span className="text-gray-700">{getVisibilityLabel(group.visibility)}</span>
          </div>
        </div>

        {/* Actions menu */}
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="w-8 h-8 bg-white bg-opacity-90 rounded-full flex items-center justify-center text-gray-700 hover:bg-white"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {showActions && (
              <div className="absolute right-0 bottom-full mb-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    onShare();
                    setShowActions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded-t-lg"
                >
                  Share
                </button>
                <button
                  onClick={() => {
                    onDuplicate();
                    setShowActions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    onDelete();
                    setShowActions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 rounded-b-lg"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 
          className="text-lg font-semibold text-gray-900 mb-2 cursor-pointer hover:text-blue-600 line-clamp-1"
          onClick={onSelect}
        >
          {group.name}
        </h3>

        {group.description && (
          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
            {group.description}
          </p>
        )}

        {/* Tags */}
        {group.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {group.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
              >
                {tag}
              </span>
            ))}
            {group.tags.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                +{group.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{group.totalRecipes} recipes</span>
          </div>
          <span>{formatDate(group.createdAt)}</span>
        </div>

        {/* Action Button */}
        <button
          onClick={onSelect}
          className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium text-sm"
        >
          View Group
        </button>
      </div>
    </div>
  );
}
