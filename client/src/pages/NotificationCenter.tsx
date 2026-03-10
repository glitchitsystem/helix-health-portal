/**
 * NotificationCenter — lists all in-app notifications for the current user.
 * Route: /notifications
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AppNotification } from '../types';

const TYPE_ICON: Record<string, string> = {
  new_message:              '✉️',
  appointment_reminder:     '📅',
  appointment_cancelled:    '❌',
  appointment_rescheduled:  '🔄',
  lab_result:               '🔬',
  refill_approved:          '✅',
  refill_denied:            '❌',
};

const TYPE_ROUTE: Record<string, (data: any) => string | null> = {
  new_message:              (d) => d?.thread_id ? `/messages/threads/${d.thread_id}` : '/messages',
  appointment_reminder:     (d) => d?.appointment_id ? `/appointments` : null,
  appointment_cancelled:    ()  => '/appointments',
  appointment_rescheduled:  ()  => '/appointments',
  lab_result:               ()  => '/labs',
  refill_approved:          ()  => '/prescriptions',
  refill_denied:            ()  => '/prescriptions',
};

function parseData(json: string | null): any {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [unreadOnly, setUnreadOnly]       = useState(false);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/notifications', { params: unreadOnly ? { unread_only: 'true' } : {} });
      setNotifications(r.data?.data?.notifications ?? []);
      setUnreadCount(r.data?.data?.unread_count ?? 0);
    } catch {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [unreadOnly]);

  async function markAllRead() {
    try {
      await api.put('/notifications/read-all');
      load();
    } catch { /* noop */ }
  }

  async function handleClick(notification: AppNotification) {
    // Mark as read
    if (!notification.is_read) {
      await api.put(`/notifications/${notification.id}/read`).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => n.id === notification.id ? { ...n, is_read: 1, read_at: new Date().toISOString() } : n),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    // Navigate to linked resource
    const data = parseData(notification.data_json);
    const routeFn = TYPE_ROUTE[notification.type];
    const route = routeFn ? routeFn(data) : null;
    if (route) navigate(route);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-500 mt-1">{unreadCount} unread</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/notifications/preferences"
            className="text-sm text-blue-600 hover:underline"
          >
            ⚙ Preferences
          </Link>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Unread filter */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${!unreadOnly ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          All
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${unreadOnly ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Unread only
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-gray-500">Loading notifications…</p>
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-gray-500 text-sm">No notifications.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {notifications.map((n) => {
            const isUnread = !n.is_read;
            const icon = TYPE_ICON[n.type] ?? '🔔';
            return (
              <li key={n.id}>
                <button
                  onClick={() => handleClick(n)}
                  className={`w-full flex items-start gap-3 py-4 px-2 text-left hover:bg-gray-50 rounded-md transition-colors ${
                    isUnread ? 'bg-blue-50' : ''
                  }`}
                >
                  <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {n.title}
                      </p>
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{n.body}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
