/**
 * ResetPassword page — confirm a password reset using the token from the email link.
 * Reads ?token= from the URL query string.
 */

import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/api';

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const token          = searchParams.get('token') ?? '';

  const [newPassword, setNewPassword]   = useState('');
  const [confirmPwd, setConfirmPwd]     = useState('');
  const [error, setError]               = useState('');
  const [message, setMessage]           = useState('');
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!token) {
      setError('Invalid or missing reset token. Please request a new link.');
      return;
    }

    if (newPassword !== confirmPwd) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.resetPassword(token, newPassword);
      if (data.success) {
        setMessage(data.data.message);
        setTimeout(() => navigate('/login'), 3000);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Password reset failed. The link may have expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-helix-50 to-helix-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🔒</div>
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
          <p className="mt-1 text-sm text-gray-500">Choose a strong new password.</p>
        </div>

        {!token && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            No reset token found in the URL. Please click the link from your email.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {message} Redirecting to login…
            </div>
          )}

          <div>
            <label htmlFor="newPassword" className="mb-1 block text-sm font-medium text-gray-700">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                         focus:border-helix-500 focus:outline-none focus:ring-2 focus:ring-helix-200"
              placeholder="Min. 8 chars, upper, lower, digit, symbol"
              disabled={!token || !!message}
            />
          </div>

          <div>
            <label htmlFor="confirmPwd" className="mb-1 block text-sm font-medium text-gray-700">
              Confirm new password
            </label>
            <input
              id="confirmPwd"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm
                         focus:border-helix-500 focus:outline-none focus:ring-2 focus:ring-helix-200"
              placeholder="••••••••"
              disabled={!token || !!message}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token || !!message}
            className="w-full rounded-lg bg-helix-600 px-4 py-2.5 text-sm font-semibold
                       text-white shadow hover:bg-helix-700 focus:outline-none
                       focus:ring-2 focus:ring-helix-500 focus:ring-offset-2
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Resetting…' : 'Reset password'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          <Link to="/login" className="font-medium text-helix-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default ResetPassword;
