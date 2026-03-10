/**
 * NoteEditor — SOAP note editor for providers.
 *
 * Route: /patients/:patientId/notes/new  |  /notes/:noteId/edit
 * Features: template picker, autosave draft to localStorage, submit to API.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { NoteTemplate, ClinicalNote } from '../types';

const AUTOSAVE_KEY = (id: string) => `helix_note_draft_${id}`;
const AUTOSAVE_INTERVAL_MS = 5000;

interface SoapForm {
  note_type: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const EMPTY_FORM: SoapForm = {
  note_type: 'soap',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
};

const NoteEditor: React.FC = () => {
  const { patientId, noteId } = useParams<{ patientId?: string; noteId?: string }>();
  const navigate = useNavigate();

  const isEditMode = Boolean(noteId);
  const draftKey = isEditMode ? AUTOSAVE_KEY(`edit-${noteId}`) : AUTOSAVE_KEY(`new-${patientId}`);

  const [form, setForm] = useState<SoapForm>(EMPTY_FORM);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditMode);
  const [error, setError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load templates
  useEffect(() => {
    api.get<{ data: NoteTemplate[] }>('/note-templates')
      .then(r => setTemplates(r.data.data))
      .catch(() => {/* templates are optional */});
  }, []);

  // Load existing note in edit mode
  useEffect(() => {
    if (!isEditMode || !noteId) return;
    api.get<{ data: ClinicalNote }>(`/notes/${noteId}`)
      .then(r => {
        const note = r.data.data;
        if (note.is_locked) {
          navigate(`/notes/${noteId}`, { replace: true });
          return;
        }
        // Check for newer autosave draft
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as SoapForm;
          setForm(parsed);
          setLastSaved('Draft restored from autosave');
        } else {
          setForm({
            note_type: note.note_type,
            subjective: note.subjective ?? '',
            objective: note.objective ?? '',
            assessment: note.assessment ?? '',
            plan: note.plan ?? '',
          });
        }
      })
      .catch(() => setError('Note not found.'))
      .finally(() => setLoading(false));
  }, [noteId, isEditMode, draftKey, navigate]);

  // Restore draft for new notes
  useEffect(() => {
    if (isEditMode) return;
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as SoapForm;
        setForm(parsed);
        setLastSaved('Draft restored');
      } catch { /* ignore */ }
    }
  }, [draftKey, isEditMode]);

  // Autosave to localStorage
  const saveDraft = useCallback(() => {
    localStorage.setItem(draftKey, JSON.stringify(form));
    setLastSaved(new Date().toLocaleTimeString());
  }, [draftKey, form]);

  useEffect(() => {
    autosaveTimer.current = setInterval(saveDraft, AUTOSAVE_INTERVAL_MS);
    return () => { if (autosaveTimer.current) clearInterval(autosaveTimer.current); };
  }, [saveDraft]);

  const applyTemplate = (t: NoteTemplate) => {
    setForm(f => ({
      ...f,
      note_type: t.note_type,
      subjective: t.subjective_template ?? f.subjective,
      objective: t.objective_template ?? f.objective,
      assessment: t.assessment_template ?? f.assessment,
      plan: t.plan_template ?? f.plan,
    }));
    setShowTemplates(false);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      if (isEditMode && noteId) {
        await api.put(`/notes/${noteId}`, form);
        localStorage.removeItem(draftKey);
        navigate(`/notes/${noteId}`);
      } else if (patientId) {
        const r = await api.post<{ data: ClinicalNote }>(`/patients/${patientId}/notes`, form);
        localStorage.removeItem(draftKey);
        navigate(`/notes/${r.data.data.id}`);
      }
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to save note.'
      );
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof SoapForm) => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl py-8">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        {patientId && (
          <>
            <Link to={`/patients/${patientId}/chart`} className="hover:text-helix-600">Patient Chart</Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-gray-800">{isEditMode ? 'Edit Note' : 'New SOAP Note'}</span>
      </nav>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? 'Edit Clinical Note' : 'New Clinical Note'}
        </h1>
        <div className="flex items-center gap-4">
          {lastSaved && (
            <span className="text-xs text-gray-400">Autosaved: {lastSaved}</span>
          )}
          {templates.length > 0 && (
            <button
              onClick={() => setShowTemplates(s => !s)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              📋 Templates
            </button>
          )}
        </div>
      </div>

      {/* Template picker dropdown */}
      {showTemplates && (
        <div className="mb-6 rounded-xl bg-white p-4 ring-1 ring-gray-200 shadow-lg">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Choose a Template</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:border-helix-400 hover:bg-helix-50"
              >
                <div className="font-medium text-gray-800">{t.name}</div>
                <div className="text-xs text-gray-500 capitalize">{t.note_type}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        {/* Note type */}
        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Note Type
          </label>
          <select
            value={form.note_type}
            onChange={e => updateField('note_type')(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-helix-400 focus:outline-none"
          >
            {['soap','progress','discharge','referral','procedure','other'].map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* SOAP fields */}
        <div className="space-y-5">
          <SoapSection
            label="S — Subjective"
            hint="Patient's chief complaint, history of present illness, review of systems"
            value={form.subjective}
            onChange={updateField('subjective')}
          />
          <SoapSection
            label="O — Objective"
            hint="Vital signs, physical examination findings, diagnostic results"
            value={form.objective}
            onChange={updateField('objective')}
          />
          <SoapSection
            label="A — Assessment"
            hint="Diagnosis, differential diagnoses, clinical impression"
            value={form.assessment}
            onChange={updateField('assessment')}
          />
          <SoapSection
            label="P — Plan"
            hint="Treatment plan, medications ordered, follow-up instructions, referrals"
            value={form.plan}
            onChange={updateField('plan')}
          />
        </div>

        <div className="mt-6 flex gap-3 border-t border-gray-100 pt-6">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={saveDraft}
            className="rounded-lg border border-helix-300 px-5 py-2 text-sm text-helix-700 hover:bg-helix-50"
          >
            Save Draft
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-lg bg-helix-600 px-5 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEditMode ? 'Update Note' : 'Create Note'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SOAP section component ───────────────────────────────────────────────────

interface SoapSectionProps {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}

const SoapSection: React.FC<SoapSectionProps> = ({ label, hint, value, onChange }) => (
  <div>
    <div className="mb-1 flex items-baseline gap-2">
      <label className="text-sm font-bold text-gray-700">{label}</label>
      <span className="text-xs text-gray-400">{hint}</span>
    </div>
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      rows={4}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-helix-400"
      placeholder={hint}
    />
  </div>
);

const Spinner: React.FC = () => (
  <div className="flex justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

export default NoteEditor;
