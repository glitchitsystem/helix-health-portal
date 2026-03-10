/**
 * PrescriptionManager — provider/nurse-facing prescription management page.
 * Route: /prescriptions/manage
 * Allows creating, renewing, discontinuing prescriptions, and managing refill requests.
 */

import React, { useEffect, useState, FormEvent } from 'react';
import api from '../services/api';
import { Prescription, DrugInteraction, RefillRequest } from '../types';

type Tab = 'prescriptions' | 'refill-requests';

interface CreateForm {
  patient_id: string;
  drug_name: string;
  drug_ndc: string;
  dosage: string;
  frequency: string;
  route: string;
  quantity: string;
  refills_remaining: string;
  start_date: string;
  end_date: string;
  is_controlled: boolean;
  schedule_class: string;
  pharmacy_name: string;
  pharmacy_phone: string;
  notes: string;
}

const EMPTY_FORM: CreateForm = {
  patient_id: '',
  drug_name: '',
  drug_ndc: '',
  dosage: '',
  frequency: '',
  route: 'oral',
  quantity: '30',
  refills_remaining: '3',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  is_controlled: false,
  schedule_class: '',
  pharmacy_name: '',
  pharmacy_phone: '',
  notes: '',
};

const STATUS_BADGE: Record<string, string> = {
  active:       'bg-green-100 text-green-800',
  discontinued: 'bg-red-100 text-red-800',
  expired:      'bg-gray-100 text-gray-600',
  on_hold:      'bg-yellow-100 text-yellow-800',
  pending:      'bg-blue-100 text-blue-800',
};

export default function PrescriptionManager() {
  const [tab, setTab]                     = useState<Tab>('prescriptions');
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [refillRequests, setRefillRequests] = useState<RefillRequest[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [success, setSuccess]             = useState<string | null>(null);

  // Create form
  const [form, setForm]         = useState<CreateForm>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [interactions, setInteractions] = useState<DrugInteraction[]>([]);

  // Renew modal
  const [renewTarget, setRenewTarget] = useState<Prescription | null>(null);
  const [renewDate, setRenewDate]     = useState('');
  const [renewRefills, setRenewRefills] = useState('3');

  // Discontinue modal
  const [discTarget, setDiscTarget] = useState<Prescription | null>(null);
  const [discReason, setDiscReason] = useState('');

  // Patient filter
  const [patientFilter, setPatientFilter] = useState('');

  function flash(msg: string, isError = false) {
    isError ? setError(msg) : setSuccess(msg);
    setTimeout(() => { setError(null); setSuccess(null); }, 5000);
  }

  async function loadPrescriptions(patId: string) {
    if (!patId) return;
    setLoading(true);
    try {
      const r = await api.get(`/patients/${patId}/prescriptions`, { params: { status: 'all' } });
      setPrescriptions(r.data?.data ?? []);
    } catch {
      flash('Failed to load prescriptions.', true);
    } finally {
      setLoading(false);
    }
  }

  async function loadRefillRequests() {
    setLoading(true);
    try {
      const r = await api.get('/prescriptions/refill-requests', { params: { status: 'pending' } });
      setRefillRequests(r.data?.data ?? []);
    } catch {
      flash('Failed to load refill requests.', true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === 'refill-requests') loadRefillRequests();
  }, [tab]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setInteractions([]);
    try {
      const body = {
        ...form,
        quantity: Number(form.quantity),
        refills_remaining: Number(form.refills_remaining),
        is_controlled: form.is_controlled ? 1 : 0,
        schedule_class: form.schedule_class || undefined,
        drug_ndc: form.drug_ndc || undefined,
        end_date: form.end_date || undefined,
        pharmacy_name: form.pharmacy_name || undefined,
        pharmacy_phone: form.pharmacy_phone || undefined,
        notes: form.notes || undefined,
      };
      const r = await api.post(`/patients/${form.patient_id}/prescriptions`, body);
      const { data, warnings } = r.data;
      if (warnings?.length) setInteractions(warnings);
      flash(`Prescription for ${data.drug_name} created successfully.`);
      setForm(EMPTY_FORM);
      setShowForm(false);
      if (patientFilter && form.patient_id === patientFilter) {
        loadPrescriptions(patientFilter);
      }
    } catch (err: any) {
      flash(err.response?.data?.error ?? 'Failed to create prescription.', true);
    } finally {
      setCreating(false);
    }
  }

  async function handleRenew() {
    if (!renewTarget) return;
    try {
      await api.post(`/prescriptions/${renewTarget.id}/renew`, {
        new_end_date: renewDate,
        refills_remaining: Number(renewRefills),
      });
      flash('Prescription renewed.');
      setRenewTarget(null);
      loadPrescriptions(patientFilter);
    } catch (err: any) {
      flash(err.response?.data?.error ?? 'Failed to renew.', true);
    }
  }

  async function handleDiscontinue() {
    if (!discTarget) return;
    try {
      await api.delete(`/prescriptions/${discTarget.id}`, { data: { reason: discReason } });
      flash('Prescription discontinued.');
      setDiscTarget(null);
      setDiscReason('');
      loadPrescriptions(patientFilter);
    } catch (err: any) {
      flash(err.response?.data?.error ?? 'Failed to discontinue.', true);
    }
  }

  async function handleRefillAction(id: number, action: 'approve' | 'deny') {
    try {
      await api.put(`/prescriptions/refill-requests/${id}`, { action });
      flash(`Refill request ${action}d.`);
      loadRefillRequests();
    } catch (err: any) {
      flash(err.response?.data?.error ?? 'Failed to update refill request.', true);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Prescription Manager</h1>

      {/* Alerts */}
      {error   && <div className="rounded-md bg-red-50   p-4 mb-4 text-red-700   text-sm">{error}</div>}
      {success && <div className="rounded-md bg-green-50 p-4 mb-4 text-green-700 text-sm">{success}</div>}

      {/* Drug interaction warnings */}
      {interactions.length > 0 && (
        <div className="rounded-md bg-yellow-50 border border-yellow-300 p-4 mb-4">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠ Drug Interaction Detected</h3>
          {interactions.map((i, idx) => (
            <p key={idx} className="text-sm text-yellow-700">
              <strong>{i.drug_a}</strong> ↔ <strong>{i.drug_b}</strong> ({i.severity}): {i.description}
            </p>
          ))}
          <button
            onClick={() => setInteractions([])}
            className="mt-2 text-xs text-yellow-600 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {([['prescriptions', 'Prescriptions'], ['refill-requests', 'Refill Requests']] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Prescriptions Tab ── */}
      {tab === 'prescriptions' && (
        <div>
          {/* Patient lookup */}
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              placeholder="Enter patient ID to load prescriptions"
              value={patientFilter}
              onChange={(e) => setPatientFilter(e.target.value)}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => loadPrescriptions(patientFilter)}
              disabled={!patientFilter}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40"
            >
              Load
            </button>
            <button
              onClick={() => { setForm({ ...EMPTY_FORM, patient_id: patientFilter }); setShowForm(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              + New Rx
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-6">
              <h2 className="text-base font-semibold text-gray-800 mb-4">New Prescription</h2>
              <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
                <div className="col-span-2 grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Drug Name*</span>
                    <input required value={form.drug_name} onChange={(e) => setForm({ ...form, drug_name: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">NDC Code</span>
                    <input value={form.drug_ndc} onChange={(e) => setForm({ ...form, drug_ndc: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Dosage*</span>
                    <input required value={form.dosage} onChange={(e) => setForm({ ...form, dosage: e.target.value })}
                      placeholder="e.g. 500mg" className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Frequency*</span>
                    <input required value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                      placeholder="e.g. twice daily" className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Route*</span>
                    <input required value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Quantity</span>
                    <input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Refills</span>
                    <input type="number" min={0} value={form.refills_remaining} onChange={(e) => setForm({ ...form, refills_remaining: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Start Date*</span>
                    <input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">End Date</span>
                    <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Pharmacy Name</span>
                    <input value={form.pharmacy_name} onChange={(e) => setForm({ ...form, pharmacy_name: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Pharmacy Phone</span>
                    <input value={form.pharmacy_phone} onChange={(e) => setForm({ ...form, pharmacy_phone: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                  <label className="flex items-center gap-2 col-span-2">
                    <input type="checkbox" checked={form.is_controlled} onChange={(e) => setForm({ ...form, is_controlled: e.target.checked })} />
                    <span className="text-sm text-gray-700">Controlled Substance</span>
                  </label>
                  {form.is_controlled && (
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">Schedule Class</span>
                      <select value={form.schedule_class} onChange={(e) => setForm({ ...form, schedule_class: e.target.value })}
                        className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm">
                        <option value="">Select…</option>
                        {['II', 'III', 'IV', 'V'].map((s) => <option key={s} value={s}>Schedule {s}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="block col-span-2">
                    <span className="text-xs font-medium text-gray-600">Notes</span>
                    <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
                  </label>
                </div>
                <div className="col-span-2 flex gap-3 pt-2">
                  <button type="submit" disabled={creating}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40">
                    {creating ? 'Saving…' : 'Create Prescription'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Prescriptions list */}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : prescriptions.length === 0 ? (
            <p className="text-gray-500 text-sm">No prescriptions. Enter a patient ID above to load.</p>
          ) : (
            <div className="grid gap-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{rx.drug_name}</h3>
                      <p className="text-sm text-gray-500">{rx.dosage} · {rx.frequency} · {rx.route}</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[rx.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {rx.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 text-sm text-gray-600 mb-3">
                    <span>Qty: {rx.quantity}</span>
                    <span>Refills: {rx.refills_remaining}</span>
                    <span>Start: {rx.start_date}</span>
                    {rx.end_date && <span>End: {rx.end_date}</span>}
                    {rx.is_controlled ? <span className="text-orange-600 font-medium col-span-2">⚠ Controlled {rx.schedule_class ? `(Sch. ${rx.schedule_class})` : ''}</span> : null}
                  </div>
                  {rx.status !== 'discontinued' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRenewTarget(rx); setRenewDate(''); setRenewRefills('3'); }}
                        className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                      >
                        Renew
                      </button>
                      <button
                        onClick={() => { setDiscTarget(rx); setDiscReason(''); }}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                      >
                        Discontinue
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Refill Requests Tab ── */}
      {tab === 'refill-requests' && (
        <div>
          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : refillRequests.length === 0 ? (
            <p className="text-gray-500 text-sm">No pending refill requests.</p>
          ) : (
            <div className="grid gap-4">
              {refillRequests.map((rr) => (
                <div key={rr.id} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-900">{rr.drug_name ?? `Prescription #${rr.prescription_id}`}</h3>
                      {rr.patient_name && <p className="text-sm text-gray-500">Patient: {rr.patient_name}</p>}
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      {rr.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">Requested: {new Date(rr.requested_at).toLocaleDateString()}</p>
                  {rr.pharmacy_notes && <p className="text-sm text-gray-500 italic mb-3">Notes: {rr.pharmacy_notes}</p>}
                  {rr.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleRefillAction(rr.id, 'approve')}
                        className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700">
                        Approve
                      </button>
                      <button onClick={() => handleRefillAction(rr.id, 'deny')}
                        className="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700">
                        Deny
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Renew Modal ── */}
      {renewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Renew Prescription</h2>
            <p className="text-sm text-gray-600 mb-4">{renewTarget.drug_name} — {renewTarget.dosage}</p>
            <label className="block mb-3">
              <span className="text-xs font-medium text-gray-600">New End Date*</span>
              <input type="date" required value={renewDate} onChange={(e) => setRenewDate(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            </label>
            <label className="block mb-4">
              <span className="text-xs font-medium text-gray-600">Refills</span>
              <input type="number" min={0} value={renewRefills} onChange={(e) => setRenewRefills(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            </label>
            <div className="flex gap-3">
              <button onClick={handleRenew} disabled={!renewDate}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-40">
                Confirm Renewal
              </button>
              <button onClick={() => setRenewTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discontinue Modal ── */}
      {discTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Discontinue Prescription</h2>
            <p className="text-sm text-gray-600 mb-4">{discTarget.drug_name} — {discTarget.dosage}</p>
            <label className="block mb-4">
              <span className="text-xs font-medium text-gray-600">Reason (optional)</span>
              <textarea rows={3} value={discReason} onChange={(e) => setDiscReason(e.target.value)}
                className="mt-1 w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm" />
            </label>
            <div className="flex gap-3">
              <button onClick={handleDiscontinue}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">
                Yes, Discontinue
              </button>
              <button onClick={() => setDiscTarget(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
