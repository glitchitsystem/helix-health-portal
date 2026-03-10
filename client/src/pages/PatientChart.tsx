/**
 * PatientChart — comprehensive clinical view of a single patient.
 * Provider-only page showing summary + quick links to all sub-sections.
 *
 * Route: /patients/:patientId/chart
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { HealthSummary, ClinicalNote } from '../types';

interface PatientInfo {
  id: number;
  mrn: string;
  user_id: number;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

const PatientChart: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!patientId) return;
    Promise.all([
      api.get<{ data: PatientInfo }>(`/patients/${patientId}`),
      api.get<{ data: HealthSummary }>(`/patients/${patientId}/summary`),
      api.get<{ data: ClinicalNote[] }>(`/patients/${patientId}/notes`),
    ])
      .then(([pRes, sRes, nRes]) => {
        setPatient(pRes.data.data);
        setSummary(sRes.data.data);
        setNotes(nRes.data.data.slice(0, 5)); // latest 5
      })
      .catch(() => setError('Failed to load patient chart.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <Spinner />;
  if (error || !patient) return <div className="py-10 text-center text-red-600">{error}</div>;

  const age = patient.dob
    ? Math.floor((Date.now() - new Date(patient.dob).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return (
    <div className="mx-auto max-w-5xl py-8">
      {/* Patient header */}
      <div className="mb-6 rounded-2xl bg-helix-900 p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {patient.first_name} {patient.last_name}
            </h1>
            <p className="mt-1 text-helix-200">
              MRN: {patient.mrn}
              {age != null && ` · Age ${age}`}
              {patient.gender && ` · ${patient.gender}`}
              {patient.dob && ` · DOB: ${patient.dob}`}
            </p>
            {patient.phone && <p className="text-sm text-helix-300">📞 {patient.phone}</p>}
            {patient.city && (
              <p className="text-sm text-helix-300">
                📍 {patient.city}, {patient.state} {patient.zip}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/patients/${patientId}/notes/new`)}
              className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold hover:bg-helix-500"
            >
              + New Note
            </button>
            <Link
              to={`/appointments/book?patient_id=${patientId}`}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              + Book Appointment
            </Link>
          </div>
        </div>
      </div>

      {/* Quick navigation */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Medical Records', to: `/patients/${patientId}/records`, icon: '📋' },
          { label: 'Appointments',    to: `/appointments?patient_id=${patientId}`, icon: '📅' },
          { label: 'Documents',       to: `/patients/${patientId}/documents`, icon: '📁' },
          { label: 'Clinical Notes',  to: `/patients/${patientId}/notes`, icon: '📝' },
        ].map(item => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-2 rounded-xl bg-white p-3 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:ring-helix-400 hover:text-helix-700 transition"
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      {summary && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Allergies — always shown prominently */}
          {summary.active_allergies.length > 0 && (
            <div className="lg:col-span-2 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-red-700">
                ⚠️ Known Allergies
              </h2>
              <div className="flex flex-wrap gap-2">
                {summary.active_allergies.map(a => (
                  <span key={a.id}
                    className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                    {a.allergen} ({a.reaction_type}) — <strong>{a.severity}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Latest Vitals */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">Latest Vitals</h2>
              <Link to={`/patients/${patientId}/records`} className="text-xs text-helix-600 hover:underline">
                All Records →
              </Link>
            </div>
            {summary.latest_vitals ? (
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {summary.latest_vitals.bp_systolic && (
                  <VitalRow label="Blood Pressure"
                    value={`${summary.latest_vitals.bp_systolic}/${summary.latest_vitals.bp_diastolic} mmHg`} />
                )}
                {summary.latest_vitals.heart_rate && (
                  <VitalRow label="Heart Rate" value={`${summary.latest_vitals.heart_rate} bpm`} />
                )}
                {summary.latest_vitals.temperature != null && (
                  <VitalRow label="Temperature" value={`${summary.latest_vitals.temperature}°C`} />
                )}
                {summary.latest_vitals.o2_saturation != null && (
                  <VitalRow label="SpO₂" value={`${summary.latest_vitals.o2_saturation}%`} />
                )}
                {summary.latest_vitals.weight_kg != null && (
                  <VitalRow label="Weight" value={`${summary.latest_vitals.weight_kg} kg`} />
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">No vitals recorded.</p>
            )}
          </div>

          {/* Active Medications */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">
                Active Medications ({summary.active_medications.length})
              </h2>
              <Link to={`/patients/${patientId}/records`} className="text-xs text-helix-600 hover:underline">
                All →
              </Link>
            </div>
            {summary.active_medications.length === 0 ? (
              <p className="text-sm text-gray-400">No active medications.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.active_medications.map(m => (
                  <li key={m.id} className="text-sm">
                    <span className="font-medium text-gray-800">{m.name}</span>
                    <span className="text-gray-500"> — {m.dosage} {m.frequency}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Active Diagnoses */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">
                Active Diagnoses ({summary.active_diagnoses.length})
              </h2>
            </div>
            {summary.active_diagnoses.length === 0 ? (
              <p className="text-sm text-gray-400">No active diagnoses.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.active_diagnoses.map(d => (
                  <li key={d.id} className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-gray-500">{d.icd10_code}</span>
                    <span className="text-gray-800">{d.icd10_description}</span>
                    {d.severity && (
                      <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                        d.severity === 'severe' ? 'bg-red-100 text-red-700' :
                        d.severity === 'moderate' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{d.severity}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Labs */}
          <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-700">Recent Lab Results</h2>
              <Link to={`/patients/${patientId}/records`} className="text-xs text-helix-600 hover:underline">
                All →
              </Link>
            </div>
            {summary.recent_labs.length === 0 ? (
              <p className="text-sm text-gray-400">No recent labs.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.recent_labs.slice(0, 5).map(l => {
                  const numVal = parseFloat(l.value);
                  const flagged =
                    !isNaN(numVal) &&
                    ((l.reference_range_low != null && numVal < l.reference_range_low) ||
                     (l.reference_range_high != null && numVal > l.reference_range_high));
                  return (
                    <li key={l.id} className={`flex items-center justify-between text-sm ${flagged ? 'text-red-700' : 'text-gray-800'}`}>
                      <span>{flagged ? '🚨 ' : ''}{l.test_name}</span>
                      <span className="font-mono font-medium">{l.value} {l.unit}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Recent Notes */}
      <div className="mt-6 rounded-xl bg-white p-5 ring-1 ring-gray-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-700">Recent Clinical Notes</h2>
          <div className="flex gap-2">
            <Link
              to={`/patients/${patientId}/notes/new`}
              className="rounded-lg bg-helix-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-helix-700"
            >
              + New Note
            </Link>
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">No clinical notes yet.</p>
        ) : (
          <div className="space-y-2">
            {notes.map(n => (
              <Link
                key={n.id}
                to={`/notes/${n.id}`}
                className="flex items-center justify-between rounded-lg p-3 text-sm hover:bg-gray-50"
              >
                <div>
                  <span className="font-medium text-gray-800 capitalize">{n.note_type} note</span>
                  {n.is_locked ? (
                    <span className="ml-2 text-xs text-gray-400">🔒 locked</span>
                  ) : (
                    <span className="ml-2 text-xs text-green-600">✏️ editable</span>
                  )}
                  <p className="text-xs text-gray-500">{n.provider_email}</p>
                </div>
                <span className="text-xs text-gray-400">{formatDate(n.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const VitalRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs text-gray-500">{label}</dt>
    <dd className="font-medium text-gray-800">{value}</dd>
  </div>
);

const Spinner: React.FC = () => (
  <div className="flex justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default PatientChart;
