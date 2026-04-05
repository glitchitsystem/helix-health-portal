/**
 * PrescriptionList — patient-facing prescription viewer.
 * Route: /prescriptions
 */

import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ApiSuccess, AuthMeData, Prescription } from '../types';

type StatusFilter = 'active' | 'all';

const STATUS_BADGE: Record<string, string> = {
  active:       'bg-green-100 text-green-800',
  discontinued: 'bg-red-100 text-red-800',
  expired:      'bg-gray-100 text-gray-600',
  on_hold:      'bg-yellow-100 text-yellow-800',
  pending:      'bg-blue-100 text-blue-800',
};

export default function PrescriptionList() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [filter, setFilter]               = useState<StatusFilter>('active');
  const [patientId, setPatientId]         = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [refillMsg, setRefillMsg]         = useState<Record<number, string>>({});

  // Resolve the patient record for the logged-in user
  useEffect(() => {
    if (!user) return;
    api.get<ApiSuccess<AuthMeData>>('/auth/me')
      .then((r) => {
        const pid = r.data.data.patient_id ?? r.data.data.patient?.id ?? null;
        if (pid === null) {
          setError('Could not load patient profile.');
          setLoading(false);
          return;
        }
        setPatientId(pid);
      })
      .catch(() => {
        setError('Could not load patient profile.');
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    if (patientId === null) return;
    setLoading(true);
    setError(null);
    api.get(`/patients/${patientId}/prescriptions`, { params: { status: filter } })
      .then((r) => setPrescriptions(r.data?.data ?? []))
      .catch(() => setError('Failed to load prescriptions.'))
      .finally(() => setLoading(false));
  }, [patientId, filter]);

  async function requestRefill(prescription: Prescription) {
    try {
      await api.post(`/prescriptions/${prescription.id}/refill-request`);
      setRefillMsg((prev) => ({ ...prev, [prescription.id]: 'Refill request submitted.' }));
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to submit refill request.';
      setRefillMsg((prev) => ({ ...prev, [prescription.id]: msg }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-gray-500">Loading prescriptions…</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Prescriptions</h1>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(['active', 'all'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              filter === f
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'All Prescriptions' : 'Active'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-4 text-red-700 text-sm">{error}</div>
      )}

      {prescriptions.length === 0 ? (
        <p className="text-gray-500 text-sm">No prescriptions found.</p>
      ) : (
        <div className="grid gap-4">
          {prescriptions.map((rx) => (
            <div
              key={rx.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{rx.drug_name}</h2>
                  <p className="text-sm text-gray-500">{rx.dosage} · {rx.frequency} · {rx.route}</p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    STATUS_BADGE[rx.status] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {rx.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
                <span><strong>Qty:</strong> {rx.quantity}</span>
                <span><strong>Refills remaining:</strong> {rx.refills_remaining}</span>
                <span><strong>Start:</strong> {rx.start_date}</span>
                {rx.end_date && <span><strong>End:</strong> {rx.end_date}</span>}
                {rx.pharmacy_name && <span className="col-span-2"><strong>Pharmacy:</strong> {rx.pharmacy_name}</span>}
                {rx.prescriber_email && (
                  <span className="col-span-2"><strong>Prescriber:</strong> {rx.prescriber_email}</span>
                )}
                {rx.is_controlled ? (
                  <span className="col-span-2 text-orange-600 font-medium">
                    ⚠ Controlled substance{rx.schedule_class ? ` (Schedule ${rx.schedule_class})` : ''}
                  </span>
                ) : null}
              </div>

              {rx.notes && (
                <p className="text-sm text-gray-500 italic mb-3">Notes: {rx.notes}</p>
              )}

              {rx.status === 'active' && (
                <div className="mt-2">
                  <button
                    onClick={() => requestRefill(rx)}
                    disabled={rx.refills_remaining === 0}
                    className="inline-flex items-center px-3 py-1.5 border border-transparent
                      text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700
                      disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {rx.refills_remaining === 0 ? 'No refills remaining' : 'Request Refill'}
                  </button>
                  {refillMsg[rx.id] && (
                    <p className="mt-1 text-xs text-gray-600">{refillMsg[rx.id]}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
