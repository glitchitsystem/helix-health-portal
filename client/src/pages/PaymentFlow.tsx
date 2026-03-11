/**
 * PaymentFlow — two-step mock payment UI.
 * Step 1: Fake card form. Step 2: Success or failure screen.
 * Route: /billing/pay/:invoiceId
 */

import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';
import type { Invoice } from '../types';

type Step = 'form' | 'success' | 'error' | 'plan_form';

interface CardForm {
  cardHolder: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
}

const PaymentFlow: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const isPlanMode = searchParams.get('plan') === '1';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>(isPlanMode ? 'plan_form' : 'form');
  const [submitting, setSubmitting] = useState(false);

  /* Payment result */
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /* Card form */
  const [form, setForm] = useState<CardForm>({
    cardHolder: '',
    cardNumber: '',
    expiry: '',
    cvv: '',
  });

  /* Payment plan form */
  const [installments, setInstallments] = useState(3);

  useEffect(() => {
    if (!invoiceId) return;
    api
      .get<Invoice>(`/invoices/${invoiceId}`)
      .then((r) => setInvoice(r.data))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handlePay = async () => {
    if (!invoiceId) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const response = await api.post<{ payment_intent_id: string }>(`/invoices/${invoiceId}/pay`, {
        payment_method: 'card',
        card_last_four: form.cardNumber.replace(/\s/g, '').slice(-4),
      });
      setPaymentIntentId(response.data.payment_intent_id);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.message ??
          'Payment failed. Please try again or contact billing support.',
      );
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetupPlan = async () => {
    if (!invoiceId) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await api.post(`/invoices/${invoiceId}/payment-plan`, {
        installments_total: installments,
      });
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.message ?? 'Failed to set up payment plan.');
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>;
  if (!invoice)
    return (
      <div className="p-8 text-red-600">
        Invoice not found.{' '}
        <Link to="/billing" className="underline">
          Back to billing
        </Link>
      </div>
    );

  /* ── Success screen ── */
  if (step === 'success') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center rounded-xl bg-green-50 border border-green-200 p-10 shadow">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-green-800">
          {isPlanMode ? 'Payment Plan Created!' : 'Payment Successful!'}
        </h2>
        {paymentIntentId && (
          <p className="mt-3 text-sm text-green-700">
            Transaction ID:{' '}
            <span className="font-mono">{paymentIntentId}</span>
          </p>
        )}
        {invoice && !isPlanMode && (
          <p className="mt-2 text-sm text-green-700">
            Amount paid: <strong>${Number(invoice.patient_amount).toFixed(2)}</strong>
          </p>
        )}
        {isPlanMode && (
          <p className="mt-2 text-sm text-green-700">
            {installments} installments set up for this invoice.
          </p>
        )}
        <p className="mt-2 text-xs text-green-600">
          {new Date().toLocaleString()}
        </p>
        <Link
          to={`/billing/invoice/${invoiceId}`}
          className="mt-6 inline-block px-6 py-2 bg-green-700 text-white rounded-md font-medium hover:bg-green-800"
        >
          Back to Invoice
        </Link>
      </div>
    );
  }

  /* ── Error screen ── */
  if (step === 'error') {
    return (
      <div className="max-w-md mx-auto mt-16 text-center rounded-xl bg-red-50 border border-red-200 p-10 shadow">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-2xl font-bold text-red-800">Payment Failed</h2>
        <p className="mt-3 text-sm text-red-700">{errorMsg}</p>
        <p className="mt-2 text-xs text-gray-500">
          Note: Payments over $10,000 are rejected by the test payment processor.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => setStep(isPlanMode ? 'plan_form' : 'form')}
            className="px-5 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700"
          >
            Try Again
          </button>
          <Link
            to={`/billing/invoice/${invoiceId}`}
            className="px-5 py-2 border border-gray-400 text-gray-600 rounded-md font-medium hover:bg-gray-50"
          >
            Back to Invoice
          </Link>
        </div>
      </div>
    );
  }

  /* ── Payment Plan Form ── */
  if (step === 'plan_form') {
    const installmentAmt =
      invoice.patient_amount != null
        ? Math.ceil((Number(invoice.patient_amount) / installments) * 100) / 100
        : 0;

    return (
      <div className="max-w-md mx-auto mt-8 space-y-6">
        <div>
          <Link to={`/billing/invoice/${invoiceId}`} className="text-sm text-indigo-600 hover:underline">
            ← Back to Invoice
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Set Up Payment Plan</h1>
        </div>
        <div className="rounded-lg bg-white shadow p-6 space-y-5">
          <div className="rounded-md bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              Balance due: <strong>${Number(invoice.patient_amount).toFixed(2)}</strong>
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Installments
            </label>
            <select
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
              className="w-full border rounded-md p-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {[2, 3, 4, 6, 12].map((n) => (
                <option key={n} value={n}>
                  {n} installments
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-700">
            Approximate monthly payment:{' '}
            <strong className="text-gray-900">${installmentAmt.toFixed(2)}</strong>
          </div>
          <button
            onClick={handleSetupPlan}
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Setting up…' : `Create Payment Plan`}
          </button>
        </div>
      </div>
    );
  }

  /* ── Card Payment Form ── */
  return (
    <div className="max-w-md mx-auto mt-8 space-y-6">
      <div>
        <Link to={`/billing/invoice/${invoiceId}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to Invoice
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Make a Payment</h1>
      </div>

      <div className="rounded-md bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
        🧪 <strong>Test environment</strong> — No real charges. Payments over $10,000 will fail.
      </div>

      <div className="rounded-lg bg-white shadow p-6 space-y-4">
        <div className="text-lg font-semibold text-gray-900">
          Amount due: ${Number(invoice.patient_amount).toFixed(2)}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder Name</label>
          <input
            type="text"
            name="cardHolder"
            value={form.cardHolder}
            onChange={handleFormChange}
            placeholder="Jane Smith"
            className="w-full border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
          <input
            type="text"
            name="cardNumber"
            value={form.cardNumber}
            onChange={handleFormChange}
            placeholder="4242 4242 4242 4242"
            maxLength={19}
            className="w-full border rounded-md p-2 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry</label>
            <input
              type="text"
              name="expiry"
              value={form.expiry}
              onChange={handleFormChange}
              placeholder="MM/YY"
              maxLength={5}
              className="w-full border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
            <input
              type="text"
              name="cvv"
              value={form.cvv}
              onChange={handleFormChange}
              placeholder="123"
              maxLength={4}
              className="w-full border rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <button
          onClick={handlePay}
          disabled={
            submitting ||
            !form.cardHolder.trim() ||
            form.cardNumber.replace(/\s/g, '').length < 16
          }
          className="w-full py-3 bg-indigo-600 text-white rounded-md font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Processing…' : `Pay $${Number(invoice.patient_amount).toFixed(2)}`}
        </button>
      </div>
    </div>
  );
};

export default PaymentFlow;
