/**
 * NoteViewer — read-only view for clinical notes.
 * Locked notes show an addendum form. Editable notes show "Edit" button.
 *
 * Route: /notes/:noteId
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ClinicalNote, NoteAddendum } from '../types';
import { useAuth } from '../contexts/AuthContext';

const NoteViewer: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addendumContent, setAddendumContent] = useState('');
  const [submittingAddendum, setSubmittingAddendum] = useState(false);
  const [addendumError, setAddendumError] = useState('');
  const [addendumSuccess, setAddendumSuccess] = useState(false);

  const isStaff = user?.roles.some(r => ['admin', 'provider', 'nurse'].includes(r)) ?? false;

  const fetchNote = async () => {
    if (!noteId) return;
    setLoading(true);
    try {
      const r = await api.get<{ data: ClinicalNote & { addenda: NoteAddendum[] } }>(`/notes/${noteId}`);
      setNote(r.data.data);
    } catch {
      setError('Note not found or access denied.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNote(); }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddendum = async () => {
    if (!noteId || !addendumContent.trim()) return;
    setSubmittingAddendum(true);
    setAddendumError('');
    try {
      await api.post(`/notes/${noteId}/addendum`, { content: addendumContent.trim() });
      setAddendumContent('');
      setAddendumSuccess(true);
      setTimeout(() => setAddendumSuccess(false), 3000);
      fetchNote();
    } catch (e: unknown) {
      setAddendumError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to save addendum.'
      );
    } finally {
      setSubmittingAddendum(false);
    }
  };

  if (loading) return <Spinner />;
  if (error || !note) return (
    <div className="py-10 text-center text-sm text-red-600">{error || 'Note not found.'}</div>
  );

  const isLocked = Boolean(note.is_locked);

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link to={`/patients/${note.patient_id}/chart`} className="hover:text-helix-600">
          Patient Chart
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-800">Clinical Note #{note.id}</span>
      </nav>

      {/* Note header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900 capitalize">{note.note_type} Note</h1>
            {isLocked ? (
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-500">
                🔒 Locked
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                ✏️ Editable
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            By {note.provider_email ?? `Provider #${note.provider_id}`} &bull;{' '}
            {formatDateTime(note.created_at)}
            {note.locked_at && ` · Locked ${formatDateTime(note.locked_at)}`}
          </p>
        </div>

        {isStaff && !isLocked && (
          <button
            onClick={() => navigate(`/notes/${note.id}/edit`)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700"
          >
            Edit Note
          </button>
        )}
      </div>

      {/* SOAP content */}
      <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-gray-200">
        {note.appointment_id && (
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700">
            📅 Linked to appointment{' '}
            <Link to={`/appointments/${note.appointment_id}`} className="font-semibold underline">
              #{note.appointment_id}
            </Link>
          </div>
        )}

        <div className="space-y-6">
          <SoapBlock label="S — Subjective" content={note.subjective} />
          <SoapBlock label="O — Objective"  content={note.objective} />
          <SoapBlock label="A — Assessment" content={note.assessment} />
          <SoapBlock label="P — Plan"       content={note.plan} />
        </div>
      </div>

      {/* Addenda */}
      {note.addenda && note.addenda.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
            Addenda ({note.addenda.length})
          </h2>
          <div className="space-y-3">
            {note.addenda.map((a: NoteAddendum) => (
              <div key={a.id} className="rounded-xl border-l-4 border-helix-400 bg-white p-4 shadow-sm">
                <p className="mb-1 text-xs text-gray-500">
                  {a.author_email ?? `User #${a.author_id}`} &bull; {formatDateTime(a.created_at)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-gray-800">{a.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add addendum (only providers/staff, regardless of lock state) */}
      {isStaff && (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h2 className="mb-3 text-sm font-bold text-gray-700">Add Addendum</h2>
          {!isLocked && (
            <p className="mb-3 text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
              Note: The note is still editable. Addenda are typically added after a note is locked.
            </p>
          )}
          {addendumError && (
            <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{addendumError}</div>
          )}
          {addendumSuccess && (
            <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Addendum saved.
            </div>
          )}
          <textarea
            value={addendumContent}
            onChange={e => setAddendumContent(e.target.value)}
            rows={4}
            placeholder="Enter addendum content…"
            className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400"
          />
          <button
            onClick={handleAddendum}
            disabled={submittingAddendum || !addendumContent.trim()}
            className="rounded-lg bg-helix-600 px-5 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60"
          >
            {submittingAddendum ? 'Saving…' : 'Save Addendum'}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SoapBlock: React.FC<{ label: string; content: string | null }> = ({ label, content }) => (
  <div>
    <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</h3>
    {content ? (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{content}</p>
    ) : (
      <p className="text-sm italic text-gray-400">Not documented</p>
    )}
  </div>
);

const Spinner: React.FC = () => (
  <div className="flex justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default NoteViewer;
