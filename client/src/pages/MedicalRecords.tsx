/**
 * MedicalRecords — tabbed patient health record viewer.
 *
 * Route: /records (patients see their own) | /patients/:patientId/records (providers)
 * Tabs: Diagnoses | Medications | Allergies | Vitals | Labs
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ApiSuccess, AuthMeData, Diagnosis, Medication, Allergy, Vitals, LabResult } from '../types';

type Tab = 'diagnoses' | 'medications' | 'allergies' | 'vitals' | 'labs';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'diagnoses',   label: 'Diagnoses',   icon: '🩺' },
  { id: 'medications', label: 'Medications', icon: '💊' },
  { id: 'allergies',   label: 'Allergies',   icon: '⚠️' },
  { id: 'vitals',      label: 'Vitals',      icon: '❤️' },
  { id: 'labs',        label: 'Lab Results', icon: '🔬' },
];

// ─── Severity / status helpers ────────────────────────────────────────────────

const SEVERITY_BADGE: Record<string, string> = {
  mild:         'bg-yellow-50 text-yellow-700',
  moderate:     'bg-orange-50 text-orange-700',
  severe:       'bg-red-100 text-red-700',
  life_threatening: 'bg-red-200 text-red-900 font-bold',
};

const STATUS_BADGE: Record<string, string> = {
  active:       'bg-green-100 text-green-700',
  chronic:      'bg-blue-100 text-blue-700',
  resolved:     'bg-gray-100 text-gray-500',
  inactive:     'bg-gray-100 text-gray-500',
  discontinued: 'bg-gray-100 text-gray-500',
  completed:    'bg-gray-100 text-gray-500',
  on_hold:      'bg-yellow-100 text-yellow-700',
};

const LAB_STATUS: Record<string, string> = {
  final:       'bg-green-100 text-green-700',
  preliminary: 'bg-yellow-100 text-yellow-700',
  corrected:   'bg-blue-100 text-blue-700',
  flagged_high:'bg-red-100 text-red-700',
  flagged_low: 'bg-orange-100 text-orange-700',
  critical:    'bg-red-200 text-red-900 font-bold animate-pulse',
};

// ─── Sub-tab views ────────────────────────────────────────────────────────────

const DiagnosesTab: React.FC<{ patientId: number; canWrite: boolean }> = ({
  patientId, canWrite,
}) => {
  const [data, setData] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ icd10_code: '', icd10_description: '', status: 'active', severity: '', onset_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Diagnosis[] }>(`/patients/${patientId}/diagnoses`);
      setData(r.data.data);
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/patients/${patientId}/diagnoses`, form);
      setShowForm(false);
      setForm({ icd10_code: '', icd10_description: '', status: 'active', severity: '', onset_date: '', notes: '' });
      fetch();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this diagnosis?')) return;
    await api.delete(`/patients/${patientId}/diagnoses/${id}`);
    fetch();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700">
            {showForm ? '— Cancel' : '+ Add Diagnosis'}
          </button>
        </div>
      )}
      {showForm && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          {error && <ErrorMsg msg={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="ICD-10 Code *" value={form.icd10_code}
              onChange={v => setForm(f => ({ ...f, icd10_code: v }))} placeholder="e.g. E11.9" />
            <LabeledInput label="Description *" value={form.icd10_description}
              onChange={v => setForm(f => ({ ...f, icd10_description: v }))} placeholder="Type 2 diabetes mellitus" />
            <LabeledSelect label="Status" value={form.status}
              onChange={v => setForm(f => ({ ...f, status: v }))}
              options={['active','chronic','resolved','inactive']} />
            <LabeledSelect label="Severity" value={form.severity}
              onChange={v => setForm(f => ({ ...f, severity: v }))}
              options={['','mild','moderate','severe']} />
            <LabeledInput label="Onset Date" type="date" value={form.onset_date}
              onChange={v => setForm(f => ({ ...f, onset_date: v }))} />
          </div>
          <div className="mt-3">
            <LabeledTextarea label="Notes" value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Diagnosis'}
          </button>
        </div>
      )}
      {data.length === 0 ? <EmptyState label="diagnoses" /> : (
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.id} className="flex items-start justify-between rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-500">{d.icd10_code}</span>
                  <span className="font-semibold text-gray-800">{d.icd10_description}</span>
                  <Badge text={d.status} className={STATUS_BADGE[d.status] ?? ''} />
                  {d.severity && <Badge text={d.severity} className={SEVERITY_BADGE[d.severity] ?? ''} />}
                </div>
                {d.onset_date && <p className="mt-0.5 text-xs text-gray-500">Onset: {d.onset_date}</p>}
                {d.notes && <p className="mt-1 text-xs text-gray-600">{d.notes}</p>}
              </div>
              {canWrite && (
                <button onClick={() => handleDelete(d.id)}
                  className="ml-4 text-xs text-red-500 hover:text-red-700">Delete</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const MedicationsTab: React.FC<{ patientId: number; canWrite: boolean }> = ({
  patientId, canWrite,
}) => {
  const [data, setData] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', dosage: '', frequency: '', route: 'oral', start_date: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Medication[] }>(`/patients/${patientId}/medications`);
      setData(r.data.data);
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/patients/${patientId}/medications`, form);
      setShowForm(false);
      setForm({ name: '', dosage: '', frequency: '', route: 'oral', start_date: '', notes: '' });
      fetch();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    await api.put(`/patients/${patientId}/medications/${id}`, { status });
    fetch();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700">
            {showForm ? '— Cancel' : '+ Add Medication'}
          </button>
        </div>
      )}
      {showForm && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          {error && <ErrorMsg msg={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Name *" value={form.name}
              onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Metformin" />
            <LabeledInput label="Dosage *" value={form.dosage}
              onChange={v => setForm(f => ({ ...f, dosage: v }))} placeholder="500 mg" />
            <LabeledInput label="Frequency *" value={form.frequency}
              onChange={v => setForm(f => ({ ...f, frequency: v }))} placeholder="twice daily" />
            <LabeledSelect label="Route" value={form.route}
              onChange={v => setForm(f => ({ ...f, route: v }))}
              options={['oral','intravenous','intramuscular','subcutaneous','topical','inhaled','sublingual','other']} />
            <LabeledInput label="Start Date *" type="date" value={form.start_date}
              onChange={v => setForm(f => ({ ...f, start_date: v }))} />
          </div>
          <div className="mt-3">
            <LabeledTextarea label="Notes" value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Medication'}
          </button>
        </div>
      )}
      {data.length === 0 ? <EmptyState label="medications" /> : (
        <div className="space-y-3">
          {data.map(m => (
            <div key={m.id} className="flex items-start justify-between rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">{m.name}</span>
                  <Badge text={m.status} className={STATUS_BADGE[m.status] ?? ''} />
                </div>
                <p className="text-sm text-gray-600">{m.dosage} — {m.frequency} ({m.route})</p>
                <p className="text-xs text-gray-500">Started: {m.start_date}{m.end_date ? ` · Ended: ${m.end_date}` : ''}</p>
                {m.notes && <p className="mt-1 text-xs text-gray-600">{m.notes}</p>}
              </div>
              {canWrite && m.status === 'active' && (
                <button onClick={() => handleStatusUpdate(m.id, 'discontinued')}
                  className="ml-4 text-xs text-orange-500 hover:text-orange-700">Discontinue</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const AllergiesTab: React.FC<{ patientId: number; canWrite: boolean }> = ({
  patientId, canWrite,
}) => {
  const [data, setData] = useState<Allergy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ allergen: '', reaction_type: 'rash', severity: 'mild', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Allergy[] }>(`/patients/${patientId}/allergies`);
      setData(r.data.data);
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await api.post(`/patients/${patientId}/allergies`, form);
      setShowForm(false);
      setForm({ allergen: '', reaction_type: 'rash', severity: 'mild', notes: '' });
      fetch();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700">
            {showForm ? '— Cancel' : '+ Add Allergy'}
          </button>
        </div>
      )}
      {showForm && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          {error && <ErrorMsg msg={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Allergen *" value={form.allergen}
              onChange={v => setForm(f => ({ ...f, allergen: v }))} placeholder="Penicillin" />
            <LabeledSelect label="Reaction Type *" value={form.reaction_type}
              onChange={v => setForm(f => ({ ...f, reaction_type: v }))}
              options={['rash','hives','anaphylaxis','nausea','swelling','respiratory','other']} />
            <LabeledSelect label="Severity *" value={form.severity}
              onChange={v => setForm(f => ({ ...f, severity: v }))}
              options={['mild','moderate','severe','life_threatening']} />
          </div>
          <div className="mt-3">
            <LabeledTextarea label="Notes" value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Allergy'}
          </button>
        </div>
      )}
      {data.length === 0 ? <EmptyState label="allergies" /> : (
        <div className="space-y-3">
          {data.map(a => (
            <div key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span className="font-semibold text-gray-800">{a.allergen}</span>
                <Badge text={a.severity} className={SEVERITY_BADGE[a.severity] ?? ''} />
                <Badge text={a.reaction_type.replace('_', ' ')} className="bg-gray-100 text-gray-600" />
                <Badge text={a.status} className={STATUS_BADGE[a.status] ?? ''} />
              </div>
              {a.notes && <p className="mt-1 text-xs text-gray-600">{a.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const VitalsTab: React.FC<{ patientId: number; canWrite: boolean }> = ({
  patientId, canWrite,
}) => {
  const [data, setData] = useState<Vitals[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    recorded_at: new Date().toISOString().slice(0, 16),
    bp_systolic: '', bp_diastolic: '', heart_rate: '',
    temperature: '', weight_kg: '', height_cm: '', o2_saturation: '',
  });
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: Vitals[] }>(`/patients/${patientId}/vitals`);
      setData(r.data.data);
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '').map(([k, v]) => [k, k === 'recorded_at' ? new Date(v).toISOString() : Number(v) || v]),
      );
      await api.post(`/patients/${patientId}/vitals`, payload);
      setShowForm(false);
      fetch();
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700">
            {showForm ? '— Cancel' : '+ Record Vitals'}
          </button>
        </div>
      )}
      {showForm && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          <div className="grid gap-3 sm:grid-cols-3">
            <LabeledInput label="Recorded At" type="datetime-local" value={form.recorded_at}
              onChange={v => setForm(f => ({ ...f, recorded_at: v }))} />
            <LabeledInput label="BP Systolic (mmHg)" value={form.bp_systolic} type="number"
              onChange={v => setForm(f => ({ ...f, bp_systolic: v }))} />
            <LabeledInput label="BP Diastolic (mmHg)" value={form.bp_diastolic} type="number"
              onChange={v => setForm(f => ({ ...f, bp_diastolic: v }))} />
            <LabeledInput label="Heart Rate (bpm)" value={form.heart_rate} type="number"
              onChange={v => setForm(f => ({ ...f, heart_rate: v }))} />
            <LabeledInput label="Temperature (°C)" value={form.temperature} type="number"
              onChange={v => setForm(f => ({ ...f, temperature: v }))} />
            <LabeledInput label="Weight (kg)" value={form.weight_kg} type="number"
              onChange={v => setForm(f => ({ ...f, weight_kg: v }))} />
            <LabeledInput label="Height (cm)" value={form.height_cm} type="number"
              onChange={v => setForm(f => ({ ...f, height_cm: v }))} />
            <LabeledInput label="O₂ Saturation (%)" value={form.o2_saturation} type="number"
              onChange={v => setForm(f => ({ ...f, o2_saturation: v }))} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Vitals'}
          </button>
        </div>
      )}
      {data.length === 0 ? <EmptyState label="vitals" /> : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                {['Date','BP','HR','Temp','Wt','Ht','SpO₂'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {data.map(v => (
                <tr key={v.id}>
                  <td className="px-4 py-3 text-gray-700">{formatShortDate(v.recorded_at)}</td>
                  <td className="px-4 py-3 font-mono">
                    {v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : '—'}
                  </td>
                  <td className="px-4 py-3">{v.heart_rate ?? '—'}</td>
                  <td className="px-4 py-3">{v.temperature != null ? `${v.temperature}°C` : '—'}</td>
                  <td className="px-4 py-3">{v.weight_kg != null ? `${v.weight_kg} kg` : '—'}</td>
                  <td className="px-4 py-3">{v.height_cm != null ? `${v.height_cm} cm` : '—'}</td>
                  <td className="px-4 py-3">{v.o2_saturation != null ? `${v.o2_saturation}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const LabsTab: React.FC<{ patientId: number; canWrite: boolean }> = ({
  patientId, canWrite,
}) => {
  const [data, setData] = useState<LabResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ test_name: '', test_code: '', value: '', unit: '', reference_range_low: '', reference_range_high: '', status: 'final', collected_at: new Date().toISOString().slice(0, 16), notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<{ data: LabResult[] }>(`/patients/${patientId}/labs`);
      setData(r.data.data);
    } finally { setLoading(false); }
  }, [patientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        collected_at: new Date(form.collected_at).toISOString(),
        reference_range_low: form.reference_range_low ? Number(form.reference_range_low) : undefined,
        reference_range_high: form.reference_range_high ? Number(form.reference_range_high) : undefined,
      };
      await api.post(`/patients/${patientId}/labs`, payload);
      setShowForm(false);
      fetch();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Save failed');
    } finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      {canWrite && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setShowForm(s => !s)}
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700">
            {showForm ? '— Cancel' : '+ Add Lab Result'}
          </button>
        </div>
      )}
      {showForm && (
        <div className="mb-6 rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          {error && <ErrorMsg msg={error} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Test Name *" value={form.test_name}
              onChange={v => setForm(f => ({ ...f, test_name: v }))} placeholder="HbA1c" />
            <LabeledInput label="Test Code (LOINC)" value={form.test_code}
              onChange={v => setForm(f => ({ ...f, test_code: v }))} placeholder="4548-4" />
            <LabeledInput label="Value *" value={form.value}
              onChange={v => setForm(f => ({ ...f, value: v }))} placeholder="7.2" />
            <LabeledInput label="Unit" value={form.unit}
              onChange={v => setForm(f => ({ ...f, unit: v }))} placeholder="%" />
            <LabeledInput label="Ref Range Low" value={form.reference_range_low} type="number"
              onChange={v => setForm(f => ({ ...f, reference_range_low: v }))} />
            <LabeledInput label="Ref Range High" value={form.reference_range_high} type="number"
              onChange={v => setForm(f => ({ ...f, reference_range_high: v }))} />
            <LabeledSelect label="Status" value={form.status}
              onChange={v => setForm(f => ({ ...f, status: v }))}
              options={['preliminary','final','corrected','flagged_high','flagged_low','critical']} />
            <LabeledInput label="Collected At" type="datetime-local" value={form.collected_at}
              onChange={v => setForm(f => ({ ...f, collected_at: v }))} />
          </div>
          <div className="mt-3">
            <LabeledTextarea label="Notes" value={form.notes}
              onChange={v => setForm(f => ({ ...f, notes: v }))} />
          </div>
          <button onClick={handleSave} disabled={saving}
            className="mt-3 rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Result'}
          </button>
        </div>
      )}
      {data.length === 0 ? <EmptyState label="lab results" /> : (
        <div className="space-y-3">
          {data.map(l => {
            const numVal = parseFloat(l.value);
            const outOfRange =
              !isNaN(numVal) &&
              ((l.reference_range_low != null && numVal < l.reference_range_low) ||
               (l.reference_range_high != null && numVal > l.reference_range_high));
            return (
              <div key={l.id} className={`rounded-xl p-4 ring-1 ${outOfRange ? 'bg-red-50 ring-red-300' : 'bg-white ring-gray-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {outOfRange && <span className="text-red-600">🚨</span>}
                    <span className="font-semibold text-gray-800">{l.test_name}</span>
                    {l.test_code && <span className="font-mono text-xs text-gray-500">({l.test_code})</span>}
                    <Badge text={l.status.replace('_', ' ')} className={LAB_STATUS[l.status] ?? ''} />
                  </div>
                  <span className={`font-mono text-sm font-bold ${outOfRange ? 'text-red-700' : 'text-gray-800'}`}>
                    {l.value} {l.unit}
                  </span>
                </div>
                {(l.reference_range_low != null || l.reference_range_high != null) && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Ref: {l.reference_range_low ?? '?'} – {l.reference_range_high ?? '?'} {l.unit}
                  </p>
                )}
                <p className="text-xs text-gray-500 mt-0.5">Collected: {formatShortDate(l.collected_at)}</p>
                {l.notes && <p className="mt-1 text-xs text-gray-600">{l.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

const MedicalRecords: React.FC = () => {
  const { user } = useAuth();
  const { patientId: paramPatientId } = useParams<{ patientId?: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('diagnoses');
  const [resolvedPatientId, setResolvedPatientId] = useState<number | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [patientError, setPatientError] = useState('');

  const isStaff = user?.roles.some(r => ['admin', 'provider', 'nurse'].includes(r)) ?? false;
  const canWrite = isStaff;

  useEffect(() => {
    if (paramPatientId) {
      setResolvedPatientId(Number(paramPatientId));
      setLoadingPatient(false);
      return;
    }
    // For patients: fetch their own patient ID
    api.get<ApiSuccess<AuthMeData>>('/auth/me')
      .then((r) => {
        const patientId = r.data.data.patient_id ?? r.data.data.patient?.id ?? null;
        if (patientId === null) {
          setPatientError('Could not determine patient record.');
          setResolvedPatientId(null);
          return;
        }
        setResolvedPatientId(patientId);
      })
      .catch(() => {
        setPatientError('Could not determine patient record.');
        setResolvedPatientId(null);
      })
      .finally(() => setLoadingPatient(false));
  }, [paramPatientId]);

  if (loadingPatient) return <Spinner />;
  if (resolvedPatientId === null) return <ErrorMsg msg={patientError || 'Could not determine patient record.'} />;

  return (
    <div className="mx-auto max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Medical Records</h1>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === t.id
                ? 'bg-white text-helix-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl bg-gray-50 p-5 ring-1 ring-gray-200">
        {activeTab === 'diagnoses'   && <DiagnosesTab   patientId={resolvedPatientId} canWrite={canWrite} />}
        {activeTab === 'medications' && <MedicationsTab patientId={resolvedPatientId} canWrite={canWrite} />}
        {activeTab === 'allergies'   && <AllergiesTab   patientId={resolvedPatientId} canWrite={canWrite} />}
        {activeTab === 'vitals'      && <VitalsTab      patientId={resolvedPatientId} canWrite={canWrite} />}
        {activeTab === 'labs'        && <LabsTab        patientId={resolvedPatientId} canWrite={canWrite} />}
      </div>
    </div>
  );
};

// ─── Reusable micro-components ────────────────────────────────────────────────

const Spinner: React.FC = () => (
  <div className="flex justify-center py-10">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

const ErrorMsg: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{msg}</div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
  <p className="py-8 text-center text-sm text-gray-400">No {label} on record.</p>
);

const Badge: React.FC<{ text: string; className: string }> = ({ text, className }) => (
  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${className}`}>{text}</span>
);

interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}
const LabeledInput: React.FC<InputProps> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400" />
  </div>
);

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}
const LabeledSelect: React.FC<SelectProps> = ({ label, value, onChange, options }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400">
      {options.map(o => <option key={o} value={o}>{o || '— select —'}</option>)}
    </select>
  </div>
);

interface TextareaProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
const LabeledTextarea: React.FC<TextareaProps> = ({ label, value, onChange }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400" />
  </div>
);

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default MedicalRecords;
