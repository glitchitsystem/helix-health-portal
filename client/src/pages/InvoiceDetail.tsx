/**
 * InvoiceDetail — shows a single invoice with line items, EOB breakdown,
 * payment history, dispute form, and payment plan info.
 * Route: /billing/invoice/:id
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import type { Invoice, InvoiceItem, Payment, PaymentPlan, BillingDispute } from '../types';

interface InvoiceDetail extends Invoice {
  items: InvoiceItem[];
  payments: Payment[];
  payment_plan: PaymentPlan | null;
  dispute: BillingDispute | null;
}

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  disputed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Dispute form state */
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeMsg, setDisputeMsg] = useState<string | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api
      .get<InvoiceDetail>(`/invoices/${id}`)
      .then((r) => setInvoice(r.data))
      .catch(() => setError('Failed to load invoice.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const submitDispute = async () => {
    if (!id || !disputeReason.trim()) return;
    setDisputeSubmitting(true);
    setDisputeMsg(null);
    try {
      await api.post(`/invoices/${id}/dispute`, { reason: disputeReason });
      setDisputeMsg('Dispute submitted successfully.');
      setShowDisputeForm(false);
      setDisputeReason('');
      load();
    } catch (err: any) {
      setDisputeMsg(err?.response?.data?.message ?? 'Failed to submit dispute.');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading invoice…</div>;
  if (error || !invoice)
    return <div className="rounded-md bg-red-50 p-4 text-red-700">{error ?? 'Not found.'}</div>;

  const canPay = invoice.status === 'pending' || invoice.status === 'overdue';

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/billing" className="text-sm text-indigo-600 hover:underline">
            ← Back to Billing
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Invoice #{invoice.id}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Issued {new Date(invoice.invoice_date).toLocaleDateString()} · Due{' '}
            {new Date(invoice.due_date).toLocaleDateString()}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            STATUS_BADGE[invoice.status] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
        </span>
      </div>

      {/* EOB Summary */}
      <div className="rounded-lg bg-white shadow p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Charges</p>
          <p className="text-xl font-bold text-gray-900">
            ${Number(invoice.total_amount).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Insurance Covers</p>
          <p className="text-xl font-bold text-green-600">
            ${Number(invoice.insurance_amount).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Your Responsibility</p>
          <p className="text-xl font-bold text-red-600">
            ${Number(invoice.patient_amount).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Line Items */}
      {invoice.items && invoice.items.length > 0 && (
        <div className="rounded-lg bg-white shadow overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">Line Items</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['CPT Code', 'Description', 'Qty', 'Unit Price', 'Ins. Adj.', 'Your Cost'].map(
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
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-mono text-xs">{item.cpt_code ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-700">{item.description}</td>
                  <td className="px-4 py-2 text-center">{item.quantity}</td>
                  <td className="px-4 py-2">${Number(item.unit_price).toFixed(2)}</td>
                  <td className="px-4 py-2 text-green-600">
                    -${Number(item.insurance_adjustment ?? 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    ${Number(item.patient_responsibility).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Action Buttons */}
      {canPay && (
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/billing/pay/${invoice.id}`)}
            className="px-5 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 transition"
          >
            Pay Now — ${Number(invoice.patient_amount).toFixed(2)}
          </button>
          {!invoice.payment_plan && (
            <Link
              to={`/billing/pay/${invoice.id}?plan=1`}
              className="px-5 py-2 border border-indigo-600 text-indigo-600 rounded-md font-medium hover:bg-indigo-50 transition"
            >
              Set Up Payment Plan
            </Link>
          )}
          {!invoice.dispute && !showDisputeForm && (
            <button
              onClick={() => setShowDisputeForm(true)}
              className="px-5 py-2 border border-gray-400 text-gray-600 rounded-md font-medium hover:bg-gray-50 transition"
            >
              Dispute Charge
            </button>
          )}
        </div>
      )}

      {/* Payment Plan Info */}
      {invoice.payment_plan && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-5">
          <h2 className="text-base font-semibold text-blue-800 mb-2">Active Payment Plan</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-blue-600 font-medium">Installment Amount</p>
              <p className="text-blue-900">${Number(invoice.payment_plan.installment_amount).toFixed(2)}</p>
            </div>
            <div>
              <p className="text-blue-600 font-medium">Total Installments</p>
              <p className="text-blue-900">{invoice.payment_plan.installments_total}</p>
            </div>
            <div>
              <p className="text-blue-600 font-medium">Paid</p>
              <p className="text-blue-900">{invoice.payment_plan.installments_paid}</p>
            </div>
            <div>
              <p className="text-blue-600 font-medium">Next Payment</p>
              <p className="text-blue-900">
                {invoice.payment_plan.next_payment_date
                  ? new Date(invoice.payment_plan.next_payment_date).toLocaleDateString()
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Status */}
      {invoice.dispute && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 p-5">
          <h2 className="text-base font-semibold text-purple-800 mb-1">Active Dispute</h2>
          <p className="text-sm text-purple-700">
            <strong>Status:</strong> {invoice.dispute.status}
          </p>
          <p className="text-sm text-purple-700 mt-1">
            <strong>Reason:</strong> {invoice.dispute.reason}
          </p>
          {invoice.dispute.resolution_notes && (
            <p className="text-sm text-purple-700 mt-1">
              <strong>Resolution:</strong> {invoice.dispute.resolution_notes}
            </p>
          )}
        </div>
      )}

      {/* Dispute Form */}
      {showDisputeForm && (
        <div className="rounded-lg bg-white shadow p-5 border border-gray-200">
          <h2 className="text-base font-semibold text-gray-800 mb-3">Submit a Dispute</h2>
          <textarea
            className="w-full border rounded-md p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            rows={4}
            placeholder="Describe why you are disputing this charge…"
            value={disputeReason}
            onChange={(e) => setDisputeReason(e.target.value)}
          />
          {disputeMsg && (
            <p className="mt-2 text-sm text-red-600">{disputeMsg}</p>
          )}
          <div className="flex gap-3 mt-3">
            <button
              onClick={submitDispute}
              disabled={disputeSubmitting || !disputeReason.trim()}
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
            >
              {disputeSubmitting ? 'Submitting…' : 'Submit Dispute'}
            </button>
            <button
              onClick={() => setShowDisputeForm(false)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Payment History */}
      {invoice.payments && invoice.payments.length > 0 && (
        <div className="rounded-lg bg-white shadow overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">Payment History</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Amount', 'Method', 'Status', 'Transaction ID'].map((h) => (
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
              {invoice.payments.map((pmt) => (
                <tr key={pmt.id}>
                  <td className="px-4 py-2">
                    {new Date(pmt.payment_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">${Number(pmt.amount).toFixed(2)}</td>
                  <td className="px-4 py-2 capitalize">{pmt.payment_method}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        pmt.status === 'succeeded'
                          ? 'bg-green-100 text-green-700'
                          : pmt.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {pmt.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {pmt.stripe_payment_intent_id ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetail;
