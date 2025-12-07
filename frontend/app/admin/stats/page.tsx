'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/adminAuth';
import { getDetailedStats, DetailedStats, StatsPeriod, HourlyData, DailyData } from '@/services/admin';

export default function AdminStatsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>('day');
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  useEffect(() => {
    if (!selectedDate) loadStats();
  }, [period]);

  async function loadStats(customDate?: string) {
    try {
      setLoading(true);
      setError(null);
      const token = await getAdminToken();
      if (!token) throw new Error('Không có quyền truy cập');
      const data = await getDetailedStats(token, customDate ? 'day' : period, customDate);
      setStats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleDateSelect(date: string) {
    setSelectedDate(date);
    setShowDatePicker(false);
    loadStats(date);
  }

  function handlePeriodChange(newPeriod: StatsPeriod) {
    setSelectedDate('');
    setPeriod(newPeriod);
  }

  function clearCustomDate() {
    setSelectedDate('');
    loadStats();
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/admin')}
            className="text-[#203d11] hover:text-[#975b1d] font-medium transition-colors duration-200"
          >
            ← Quay lại
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-[#203d11]">Thống kê chi tiết</h1>
        </div>
        <button
          onClick={() => loadStats(selectedDate || undefined)}
          disabled={loading}
          className="px-5 py-2.5 bg-[#203d11] text-white rounded-xl hover:bg-[#2a5016] disabled:opacity-50 flex items-center gap-2 font-medium transition-colors duration-200"
        >
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>}
          Làm mới
        </button>
      </div>

      {/* Period Filter */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-[#203d11]/10">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-[#203d11]">Thời gian:</span>
          <div className="flex gap-2">
            {[
              { value: 'day', label: 'Hôm nay' },
              { value: 'week', label: '7 ngày' },
              { value: 'month', label: '30 ngày' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value as StatsPeriod)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  period === p.value && !selectedDate
                    ? 'bg-[#203d11] text-white'
                    : 'bg-[#f5f0e8] text-[#203d11] hover:bg-[#203d11]/10'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Picker */}
          <div className="relative">
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                selectedDate
                  ? 'bg-[#975b1d] text-white'
                  : 'bg-[#f5f0e8] text-[#975b1d] border border-[#975b1d]/30 hover:bg-[#975b1d]/10'
              }`}
            >
              {selectedDate ? formatDisplayDate(selectedDate) : 'Tìm nhanh'}
            </button>

            {showDatePicker && (
              <DatePickerDropdown
                onSelect={handleDateSelect}
                onClose={() => setShowDatePicker(false)}
                selectedDate={selectedDate}
              />
            )}
          </div>

          {selectedDate && (
            <button onClick={clearCustomDate} className="text-sm text-[#975b1d] hover:text-[#203d11] transition-colors duration-200">
              × Xóa
            </button>
          )}
        </div>

        {stats && (
          <p className="text-xs mt-3 text-[#203d11]/60">
            Từ {new Date(stats.timeRange.start).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} đến{' '}
            {new Date(stats.timeRange.end).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (GMT+7)
          </p>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-800">Lỗi: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !stats && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11]"></div>
        </div>
      )}

      {/* No Data State */}
      {stats && stats.activeUsers.total === 0 && stats.newUsers.total === 0 && stats.posts.total === 0 && stats.reports.total === 0 && (
        <div className="bg-[#975b1d]/10 border border-[#975b1d]/20 rounded-xl p-8 text-center">
          <p className="text-[#975b1d] text-lg font-medium">Không có dữ liệu trong khoảng thời gian này</p>
          <p className="text-[#975b1d]/70 text-sm mt-2">Thử chọn khoảng thời gian khác</p>
        </div>
      )}

      {/* Stats Content */}
      {stats && (stats.activeUsers.total > 0 || stats.newUsers.total > 0 || stats.posts.total > 0 || stats.reports.total > 0) && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              title="User hoạt động"
              value={stats.activeUsers.total}
              label="U"
              color="primary"
              subtitle={`${selectedDate ? 'Ngày ' + formatDisplayDate(selectedDate) : period === 'day' ? 'Hôm nay' : period === 'week' ? '7 ngày qua' : '30 ngày qua'} (unique)`}
            />
            <SummaryCard title="User mới" value={stats.newUsers.total} label="N" color="secondary" subtitle="Đăng ký mới (unique)" />
            <SummaryCard title="Bài đăng" value={stats.posts.total} label="P" color="primary" subtitle="Posts mới" />
            <SummaryCard
              title="Tố cáo"
              value={stats.reports.total}
              label="R"
              color="danger"
              subtitle={`${stats.reports.posts} post, ${stats.reports.comments} comment`}
            />
          </div>

          {/* Charts */}
          <ChartCard
            title="User hoạt động (unique)"
            total={stats.activeUsers.total}
            period={stats.period}
            hourlyData={stats.activeUsers.hourly}
            dailyData={stats.activeUsers.daily}
            color="primary"
          />
          <ChartCard
            title="User mới đăng ký"
            total={stats.newUsers.total}
            period={stats.period}
            hourlyData={stats.newUsers.hourly}
            dailyData={stats.newUsers.daily}
            color="secondary"
          />
          <ChartCard
            title="Bài đăng mới"
            total={stats.posts.total}
            period={stats.period}
            hourlyData={stats.posts.hourly}
            dailyData={stats.posts.daily}
            color="primary"
          />

          {/* Reports Chart */}
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-red-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <h3 className="text-lg font-bold text-[#203d11]">Tố cáo</h3>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-bold text-red-600">{stats.reports.total}</span>
                <div className="flex gap-2 text-sm">
                  <span className="px-2 py-1 rounded-lg text-white bg-[#203d11]">Post: {stats.reports.posts}</span>
                  <span className="px-2 py-1 rounded-lg text-white bg-[#975b1d]">Comment: {stats.reports.comments}</span>
                </div>
              </div>
            </div>
            <BarChart period={stats.period} hourlyData={stats.reports.hourly} dailyData={stats.reports.daily} color="danger" />
          </div>
        </div>
      )}
    </div>
  );
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function DatePickerDropdown({
  onSelect,
  onClose,
  selectedDate,
}: {
  onSelect: (date: string) => void;
  onClose: () => void;
  selectedDate: string;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => (selectedDate ? new Date(selectedDate) : new Date()));

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const days: (number | null)[] = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

  function handleDayClick(day: number) {
    const date = new Date(year, month, day);
    if (date > today) return;
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onSelect(dateStr);
  }

  return (
    <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-[#203d11]/10 p-4 z-50 w-72">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setCurrentMonth(new Date(year, month - 1, 1))} className="p-1 hover:bg-[#f5f0e8] rounded-lg transition-colors duration-200">
          ←
        </button>
        <span className="font-medium text-[#203d11]">{monthNames[month]} {year}</span>
        <button
          onClick={() => { const next = new Date(year, month + 1, 1); if (next <= today) setCurrentMonth(next); }}
          className="p-1 hover:bg-[#f5f0e8] rounded-lg transition-colors duration-200"
          disabled={new Date(year, month + 1, 1) > today}
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
        {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((d) => (
          <div key={d} className="text-[#203d11]/50 font-medium py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (day === null) return <div key={i} />;
          const date = new Date(year, month, day);
          const isToday = date.toDateString() === today.toDateString();
          const isFuture = date > today;
          const isSelected = selectedDate === `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          return (
            <button
              key={i}
              onClick={() => handleDayClick(day)}
              disabled={isFuture}
              className={`p-2 text-sm rounded-lg transition-all duration-200 font-medium ${
                isSelected ? 'bg-[#203d11] text-white' :
                isToday ? 'bg-[#975b1d] text-white' :
                isFuture ? 'bg-gray-50 text-gray-300 cursor-not-allowed' :
                'bg-[#f5f0e8] text-[#203d11] hover:bg-[#203d11]/10'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-[#203d11]/60 hover:text-[#203d11] transition-colors duration-200">
        Đóng
      </button>
    </div>
  );
}

function SummaryCard({ title, value, label, color, subtitle }: { title: string; value: number; label: string; color: 'primary' | 'secondary' | 'danger'; subtitle: string }) {
  const colors = {
    primary: { bg: 'bg-[#203d11]', text: 'text-[#203d11]' },
    secondary: { bg: 'bg-[#975b1d]', text: 'text-[#975b1d]' },
    danger: { bg: 'bg-red-600', text: 'text-red-600' },
  };
  const c = colors[color];

  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border-t-4 ${color === 'primary' ? 'border-[#203d11]' : color === 'secondary' ? 'border-[#975b1d]' : 'border-red-500'}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#203d11]/60">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${c.text}`}>{value}</p>
          <p className="text-xs mt-1 text-[#203d11]/50">{subtitle}</p>
        </div>
        <div className={`w-12 h-12 ${c.bg} rounded-xl flex items-center justify-center text-white font-bold`}>{label}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, total, period, hourlyData, dailyData, color }: { title: string; total: number; period: StatsPeriod; hourlyData?: HourlyData[]; dailyData?: DailyData[]; color: 'primary' | 'secondary' | 'danger' }) {
  const borderColor = color === 'primary' ? 'border-[#203d11]' : color === 'secondary' ? 'border-[#975b1d]' : 'border-red-500';
  const textColor = color === 'primary' ? 'text-[#203d11]' : color === 'secondary' ? 'text-[#975b1d]' : 'text-red-600';

  return (
    <div className={`bg-white rounded-xl shadow-sm p-6 border-l-4 ${borderColor}`}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-[#203d11]">{title}</h3>
        <span className={`text-2xl font-bold ${textColor}`}>{total}</span>
      </div>
      <BarChart period={period} hourlyData={hourlyData} dailyData={dailyData} color={color} />
    </div>
  );
}

function BarChart({ period, hourlyData, dailyData, color }: { period: StatsPeriod; hourlyData?: HourlyData[]; dailyData?: DailyData[]; color: 'primary' | 'secondary' | 'danger' }) {
  const barColor = color === 'primary' ? 'bg-[#203d11]' : color === 'secondary' ? 'bg-[#975b1d]' : 'bg-red-500';
  const data = period === 'day' ? hourlyData : dailyData;

  if (!data || data.length === 0) {
    return <div className="h-40 flex items-center justify-center text-[#203d11]/50">Không có dữ liệu</div>;
  }

  const maxValue = Math.max(...data.map((d) => d.count), 1);

  const formatLabel = (item: HourlyData | DailyData): string => {
    if ('hour' in item) return `${item.hour.toString().padStart(2, '0')}h`;
    const date = new Date(item.date);
    return `${date.getDate()}/${date.getMonth() + 1}`;
  };

  return (
    <div className="h-48 overflow-x-auto">
      <div className="flex items-end gap-1 h-40 min-w-max">
        {data.map((item, index) => {
          const height = (item.count / maxValue) * 100;
          return (
            <div key={index} className="flex flex-col items-center" style={{ minWidth: period === 'day' ? '28px' : '36px' }}>
              <div className="relative w-full flex flex-col items-center">
                {item.count > 0 && <span className="text-xs mb-1 text-[#203d11]/60">{item.count}</span>}
                <div
                  className={`w-full rounded-t transition-all duration-300 ${barColor}`}
                  style={{ height: `${Math.max(height, item.count > 0 ? 4 : 0)}px` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-2 min-w-max">
        {data.map((item, index) => (
          <div key={index} className="text-xs text-center text-[#203d11]/50" style={{ minWidth: period === 'day' ? '28px' : '36px' }}>
            {formatLabel(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
