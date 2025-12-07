/**
 * Token Helper
 */

export function getIdToken(): string | null {
  return localStorage.getItem('idToken');
}

export function isTokenExpiringSoon(): boolean {
  // Check if token is expiring soon
  return false;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getIdToken();
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

