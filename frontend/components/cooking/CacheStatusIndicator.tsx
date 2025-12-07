'use client';

import React from 'react';

interface CacheStatusIndicatorProps {
  status: 'cache_hit' | 'ai_generated' | 'loading';
  responseTime: number;
  cacheSource?: 'ai_cache' | 'user_recipe_cache';
  confidence?: number;
}

/**
 * Cache Status Indicator Component
 * 
 * Shows cache hit/miss status and response times for search results.
 * Requirements: 9.3, 9.4
 */
export default function CacheStatusIndicator({ 
  status, 
  responseTime, 
  cacheSource, 
  confidence 
}: CacheStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'cache_hit':
        return {
          icon: '⚡',
          label: 'Cache Hit',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          description: 'Kết quả từ cache'
        };
      case 'ai_generated':
        return {
          icon: '🤖',
          label: 'AI Generated',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          description: 'Tạo mới bởi AI'
        };
      case 'loading':
        return {
          icon: '⏳',
          label: 'Loading',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          description: 'Đang xử lý...'
        };
      default:
        return {
          icon: '❓',
          label: 'Unknown',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          description: 'Không xác định'
        };
    }
  };

  const config = getStatusConfig();
  const formatResponseTime = (time: number) => {
    if (time < 1000) {
      return `${time}ms`;
    }
    return `${(time / 1000).toFixed(1)}s`;
  };

  const getCacheSourceLabel = () => {
    switch (cacheSource) {
      case 'ai_cache':
        return 'AI Cache';
      case 'user_recipe_cache':
        return 'User Cache';
      default:
        return null;
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${config.bgColor} ${config.borderColor} shadow-sm`}>
      {/* Status Icon and Label */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm">{config.icon}</span>
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      </div>

      {/* Response Time */}
      <div className="flex items-center gap-1">
        <svg className={`w-3 h-3 ${config.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={`text-xs ${config.color}`}>
          {formatResponseTime(responseTime)}
        </span>
      </div>

      {/* Cache Source (if applicable) */}
      {cacheSource && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-600">
            {getCacheSourceLabel()}
          </span>
        </div>
      )}

      {/* Confidence Score (if applicable) */}
      {confidence && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">•</span>
          <span className="text-xs text-gray-600">
            {Math.round(confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact version for smaller spaces
 */
export function CompactCacheStatusIndicator({ 
  status, 
  responseTime 
}: Pick<CacheStatusIndicatorProps, 'status' | 'responseTime'>) {
  const config = {
    cache_hit: { icon: '⚡', color: 'text-green-600' },
    ai_generated: { icon: '🤖', color: 'text-blue-600' },
    loading: { icon: '⏳', color: 'text-yellow-600' }
  }[status] || { icon: '❓', color: 'text-gray-600' };

  return (
    <div className="inline-flex items-center gap-1 text-xs">
      <span>{config.icon}</span>
      <span className={config.color}>
        {responseTime < 1000 ? `${responseTime}ms` : `${(responseTime / 1000).toFixed(1)}s`}
      </span>
    </div>
  );
}
