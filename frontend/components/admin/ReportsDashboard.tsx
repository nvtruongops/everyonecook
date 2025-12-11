/**
 * Admin Reports Dashboard Component
 * View and manage user reports
 */

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { archiveReports } from '@/services/admin';
import Toast from '@/components/ui/Toast';

// Local type definitions (API not implemented yet)
type ReportStatus = 'pending' | 'reviewed' | 'dismissed' | 'action_taken';

interface Report {
  report_id: string;
  post_id: string;
  reported_by_username?: string;
  reason: string;
  details: string;
  status: ReportStatus;
  created_at: string;
  reviewed_at?: string;
  admin_notes?: string;
  action_taken?: string;
}

// Placeholder function - API not implemented yet
async function getPendingReports(_token: string, _limit: number): Promise<{ reports: Report[] }> {
  return { reports: [] };
}

export default function ReportsDashboard() {
  const { token } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const [archiving, setArchiving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    loadReports();
  }, [token]);

  const loadReports = async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const data = await getPendingReports(token, 100);
      setReports(data.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const processedCount = reports.filter(r => r.status === 'dismissed' || r.status === 'action_taken').length;

  const handleArchive = async () => {
    if (!token) return;
    setShowConfirm(false);
    
    try {
      setArchiving(true);
      const result = await archiveReports(token);
      
      // Reload reports after archive
      await loadReports();
      
      setToast({ 
        message: `${result.message} (${result.archivedCount} records → S3)`, 
        type: 'success' 
      });
    } catch (err) {
      console.error('Archive failed:', err);
      setToast({ 
        message: 'Lỗi khi archive: ' + (err instanceof Error ? err.message : 'Unknown error'), 
        type: 'error' 
      });
    } finally {
      setArchiving(false);
    }
  };

  const filteredReports = reports.filter((report) => {
    if (filter === 'all') return true;
    return report.status === filter;
  });

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'reviewed':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'dismissed':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'action_taken':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      spam: 'Spam',
      inappropriate_content: 'Inappropriate Content',
      harassment: 'Harassment',
      misinformation: 'Misinformation',
      other: 'Other',
    };
    return labels[reason] || reason;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Reports Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">
            {filteredReports.length} {filter === 'all' ? 'total' : filter} reports
          </p>
        </div>

        <div className="flex gap-3 items-center">
          {/* Archive Button */}
          <button
            onClick={() => processedCount > 0 ? setShowConfirm(true) : setToast({ message: 'Không có reports đã xử lý để archive', type: 'error' })}
            disabled={archiving || processedCount === 0}
            className="px-4 py-2 h-11 bg-amber-600 text-white rounded-xl hover:bg-amber-700 flex items-center gap-2 transition font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {archiving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Đang giải phóng...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Giải phóng
              </>
            )}
          </button>

          {/* Filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ReportStatus | 'all')}
            className="w-full sm:w-auto px-4 py-2 h-11 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Reports</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="dismissed">Dismissed</option>
            <option value="action_taken">Action Taken</option>
          </select>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-3">Xác nhận giải phóng</h3>
            <p className="text-gray-600 mb-4">
              Bạn có chắc muốn giải phóng {processedCount} reports đã xử lý?
              <br /><br />
              Dữ liệu sẽ được lưu vào S3 và xóa khỏi database.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition"
              >
                Hủy
              </button>
              <button
                onClick={handleArchive}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-yellow-900">
            {reports.filter((r) => r.status === 'pending').length}
          </div>
          <div className="text-xs sm:text-sm text-yellow-700">Pending</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-blue-900">
            {reports.filter((r) => r.status === 'reviewed').length}
          </div>
          <div className="text-xs sm:text-sm text-blue-700">Reviewed</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-green-900">
            {reports.filter((r) => r.status === 'action_taken').length}
          </div>
          <div className="text-xs sm:text-sm text-green-700">Action Taken</div>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 sm:p-4">
          <div className="text-xl sm:text-2xl font-bold text-gray-900">
            {reports.filter((r) => r.status === 'dismissed').length}
          </div>
          <div className="text-xs sm:text-sm text-gray-700">Dismissed</div>
        </div>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {filteredReports.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <svg
              className="w-12 h-12 text-gray-400 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-600">No reports found</p>
          </div>
        ) : (
          filteredReports.map((report) => (
            <div
              key={report.report_id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                        report.status
                      )}`}
                    >
                      {report.status.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                      {getReasonLabel(report.reason)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Reported by{' '}
                    <span className="font-medium">@{report.reported_by_username || 'Unknown'}</span>{' '}
                    • {new Date(report.created_at).toLocaleString()}
                  </p>
                </div>
                <a
                  href={`/posts/${report.post_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  View Post →
                </a>
              </div>

              {/* Details */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-800">{report.details}</p>
              </div>

              {/* Admin Review */}
              {report.reviewed_at && (
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Admin Review:</span>{' '}
                    {report.admin_notes || 'No notes'}
                  </p>
                  {report.action_taken && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Action:</span>{' '}
                      {report.action_taken.replace('_', ' ')}
                    </p>
                  )}
                </div>
              )}

              {/* Actions (for pending reports) */}
              {report.status === 'pending' && (
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
                  <button className="flex-1 px-4 py-2.5 min-h-[44px] bg-red-600 text-white rounded-xl hover:bg-red-700 transition font-medium text-sm">
                    Take Action
                  </button>
                  <button className="flex-1 px-4 py-2.5 min-h-[44px] border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition font-medium text-sm">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
