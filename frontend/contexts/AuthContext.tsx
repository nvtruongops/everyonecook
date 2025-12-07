'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import type { User } from '@/types';
import { authService } from '@/services/auth-service';
import { configureCognito } from '@/lib/auth/cognito-config';
import { setAuthGetters } from '@/services/savedRecipes';
import { useAvatarCache } from './AvatarCacheContext';

if (typeof window !== 'undefined') configureCognito();

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loading: boolean;
  avatarUrl: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  register: (username: string, email: string, password: string, fullName: string) => Promise<void>;
  refreshToken: () => Promise<string | null>;
  updateAvatar: (newAvatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const usernameRef = useRef<string | null>(null);
  const { setCurrentUserAvatar, clearCache: clearAvatarCache } = useAvatarCache();

  useEffect(() => {
    tokenRef.current = token;
    usernameRef.current = user?.username || null;
  }, [token, user]);
  useEffect(() => {
    if (user?.avatarUrl) setCurrentUserAvatar(user.avatarUrl);
  }, [user?.avatarUrl, setCurrentUserAvatar]);
  useEffect(() => {
    setAuthGetters(
      () => tokenRef.current,
      () => usernameRef.current
    );
  }, []);
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    const interval = setInterval(
      async () => {
        try {
          const newToken = await authService.getAccessToken(true);
          if (newToken) setToken(newToken);
          else await logout();
        } catch {
          await logout();
        }
      },
      50 * 60 * 1000
    );
    return () => clearInterval(interval);
  }, [user]);

  const checkAuth = async () => {
    try {
      if (await authService.isAuthenticated()) {
        const cognitoUser = await authService.getCurrentUser();
        const accessToken = await authService.getAccessToken();
        if (cognitoUser && accessToken) {
          try {
            localStorage.setItem('lastUsername', cognitoUser.username);
          } catch {}
          const cachedAvatar = localStorage.getItem('userAvatarUrl') || undefined;
          if (cachedAvatar) setCurrentUserAvatar(cachedAvatar);
          setUser({
            userId: cognitoUser.userId,
            sub: cognitoUser.userId,
            username: cognitoUser.username,
            email: cognitoUser.email,
            fullName: cognitoUser.fullName || cognitoUser.username,
            avatarUrl: cachedAvatar,
            isActive: true,
            isBanned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          setToken(accessToken);
        }
      }
    } catch (error: any) {
      const msg = error?.message || '';
      if (msg.includes('disabled')) {
        const username = localStorage.getItem('lastUsername') || '';
        setUser(null);
        setToken(null);
        if (typeof window !== 'undefined') {
          window.location.href = username
            ? `/banned?username=${encodeURIComponent(username)}`
            : '/banned';
          return;
        }
      }
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await authService.login({ username, password });
      if (result.success) {
        await new Promise((r) => setTimeout(r, 2000));
        let cognitoUser = null,
          accessToken = null,
          retries = 0;
        while (retries < 3 && (!cognitoUser || !accessToken)) {
          cognitoUser = await authService.getCurrentUser();
          accessToken = await authService.getAccessToken(true);
          if (!cognitoUser || !accessToken) {
            retries++;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        if (cognitoUser && accessToken) {
          try {
            localStorage.setItem('lastUsername', cognitoUser.username);
          } catch {}
          const cachedAvatar = localStorage.getItem('userAvatarUrl') || undefined;
          if (cachedAvatar) setCurrentUserAvatar(cachedAvatar);
          setUser({
            userId: cognitoUser.userId,
            sub: cognitoUser.userId,
            username: cognitoUser.username,
            email: cognitoUser.email,
            fullName: cognitoUser.fullName || cognitoUser.username,
            avatarUrl: cachedAvatar,
            isActive: true,
            isBanned: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          setToken(accessToken);
          setTimeout(async () => {
            try {
              const { default: apiClient } = await import('@/lib/api/client');
              const res = await apiClient.get('/users/profile');
              const avatarUrl = res.data?.data?.profile?.avatarUrl || res.data?.data?.avatarUrl;
              if (avatarUrl) {
                setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
                setCurrentUserAvatar(avatarUrl);
                try {
                  localStorage.setItem('userAvatarUrl', avatarUrl);
                } catch {}
              }
            } catch {}
          }, 1000);
        } else throw new Error('Failed to establish session');
      } else if (result.requiresVerification) throw new Error('Please verify your email');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch {}
    setUser(null);
    setToken(null);
    clearAvatarCache();
    try {
      localStorage.removeItem('userAvatarUrl');
    } catch {}
  };

  const register = async (username: string, email: string, password: string, fullName: string) => {
    setIsLoading(true);
    try {
      const result = await authService.register({ username, email, password, fullName });
      if (!result.success) throw new Error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshToken = async (): Promise<string | null> => {
    try {
      const newToken = await authService.getAccessToken(true);
      if (newToken) {
        setToken(newToken);
        return newToken;
      }
      return null;
    } catch {
      return null;
    }
  };

  const updateAvatar = (newAvatarUrl: string) => {
    if (user) {
      setUser({ ...user, avatarUrl: newAvatarUrl });
      try {
        localStorage.setItem('userAvatarUrl', newAvatarUrl);
      } catch {}
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        loading: isLoading,
        avatarUrl: user?.avatarUrl || null,
        login,
        logout,
        signOut: logout,
        register,
        refreshToken,
        updateAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
