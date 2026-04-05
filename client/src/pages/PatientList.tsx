/**
 * PatientList — staff-facing patient directory with quick access into charts,
 * records, and lab workflows.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { ApiSuccess, PatientRecord } from '../types';

type PatientListMode = 'patients' | 'labs';

interface PatientListProps {
  mode?: PatientListMode;
}

const PatientList: React.FC<PatientListProps> = ({ mode = 'patients' }) => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    api.get<ApiSuccess<PatientRecord[]>>('/patients')
      .then((response) => {
        if (!cancelled) {
          setPatients(response.data.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load patients.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredPatients = useMemo(() => {
    if (!normalizedQuery) return patients;

    return patients.filter((patient) => {
      const haystack = [
        patient.first_name,
        patient.last_name,
        patient.mrn,
        patient.dob,
        patient.phone,
        patient.city,
        patient.state,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [patients, normalizedQuery]);

  const title = mode === 'labs' ? 'Lab Results' : 'Patient List';
  const description = mode === 'labs'
    ? 'Select a patient to review or add lab results.'
    : 'Browse registered patients and jump into their chart, records, or documents.';

  if (loading) return <Spinner />;
  if (error) return <ErrorBanner message={error} />;

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
          <p className="mt-3 text-sm font-medium text-helix-700">
            {filteredPatients.length} of {patients.length} patients shown
          </p>
        </div>

        <label className="block w-full max-w-md">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Search patients
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, MRN, DOB, phone, or location"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm shadow-sm outline-none transition focus:border-helix-500 focus:ring-2 focus:ring-helix-200"
          />
        </label>
      </div>

      {filteredPatients.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 px-6 py-12 text-center ring-1 ring-gray-200">
          <p className="text-lg font-semibold text-gray-700">No matching patients</p>
          <p className="mt-2 text-sm text-gray-500">Try a different name, MRN, or demographic detail.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredPatients.map((patient) => {
            const fullName = formatPatientName(patient);

            return (
              <article key={patient.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">{fullName}</h2>
                      <span className="rounded-full bg-helix-50 px-2.5 py-1 text-xs font-semibold text-helix-700">
                        MRN {patient.mrn}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      {patient.dob && <span>DOB {formatDate(patient.dob)}</span>}
                      {patient.dob && <span>Age {getAge(patient.dob)}</span>}
                      {patient.gender && <span>{patient.gender}</span>}
                      {patient.phone && <span>{patient.phone}</span>}
                      {(patient.city || patient.state) && (
                        <span>{[patient.city, patient.state].filter(Boolean).join(', ')}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {mode === 'labs' ? (
                      <>
                        <ActionLink to={`/patients/${patient.id}/records?tab=labs`} tone="primary">
                          View Labs
                        </ActionLink>
                        <ActionLink to={`/patients/${patient.id}/chart`} tone="secondary">
                          Open Chart
                        </ActionLink>
                      </>
                    ) : (
                      <>
                        <ActionLink to={`/patients/${patient.id}/chart`} tone="primary">
                          Open Chart
                        </ActionLink>
                        <ActionLink to={`/patients/${patient.id}/records`} tone="secondary">
                          Records
                        </ActionLink>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <ActionLink to={`/appointments?patient_id=${patient.id}`} tone="ghost">
                    Appointments
                  </ActionLink>
                  <ActionLink to={`/patients/${patient.id}/documents`} tone="ghost">
                    Documents
                  </ActionLink>
                  <ActionLink to={`/patients/${patient.id}/notes/new`} tone="ghost">
                    New Note
                  </ActionLink>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ActionLink: React.FC<{
  children: React.ReactNode;
  to: string;
  tone: 'primary' | 'secondary' | 'ghost';
}> = ({ children, to, tone }) => {
  const className = tone === 'primary'
    ? 'bg-helix-600 text-white hover:bg-helix-700'
    : tone === 'secondary'
      ? 'bg-white text-helix-700 ring-1 ring-helix-200 hover:bg-helix-50'
      : 'bg-gray-50 text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100';

  return (
    <Link
      to={to}
      className={`inline-flex items-center rounded-lg px-3 py-2 font-semibold transition ${className}`}
    >
      {children}
    </Link>
  );
};

const Spinner: React.FC = () => (
  <div className="flex justify-center py-16">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">{message}</div>
);

function formatPatientName(patient: PatientRecord): string {
  const firstName = patient.first_name?.trim();
  const lastName = patient.last_name?.trim();
  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  return fullName || `Patient #${patient.id}`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function getAge(dob: string): number {
  const ageInMs = Date.now() - new Date(dob).getTime();
  return Math.max(0, Math.floor(ageInMs / (365.25 * 24 * 60 * 60 * 1000)));
}

export default PatientList;
