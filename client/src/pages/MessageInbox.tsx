/**
 * MessageInbox — lists all message threads for the current user.
 * Route: /messages
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { MessageThread } from '../types';

export default function MessageInbox() {
  const navigate = useNavigate();
  const [threads, setThreads]     = useState<MessageThread[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [archived, setArchived]   = useState(false);

  async function loadThreads() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/messages/threads', { params: archived ? { archived: 'true' } : {} });
      setThreads(r.data?.data ?? []);
    } catch {
      setError('Failed to load messages.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThreads(); }, [archived]);

  async function archiveThread(e: React.MouseEvent, threadId: number) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await api.post(`/messages/threads/${threadId}/archive`);
      loadThreads();
    } catch {
      // ignore — user feedback via reload failure
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <button
          onClick={() => navigate('/messages/new')}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          ✉️ Compose
        </button>
      </div>

      {/* Archive toggle */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        <button
          onClick={() => setArchived(false)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${!archived ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Inbox
        </button>
        <button
          onClick={() => setArchived(true)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${archived ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          Archived
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-gray-500">Loading messages…</p>
        </div>
      ) : threads.length === 0 ? (
        <p className="text-gray-500 text-sm">No messages found.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {threads.map((t) => {
            const hasUnread = (t.unread_count ?? 0) > 0;
            return (
              <li key={t.id}>
                <Link
                  to={`/messages/threads/${t.id}`}
                  className={`flex items-start justify-between py-4 px-2 hover:bg-gray-50 rounded-md transition-colors ${hasUnread ? 'bg-blue-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {hasUnread && (
                        <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-blue-600 text-white">
                          {t.unread_count}
                        </span>
                      )}
                      <p className={`text-sm truncate ${hasUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {t.subject}
                      </p>
                    </div>
                    {t.last_message && (
                      <p className="text-xs text-gray-500 truncate">{t.last_message}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">{new Date(t.updated_at).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={(e) => archiveThread(e, t.id)}
                    title="Archive thread"
                    className="ml-4 text-gray-400 hover:text-gray-600 text-xs shrink-0"
                  >
                    Archive
                  </button>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
