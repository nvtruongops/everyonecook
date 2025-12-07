'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import AdminRoute from '@/components/AdminRoute';
import { getAdminToken } from '@/lib/adminAuth';
import {
  getUsers,
  banUser,
  unbanUser,
  getUserDetail,
  deleteUserPermanently,
  syncUsers,
  SyncUsersResult,
  User,
  BanDurationUnit,
  BAN_REASONS,
  BAN_DURATIONS,
} from '@/services/admin';

// Avatar component với fallback và error handling
function UserAvatar({ src, username, size = 40 }: { src?: string; username: string; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const initial = username?.[0]?.toUpperCase() || '?';
  
  if (!src || imgError) {
    return (
      <div 
        className="rounded-full bg-[#203d11] flex items-center justify-center text-white font-semibold"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {initial}
      </div>
    );
  }

  return (
    <div className="relative rounded-full overflow-hidden bg-[#f5f0e8]" style={{ width: size, height: size }}>
      <Image
        src={src}
        alt={username}
        fill
        className="object-cover"
        onError={() => setImgError(true)}
        unoptimized
      />
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminRoute>
      <AdminUsersContent />
    </AdminRoute>
  );
}

function AdminUsersContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const USERS_PER_PAGE = 10;

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>('all');
  const [violationFilter, setViolationFilter] = useState<'all' | '0' | '1-3' | '4+'>('all');

  const [showBanDialog, setShowBanDialog] = useState(false);
  const [banForm, setBanForm] = useState({
    userId: '',
    username: '',
    reasonType: '' as string,
    customReason: '',
    duration: 7,
    durationUnit: 'days' as BanDurationUnit,
  });

  const [selectedUserDetail, setSelectedUserDetail] = useState<any>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteUsername, setDeleteUsername] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncUsersResult | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function loadToken() {
      const adminToken = await getAdminToken();
      setToken(adminToken);
    }
    loadToken();
  }, []);

  useEffect(() => {
    if (token) loadUsers(1);
  }, [token]);

  const loadUsers = useCallback(async (page: number) => {
    if (!token) return;
    try {
      setLoading(true);
      const response = await getUsers(token, {
        limit: USERS_PER_PAGE,
        page,
        status: statusFilter,
        search: searchQuery || undefined,
      });
      setUsers(response.users);
      setTotalUsers(response.total);
      setTotalPages(response.totalPages);
      setCurrentPage(response.page);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, searchQuery]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => loadUsers(1), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, statusFilter, token, loadUsers]);

  const filteredUsers = users.filter((user) => {
    const violations = user.violationCount || 0;
    if (violationFilter === '0') return violations === 0;
    if (violationFilter === '1-3') return violations >= 1 && violations <= 3;
    if (violationFilter === '4+') return violations >= 4;
    return true;
  });

  async function handleBanUser() {
    const finalReason = banForm.reasonType === 'other'
      ? banForm.customReason
      : BAN_REASONS.find((r) => r.value === banForm.reasonType)?.label || banForm.customReason;

    if (!finalReason.trim()) {
      showToast('Vui lòng chọn hoặc nhập lý do khóa tài khoản', 'error');
      return;
    }
    if (!banForm.userId.trim()) {
      showToast('Vui lòng nhập User ID', 'error');
      return;
    }

    try {
      await banUser({ userId: banForm.userId, reason: finalReason, duration: banForm.duration, durationUnit: banForm.durationUnit }, token || undefined);
      const durationDisplay = banForm.duration === 0 ? 'vĩnh viễn' : `${banForm.duration} ${banForm.durationUnit === 'minutes' ? 'phút' : banForm.durationUnit === 'hours' ? 'giờ' : 'ngày'}`;
      showToast(`Đã khóa tài khoản ${banForm.username || banForm.userId} trong ${durationDisplay}`, 'success');
      closeBanDialog();
      loadUsers(currentPage);
    } catch (error) {
      showToast('Lỗi khi khóa tài khoản: ' + (error as Error).message, 'error');
    }
  }

  async function handleUnbanUser(userId: string, username?: string) {
    setConfirmDialog({
      show: true,
      title: 'Xác nhận mở khóa',
      message: `Bạn có chắc muốn mở khóa tài khoản ${username || userId}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await unbanUser(userId, 'Admin mở khóa', token || undefined);
          showToast('Đã mở khóa tài khoản thành công', 'success');
          loadUsers(currentPage);
          setSelectedUserDetail(null);
        } catch (error) {
          showToast('Lỗi khi mở khóa tài khoản: ' + (error as Error).message, 'error');
        }
      },
    });
  }

  function handleBanFromList(user: User) {
    setBanForm({ userId: user.userId, username: user.username, reasonType: '', customReason: '', duration: 7, durationUnit: 'days' });
    setShowBanDialog(true);
  }

  function closeBanDialog() {
    setShowBanDialog(false);
    setBanForm({ userId: '', username: '', reasonType: '', customReason: '', duration: 7, durationUnit: 'days' });
  }

  async function handleViewUserDetail(user: User) {
    if (!token) return;
    setLoadingUserDetail(true);
    try {
      const detail = await getUserDetail(user.userId, token);
      if (detail) setSelectedUserDetail(detail);
      else showToast('Không thể tải thông tin user', 'error');
    } catch (error) {
      showToast('Lỗi khi tải thông tin user', 'error');
    } finally {
      setLoadingUserDetail(false);
    }
  }

  function goToUserProfile(userId: string) {
    window.open(`/users/${userId}`, '_blank');
  }

  async function handleDeleteUser() {
    if (!deleteUsername.trim()) { showToast('Vui lòng nhập username', 'error'); return; }
    if (!deleteReason.trim()) { showToast('Vui lòng nhập lý do xóa', 'error'); return; }

    const userToDelete = users.find((u) => u.username.toLowerCase() === deleteUsername.toLowerCase());
    if (!userToDelete) { showToast('Không tìm thấy user với username này', 'error'); return; }

    setConfirmDialog({
      show: true,
      title: 'Xác nhận xóa vĩnh viễn',
      message: `Bạn có chắc muốn XÓA VĨNH VIỄN tài khoản @${userToDelete.username}? Hành động này KHÔNG THỂ hoàn tác.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setDeleting(true);
        try {
          const result = await deleteUserPermanently(userToDelete.userId, deleteReason, token || '');
          showToast(`Đã xóa vĩnh viễn @${result.username}. Đã xóa ${result.stats.totalItemsDeleted} items.`, 'success');
          closeDeleteDialog();
          loadUsers(currentPage);
        } catch (error) {
          showToast('Lỗi khi xóa user: ' + (error as Error).message, 'error');
        } finally {
          setDeleting(false);
        }
      },
    });
  }

  function closeDeleteDialog() {
    setShowDeleteDialog(false);
    setDeleteUsername('');
    setDeleteReason('');
  }

  async function handleSyncUsers(dryRun: boolean, deleteS3: boolean = false, deleteCognitoOrphans: boolean = false) {
    try {
      setSyncLoading(true);
      if (!token) { showToast('Không có quyền truy cập', 'error'); return; }
      const result = await syncUsers(token, { dryRun, deleteS3, deleteCognitoOrphans });
      setSyncResult(result);
      if (!dryRun && (result.deletedUsers?.length || 0) > 0) loadUsers(currentPage);
    } catch (error) { showToast('Lỗi: ' + (error as Error).message, 'error'); } 
    finally { setSyncLoading(false); }
  }

  function closeSyncDialog() {
    setShowSyncDialog(false);
    setSyncResult(null);
  }

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#203d11] border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100]">
          <div className={`px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-[#203d11]' : 'bg-red-600'}`}>
            {toast.message}
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg p-5 max-w-sm w-full">
            <h3 className="text-lg font-semibold mb-2 text-[#203d11]">{confirmDialog.title}</h3>
            <p className="mb-5 text-[#203d11]/70 text-sm">{confirmDialog.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDialog(null)} className="flex-1 px-4 py-2 border border-[#203d11]/20 rounded-lg text-sm font-medium text-[#203d11] hover:bg-[#f5f0e8] transition-colors">
                Hủy
              </button>
              <button onClick={confirmDialog.onConfirm} className="flex-1 px-4 py-2 bg-[#203d11] text-white rounded-lg text-sm font-medium hover:bg-[#2a5016] transition-colors">
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin')} className="text-[#203d11] hover:text-[#975b1d] text-sm font-medium transition-colors">
            ← Quay lại
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-[#203d11]">Quản lý Users</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBanDialog(true)} className="px-4 py-2 bg-[#975b1d] text-white rounded-lg text-sm font-medium hover:bg-[#7a4917] transition-colors">
            Khóa tài khoản
          </button>
          <button onClick={() => setShowDeleteDialog(true)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            Xóa user
          </button>
          <button onClick={() => setShowSyncDialog(true)} className="px-4 py-2 bg-[#203d11] text-white rounded-lg text-sm font-medium hover:bg-[#2a5016] transition-colors">
            Sync Users
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <span className="px-3 py-1.5 rounded-lg bg-[#203d11] text-white text-sm font-medium">
          {totalUsers} Tổng users
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-[#203d11]/70 text-white text-sm font-medium">
          {users.filter((u) => !u.isBanned).length} Hoạt động
        </span>
        <span className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium">
          {users.filter((u) => u.isBanned).length} Đã khóa
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-4 border border-[#203d11]/10">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            placeholder="Tìm kiếm theo username, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 h-10 px-3 border border-[#203d11]/20 rounded-lg text-sm focus:border-[#203d11] focus:outline-none transition-colors"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'banned')}
            className="h-10 px-3 border border-[#203d11]/20 rounded-lg bg-white text-sm text-[#203d11] focus:border-[#203d11] focus:outline-none transition-colors"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="banned">Đã bị khóa</option>
          </select>
          <select
            value={violationFilter}
            onChange={(e) => setViolationFilter(e.target.value as 'all' | '0' | '1-3' | '4+')}
            className="h-10 px-3 border border-[#203d11]/20 rounded-lg bg-white text-sm text-[#203d11] focus:border-[#203d11] focus:outline-none transition-colors"
          >
            <option value="all">Tất cả vi phạm</option>
            <option value="0">Chưa vi phạm</option>
            <option value="1-3">1-3 vi phạm</option>
            <option value="4+">4+ vi phạm</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg overflow-hidden border border-[#203d11]/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#203d11]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">Trạng thái</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">Vi phạm</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">Posts</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-white uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#203d11]/10">
              {filteredUsers.map((user) => (
                <tr key={user.userId} className="hover:bg-[#f5f0e8]/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar src={user.avatarUrl} username={user.username} size={40} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#203d11] truncate">@{user.username}</div>
                        <div className="text-xs text-[#203d11]/50 truncate">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${user.isBanned ? 'bg-red-100 text-red-700' : 'bg-[#203d11]/10 text-[#203d11]'}`}>
                      {user.isBanned ? 'Đã khóa' : 'Hoạt động'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block min-w-[24px] px-2 py-1 text-xs font-medium rounded ${
                      (user.violationCount || 0) === 0 ? 'bg-[#203d11]/10 text-[#203d11]' :
                      (user.violationCount || 0) <= 3 ? 'bg-[#975b1d]/10 text-[#975b1d]' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.violationCount || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-[#203d11]">{user.postCount || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewUserDetail(user)}
                        disabled={loadingUserDetail}
                        className="px-3 py-1.5 rounded-md bg-[#975b1d] text-white text-xs font-semibold hover:bg-[#7a4917] transition-colors disabled:opacity-50 flex items-center gap-1"
                        title="Xem chi tiết"
                      >
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">i</span>
                        <span className="hidden sm:inline">Chi tiết</span>
                      </button>
                      <button
                        onClick={() => goToUserProfile(user.userId)}
                        className="px-3 py-1.5 rounded-md bg-[#203d11] text-white text-xs font-semibold hover:bg-[#2a5016] transition-colors flex items-center gap-1"
                        title="Xem profile"
                      >
                        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">P</span>
                        <span className="hidden sm:inline">Profile</span>
                      </button>
                      {user.isBanned ? (
                        <button
                          onClick={() => handleUnbanUser(user.userId, user.username)}
                          className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1"
                          title="Mở khóa"
                        >
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">✓</span>
                          <span className="hidden sm:inline">Mở khóa</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBanFromList(user)}
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-1"
                          title="Khóa tài khoản"
                        >
                          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">✕</span>
                          <span className="hidden sm:inline">Khóa</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && !loading && (
            <div className="text-center py-10 text-[#203d11]/50 text-sm">Không tìm thấy user nào</div>
          )}
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-[#203d11]/10 flex flex-col md:flex-row items-center justify-between gap-3">
          <span className="text-sm text-[#203d11]/70">
            Trang {currentPage} / {totalPages} • Tổng {totalUsers} users
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => loadUsers(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              className="px-3 py-1.5 text-sm border border-[#203d11]/20 rounded-lg disabled:opacity-40 text-[#203d11] hover:bg-[#f5f0e8] transition-colors"
            >
              ← Trước
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = i + 1;
              else if (currentPage <= 3) pageNum = i + 1;
              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = currentPage - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => loadUsers(pageNum)}
                  disabled={loading}
                  className={`w-8 h-8 text-sm rounded-lg font-medium transition-colors ${
                    currentPage === pageNum ? 'bg-[#203d11] text-white' : 'border border-[#203d11]/20 text-[#203d11] hover:bg-[#f5f0e8]'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => loadUsers(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              className="px-3 py-1.5 text-sm border border-[#203d11]/20 rounded-lg disabled:opacity-40 text-[#203d11] hover:bg-[#f5f0e8] transition-colors"
            >
              Sau →
            </button>
          </div>
        </div>
      </div>


      {/* Ban Dialog */}
      {showBanDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4 text-[#975b1d]">Khóa tài khoản</h3>
            {banForm.username && (
              <div className="mb-4 p-3 rounded-lg bg-[#f5f0e8]">
                <p className="text-xs text-[#203d11]/60">Đang khóa:</p>
                <p className="font-semibold text-[#203d11]">@{banForm.username}</p>
              </div>
            )}
            {!banForm.username && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1.5 text-[#203d11]">User ID</label>
                <input
                  type="text"
                  value={banForm.userId}
                  onChange={(e) => setBanForm({ ...banForm, userId: e.target.value })}
                  className="w-full h-10 px-3 border border-[#203d11]/20 rounded-lg text-sm focus:border-[#203d11] focus:outline-none"
                  placeholder="user_123..."
                />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5 text-[#203d11]">Lý do khóa</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {BAN_REASONS.map((reason) => (
                  <button
                    key={reason.value}
                    type="button"
                    onClick={() => setBanForm({ ...banForm, reasonType: reason.value })}
                    className={`p-2 text-xs rounded-lg border transition-colors ${
                      banForm.reasonType === reason.value
                        ? 'bg-[#975b1d]/10 border-[#975b1d] text-[#975b1d]'
                        : 'border-[#203d11]/20 text-[#203d11]/70 hover:border-[#203d11]/40'
                    }`}
                  >
                    {reason.label}
                  </button>
                ))}
              </div>
              {banForm.reasonType === 'other' && (
                <input
                  type="text"
                  value={banForm.customReason}
                  onChange={(e) => setBanForm({ ...banForm, customReason: e.target.value })}
                  className="w-full h-10 px-3 border border-[#203d11]/20 rounded-lg text-sm mt-2 focus:border-[#203d11] focus:outline-none"
                  placeholder="Nhập lý do khác..."
                />
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5 text-[#203d11]">Thời hạn khóa</label>
              <div className="grid grid-cols-3 gap-2">
                {BAN_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setBanForm({ ...banForm, duration: d.value, durationUnit: d.unit })}
                    className={`p-2 text-xs rounded-lg border transition-colors ${
                      banForm.duration === d.value && banForm.durationUnit === d.unit
                        ? 'bg-[#203d11]/10 border-[#203d11] text-[#203d11]'
                        : 'border-[#203d11]/20 text-[#203d11]/70 hover:border-[#203d11]/40'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={closeBanDialog} className="flex-1 px-4 py-2 border border-[#203d11]/20 rounded-lg text-sm font-medium text-[#203d11] hover:bg-[#f5f0e8] transition-colors">
                Hủy
              </button>
              <button onClick={handleBanUser} className="flex-1 px-4 py-2 bg-[#975b1d] text-white rounded-lg text-sm font-medium hover:bg-[#7a4917] transition-colors">
                Khóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4 text-red-600">Xóa user vĩnh viễn</h3>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-red-700 text-xs">Hành động này KHÔNG THỂ hoàn tác. Tất cả dữ liệu của user sẽ bị xóa vĩnh viễn.</p>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1.5 text-[#203d11]">Username</label>
              <input
                type="text"
                value={deleteUsername}
                onChange={(e) => setDeleteUsername(e.target.value)}
                className="w-full h-10 px-3 border border-[#203d11]/20 rounded-lg text-sm focus:border-[#203d11] focus:outline-none"
                placeholder="Nhập username để xác nhận..."
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5 text-[#203d11]">Lý do xóa</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border border-[#203d11]/20 rounded-lg text-sm resize-none focus:border-[#203d11] focus:outline-none"
                rows={2}
                placeholder="Nhập lý do xóa user..."
              />
            </div>
            <div className="flex gap-2">
              <button onClick={closeDeleteDialog} className="flex-1 px-4 py-2 border border-[#203d11]/20 rounded-lg text-sm font-medium text-[#203d11] hover:bg-[#f5f0e8] transition-colors">
                Hủy
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {selectedUserDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b border-[#203d11]/10 flex justify-between items-center">
              <h3 className="text-lg font-bold text-[#203d11]">Chi tiết User</h3>
              <button onClick={() => setSelectedUserDetail(null)} className="w-8 h-8 rounded-lg hover:bg-[#f5f0e8] flex items-center justify-center text-[#203d11]/60 hover:text-[#203d11] transition-colors">
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <UserAvatar src={selectedUserDetail.avatarUrl} username={selectedUserDetail.username} size={56} />
                <div>
                  <p className="text-lg font-bold text-[#203d11]">@{selectedUserDetail.username}</p>
                  <p className="text-sm text-[#203d11]/60">{selectedUserDetail.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#f5f0e8] rounded-lg p-3">
                  <p className="text-xs text-[#203d11]/60">Trạng thái</p>
                  <p className={`font-semibold text-sm ${selectedUserDetail.isBanned ? 'text-red-600' : 'text-[#203d11]'}`}>
                    {selectedUserDetail.isBanned ? 'Đã khóa' : 'Hoạt động'}
                  </p>
                </div>
                <div className="bg-[#f5f0e8] rounded-lg p-3">
                  <p className="text-xs text-[#203d11]/60">Vi phạm</p>
                  <p className="font-semibold text-sm text-[#203d11]">{selectedUserDetail.violationCount || 0}</p>
                </div>
                <div className="bg-[#f5f0e8] rounded-lg p-3">
                  <p className="text-xs text-[#203d11]/60">Bài viết</p>
                  <p className="font-semibold text-sm text-[#203d11]">{selectedUserDetail.postCount || 0}</p>
                </div>
                <div className="bg-[#f5f0e8] rounded-lg p-3">
                  <p className="text-xs text-[#203d11]/60">Ngày tạo</p>
                  <p className="font-semibold text-sm text-[#203d11]">{new Date(selectedUserDetail.createdAt).toLocaleDateString('vi-VN')}</p>
                </div>
              </div>
              {selectedUserDetail.isBanned && selectedUserDetail.banInfo && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-600 font-medium mb-1">Thông tin khóa</p>
                  <p className="text-sm text-[#203d11]">Lý do: {selectedUserDetail.banInfo.reason}</p>
                  <p className="text-xs text-[#203d11]/60 mt-1">
                    Hết hạn: {selectedUserDetail.banInfo.expiresAt ? new Date(selectedUserDetail.banInfo.expiresAt).toLocaleString('vi-VN') : 'Vĩnh viễn'}
                  </p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedUserDetail.isBanned ? (
                  <button
                    onClick={() => handleUnbanUser(selectedUserDetail.userId, selectedUserDetail.username)}
                    className="flex-1 px-4 py-2 bg-[#203d11] text-white rounded-lg text-sm font-medium hover:bg-[#2a5016] transition-colors"
                  >
                    Mở khóa
                  </button>
                ) : (
                  <button
                    onClick={() => { setSelectedUserDetail(null); handleBanFromList(selectedUserDetail); }}
                    className="flex-1 px-4 py-2 bg-[#975b1d] text-white rounded-lg text-sm font-medium hover:bg-[#7a4917] transition-colors"
                  >
                    Khóa tài khoản
                  </button>
                )}
                <button
                  onClick={() => goToUserProfile(selectedUserDetail.userId)}
                  className="flex-1 px-4 py-2 border border-[#203d11]/20 rounded-lg text-sm font-medium text-[#203d11] hover:bg-[#f5f0e8] transition-colors"
                >
                  Xem Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sync Users Dialog */}
      {showSyncDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[80vh] overflow-hidden">
            <div className="px-5 py-4 flex justify-between items-center bg-[#203d11]">
              <h2 className="text-base font-bold text-white">Sync Users (Cognito - DynamoDB)</h2>
              <button onClick={closeSyncDialog} className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-lg">×</button>
            </div>
            <div className="p-5 overflow-y-auto max-h-[50vh]">
              {syncResult ? (
                <div className="space-y-4">
                  <div className={`p-3 rounded-lg ${syncResult.dryRun ? 'bg-amber-50' : 'bg-green-50'}`}>
                    <p className={`font-semibold text-sm ${syncResult.dryRun ? 'text-amber-700' : 'text-green-700'}`}>
                      {syncResult.dryRun ? 'Chế độ kiểm tra' : 'Đã thực thi'}
                    </p>
                    <p className="text-xs text-[#203d11]/70 mt-1">{syncResult.message}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-[#f5f0e8] rounded-lg p-3">
                      <p className="text-xl font-bold text-[#203d11]">{syncResult.totalCognitoUsers}</p>
                      <p className="text-xs text-[#203d11]/60">Cognito</p>
                    </div>
                    <div className="bg-[#f5f0e8] rounded-lg p-3">
                      <p className="text-xl font-bold text-[#203d11]">{syncResult.totalDynamoUsers}</p>
                      <p className="text-xs text-[#203d11]/60">DynamoDB</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className={`rounded-lg p-3 ${(syncResult.orphanedDynamoUsers?.length || 0) > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                      <p className={`text-xl font-bold ${(syncResult.orphanedDynamoUsers?.length || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>{syncResult.orphanedDynamoUsers?.length || 0}</p>
                      <p className="text-xs text-[#203d11]/60">DynamoDB Orphans</p>
                      <p className="text-[10px] text-[#203d11]/40">(Có trong DB, không có Cognito)</p>
                    </div>
                    <div className={`rounded-lg p-3 ${(syncResult.orphanedCognitoUsers?.length || 0) > 0 ? 'bg-orange-100' : 'bg-green-100'}`}>
                      <p className={`text-xl font-bold ${(syncResult.orphanedCognitoUsers?.length || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>{syncResult.orphanedCognitoUsers?.length || 0}</p>
                      <p className="text-xs text-[#203d11]/60">Cognito Orphans</p>
                      <p className="text-[10px] text-[#203d11]/40">(Có trong Cognito, không có DB)</p>
                    </div>
                  </div>
                  {(syncResult.orphanedDynamoUsers?.length || 0) > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[#203d11]/70 mb-1">DynamoDB Orphans:</p>
                      <div className="bg-gray-900 rounded-lg p-3 max-h-20 overflow-y-auto">
                        {syncResult.orphanedDynamoUsers?.map((id, i) => <code key={i} className="block text-green-400 text-xs py-0.5">{id}</code>)}
                      </div>
                    </div>
                  )}
                  {(syncResult.orphanedCognitoUsers?.length || 0) > 0 && (
                    <div>
                      <p className="text-xs font-medium text-[#203d11]/70 mb-1">Cognito Orphans:</p>
                      <div className="bg-gray-900 rounded-lg p-3 max-h-20 overflow-y-auto">
                        {syncResult.orphanedCognitoUsers?.map((u, i) => <code key={i} className="block text-orange-400 text-xs py-0.5">{u.username} ({u.email || 'no email'})</code>)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[#203d11]/70 text-sm">Nhấn "Kiểm tra" để quét dữ liệu orphaned users</p>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-[#203d11]/10 flex flex-wrap gap-2 justify-end">
              <button onClick={closeSyncDialog} className="px-4 py-2 rounded-lg border border-[#203d11]/20 text-[#203d11] text-sm hover:bg-[#f5f0e8]">Đóng</button>
              <button onClick={() => handleSyncUsers(true)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-[#975b1d] text-white text-sm hover:bg-[#7a4917] disabled:opacity-50 flex items-center gap-2">
                {syncLoading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />}
                Kiểm tra
              </button>
              {syncResult && (syncResult.orphanedDynamoUsers?.length || 0) > 0 && (
                <button onClick={() => handleSyncUsers(false, true, false)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-50">Xóa DB Orphans</button>
              )}
              {syncResult && (syncResult.orphanedCognitoUsers?.length || 0) > 0 && (
                <button onClick={() => handleSyncUsers(false, false, true)} disabled={syncLoading} className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm hover:bg-orange-700 disabled:opacity-50">Xóa Cognito Orphans</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
