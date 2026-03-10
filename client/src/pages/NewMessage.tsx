/**
 * NewMessage — compose a new message thread.
 * Route: /messages/new
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Recipient {
  id: number;
  email: string;
  label: string;
}

export default function NewMessage() {
  const navigate = useNavigate();
  const { user }  = useAuth();

  const [recipients, setRecipients]       = useState<Recipient[]>([]);
  const [recipientSearch, setSearch]      = useState('');
  const [selectedIds, setSelectedIds]     = useState<number[]>([]);
  const [subject, setSubject]             = useState('');
  const [body, setBody]                   = useState('');
  const [loading, setLoading]             = useState(false);
  const [loadingRecipients, setLR]        = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);

  // Patients see providers; providers/nurses/admin see patients
  const isPatient = user?.roles.includes('patient') ?? false;

  useEffect(() => {
    const endpoint = isPatient ? '/providers' : '/patients';
    setLR(true);
    api.get(endpoint)
      .then((r) => {
        const data = r.data?.data ?? [];
        const mapped: Recipient[] = data.map((item: any) => ({
          id: item.user_id ?? item.id,
          email: item.email ?? item.user_email ?? '',
          label: item.email ?? item.user_email ?? `User #${item.id}`,
        }));
        setRecipients(mapped);
      })
      .catch(() => setError('Failed to load recipients.'))
      .finally(() => setLR(false));
  }, [isPatient]);

  function toggleRecipient(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.length === 0) { setError('Select at least one recipient.'); return; }
    if (!body.trim())             { setError('Message body is required.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post('/messages/threads', {
        subject: subject.trim() || '(No subject)',
        body: body.trim(),
        participant_ids: selectedIds,
      });
      const threadId = r.data?.data?.thread_id;
      navigate(threadId ? `/messages/threads/${threadId}` : '/messages');
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to send message.');
      setSubmitting(false);
    }
  }

  const filtered = recipients.filter((r) =>
    r.label.toLowerCase().includes(recipientSearch.toLowerCase()),
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Message</h1>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Recipient picker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            To ({isPatient ? 'Providers' : 'Patients'})
          </label>
          <input
            type="text"
            placeholder="Search by email…"
            value={recipientSearch}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
            {loadingRecipients ? (
              <p className="text-sm text-gray-400 p-3">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 p-3">No recipients found.</p>
            ) : (
              filtered.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${
                    selectedIds.includes(r.id) ? 'bg-blue-50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleRecipient(r.id)}
                  />
                  <span className="text-sm text-gray-800">{r.label}</span>
                </label>
              ))
            )}
          </div>
          {selectedIds.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {selectedIds.length} recipient{selectedIds.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            placeholder="(optional)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message*</label>
          <textarea
            rows={6}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message here…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
          >
            {submitting ? 'Sending…' : 'Send Message'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/messages')}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
