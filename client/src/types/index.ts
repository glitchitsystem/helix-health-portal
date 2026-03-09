/**
 * Shared TypeScript types for the Helix Health Portal client.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  roles: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginMfaResponse {
  mfaRequired: true;
  mfaChallengeToken: string;
}

// ─── API wrappers ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Context ──────────────────────────────────────────────────────────────────

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Returns null on success, error message string on failure */
  login: (email: string, password: string) => Promise<string | null | { mfaRequired: true; mfaChallengeToken: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}
