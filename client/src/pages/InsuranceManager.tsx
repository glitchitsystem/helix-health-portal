/**
 * InsuranceManager — view, add, and edit insurance plans for a patient.
 * Route: /billing/insurance (patient, billing, admin)
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import type { ApiSuccess, AuthMeData, InsurancePlan } from '../types';

interface PlanForm {
  insurer_name: string;
  plan_name: string;
  member_id: string;
  group_number: string;
  effective_date: string;
  expiration_date: string;
  copay_amount: string;
  deductible_amount: string;
  deductible_met: string;
  is_primary: boolean;
}

const EMPTY_FORM: PlanForm = {
  insurer_name: '',
  plan_name: '',
  member_id: '',
  group_number: '',
  effective_date: '',
  expiration_date: '',
  copay_amount: '0',
  deductible_amount: '0',
  deductible_met: '0',
  is_primary: false,
};

const InsuranceManager: React.FC = () => {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [plans, setPlans] = useState<InsurancePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Add form state */
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<PlanForm>(EMPTY_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  /* Edit modal state */
  const [editPlan, setEditPlan] = useState<InsurancePlan | null>(null);
  const [editForm, setEditForm] = useState<PlanForm>(EMPTY_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = () => {
    if (!patientId) return;
    setLoading(true);
    api
      .get<ApiSuccess<InsurancePlan[]>>(`/patients/${patientId}/insurance`)
      .then((r) => setPlans(r.data.data))
      .catch(() => setError('Failed to load insurance plans.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api
      .get<ApiSuccess<AuthMeData>>('/auth/me')
      .then((r) => {
        const resolvedPatientId = r.data.data.patient_id ?? r.data.data.patient?.id ?? null;
        if (resolvedPatientId === null) {
          setError('Unable to resolve patient record.');
          setLoading(false);
          return;
        }
        setPatientId(resolvedPatientId);
      })
      .catch(() => {
        setError('Unable to resolve patient record.');
        setLoading(false);
      });
  }, []);

  useEffect(load, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      await api.post(`/patients/${patientId}/insurance`, {
        ...addForm,
        copay_amount: Number(addForm.copay_amount),
        deductible_amount: Number(addForm.deductible_amount),
        deductible_met: Number(addForm.deductible_met),
        is_primary: addForm.is_primary ? 1 : 0,
      });
      setShowAddForm(false);
      setAddForm(EMPTY_FORM);
      load();
    } catch (err: any) {
      setAddError(err?.response?.data?.message ?? 'Failed to add insurance plan.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEdit = (plan: InsurancePlan) => {
    setEditPlan(plan);
    setEditForm({
      insurer_name: plan.insurer_name,
      plan_name: plan.plan_name,
      member_id: plan.member_id,
      group_number: plan.group_number ?? '',
      effective_date: plan.effective_date ?? '',
      expiration_date: plan.expiration_date ?? '',
      copay_amount: String(plan.copay_amount ?? '0'),
      deductible_amount: String(plan.deductible_amount ?? '0'),
      deductible_met: String(plan.deductible_met ?? '0'),
      is_primary: plan.is_primary === 1,
    });
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId || !editPlan) return;
    setEditSubmitting(true);
    setEditError(null);
    try {
      await api.put(`/patients/${patientId}/insurance/${editPlan.id}`, {
        ...editForm,
        copay_amount: Number(editForm.copay_amount),
        deductible_amount: Number(editForm.deductible_amount),
        deductible_met: Number(editForm.deductible_met),
        is_primary: editForm.is_primary ? 1 : 0,
      });
      setEditPlan(null);
      load();
    } catch (err: any) {
      setEditError(err?.response?.data?.message ?? 'Failed to update plan.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const PlanFormFields: React.FC<{
    form: PlanForm;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCheckChange: (field: string, val: boolean) => void;
  }> = ({ form, onChange, onCheckChange }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {(
        [
          ['insurer_name', 'Insurer Name', 'text', 'BlueCross'],
          ['plan_name', 'Plan Name', 'text', 'Gold PPO'],
          ['member_id', 'Member ID', 'text', 'MBR-123456'],
          ['group_number', 'Group Number', 'text', 'GRP-789'],
          ['effective_date', 'Effective Date', 'date', ''],
          ['expiration_date', 'Expiration Date', 'date', ''],
          ['copay_amount', 'Copay ($)', 'number', '20'],
          ['deductible_amount', 'Deductible ($)', 'number', '1000'],
          ['deductible_met', 'Deductible Met ($)', 'number', '0'],
        ] as [keyof PlanForm, string, string, string][]
      ).map(([field, label, type, placeholder]) => (
        <div key={field}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <input
            type={type}
            name={field}
            value={form[field] as string}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-5">
        <input
          type="checkbox"
          id="is_primary"
          checked={form.is_primary}
          onChange={(e) => onCheckChange('is_primary', e.target.checked)}
          className="h-4 w-4 text-indigo-600"
        />
        <label htmlFor="is_primary" className="text-sm text-gray-700">
          Set as Primary Insurance
        </label>
      </div>
    </div>
  );

  if (loading) return <div className="p-8 text-gray-500">Loading insurance plans…</div>;
  if (error) return <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/billing" className="text-sm text-indigo-600 hover:underline">
            ← Back to Billing
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Insurance Manager</h1>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          {showAddForm ? 'Cancel' : '+ Add Plan'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <form
          onSubmit={handleAddSubmit}
          className="rounded-lg bg-white shadow p-6 border border-indigo-200 space-y-4"
        >
          <h2 className="text-base font-semibold text-gray-800">Add Insurance Plan</h2>
          <PlanFormFields
            form={addForm}
            onChange={(e) =>
              setAddForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
            }
            onCheckChange={(field, val) => setAddForm((prev) => ({ ...prev, [field]: val }))}
          />
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <button
            type="submit"
            disabled={addSubmitting}
            className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {addSubmitting ? 'Saving…' : 'Save Plan'}
          </button>
        </form>
      )}

      {/* Plan list */}
      {plans.length === 0 ? (
        <p className="text-gray-500">No insurance plans on file.</p>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-lg bg-white shadow p-5 flex justify-between items-start"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{plan.insurer_name}</p>
                  {plan.is_primary === 1 && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                      Primary
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600">{plan.plan_name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Member ID: {plan.member_id}
                  {plan.group_number ? ` · Group: ${plan.group_number}` : ''}
                </p>
                <div className="mt-2 flex gap-4 text-sm text-gray-600">
                  <span>Copay: ${plan.copay_amount}</span>
                  <span>Deductible: ${plan.deductible_amount}</span>
                  <span>Met: ${plan.deductible_met}</span>
                </div>
                {plan.effective_date && (
                  <p className="text-xs text-gray-400 mt-1">
                    Effective {new Date(plan.effective_date).toLocaleDateString()}
                    {plan.expiration_date
                      ? ` — ${new Date(plan.expiration_date).toLocaleDateString()}`
                      : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => openEdit(plan)}
                className="text-sm text-indigo-600 hover:underline ml-4 flex-shrink-0"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-screen overflow-y-auto p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">
              Edit — {editPlan.insurer_name}
            </h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <PlanFormFields
                form={editForm}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
                }
                onCheckChange={(field, val) =>
                  setEditForm((prev) => ({ ...prev, [field]: val }))
                }
              />
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditPlan(null)}
                  className="px-5 py-2 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsuranceManager;
