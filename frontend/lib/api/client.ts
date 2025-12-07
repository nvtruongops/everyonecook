/**
 * API Client - Base HTTP client for backend API communication
 *
 * Features:
 * - Automatic JWT token injection
 * - Request/response interceptors
 * - Error handling
 * - Token refresh logic
 */

import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// API base URL from environment
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - Add JWT token to requests
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    // Skip token for public endpoints
    const publicEndpoints = ['/users/username/check', '/health', '/status'];
    const isPublicEndpoint = publicEndpoints.some((endpoint) => config.url?.includes(endpoint));

    if (isPublicEndpoint) {
      return config;
    }

    // Get token from AWS Amplify (not localStorage)
    if (typeof window !== 'undefined') {
      try {
        // Dynamically import to avoid SSR issues
        const { authService } = await import('@/services/auth-service');

        // Always get fresh token - Amplify handles caching internally
        // Pass true to force check expiration and refresh if needed
        const token = await authService.getAccessToken(false);

        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        } else if (!isPublicEndpoint) {
          console.warn('[API Client] No token available for protected request:', config.url);
          // Try to force refresh once
          const refreshedToken = await authService.getAccessToken(true);
          if (refreshedToken && config.headers) {
            config.headers.Authorization = `Bearer ${refreshedToken}`;
          }
        }
      } catch (error) {
        console.error('[API Client] Failed to get access token for', config.url, error);
      }
    }

    // Add correlation ID for request tracking
    const correlationId =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('correlationId') || generateCorrelationId()
        : generateCorrelationId();

    if (config.headers) {
      config.headers['X-Correlation-ID'] = correlationId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors and token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _retryCount?: number;
    };

    // Initialize retry count
    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 0;
    }

    // Check if user is banned (Cognito disabled user returns specific error)
    const errorData = error.response?.data as any;
    const isBannedError =
      error.response?.status === 403 &&
      (errorData?.message?.includes('User is disabled') ||
        errorData?.error?.includes('disabled') ||
        errorData?.code === 'UserDisabledException');

    if (isBannedError && typeof window !== 'undefined') {
      console.warn('[API Client] User is banned, redirecting to banned page...');
      try {
        const { authService } = await import('@/services/auth-service');
        // Get username before logout
        const currentUser = await authService.getCurrentUser();
        const username = currentUser?.username;
        // Clear local auth state
        await authService.logout();
        // Redirect to banned page with username
        if (username) {
          window.location.href = `/banned?username=${encodeURIComponent(username)}`;
        } else {
          window.location.href = '/banned';
        }
      } catch (e) {
        console.error('[API Client] Failed to handle banned user:', e);
        window.location.href = '/banned';
      }
      return Promise.reject(error);
    }

    // Handle 401/403 - Token expired or invalid (from Cognito Authorizer)
    // 403 from API Gateway Cognito Authorizer means token is invalid/expired
    if (
      (error.response?.status === 401 || error.response?.status === 403) &&
      originalRequest._retryCount < 2 // Max 2 retries
    ) {
      originalRequest._retryCount++;
      console.log(
        `[API Client] ${error.response?.status} error, attempting token refresh (attempt ${originalRequest._retryCount})...`
      );

      try {
        if (typeof window !== 'undefined') {
          const { authService } = await import('@/services/auth-service');

          // Check if user is still authenticated
          const isAuth = await authService.isAuthenticated();
          if (!isAuth) {
            console.warn('[API Client] User not authenticated, redirecting to login...');
            window.location.href = '/login';
            return Promise.reject(error);
          }

          // Force refresh the token from AWS Amplify
          const newToken = await authService.getAccessToken(true); // Force refresh

          if (newToken && originalRequest.headers) {
            console.log('[API Client] Token refreshed successfully, retrying request...');
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }

          // If no token available after refresh, redirect to login
          console.warn('[API Client] No token available after refresh, redirecting to login...');
          window.location.href = '/login';
        }
      } catch (refreshError: any) {
        // Token refresh failed - check if it's because user is banned
        if (
          refreshError?.message?.includes('disabled') ||
          refreshError?.code === 'UserDisabledException'
        ) {
          console.warn('[API Client] User is banned during token refresh');
          try {
            const { authService } = await import('@/services/auth-service');
            const currentUser = await authService.getCurrentUser();
            const username = currentUser?.username;
            await authService.logout();
            if (username) {
              window.location.href = `/banned?username=${encodeURIComponent(username)}`;
            } else {
              window.location.href = '/banned';
            }
          } catch (e) {
            window.location.href = '/banned';
          }
          return Promise.reject(refreshError);
        }

        console.error('[API Client] Token refresh failed:', refreshError);
        // Only redirect on final retry
        if (originalRequest._retryCount >= 2 && typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // Handle other errors
    return Promise.reject(error);
  }
);

// Helper function to generate correlation ID
function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Export API client
export default apiClient;

// Export helper types
export type { AxiosError, AxiosResponse } from 'axios';
