'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from 'react';

interface CacheEntry {
  url: string;
  status: 'loading' | 'loaded' | 'error';
  timestamp: number;
  blob?: string;
}

interface AvatarCacheContextType {
  getAvatarStatus: (url: string | null | undefined) => 'loading' | 'loaded' | 'error' | 'unknown';
  getPreloadedBlob: (url: string | null | undefined) => string | null;
  preloadAvatar: (url: string | null | undefined) => Promise<boolean>;
  preloadAvatars: (urls: (string | null | undefined)[]) => Promise<void>;
  currentUserAvatar: string | null;
  currentUserAvatarStatus: 'loading' | 'loaded' | 'error' | 'unknown';
  setCurrentUserAvatar: (url: string | null) => void;
  refreshAvatar: (url: string) => Promise<boolean>;
  clearCache: () => void;
}

const AvatarCacheContext = createContext<AvatarCacheContextType | undefined>(undefined);
const CACHE_PREFIX = 'avatar_cache_';
const USER_AVATAR_KEY = 'current_user_avatar';
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

export function AvatarCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const loadingRef = useRef<Map<string, Promise<boolean>>>(new Map());
  const [currentUserAvatar, setCurrentUserAvatarState] = useState<string | null>(null);
  const [currentUserAvatarStatus, setCurrentUserAvatarStatus] = useState<
    'loading' | 'loaded' | 'error' | 'unknown'
  >('unknown');
  const [, forceUpdate] = useState({});

  const hashUrl = (url: string): string => {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash + url.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36);
  };

  const cleanupOldEntries = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      if (keys.length > MAX_ENTRIES) {
        const entries = keys
          .map((key) => {
            try {
              return { key, timestamp: JSON.parse(localStorage.getItem(key) || '').timestamp || 0 };
            } catch {
              return { key, timestamp: 0 };
            }
          })
          .sort((a, b) => a.timestamp - b.timestamp);
        entries
          .slice(0, Math.floor(entries.length * 0.2))
          .forEach(({ key }) => localStorage.removeItem(key));
      }
    } catch {}
  }, []);

  const preloadInternal = useCallback(
    (url: string): Promise<boolean> => {
      const existing = loadingRef.current.get(url);
      if (existing) return existing;
      const cached = cacheRef.current.get(url);
      if (cached?.status === 'loaded') return Promise.resolve(true);

      const promise = new Promise<boolean>((resolve) => {
        cacheRef.current.set(url, { url, status: 'loading', timestamp: Date.now() });
        forceUpdate({});
        const img = new window.Image();
        img.onload = () => {
          cacheRef.current.set(url, { url, status: 'loaded', timestamp: Date.now() });
          try {
            localStorage.setItem(
              CACHE_PREFIX + hashUrl(url),
              JSON.stringify({ url, status: 'loaded', timestamp: Date.now() })
            );
            cleanupOldEntries();
          } catch {}
          loadingRef.current.delete(url);
          forceUpdate({});
          resolve(true);
        };
        img.onerror = () => {
          cacheRef.current.set(url, { url, status: 'error', timestamp: Date.now() });
          loadingRef.current.delete(url);
          forceUpdate({});
          resolve(false);
        };
        img.src = url;
      });
      loadingRef.current.set(url, promise);
      return promise;
    },
    [cleanupOldEntries]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(USER_AVATAR_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.url && Date.now() - parsed.timestamp < MAX_AGE) {
          setCurrentUserAvatarState(parsed.url);
          setCurrentUserAvatarStatus('loading');
          preloadInternal(parsed.url).then((ok) =>
            setCurrentUserAvatarStatus(ok ? 'loaded' : 'error')
          );
        }
      }
    } catch {}
  }, [preloadInternal]);

  const getAvatarStatus = useCallback((url: string | null | undefined) => {
    if (!url) return 'unknown';
    return cacheRef.current.get(url)?.status || 'unknown';
  }, []);

  const getPreloadedBlob = useCallback((url: string | null | undefined) => {
    if (!url) return null;
    return cacheRef.current.get(url)?.blob || null;
  }, []);

  const preloadAvatar = useCallback(
    async (url: string | null | undefined) => (url ? preloadInternal(url) : false),
    [preloadInternal]
  );

  const preloadAvatars = useCallback(
    async (urls: (string | null | undefined)[]) => {
      await Promise.all(urls.filter((u): u is string => !!u).map(preloadInternal));
    },
    [preloadInternal]
  );

  const setCurrentUserAvatar = useCallback(
    (url: string | null) => {
      setCurrentUserAvatarState(url);
      if (url) {
        setCurrentUserAvatarStatus('loading');
        try {
          localStorage.setItem(USER_AVATAR_KEY, JSON.stringify({ url, timestamp: Date.now() }));
        } catch {}
        preloadInternal(url).then((ok) => setCurrentUserAvatarStatus(ok ? 'loaded' : 'error'));
      } else {
        setCurrentUserAvatarStatus('unknown');
        try {
          localStorage.removeItem(USER_AVATAR_KEY);
        } catch {}
      }
    },
    [preloadInternal]
  );

  const refreshAvatar = useCallback(
    async (url: string) => {
      cacheRef.current.delete(url);
      loadingRef.current.delete(url);
      try {
        localStorage.removeItem(CACHE_PREFIX + hashUrl(url));
      } catch {}
      return preloadInternal(url);
    },
    [preloadInternal]
  );

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
    loadingRef.current.clear();
    setCurrentUserAvatarState(null);
    setCurrentUserAvatarStatus('unknown');
    if (typeof window !== 'undefined') {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(CACHE_PREFIX) || k === USER_AVATAR_KEY)
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
    }
    forceUpdate({});
  }, []);

  return (
    <AvatarCacheContext.Provider
      value={{
        getAvatarStatus,
        getPreloadedBlob,
        preloadAvatar,
        preloadAvatars,
        currentUserAvatar,
        currentUserAvatarStatus,
        setCurrentUserAvatar,
        refreshAvatar,
        clearCache,
      }}
    >
      {children}
    </AvatarCacheContext.Provider>
  );
}

export function useAvatarCache() {
  const context = useContext(AvatarCacheContext);
  if (!context) throw new Error('useAvatarCache must be used within AvatarCacheProvider');
  return context;
}

export function useCurrentUserAvatar() {
  const { currentUserAvatar, currentUserAvatarStatus, setCurrentUserAvatar } = useAvatarCache();
  return {
    avatarUrl: currentUserAvatar,
    status: currentUserAvatarStatus,
    setAvatarUrl: setCurrentUserAvatar,
  };
}
