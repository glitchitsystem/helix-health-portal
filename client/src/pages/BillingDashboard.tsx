/**
 * BillingDashboard — patient-facing billing overview.
 * Shows billing summary card, invoice list, and insurance on file.
 * Route: /billing (patient, billing, admin)
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import type { BillingSummary, Invoice, InsurancePlan } from '../types';

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  disputed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const BillingDashboard: React.FC = () => {
  const { user } = useAuth();

  const [patientId, setPatientId] = useState<number | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Resolve patient ID: staff can pass a query param, patients use /auth/me */
  useEffect(() => {
    // For staff reviewing a patient, a patientId query param could be used.
    // For now fall back to the authenticated user's own patient record.
    api
      .get<{ success: true; data: { patient_id: number } }>('/auth/me')
      .then((r) => setPatientId(r.data.data.patient_id))
      .catch(() => setError('Unable to resolve patient record.'));
  }, []);

  useEffect(() => {
    if (!patientId) return;
    setLoading(true);
    Promise.all([
      api.get<BillingSummary>(`/patients/${patientId}/billing-summary`),
      api.get<Invoice[]>(`/patients/${patientId}/invoices?status=all`),
      api.get<InsurancePlan[]>(`/patients/${patientId}/insurance`),
    ])
      .then(([summaryRes, invoicesRes, plansRes]) => {
        setSummary(summaryRes.data);
        setInvoices(invoicesRes.data);
        setPlans(plansRes.data);
      })
      .catch(() => setError('Failed to load billing data.'))
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-500">Loading billing information…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <Link
          to="/billing/insurance"
          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
        >
          Manage Insurance →
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-white shadow p-5 border-l-4 border-red-500">
            <p className="text-sm text-gray-500">Total Owed</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              ${Number(summary.total_owed ?? 0).toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-white shadow p-5 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Last Payment</p>
            <p className="mt-1 text-2xl font-bold text-green-600">
              {summary.last_payment_amount
                ? `$${Number(summary.last_payment_amount).toFixed(2)}`
                : '—'}
            </p>
            {summary.last_payment_date && (
              <p className="text-xs text-gray-400 mt-1">
                {new Date(summary.last_payment_date).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-white shadow p-5 border-l-4 border-yellow-500">
            <p className="text-sm text-gray-500">Next Due Date</p>
            <p className="mt-1 text-2xl font-bold text-yellow-600">
              {summary.next_due_date
                ? new Date(summary.next_due_date).toLocaleDateString()
                : '—'}
            </p>
            {summary.overdue_count > 0 && (
              <p className="text-xs text-red-500 mt-1">
                {summary.overdue_count} overdue invoice{summary.overdue_count !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Insurance on File */}
      {plans.length > 0 && (
        <div className="rounded-lg bg-white shadow p-5">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Insurance on File</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="border rounded-md p-4 flex justify-between items-start"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{plan.insurer_name}</p>
                    {plan.is_primary === 1 && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{plan.plan_name}</p>
                  <p className="text-xs text-gray-400 mt-1">Member ID: {plan.member_id}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-gray-600">Copay: ${plan.copay_amount}</p>
                  <p className="text-gray-600">Deductible: ${plan.deductible_amount}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="rounded-lg bg-white shadow overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="p-5 text-gray-500">No invoices found.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Invoice #', 'Date', 'Due Date', 'Total', 'My Share', 'Status', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">#{inv.id}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(inv.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    ${Number(inv.total_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    ${Number(inv.patient_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_BADGE[inv.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/billing/invoice/${inv.id}`}
                      className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default BillingDashboard;
