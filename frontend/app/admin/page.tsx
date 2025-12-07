'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/adminAuth';
import {
  getDatabaseStats,
  DatabaseStats,
  getReportStats,
  ReportStats,
  syncUsers,
  SyncUsersResult,
  getDetailedStats,
  DetailedStats,
} from '@/services/admin';
import {
  getAllTrending,
  SearchTrendingItem,
  PostTrendingItem,
} from '@/services/trending';
import { normalizeImageUrl } from '@/lib/image-utils';

// Simple line chart component - larger and easier to read
function SimpleLineChart({ 
  data, 
  label,
  color = '#203d11'
}: { 
  data: { label: string; value: number }[];
  label: string;
  color?: string;
}) {
  if (!data || data.length === 0) return <div className="h-32 md:h-40 flex items-center justify-center text-[#203d11]/40 text-sm">Không có dữ liệu</div>;
  
  const maxValue = Math.max(...data.map(d => d.value), 1);
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1 || 1)) * 100,
    y: 100 - (d.value / maxValue) * 75 - 5, // More padding
    value: d.value,
    label: d.label
  }));
  
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L 100 100 L 0 100 Z`;
  
  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-3">
        <span className="text-sm font-semibold text-[#203d11]">{label}</span>
        <span className="text-xl font-bold text-[#203d11]">
          {data.reduce((sum, d) => sum + d.value, 0)}
        </span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-32 md:h-40" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        <line x1="0" y1="25" x2="100" y2="25" stroke={color} strokeOpacity="0.1" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="50" x2="100" y2="50" stroke={color} strokeOpacity="0.1" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="75" x2="100" y2="75" stroke={color} strokeOpacity="0.1" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        {/* Area fill */}
        <path d={areaD} fill={`url(#grad-${label.replace(/\s/g, '')})`} />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} stroke="white" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-[#203d11]/60 mt-2">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}



export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [reportStats, setReportStats] = useState<ReportStats | null>(null);
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncUsersResult | null>(null);
  // Always use week view - 7 days comparison
  const chartPeriod = 'week' as const;
  const [trendingTab, setTrendingTab] = useState<'searches' | 'posts'>('searches');
  const [topSearches, setTopSearches] = useState<SearchTrendingItem[]>([]);
  const [topPosts, setTopPosts] = useState<PostTrendingItem[]>([]);
  const [weekId, setWeekId] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      const token = await getAdminToken();
      if (!token) { setDefaultStats(); return; }
      const [databaseStats, reportStatsData, detailed, trendingData] = await Promise.all([
        getDatabaseStats(token).catch(() => null),
        getReportStats(token).catch(() => null),
        getDetailedStats(token, chartPeriod).catch(() => null),
        getAllTrending(token, 5).catch(() => null),
      ]);
      databaseStats ? setStats(databaseStats) : setDefaultStats();
      if (reportStatsData) setReportStats(reportStatsData);
      if (detailed) setDetailedStats(detailed);
      if (trendingData) {
        setTopSearches(trendingData.topSearches);
        setTopPosts(trendingData.topPosts);
        setWeekId(trendingData.weekId);
      }
    } catch { setDefaultStats(); } 
    finally { setLoading(false); }
  }

  async function loadDetailedStats() {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const detailed = await getDetailedStats(token, chartPeriod);
      if (detailed) setDetailedStats(detailed);
    } catch (e) { console.error('Failed to load detailed stats:', e); }
  }

  function setDefaultStats() {
    setStats({
      timestamp: new Date().toISOString(),
      counts: { total_users: 0, active_users: 0, suspended_users: 0, total_ingredients: 508, total_recipes: 0, total_posts: 0, total_cooking_sessions: 0, total_violations: 0 },
      growth: { new_users_today: 0, new_users_this_week: 0, new_users_this_month: 0, new_recipes_today: 0, new_recipes_this_week: 0, new_recipes_this_month: 0 },
    });
  }

  async function handleSyncUsers(dryRun: boolean, deleteS3: boolean = false, deleteCognitoOrphans: boolean = false) {
    try {
      setSyncLoading(true);
      const token = await getAdminToken();
      if (!token) { alert('Không có quyền truy cập'); return; }
      const result = await syncUsers(token, { dryRun, deleteS3, deleteCognitoOrphans });
      setSyncResult(result);
      if (!dryRun && (result.deletedUsers?.length || 0) > 0) loadData();
    } catch (error) { alert('Lỗi: ' + (error as Error).message); } 
    finally { setSyncLoading(false); }
  }

  const getChartData = () => {
    if (!detailedStats || !detailedStats.activeUsers.daily) {
      return { activeUsers: [], newUsers: [], posts: [] };
    }
    // Format date as DD/MM for better readability
    const formatDate = (dateStr: string) => {
      const [, month, day] = dateStr.split('-');
      return `${day}/${month}`;
    };
    return {
      activeUsers: detailedStats.activeUsers.daily.map(d => ({ label: formatDate(d.date), value: d.count })),
      newUsers: detailedStats.newUsers.daily?.map(d => ({ label: formatDate(d.date), value: d.count })) || [],
      posts: detailedStats.posts.daily?.map(d => ({ label: formatDate(d.date), value: d.count })) || [],
    };
  };

  const chartData = getChartData();



  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#203d11] mx-auto" />
        <p className="mt-4 text-[#203d11]/70">Đang tải...</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-[#203d11] rounded-2xl p-6 md:p-8 text-white">
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Chào mừng đến Admin Dashboard</h1>
        <p className="text-white/80">Quản lý nền tảng Everyone Cook từ đây</p>
      </div>



      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Tổng Users" value={stats?.counts?.total_users || 0} />
        <StatCard label="Users hoạt động" value={stats?.counts?.active_users || 0} color="green" />
        <StatCard label="Bài viết" value={stats?.counts?.total_posts || 0} />
        <StatCard label="Bài có công thức" value={stats?.counts?.recipe_posts || 0} color="orange" sublabel="Posts recipe_share" />
      </div>

      {/* Ingredients & AI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Thành phần (Dictionary)" value={stats?.counts?.dictionary_ingredients || 0} color="green" sublabel="Đã duyệt" />
        <StatCard label="Thành phần (Cache)" value={stats?.counts?.cache_ingredients || 0} sublabel="Chờ promote 100+" />
        <StatCard label="AI Recipes (24h)" value={stats?.counts?.total_ai_cache || 0} color="orange" sublabel="TTL 24 giờ" />
        <StatCard label="Tài khoản bị khóa" value={stats?.counts?.suspended_users || 0} color="orange" />
      </div>

      {/* Growth Charts */}
      <section className="bg-white rounded-2xl shadow-sm p-6 border border-[#203d11]/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-bold text-[#203d11]">Biểu đồ tăng trưởng</h2>
          <span className="text-sm text-[#203d11]/60">7 ngày gần nhất</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-[#f5f0e8]/50 rounded-xl p-4 md:p-5">
            <SimpleLineChart data={chartData.activeUsers} label="Users hoạt động" color="#203d11" />
          </div>
          <div className="bg-[#f5f0e8]/50 rounded-xl p-4 md:p-5">
            <SimpleLineChart data={chartData.newUsers} label="Users mới" color="#975b1d" />
          </div>
          <div className="bg-[#f5f0e8]/50 rounded-xl p-4 md:p-5">
            <SimpleLineChart data={chartData.posts} label="Bài viết mới" color="#2563eb" />
          </div>
        </div>
      </section>

      {/* Report Stats & Top Week - Equal Height */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {reportStats && (
          <section className="bg-white rounded-2xl shadow-sm p-6 border border-[#203d11]/10 flex flex-col">
            <h2 className="text-lg font-bold text-[#203d11] mb-4">Thống kê báo cáo</h2>
            <div className="grid grid-cols-2 gap-4">
              <ReportStatCard title="Chờ xử lý" count={reportStats.stats?.byStatus?.pending || 0} percentage={reportStats.breakdown?.byStatus?.pending?.percentage || 0} color="warning" />
              <ReportStatCard title="Đã xử lý" count={reportStats.stats?.byStatus?.action_taken || 0} percentage={reportStats.breakdown?.byStatus?.action_taken?.percentage || 0} color="success" />
            </div>
            <div className="mt-auto pt-4 border-t border-[#203d11]/10 flex justify-between items-center">
              <span className="text-sm text-[#203d11]/60">Tổng: {reportStats.stats?.total || 0} báo cáo</span>
              <button onClick={() => router.push('/admin/reports')} className="text-sm text-[#975b1d] hover:text-[#203d11] font-semibold transition-colors">Xem chi tiết →</button>
            </div>
          </section>
        )}
        <section className="bg-white rounded-2xl shadow-sm p-6 border border-[#203d11]/10 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#203d11]">Top tuần này</h2>
            {weekId && <span className="text-xs text-[#203d11]/50">{weekId}</span>}
          </div>
          <div className="flex bg-[#f5f0e8]/50 rounded-xl p-1 mb-4">
            {(['searches', 'posts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTrendingTab(t)}
                className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition ${trendingTab === t ? 'bg-white text-[#203d11] shadow-sm' : 'text-[#203d11]/60 hover:text-[#203d11]'}`}
              >
                {t === 'searches' ? 'Tìm kiếm' : 'Bài viết'}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-2">
            {trendingTab === 'searches' && (
              topSearches.length === 0 ? (
                <p className="text-sm text-[#203d11]/60 text-center py-4">Chưa có dữ liệu</p>
              ) : (
                topSearches.map((item, i) => (
                  <TrendingSearchRow key={item.term} rank={i + 1} term={item.term} count={item.searchCount} />
                ))
              )
            )}
            {trendingTab === 'posts' && (
              topPosts.length === 0 ? (
                <p className="text-sm text-[#203d11]/60 text-center py-4">Chưa có bài viết</p>
              ) : (
                topPosts.map((post, i) => (
                  <TrendingPostRow key={post.postId} rank={i + 1} post={post} onClick={() => router.push(`/post/${post.postId}`)} />
                ))
              )
            )}
          </div>
        </section>
      </div>





      {showSyncDialog && <SyncDialog syncLoading={syncLoading} syncResult={syncResult} onClose={() => { setShowSyncDialog(false); setSyncResult(null); }} onSync={handleSyncUsers} />}
    </div>
  );
}

function StatCard({ label, value, color = 'default', sublabel }: { label: string; value: number; color?: 'default' | 'green' | 'orange'; sublabel?: string }) {
  const colors = { default: 'border-[#203d11]/20', green: 'border-emerald-300', orange: 'border-amber-300' };
  const textColors = { default: 'text-[#203d11]', green: 'text-emerald-700', orange: 'text-amber-700' };
  return (
    <div className={`bg-white rounded-xl p-4 border-l-4 ${colors[color]} border border-[#203d11]/10 hover:shadow-md transition-shadow`}>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value.toLocaleString()}</p>
      <p className="text-sm text-[#203d11]/60">{label}</p>
      {sublabel && <p className="text-xs text-[#203d11]/40 mt-1">{sublabel}</p>}
    </div>
  );
}



const rankColors = [
  'bg-yellow-100 text-yellow-700',
  'bg-gray-200 text-gray-600',
  'bg-orange-100 text-orange-700',
  'bg-[#f5f0e8] text-[#203d11]/60',
];

function TrendingSearchRow({ rank, term, count }: { rank: number; term: string; count: number }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f5f0e8]/50 transition">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${rankColors[Math.min(rank - 1, 3)]}`}>
        {rank}
      </div>
      <span className="flex-1 font-medium text-[#203d11] truncate text-sm">{term}</span>
      <span className="text-xs text-[#203d11]/50 flex-shrink-0">{count} lượt</span>
    </div>
  );
}

function TrendingPostRow({ rank, post, onClick }: { rank: number; post: PostTrendingItem; onClick: () => void }) {
  return (
    <div onClick={onClick} className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f5f0e8]/50 cursor-pointer transition group">
      <div className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-xs ${rankColors[Math.min(rank - 1, 3)]}`}>
        {rank}
      </div>
      {post.authorAvatar && normalizeImageUrl(post.authorAvatar) ? (
        <img src={normalizeImageUrl(post.authorAvatar)!} alt="" className="w-8 h-8 flex-shrink-0 rounded-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : (
        <div className="w-8 h-8 flex-shrink-0 rounded-full bg-[#203d11] flex items-center justify-center text-white text-xs font-bold">
          {post.authorName?.[0]?.toUpperCase() || '?'}
        </div>
      )}
      {post.image && normalizeImageUrl(post.image) && (
        <img src={normalizeImageUrl(post.image)!} alt="" className="w-10 h-10 flex-shrink-0 rounded-lg object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[#203d11]/60">@{post.authorName}</p>
        <p className="font-medium text-[#203d11] group-hover:text-[#975b1d] transition truncate text-sm">
          {post.title || 'Bài viết'}
        </p>
      </div>
      <span className="text-xs text-[#975b1d] flex-shrink-0">{post.likesThisWeek} likes</span>
    </div>
  );
}

function ReportStatCard({ title, count, percentage, color }: { title: string; count: number; percentage: number; color: 'warning' | 'success' }) {
  const colors = { warning: { bg: 'bg-[#975b1d]/10', bar: 'bg-[#975b1d]', text: 'text-[#975b1d]' }, success: { bg: 'bg-[#203d11]/10', bar: 'bg-[#203d11]', text: 'text-[#203d11]' } };
  const c = colors[color];
  return (
    <div className={`p-4 rounded-xl ${c.bg}`}>
      <p className="text-sm text-[#203d11]/60 mb-1">{title}</p>
      <p className={`text-2xl font-bold ${c.text}`}>{count}</p>
      <div className="mt-2">
        <div className="w-full bg-[#203d11]/10 rounded-full h-1.5">
          <div className={`h-1.5 rounded-full ${c.bar}`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    </div>
  );
}



function SyncDialog({ syncLoading, syncResult, onClose, onSync }: { syncLoading: boolean; syncResult: SyncUsersResult | null; onClose: () => void; onSync: (dryRun: boolean, deleteS3?: boolean, deleteCognitoOrphans?: boolean) => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 flex justify-between items-center bg-[#203d11]">
          <h2 className="text-lg font-bold text-white">Đồng bộ Users (Cognito ↔ DynamoDB)</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-xl">×</button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {syncResult ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl ${syncResult.dryRun ? 'bg-amber-50' : 'bg-green-50'}`}>
                <p className={`font-semibold ${syncResult.dryRun ? 'text-amber-700' : 'text-green-700'}`}>
                  {syncResult.dryRun ? '🔍 Chế độ kiểm tra' : '✅ Đã thực thi'}
                </p>
                <p className="text-sm text-[#203d11]/70 mt-1">{syncResult.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-[#f5f0e8] rounded-xl p-4">
                  <p className="text-2xl font-bold text-[#203d11]">{syncResult.totalCognitoUsers}</p>
                  <p className="text-xs text-[#203d11]/60">Cognito</p>
                </div>
                <div className="bg-[#f5f0e8] rounded-xl p-4">
                  <p className="text-2xl font-bold text-[#203d11]">{syncResult.totalDynamoUsers}</p>
                  <p className="text-xs text-[#203d11]/60">DynamoDB</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className={`rounded-xl p-4 ${(syncResult.orphanedDynamoUsers?.length || 0) > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                  <p className={`text-2xl font-bold ${(syncResult.orphanedDynamoUsers?.length || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{syncResult.orphanedDynamoUsers?.length || 0}</p>
                  <p className="text-xs text-[#203d11]/60">DynamoDB Orphans</p>
                  <p className="text-[10px] text-[#203d11]/40">(Có trong DB, không có Cognito)</p>
                </div>
                <div className={`rounded-xl p-4 ${(syncResult.orphanedCognitoUsers?.length || 0) > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
                  <p className={`text-2xl font-bold ${(syncResult.orphanedCognitoUsers?.length || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>{syncResult.orphanedCognitoUsers?.length || 0}</p>
                  <p className="text-xs text-[#203d11]/60">Cognito Orphans</p>
                  <p className="text-[10px] text-[#203d11]/40">(Có trong Cognito, không có DB)</p>
                </div>
              </div>
              {(syncResult.orphanedDynamoUsers?.length || 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-[#203d11]/70 mb-1">DynamoDB Orphans:</p>
                  <div className="bg-gray-900 rounded-lg p-3 max-h-24 overflow-y-auto">
                    {syncResult.orphanedDynamoUsers?.map((id, i) => <code key={i} className="block text-green-400 text-xs py-0.5">{id}</code>)}
                  </div>
                </div>
              )}
              {(syncResult.orphanedCognitoUsers?.length || 0) > 0 && (
                <div>
                  <p className="text-xs font-medium text-[#203d11]/70 mb-1">Cognito Orphans:</p>
                  <div className="bg-gray-900 rounded-lg p-3 max-h-24 overflow-y-auto">
                    {syncResult.orphanedCognitoUsers?.map((u, i) => <code key={i} className="block text-orange-400 text-xs py-0.5">{u.username} ({u.email || 'no email'})</code>)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[#203d11]/70">Nhấn "Kiểm tra" để quét dữ liệu</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-[#203d11]/10 flex flex-wrap gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[#203d11]/20 text-[#203d11] hover:bg-[#f5f0e8]">Đóng</button>
          <button onClick={() => onSync(true)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-[#975b1d] text-white hover:bg-[#7a4917] disabled:opacity-50 flex items-center gap-2">
            {syncLoading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
            Kiểm tra
          </button>
          {syncResult && (syncResult.orphanedDynamoUsers?.length || 0) > 0 && (
            <button onClick={() => onSync(false, true, false)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Xóa DB Orphans</button>
          )}
          {syncResult && (syncResult.orphanedCognitoUsers?.length || 0) > 0 && (
            <button onClick={() => onSync(false, false, true)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50">Xóa Cognito Orphans</button>
          )}
        </div>
      </div>
    </div>
  );
}
