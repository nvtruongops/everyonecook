/**
 * Admin Module Handlers
 *
 * Exports all admin handlers for user management and content moderation.
 */

// User Management Handlers
export { handler as getUsers } from './get-users';
export { handler as getUserDetail } from './get-user-detail';
export { handler as banUser } from './ban-user';
export { handler as unbanUser } from './unban-user';
export { handler as getBannedUsers } from './get-banned-users';
export { handler as cleanupInactive } from './cleanup-inactive';
export { handler as deleteUser } from './delete-user';
export { handler as checkBanStatus } from './check-ban-status';

// Content Moderation Handlers
export { handler as getReportedPosts } from './get-reported-posts';
export { handler as getReportedComments } from './get-reported-comments';
export { handler as getReportStats } from './get-report-stats';
export { handler as getPostDetail } from './get-post-detail';
export { handler as getCommentDetail } from './get-comment-detail';
export { handler as reviewPost } from './review-post';
export { handler as deletePost } from './delete-post';
export { handler as restorePost } from './restore-post';
export { handler as takeAction } from './take-action';
export { handler as takeCommentAction } from './take-comment-action';

// Appeal Handlers
export { handler as getAppeals } from './get-appeals';
export { handler as reviewAppeal } from './review-appeal';
export { handler as submitAppeal } from './submit-appeal';

// User Sync Handler
export { handler as syncUsers } from './sync-users';

// System Monitoring Handlers
export { handler as getStats } from './get-stats';
export { handler as getHealth } from './get-health';
export { handler as getMetrics } from './get-metrics';
export { handler as getCosts } from './get-costs';
export { handler as getActivity } from './get-activity';

// Archive Handlers
export { handler as archiveReports } from './archive-reports';
export { handler as archiveActivity } from './archive-activity';
export { handler as streamArchive } from './stream-archive';
