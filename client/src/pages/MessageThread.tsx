/**
 * MessageThread — full conversation view for a single message thread.
 * Route: /messages/threads/:id
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Message, MessageThread, ThreadParticipant } from '../types';

export default function MessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [thread, setThread]             = useState<MessageThread | null>(null);
  const [messages, setMessages]         = useState<Message[]>([]);
  const [participants, setParticipants] = useState<ThreadParticipant[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // Reply form
  const [replyBody, setReplyBody]           = useState('');
  const [replyPriority, setReplyPriority]   = useState(false);
  const [sending, setSending]               = useState(false);
  const [sendError, setSendError]           = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadThread() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/messages/threads/${id}`);
      const { thread: t, messages: msgs, participants: parts } = r.data?.data ?? {};
      setThread(t ?? null);
      setMessages(msgs ?? []);
      setParticipants(parts ?? []);
      // Mark as read
      await api.put(`/messages/threads/${id}/read`).catch(() => {});
    } catch {
      setError('Failed to load conversation.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadThread(); }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendReply() {
    if (!replyBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await api.post(`/messages/threads/${id}/messages`, {
        body: replyBody.trim(),
        is_priority: replyPriority ? 1 : 0,
      });
      setMessages((prev) => [...prev, r.data?.data]);
      setReplyBody('');
      setReplyPriority(false);
    } catch (err: any) {
      setSendError(err.response?.data?.error ?? 'Failed to send reply.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-500">Loading conversation…</p>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-red-600 text-sm">{error ?? 'Thread not found.'}</p>
        <Link to="/messages" className="text-blue-600 text-sm underline mt-2 inline-block">← Back to Inbox</Link>
      </div>
    );
  }

  const isArchived = thread.is_archived === 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col" style={{ minHeight: '80vh' }}>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link to="/messages" className="text-blue-600 text-sm hover:underline">← Inbox</Link>
      </div>

      {/* Thread header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{thread.subject}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Participants: {participants.map((p) => p.email).join(', ')}
        </p>
        {isArchived && (
          <span className="inline-flex mt-2 items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            Archived
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto mb-6">
        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] rounded-lg px-4 py-3 ${
                isOwn ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
              }`}>
                {msg.is_priority === 1 && (
                  <p className={`text-xs font-semibold mb-1 ${isOwn ? 'text-blue-200' : 'text-orange-600'}`}>
                    ⚠ Priority
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                <p className={`text-xs mt-2 ${isOwn ? 'text-blue-200' : 'text-gray-400'}`}>
                  {msg.sender_email ?? `User #${msg.sender_id}`} · {new Date(msg.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply composer */}
      {!isArchived && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          {sendError && (
            <p className="text-red-600 text-xs mb-2">{sendError}</p>
          )}
          <textarea
            rows={3}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Type a reply…"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={replyPriority}
                onChange={(e) => setReplyPriority(e.target.checked)}
              />
              Mark as priority
            </label>
            <button
              onClick={sendReply}
              disabled={sending || !replyBody.trim()}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </div>
      )}

      {isArchived && (
        <p className="text-center text-sm text-gray-500 mt-4">This thread is archived. Replies are disabled.</p>
      )}
    </div>
  );
}
