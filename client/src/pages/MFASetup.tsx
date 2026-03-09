/**
 * MFASetup page — generates a TOTP secret and displays a QR code for the user
 * to scan with their authenticator app, then verifies the first code.
 * Accessible from the user menu for any authenticated user.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api';

type Step = 'loading' | 'scan' | 'verify' | 'done' | 'error';

const MFASetup: React.FC = () => {
  const navigate = useNavigate();

  const [step, setStep]               = useState<Step>('loading');
  const [qrCodeDataUrl, setQrCode]    = useState('');
  const [secret, setSecret]           = useState('');
  const [code, setCode]               = useState('');
  const [error, setError]             = useState('');
  const [verifying, setVerifying]     = useState(false);

  useEffect(() => {
    authApi
      .mfaSetup()
      .then(({ data }) => {
        if (data.success) {
          setQrCode(data.data.qrCodeDataUrl);
          setSecret(data.data.secret);
          setStep('scan');
        } else {
          setError('Failed to generate MFA secret. Please try again.');
          setStep('error');
        }
      })
      .catch(() => {
        setError('Failed to contact the server. Please try again later.');
        setStep('error');
      });
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      const { data } = await authApi.mfaVerify(code);
      if (data.success) {
        setStep('done');
        setTimeout(() => navigate('/dashboard'), 3000);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Invalid code. Please try again.';
      setError(msg);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 shadow">
      <h2 className="mb-1 text-xl font-bold text-gray-900">Set up Two-Factor Authentication</h2>
      <p className="mb-6 text-sm text-gray-500">
        Secure your account with a time-based one-time password (TOTP) app such as Google
        Authenticator or Authy.
      </p>

      {step === 'loading' && (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-600 border-t-transparent" />
        </div>
      )}

      {step === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'scan' && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-4">
            <img
              src={qrCodeDataUrl}
              alt="MFA QR code"
              className="h-52 w-52 rounded-lg border border-gray-200 p-2"
            />
            <p className="text-xs text-gray-500">
              Can&apos;t scan? Enter this key manually:
            </p>
            <code className="rounded bg-gray-100 px-3 py-1 text-xs font-mono text-gray-700 break-all select-all">
              {secret}
            </code>
          </div>

          <button
            onClick={() => setStep('verify')}
            className="w-full rounded-lg bg-helix-600 px-4 py-2.5 text-sm font-semibold
                       text-white hover:bg-helix-700"
          >
            I&apos;ve scanned the QR code →
          </button>
        </div>
      )}

      {step === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-5">
          <p className="text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app to confirm setup.
          </p>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-2xl
                         tracking-widest shadow-sm focus:border-helix-500 focus:outline-none
                         focus:ring-2 focus:ring-helix-200"
              placeholder="000000"
            />
          </div>

          <button
            type="submit"
            disabled={verifying || code.length !== 6}
            className="w-full rounded-lg bg-helix-600 px-4 py-2.5 text-sm font-semibold
                       text-white hover:bg-helix-700 disabled:opacity-60"
          >
            {verifying ? 'Verifying…' : 'Enable MFA'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="text-center">
          <div className="mb-4 text-5xl">✅</div>
          <p className="font-semibold text-green-700">MFA enabled successfully!</p>
          <p className="mt-1 text-sm text-gray-500">Redirecting to dashboard…</p>
        </div>
      )}
    </div>
  );
};

export default MFASetup;
