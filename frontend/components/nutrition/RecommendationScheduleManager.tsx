'use client';

import React, { useState, useEffect } from 'react';
import { 
  RecommendationSchedule,
  RecommendationPerformanceMetrics,
  recommendationScheduleService 
} from '@/services/recommendationScheduleService';
// SVG Icons as components
const Calendar = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const Clock = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const Settings = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const BarChart3 = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const TrendingUp = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

const CheckCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const RefreshCw = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const Bell = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const Save = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

interface RecommendationScheduleManagerProps {
  userId: string;
}

const RecommendationScheduleManager: React.FC<RecommendationScheduleManagerProps> = ({
  userId
}) => {
  const [schedule, setSchedule] = useState<RecommendationSchedule | null>(null);
  const [metrics, setMetrics] = useState<RecommendationPerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    frequency: 'weekly' as 'daily' | 'weekly' | 'bi-weekly',
    dayOfWeek: 1, // Monday
    timeOfDay: '09:00',
    enabled: true,
    maxRecommendations: 8,
    mealTypes: ['breakfast', 'lunch', 'dinner'],
    cuisineTypes: ['vietnamese', 'western', 'chinese'],
    excludeRecentDays: 7
  });

  useEffect(() => {
    loadScheduleAndMetrics();
  }, [userId]);

  const loadScheduleAndMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      const [scheduleData, metricsData] = await Promise.all([
        recommendationScheduleService.getUserSchedule(userId),
        recommendationScheduleService.getPerformanceMetrics(userId, 'month')
      ]);

      setSchedule(scheduleData);
      setMetrics(metricsData);

      if (scheduleData) {
        setFormData({
          frequency: scheduleData.frequency,
          dayOfWeek: scheduleData.dayOfWeek,
          timeOfDay: scheduleData.timeOfDay,
          enabled: scheduleData.enabled,
          maxRecommendations: scheduleData.preferences.maxRecommendations,
          mealTypes: scheduleData.preferences.mealTypes,
          cuisineTypes: scheduleData.preferences.cuisineTypes,
          excludeRecentDays: scheduleData.preferences.excludeRecentDays
        });
      }
    } catch (err) {
      console.error('Load schedule error:', err);
      setError('Không thể tải cài đặt gợi ý. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      setSaving(true);
      setError(null);

      const scheduleData: Partial<RecommendationSchedule> = {
        userId,
        frequency: formData.frequency,
        dayOfWeek: formData.dayOfWeek,
        timeOfDay: formData.timeOfDay,
        enabled: formData.enabled,
        preferences: {
          maxRecommendations: formData.maxRecommendations,
          mealTypes: formData.mealTypes,
          cuisineTypes: formData.cuisineTypes,
          excludeRecentDays: formData.excludeRecentDays
        }
      };

      const savedSchedule = await recommendationScheduleService.saveSchedule(scheduleData);
      setSchedule(savedSchedule);
      setShowSettings(false);
    } catch (err) {
      console.error('Save schedule error:', err);
      setError('Không thể lưu cài đặt. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateNow = async () => {
    try {
      setSaving(true);
      await recommendationScheduleService.generateWeeklyRecommendations(userId);
      await loadScheduleAndMetrics(); // Refresh data
    } catch (err) {
      console.error('Generate recommendations error:', err);
      setError('Không thể tạo gợi ý mới. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const getDayName = (dayOfWeek: number) => {
    const days = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
    return days[dayOfWeek];
  };

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'daily': return 'Hàng ngày';
      case 'weekly': return 'Hàng tuần';
      case 'bi-weekly': return '2 tuần một lần';
      default: return frequency;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900">Gợi ý tự động</h2>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Settings className="h-4 w-4" />
            Cài đặt
          </button>
        </div>

        {schedule ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${
                schedule.enabled ? 'text-green-600' : 'text-gray-400'
              }`}>
                {schedule.enabled ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <span className="font-medium">
                  {schedule.enabled ? 'Đang hoạt động' : 'Tạm dừng'}
                </span>
              </div>
              
              <div className="flex items-center gap-1 text-gray-600">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">
                  {getFrequencyLabel(schedule.frequency)}
                  {schedule.frequency !== 'daily' && ` - ${getDayName(schedule.dayOfWeek)}`}
                </span>
              </div>
              
              <div className="flex items-center gap-1 text-gray-600">
                <Clock className="h-4 w-4" />
                <span className="text-sm">{schedule.timeOfDay}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Lần chạy cuối:</span>
                <div className="font-medium">
                  {schedule.lastRun 
                    ? schedule.lastRun.toLocaleDateString('vi-VN')
                    : 'Chưa có'
                  }
                </div>
              </div>
              <div>
                <span className="text-gray-500">Lần chạy tiếp theo:</span>
                <div className="font-medium">
                  {schedule.nextRun.toLocaleDateString('vi-VN')} {schedule.nextRun.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleGenerateNow}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
                {saving ? 'Đang tạo...' : 'Tạo gợi ý ngay'}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <Bell className="h-8 w-8 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa thiết lập gợi ý tự động</h3>
            <p className="text-gray-600 mb-4">
              Thiết lập để nhận gợi ý món ăn phù hợp định kỳ
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Thiết lập ngay
            </button>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Cài đặt gợi ý</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Enable/Disable */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Bật gợi ý tự động
              </label>
              <button
                onClick={() => setFormData(prev => ({ ...prev, enabled: !prev.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enabled ? 'bg-purple-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tần suất
              </label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  frequency: e.target.value as 'daily' | 'weekly' | 'bi-weekly'
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                <option value="daily">Hàng ngày</option>
                <option value="weekly">Hàng tuần</option>
                <option value="bi-weekly">2 tuần một lần</option>
              </select>
            </div>

            {/* Day of week (for weekly/bi-weekly) */}
            {formData.frequency !== 'daily' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ngày trong tuần
                </label>
                <select
                  value={formData.dayOfWeek}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    dayOfWeek: parseInt(e.target.value)
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value={0}>Chủ nhật</option>
                  <option value={1}>Thứ hai</option>
                  <option value={2}>Thứ ba</option>
                  <option value={3}>Thứ tư</option>
                  <option value={4}>Thứ năm</option>
                  <option value={5}>Thứ sáu</option>
                  <option value={6}>Thứ bảy</option>
                </select>
              </div>
            )}

            {/* Time of day */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Thời gian
              </label>
              <input
                type="time"
                value={formData.timeOfDay}
                onChange={(e) => setFormData(prev => ({ ...prev, timeOfDay: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Max recommendations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Số lượng gợi ý tối đa
              </label>
              <input
                type="number"
                min="3"
                max="15"
                value={formData.maxRecommendations}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  maxRecommendations: parseInt(e.target.value)
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* Meal types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Loại bữa ăn
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['breakfast', 'lunch', 'dinner', 'snack', 'dessert'].map(mealType => (
                  <label key={mealType} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.mealTypes.includes(mealType)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData(prev => ({
                            ...prev,
                            mealTypes: [...prev.mealTypes, mealType]
                          }));
                        } else {
                          setFormData(prev => ({
                            ...prev,
                            mealTypes: prev.mealTypes.filter(mt => mt !== mealType)
                          }));
                        }
                      }}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm capitalize">{mealType}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
              <button
                onClick={handleSaveSchedule}
                disabled={saving}
                className="flex items-center gap-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics */}
      {metrics && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">Hiệu quả gợi ý</h3>
            <span className="text-sm text-gray-500">(30 ngày qua)</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">{metrics.totalRecommendations}</div>
              <div className="text-sm text-gray-500">Tổng gợi ý</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{Math.round(metrics.viewRate * 100)}%</div>
              <div className="text-sm text-gray-500">Tỷ lệ xem</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{Math.round(metrics.saveRate * 100)}%</div>
              <div className="text-sm text-gray-500">Tỷ lệ lưu</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{Math.round(metrics.likeRate * 100)}%</div>
              <div className="text-sm text-gray-500">Tỷ lệ thích</div>
            </div>
          </div>

          {metrics.improvementSuggestions.length > 0 && (
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Gợi ý cải thiện</span>
              </div>
              <ul className="space-y-1">
                {metrics.improvementSuggestions.map((suggestion, index) => (
                  <li key={index} className="text-sm text-blue-700 flex items-start gap-2">
                    <span className="w-1 h-1 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
};

export default RecommendationScheduleManager;
