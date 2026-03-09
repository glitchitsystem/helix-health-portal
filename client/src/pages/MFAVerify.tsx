/**
 * MFAVerify page — second step of MFA login.
 * Receives the mfaChallengeToken via router state and collects the TOTP code.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const MFAVerify: React.FC = () => {
  const location              = useLocation();
  const navigate              = useNavigate();
  const { refresh }           = useAuth();

  const mfaChallengeToken =
    (location.state as { mfaChallengeToken?: string } | null)?.mfaChallengeToken ?? '';

  const [code, setCode]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mfaChallengeToken) {
      navigate('/login', { replace: true });
    }
  }, [mfaChallengeToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authApi.mfaValidate(mfaChallengeToken, code);
      if (data.success) {
        const { accessToken, refreshToken } = data.data as {
          accessToken: string;
          refreshToken: string;
        };
        localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        await refresh();
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Invalid code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-helix-50 to-helix-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🔐</div>
          <h1 className="text-xl font-bold text-gray-900">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">
              Authenticator code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-center text-3xl
                         tracking-[0.6em] shadow-sm focus:border-helix-500 focus:outline-none
                         focus:ring-2 focus:ring-helix-200"
              placeholder="——————"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-lg bg-helix-600 px-4 py-2.5 text-sm font-semibold
                       text-white shadow hover:bg-helix-700 focus:outline-none
                       focus:ring-2 focus:ring-helix-500 focus:ring-offset-2
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default MFAVerify;
