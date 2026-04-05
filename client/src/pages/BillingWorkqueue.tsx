/**
 * BillingWorkqueue — billing/admin view of disputes and outstanding invoices.
 * Route: /billing/workqueue (billing, admin only)
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { ApiSuccess, BillingDispute } from '../types';

type Tab = 'invoices' | 'disputes';

interface RevenueSummary {
  revenueByMonth: { month: string; revenue: number; payments_count: number }[];
  outstanding: { status: string; invoice_count: number; total_outstanding: number }[];
  topPatients: { patient_name: string; total_billed: number }[];
}

const DISPUTE_STATUSES = ['open', 'under_review', 'resolved', 'rejected'];

const BillingWorkqueue: React.FC = () => {
  const [tab, setTab] = useState<Tab>('disputes');
  const [disputes, setDisputes] = useState<BillingDispute[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Dispute update state */
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [updateForm, setUpdateForm] = useState<{ status: string; resolution_notes: string }>({
    status: '',
    resolution_notes: '',
  });
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.get<ApiSuccess<BillingDispute[]>>('/billing/disputes?status=all'),
      api.get<ApiSuccess<RevenueSummary>>('/admin/reports/revenue'),
    ])
      .then(([disputesRes, revenueRes]) => {
        setDisputes(disputesRes.data.data);
        setRevenue(revenueRes.data.data);
      })
      .catch(() => setError('Failed to load billing workqueue.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openUpdateForm = (dispute: BillingDispute) => {
    setUpdatingId(dispute.id);
    setUpdateForm({ status: dispute.status, resolution_notes: '' });
    setUpdateMsg(null);
  };

  const submitUpdate = async (disputeId: number) => {
    try {
      await api.put(`/billing/disputes/${disputeId}`, updateForm);
      setUpdatingId(null);
      setUpdateMsg(null);
      load();
    } catch (err: any) {
      setUpdateMsg(err?.response?.data?.error ?? err?.response?.data?.message ?? 'Update failed.');
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading workqueue…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Billing Workqueue</h1>

      {error && <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>}

      {/* Revenue Summary */}
      {revenue && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {revenue.outstanding.map((row) => (
            <div key={row.status} className="rounded-lg bg-white shadow p-4 border-l-4 border-indigo-400">
              <p className="text-sm text-gray-500 capitalize">{row.status}</p>
              <p className="text-xl font-bold text-gray-900">${Number(row.total_outstanding ?? 0).toFixed(2)}</p>
              <p className="text-xs text-gray-400">
                {row.invoice_count} invoice{row.invoice_count !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {(['disputes', 'invoices'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium capitalize border-b-2 transition ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'disputes'
                ? `Disputes (${disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length} open)`
                : 'Outstanding Invoices'}
            </button>
          ))}
        </nav>
      </div>

      {/* Disputes Tab */}
      {tab === 'disputes' && (
        <div className="rounded-lg bg-white shadow overflow-hidden">
          {disputes.length === 0 ? (
            <p className="p-5 text-gray-500">No disputes found.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {['ID', 'Patient', 'Invoice', 'Reason', 'Status', 'Filed', 'Actions'].map(
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
                {disputes.map((d) => (
                  <React.Fragment key={d.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">#{d.id}</td>
                      <td className="px-4 py-3">{(d as any).patient_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/billing/invoice/${d.invoice_id}`}
                          className="text-indigo-600 hover:underline"
                        >
                          #{d.invoice_id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">{d.reason}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            d.status === 'open'
                              ? 'bg-red-100 text-red-700'
                              : d.status === 'under_review'
                              ? 'bg-yellow-100 text-yellow-700'
                              : d.status === 'resolved'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(d.filed_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        {updatingId !== d.id ? (
                          <button
                            onClick={() => openUpdateForm(d)}
                            className="text-indigo-600 hover:underline text-sm"
                          >
                            Update
                          </button>
                        ) : (
                          <button
                            onClick={() => setUpdatingId(null)}
                            className="text-gray-500 hover:underline text-sm"
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                    {updatingId === d.id && (
                      <tr className="bg-indigo-50">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="flex flex-col gap-3">
                            <div className="flex gap-4 flex-wrap">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">New Status</label>
                                <select
                                  value={updateForm.status}
                                  onChange={(e) =>
                                    setUpdateForm((p) => ({ ...p, status: e.target.value }))
                                  }
                                  className="border rounded-md p-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                                >
                                  {DISPUTE_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex-1 min-w-48">
                                <label className="block text-xs text-gray-600 mb-1">
                                  Resolution Notes
                                </label>
                                <input
                                  type="text"
                                  value={updateForm.resolution_notes}
                                  onChange={(e) =>
                                    setUpdateForm((p) => ({
                                      ...p,
                                      resolution_notes: e.target.value,
                                    }))
                                  }
                                  className="w-full border rounded-md p-1.5 text-sm focus:ring-2 focus:ring-indigo-500"
                                  placeholder="Optional notes…"
                                />
                              </div>
                              <div className="self-end">
                                <button
                                  onClick={() => submitUpdate(d.id)}
                                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                            {updateMsg && <p className="text-sm text-red-600">{updateMsg}</p>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Invoices Tab */}
      {tab === 'invoices' && (
        <div className="rounded-lg bg-white shadow p-6">
          <p className="text-gray-600 text-sm">
            Outstanding invoices are managed per-patient. Use the{' '}
            <Link to="/patients" className="text-indigo-600 hover:underline">
              Patient List
            </Link>{' '}
            to navigate to a patient's billing page, or review the revenue summary above.
          </p>
          {revenue && (
            <div className="mt-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Revenue by Month (last 12)</h3>
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Month', 'Collected', 'Outstanding'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revenue.revenueByMonth.map((row) => (
                    <tr key={row.month}>
                      <td className="px-4 py-2">{row.month}</td>
                      <td className="px-4 py-2 text-green-700">
                        ${Number(row.revenue ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {row.payments_count} payment{row.payments_count !== 1 ? 's' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {revenue && revenue.topPatients.length > 0 && (
            <div className="mt-6 overflow-x-auto">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Top Billed Patients</h3>
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Patient', 'Total Billed'].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {revenue.topPatients.map((row) => (
                    <tr key={`${row.patient_name}-${row.total_billed}`}>
                      <td className="px-4 py-2">{row.patient_name}</td>
                      <td className="px-4 py-2">${Number(row.total_billed ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BillingWorkqueue;
