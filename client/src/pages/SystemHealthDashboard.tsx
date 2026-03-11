/**
 * SystemHealthDashboard — real-time system health: DB size, sessions, uptime.
 * Auto-refreshes every 30 seconds.
 * Route: /admin/system-health (admin only)
 */

import React, { useEffect, useState, useCallback } from 'react';
import api from '../services/api';

interface HealthData {
  db_size_mb: number;
  active_sessions: number;
  totals: {
    users: number;
    patients: number;
    appointments: number;
    messages: number;
  };
  uptime_seconds: number;
  node_version: string;
  timestamp: string;
  recent_audit_events: { event_type: string; count: number }[];
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

const SystemHealthDashboard: React.FC = () => {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);

  const fetchHealth = useCallback(() => {
    setError(null);
    api
      .get<HealthData>('/admin/system-health')
      .then((r) => {
        setHealth(r.data);
        setLastRefresh(new Date());
        setCountdown(30);
      })
      .catch(() => setError('Failed to load system health.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  /* Countdown timer */
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 30 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  if (loading) return <div className="p-8 text-gray-500">Loading system health…</div>;
  if (error && !health) return <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="text-xs text-gray-500">
              Last refresh: {lastRefresh.toLocaleTimeString()} · auto-refresh in {countdown}s
            </span>
          )}
          <button
            onClick={fetchHealth}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {error && <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">{error}</div>}

      {health && (
        <>
          {/* Status Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'DB Size', value: `${health.db_size_mb} MB`, icon: '🗄️', color: 'border-blue-400' },
              { label: 'Active Sessions', value: health.active_sessions, icon: '🔑', color: 'border-green-400' },
              { label: 'Uptime', value: formatUptime(health.uptime_seconds), icon: '⏱️', color: 'border-indigo-400' },
              { label: 'Node', value: health.node_version, icon: '🟢', color: 'border-teal-400' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className={`rounded-lg bg-white shadow p-5 border-l-4 ${color}`}>
                <div className="text-2xl mb-1">{icon}</div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1 truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="rounded-lg bg-white shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
              Record Counts
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Object.entries(health.totals).map(([key, val]) => (
                <div key={key} className="text-center">
                  <p className="text-3xl font-bold text-gray-900">{val}</p>
                  <p className="text-xs text-gray-500 capitalize mt-1">{key}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Audit Events */}
          {health.recent_audit_events && health.recent_audit_events.length > 0 && (
            <div className="rounded-lg bg-white shadow overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-700">
                  Audit Events (last 24 hours)
                </h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Event Type
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {health.recent_audit_events.map((evt) => (
                    <tr key={evt.event_type}>
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">
                        {evt.event_type}
                      </td>
                      <td className="px-4 py-2 font-semibold text-gray-900">{evt.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 text-right">
            Server time: {new Date(health.timestamp).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
};

export default SystemHealthDashboard;
