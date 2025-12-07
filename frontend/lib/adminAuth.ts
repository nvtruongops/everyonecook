/**
 * Admin Authentication Helper
 * Checks if user belongs to 'admin' group in Cognito
 */

import { fetchAuthSession } from 'aws-amplify/auth';

export interface AdminUser {
  userId: string;
  username: string;
  email: string;
  role: string;
  isAdmin: boolean;
}

/**
 * Decode JWT token payload
 */
function decodeToken(token: string): any {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/**
 * Check if current user is an admin (belongs to 'admin' group in Cognito)
 */
export const isAdmin = async (): Promise<boolean> => {
  try {
    const session = await fetchAuthSession();

    if (!session.tokens?.idToken) {
      return false;
    }

    const idToken = session.tokens.idToken.toString();
    const payload = decodeToken(idToken);

    if (!payload) {
      return false;
    }

    // Check cognito:groups claim for 'Admin' or 'admin' group (case-insensitive)
    const groups: string[] = payload['cognito:groups'] || [];
    const isAdminMember = groups.some((g) => g.toLowerCase() === 'admin');
    return isAdminMember;
  } catch (error) {
    console.error('[AdminAuth] Error checking admin status:', error);
    return false;
  }
};

/**
 * Require admin access - throws error if not admin
 */
export const requireAdmin = async (): Promise<void> => {
  const adminStatus = await isAdmin();
  if (!adminStatus) {
    throw new Error('Admin access required');
  }
};

/**
 * Get admin token (ID token if user is admin)
 */
export const getAdminToken = async (): Promise<string | null> => {
  try {
    const adminStatus = await isAdmin();
    if (!adminStatus) {
      return null;
    }

    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
};

/**
 * Get admin user info from token
 */
export const getAdminUser = async (): Promise<AdminUser | null> => {
  try {
    const session = await fetchAuthSession();

    if (!session.tokens?.idToken) {
      return null;
    }

    const idToken = session.tokens.idToken.toString();
    const payload = decodeToken(idToken);

    if (!payload) {
      return null;
    }

    // Check cognito:groups claim for 'Admin' or 'admin' group (case-insensitive)
    const groups: string[] = payload['cognito:groups'] || [];
    const isAdminUser = groups.some((g) => g.toLowerCase() === 'admin');

    if (!isAdminUser) {
      return null;
    }

    return {
      userId: payload.sub || '',
      username: payload['cognito:username'] || payload.username || '',
      email: payload.email || '',
      role: 'admin',
      isAdmin: true,
    };
  } catch (error) {
    console.error('[AdminAuth] Error getting admin user:', error);
    return null;
  }
};
