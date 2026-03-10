/**
 * NotificationPreferences — manage notification delivery preferences.
 * Route: /notifications/preferences
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { NotificationPreference } from '../types';

const TYPE_LABELS: Record<string, string> = {
  new_message:             'New Message',
  appointment_reminder:    'Appointment Reminder',
  appointment_cancelled:   'Appointment Cancelled',
  appointment_rescheduled: 'Appointment Rescheduled',
  lab_result:              'Lab Result Available',
  refill_approved:         'Refill Approved',
  refill_denied:           'Refill Denied',
};

export default function NotificationPreferences() {
  const [prefs, setPrefs]       = useState<NotificationPreference[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  useEffect(() => {
    api.get('/notifications/preferences')
      .then((r) => setPrefs(r.data?.data ?? []))
      .catch(() => setError('Failed to load preferences.'))
      .finally(() => setLoading(false));
  }, []);

  function toggle(type: string, field: keyof NotificationPreference) {
    setPrefs((prev) =>
      prev.map((p) =>
        p.notification_type === type
          ? { ...p, [field]: p[field] ? 0 : 1 }
          : p,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.put('/notifications/preferences', prefs);
      setSuccess('Preferences saved.');
      setTimeout(() => setSuccess(null), 4000);
    } catch {
      setError('Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-500">Loading preferences…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/notifications" className="text-blue-600 text-sm hover:underline">← Notifications</Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Notification Preferences</h1>

      {error   && <div className="rounded-md bg-red-50   p-4 mb-4 text-red-700   text-sm">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-4 mb-4 text-green-700 text-sm">{success}</div>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700 w-1/2">Notification Type</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">In-App</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">Email</th>
              <th className="text-center px-4 py-3 font-medium text-gray-700">SMS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {prefs.map((p) => (
              <tr key={p.notification_type} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-800">
                  {TYPE_LABELS[p.notification_type] ?? p.notification_type}
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.in_app_enabled}
                    onChange={() => toggle(p.notification_type, 'in_app_enabled')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.email_enabled}
                    onChange={() => toggle(p.notification_type, 'email_enabled')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={!!p.sms_enabled}
                    onChange={() => toggle(p.notification_type, 'sms_enabled')}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Note: Email and SMS delivery are simulated in this development environment.
      </p>

      <div className="mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Preferences'}
        </button>
      </div>
    </div>
  );
}
