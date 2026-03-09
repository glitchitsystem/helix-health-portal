/**
 * AuthContext — provides the authenticated user, access token, and auth
 * actions (login, logout, refresh) to the entire React component tree.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { authApi, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../services/api';
import { AuthContextValue, AuthUser } from '../types';

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Provides authentication state and actions to the component tree.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(
    () => localStorage.getItem(ACCESS_TOKEN_KEY),
  );
  const [isLoading, setIsLoading] = useState(true);

  // Track the refresh token in a ref so interceptors always see the latest
  const refreshTokenRef = useRef<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY));

  // ── Derive user from stored token on mount ─────────────────────────────────
  useEffect(() => {
    const storedAccess  = localStorage.getItem(ACCESS_TOKEN_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY);

    if (!storedAccess || !storedRefresh) {
      setIsLoading(false);
      return;
    }

    // Decode user info from the JWT (no verification — server validates)
    try {
      const payload = JSON.parse(atob(storedAccess.split('.')[1])) as {
        sub: number;
        email: string;
        roles: string[];
        exp: number;
      };

      if (payload.exp * 1000 > Date.now()) {
        setUser({ id: payload.sub, email: payload.email, roles: payload.roles });
        setAccessToken(storedAccess);
      } else {
        // Expired — attempt silent refresh
        refresh().finally(() => setIsLoading(false));
        return;
      }
    } catch {
      // Malformed token — clear storage
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }

    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<string | null | { mfaRequired: true; mfaChallengeToken: string }> => {
      try {
        const { data } = await authApi.login(email, password);
        const payload = data.data as
          | { mfaRequired: true; mfaChallengeToken: string }
          | { accessToken: string; refreshToken: string; user: AuthUser };

        if ('mfaRequired' in payload && payload.mfaRequired) {
          return payload;
        }

        const { accessToken: at, refreshToken: rt, user: u } = payload as {
          accessToken: string;
          refreshToken: string;
          user: AuthUser;
        };

        localStorage.setItem(ACCESS_TOKEN_KEY, at);
        localStorage.setItem(REFRESH_TOKEN_KEY, rt);
        refreshTokenRef.current = rt;

        setAccessToken(at);
        setUser(u);
        return null; // success
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Login failed. Please try again.';
        return message;
      }
    },
    [],
  );

  // ── logout ─────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    try {
      if (rt) await authApi.logout(rt);
    } catch {
      // Ignore errors on logout — clear local state regardless
    } finally {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      refreshTokenRef.current = null;
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  // ── refresh ────────────────────────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<boolean> => {
    const rt = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!rt) return false;

    try {
      const { data } = await authApi.refresh(rt);
      const { accessToken: at, refreshToken: newRt } = data.data as {
        accessToken: string;
        refreshToken: string;
      };

      localStorage.setItem(ACCESS_TOKEN_KEY, at);
      localStorage.setItem(REFRESH_TOKEN_KEY, newRt);
      refreshTokenRef.current = newRt;

      // Decode user from new access token
      const payload = JSON.parse(atob(at.split('.')[1])) as {
        sub: number;
        email: string;
        roles: string[];
      };
      setUser({ id: payload.sub, email: payload.email, roles: payload.roles });
      setAccessToken(at);
      return true;
    } catch {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      setUser(null);
      setAccessToken(null);
      return false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      refresh,
    }),
    [user, accessToken, isLoading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication context. Must be used inside <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
