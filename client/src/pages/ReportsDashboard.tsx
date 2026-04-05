/**
 * ReportsDashboard — admin analytics: utilisation, population health, provider load.
 * Route: /admin/reports (admin only)
 */

import React, { useEffect, useState } from 'react';
import api from '../services/api';
import type { ApiSuccess } from '../types';

type Tab = 'utilisation' | 'population' | 'provider-load';

interface UtilisationData {
  byDay: { day: string; total: number; completed: number; no_shows: number }[];
  byWeek: { week: string; total: number }[];
  byProvider: {
    provider_name: string;
    total: number;
    completed: number;
    no_show: number;
    completion_rate: string;
    no_show_rate: string | number;
  }[];
  overall: {
    total: number;
    completed: number;
    no_show: number;
    completion_rate: string;
    no_show_rate: string;
  };
}

interface PopulationData {
  ageDistribution: { bracket: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number }[];
  avgVitals: { avg_bp_systolic: number; avg_bp_diastolic: number; avg_weight_kg: number; avg_height_cm: number };
  totalPatients: number;
}

interface ProviderLoadData {
  providers: {
    provider_name: string;
    specialty: string;
    unique_patients: number;
    total_appointments: number;
    appointments_this_month: number;
  }[];
}

const ReportsDashboard: React.FC = () => {
  const [tab, setTab] = useState<Tab>('utilisation');
  const [utilisation, setUtilisation] = useState<UtilisationData | null>(null);
  const [population, setPopulation] = useState<PopulationData | null>(null);
  const [providerLoad, setProviderLoad] = useState<ProviderLoadData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const fetches: Promise<unknown>[] = [];
    if (!utilisation) {
      fetches.push(
        api.get<ApiSuccess<any>>('/admin/reports/utilisation').then((r) => setUtilisation(normalizeUtilisation(r.data.data))),
      );
    }
    if (!population) {
      fetches.push(
        api.get<ApiSuccess<any>>('/admin/reports/population').then((r) => setPopulation(normalizePopulation(r.data.data))),
      );
    }
    if (!providerLoad) {
      fetches.push(
        api.get<ApiSuccess<any[]>>('/admin/reports/provider-load').then((r) => setProviderLoad(normalizeProviderLoad(r.data.data))),
      );
    }
    Promise.all(fetches)
      .catch(() => setError('Failed to load report data.'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Reports Dashboard</h1>

      {error && <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-8">
          {([
            ['utilisation', 'Utilisation'],
            ['population', 'Population Health'],
            ['provider-load', 'Provider Load'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}

      {/* Utilisation */}
      {tab === 'utilisation' && utilisation && (
        <div className="space-y-6">
          {/* Overall stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              ['Total Appointments', utilisation.overall.total],
              ['Completed', utilisation.overall.completed],
              ['No-Shows', utilisation.overall.no_show],
              ['Completion Rate', `${utilisation.overall.completion_rate}%`],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg bg-white shadow p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* By provider */}
          <div className="rounded-lg bg-white shadow overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">By Provider</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['Provider', 'Total', 'Completed', 'No-Show', 'Completion %', 'No-Show %'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {utilisation.byProvider.map((row) => (
                  <tr key={row.provider_name}>
                    <td className="px-4 py-2 font-medium">{row.provider_name}</td>
                    <td className="px-4 py-2">{row.total}</td>
                    <td className="px-4 py-2">{row.completed}</td>
                    <td className="px-4 py-2">{row.no_show}</td>
                    <td className="px-4 py-2">{row.completion_rate}%</td>
                    <td className="px-4 py-2">{row.no_show_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* By day (last 7) */}
          <div className="rounded-lg bg-white shadow overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-800">Daily Appointments (last 7 days)</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {utilisation.byDay.slice(-7).map((row) => (
                  <tr key={row.day}>
                    <td className="px-4 py-2">{row.day}</td>
                    <td className="px-4 py-2">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Population Health */}
      {tab === 'population' && population && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white shadow p-5">
            <p className="text-sm text-gray-500">Total Patients</p>
            <p className="text-3xl font-bold text-gray-900">{population.totalPatients}</p>
          </div>

          {/* Avg Vitals */}
          {population.avgVitals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ['Avg Systolic BP', `${Math.round(population.avgVitals.avg_bp_systolic ?? 0)} mmHg`],
                ['Avg Diastolic BP', `${Math.round(population.avgVitals.avg_bp_diastolic ?? 0)} mmHg`],
                ['Avg Weight', `${Math.round(population.avgVitals.avg_weight_kg ?? 0)} kg`],
                ['Avg Height', `${Math.round(population.avgVitals.avg_height_cm ?? 0)} cm`],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg bg-white shadow p-4">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Age distribution */}
            <div className="rounded-lg bg-white shadow overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Age Distribution</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bracket</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {population.ageDistribution.map((row) => (
                    <tr key={row.bracket}>
                      <td className="px-4 py-2">{row.bracket}</td>
                      <td className="px-4 py-2">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top diagnoses */}
            <div className="rounded-lg bg-white shadow overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">Top 10 Diagnoses</h2>
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Diagnosis</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {population.topDiagnoses.map((row) => (
                    <tr key={row.diagnosis}>
                      <td className="px-4 py-2 truncate max-w-xs">{row.diagnosis}</td>
                      <td className="px-4 py-2">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Provider Load */}
      {tab === 'provider-load' && providerLoad && (
        <div className="rounded-lg bg-white shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Provider', 'Specialty', 'Unique Patients', 'Total Appts', 'This Month'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {providerLoad.providers.map((row) => (
                <tr key={row.provider_name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.provider_name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.specialty ?? '—'}</td>
                  <td className="px-4 py-3">{row.unique_patients}</td>
                  <td className="px-4 py-3">{row.total_appointments}</td>
                  <td className="px-4 py-3">{row.appointments_this_month}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportsDashboard;

function normalizeUtilisation(raw: any): UtilisationData {
  const byDay = (raw.byDay ?? []).map((row: any) => ({
    day: row.day,
    total: Number(row.total ?? 0),
    completed: Number(row.completed ?? 0),
    no_shows: Number(row.no_shows ?? 0),
  }));
  const completed = byDay.reduce((sum: number, row: { completed: number }) => sum + row.completed, 0);
  const total = Number(raw.overall?.total ?? 0);
  const noShow = Number(raw.overall?.no_show_pct != null && total > 0
    ? Math.round((raw.overall.no_show_pct / 100) * total)
    : 0);

  return {
    byDay,
    byWeek: (raw.byWeek ?? []).map((row: any) => ({
      week: row.week,
      total: Number(row.total ?? 0),
    })),
    byProvider: (raw.byProvider ?? []).map((row: any) => ({
      provider_name: row.provider_email ?? 'Unknown provider',
      total: Number(row.total ?? 0),
      completed: Number(row.completed ?? 0),
      no_show: Number(row.no_shows ?? 0),
      completion_rate: totalRate(Number(row.completed ?? 0), Number(row.total ?? 0)),
      no_show_rate: row.no_show_rate_pct ?? 0,
    })),
    overall: {
      total,
      completed,
      no_show: noShow,
      completion_rate: totalRate(completed, total),
      no_show_rate: String(raw.overall?.no_show_pct ?? 0),
    },
  };
}

function normalizePopulation(raw: any): PopulationData {
  return {
    ageDistribution: (raw.ageDistribution ?? []).map((row: any) => ({
      bracket: row.age_bracket,
      count: Number(row.patient_count ?? 0),
    })),
    topDiagnoses: (raw.topDiagnoses ?? []).map((row: any) => ({
      diagnosis: row.icd10_description,
      count: Number(row.patient_count ?? 0),
    })),
    avgVitals: {
      avg_bp_systolic: Number(raw.avgVitals?.avg_systolic ?? 0),
      avg_bp_diastolic: Number(raw.avgVitals?.avg_diastolic ?? 0),
      avg_weight_kg: Number(raw.avgVitals?.avg_weight_kg ?? 0),
      avg_height_cm: Number(raw.avgVitals?.avg_height_cm ?? 0),
    },
    totalPatients: Number(raw.totalPatients ?? 0),
  };
}

function normalizeProviderLoad(raw: any[]): ProviderLoadData {
  return {
    providers: (raw ?? []).map((row: any) => ({
      provider_name: row.provider_email ?? 'Unknown provider',
      specialty: row.specialty ?? '—',
      unique_patients: Number(row.unique_patients ?? 0),
      total_appointments: Number(row.total_appointments ?? 0),
      appointments_this_month: Number(row.appointments_this_month ?? 0),
    })),
  };
}

function totalRate(part: number, whole: number): string {
  if (!whole) return '0.0';
  return ((part / whole) * 100).toFixed(1);
}
