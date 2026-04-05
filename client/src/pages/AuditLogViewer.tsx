/**
 * AuditLogViewer — filterable, paginated audit log with CSV export.
 * Route: /admin/audit-log (admin only)
 */

import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { ApiSuccess } from '../types';

interface AuditEntry {
  id: number;
  user_id: number | null;
  user_email: string | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: string | null;
  created_at: string;
}

interface AuditResponse {
  rows: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

const AuditLogViewer: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Filters */
  const [userId, setUserId] = useState('');
  const [eventType, setEventType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const load = (off = 0) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (eventType) params.set('event_type', eventType);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    params.set('limit', String(limit));
    params.set('offset', String(off));

    api
      .get<ApiSuccess<AuditResponse>>(`/admin/audit-log?${params.toString()}`)
      .then((r) => {
        setEntries(r.data.data.rows);
        setTotal(r.data.data.total);
        setOffset(off);
      })
      .catch(() => setError('Failed to load audit log.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load(0);
  };

  const exportCsv = () => {
    const headers = ['ID', 'Timestamp', 'User', 'Event Type', 'User Agent', 'IP', 'Metadata'];
    const rows = entries.map((e) => [
      e.id,
      e.created_at,
      e.user_email ?? e.user_id ?? '',
      e.event_type,
      e.user_agent ?? '',
      e.ip_address ?? '',
      e.metadata ?? '',
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <button
          onClick={exportCsv}
          disabled={entries.length === 0}
          className="px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {/* Filter form */}
      <form
        onSubmit={handleSearch}
        className="rounded-lg bg-white shadow p-4 grid grid-cols-1 sm:grid-cols-4 gap-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">User ID</label>
          <input
            type="number"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Any"
            className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Event Type</label>
          <input
            type="text"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            placeholder="e.g. LOGIN"
            className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full border rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-4 flex gap-3">
          <button
            type="submit"
            className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => {
              setUserId('');
              setEventType('');
              setDateFrom('');
              setDateTo('');
              load(0);
            }}
            className="px-5 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </form>

      {error && <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>}
      {loading && <p className="text-gray-500">Loading…</p>}

      {/* Results */}
      {!loading && (
        <>
          <p className="text-sm text-gray-500">
            Showing {entries.length} of {total} entries
          </p>
          <div className="rounded-lg bg-white shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  {['Timestamp', 'User', 'Event Type', 'User Agent', 'IP Address', 'Metadata'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                      No entries found.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                        {new Date(entry.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {entry.user_email ?? (entry.user_id ? `#${entry.user_id}` : 'System')}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-700">
                          {entry.event_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {entry.user_agent ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{entry.ip_address ?? '—'}</td>
                      <td className="px-3 py-2 max-w-xs truncate text-gray-500 font-mono">
                        {entry.metadata
                          ? (() => {
                              try {
                                return JSON.stringify(JSON.parse(entry.metadata), null, 0);
                              } catch {
                                return entry.metadata;
                              }
                            })()
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">
                Page {currentPage} of {pages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => load(offset - limit)}
                  disabled={offset === 0}
                  className="px-3 py-1.5 border rounded-md text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  ← Prev
                </button>
                <button
                  onClick={() => load(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3 py-1.5 border rounded-md text-sm disabled:opacity-40 hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AuditLogViewer;
