/**
 * AppointmentBooking — 3-step wizard for booking an appointment.
 *
 * Step 1: Choose appointment type
 * Step 2: Choose provider + available time slot
 * Step 3: Review and confirm
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { AppointmentType, Provider, AvailabilitySlot } from '../types';

const STEPS = ['Choose Type', 'Pick Time', 'Confirm'];

// ─── Step 1: Type Picker ──────────────────────────────────────────────────────

interface StepTypeProps {
  onSelect: (type: AppointmentType) => void;
}

const StepType: React.FC<StepTypeProps> = ({ onSelect }) => {
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ success: true; data: AppointmentType[] }>('/appointments/types')
      .then((r) => setTypes(r.data.data.filter((t) => t.is_active)))
      .catch(() => setError('Failed to load appointment types.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (error)   return <ErrorMsg msg={error} />;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {types.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          className="flex flex-col rounded-xl border-2 border-transparent bg-white p-5 text-left shadow-sm ring-1 ring-gray-200 transition hover:border-helix-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-helix-400"
        >
          <div className="mb-2 flex items-center gap-2">
            {/* Decorative colour dot — hidden from assistive technology */}
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: t.color_hex }}
            />
            <span className="font-semibold text-gray-800">{t.name}</span>
            {t.is_telehealth ? (
              <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                Telehealth
              </span>
            ) : null}
          </div>
          <p className="text-sm text-gray-500">{t.duration_minutes} minutes</p>
        </button>
      ))}
    </div>
  );
};

// ─── Step 2: Provider + Slot Picker ──────────────────────────────────────────

interface StepSlotProps {
  apptType: AppointmentType;
  onSelect: (provider: Provider, slot: AvailabilitySlot) => void;
  onBack: () => void;
}

const StepSlot: React.FC<StepSlotProps> = ({ apptType, onSelect, onBack }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ success: true; data: Provider[] }>('/providers')
      .then((r) => setProviders(r.data.data))
      .catch(() => setError('Failed to load providers.'))
      .finally(() => setLoadingProviders(false));
  }, []);

  const fetchSlots = useCallback(async (providerId: number, chosenDate: string) => {
    setLoadingSlots(true);
    try {
      const r = await api.get<{ success: true; data: { slots: AvailabilitySlot[] } }>(
        '/appointments/availability',
        { params: { provider_id: providerId, date: chosenDate, appointment_type_id: apptType.id } },
      );
      setSlots(r.data.data.slots);
    } catch {
      setError('Failed to load available slots.');
    } finally {
      setLoadingSlots(false);
    }
  }, [apptType.id]);

  useEffect(() => {
    if (selectedProvider) fetchSlots(selectedProvider.id, date);
  }, [selectedProvider, date, fetchSlots]);

  if (loadingProviders) return <Spinner />;

  return (
    <div className="space-y-6">
      {error && <ErrorMsg msg={error} />}
      {/* Provider selector */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Select Provider</label>
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedProvider(p)}
              aria-pressed={selectedProvider?.id === p.id}
              className={`rounded-lg border p-3 text-left text-sm transition ${
                selectedProvider?.id === p.id
                  ? 'border-helix-500 bg-helix-50 font-semibold text-helix-700'
                  : 'border-gray-200 hover:border-helix-300'
              }`}
            >
              {p.email ?? `Provider #${p.id}`}
              {p.specialty_name && (
                <span className="ml-1 text-xs text-gray-500">({p.specialty_name})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Date picker */}
      {selectedProvider && (
        <div>
          <label htmlFor="appt-date" className="mb-2 block text-sm font-medium text-gray-700">Select Date</label>
          <input
            id="appt-date"
            type="date"
            value={date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400"
          />
        </div>
      )}

      {/* Slots */}
      {selectedProvider && (
        <div>
          <p id="slots-label" className="mb-2 block text-sm font-medium text-gray-700">Available Times</p>
          {loadingSlots ? (
            <Spinner />
          ) : (
            <div role="group" aria-labelledby="slots-label" className="flex flex-wrap gap-2">
              {slots.length === 0 && (
                <p className="text-sm text-gray-500">No slots available for this date.</p>
              )}
              {slots.map((s) => (
                <button
                  key={s.start}
                  disabled={!s.available}
                  aria-disabled={!s.available}
                  aria-label={`${formatTime(s.start)}${!s.available ? ' — unavailable' : ''}`}
                  onClick={() => onSelect(selectedProvider, s)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    s.available
                      ? 'border-helix-400 bg-white text-helix-700 hover:bg-helix-50'
                      : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through'
                  }`}
                >
                  {formatTime(s.start)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onBack}
        className="text-sm text-gray-500 underline hover:text-gray-700"
      >
        ← Back
      </button>
    </div>
  );
};

// ─── Step 3: Confirm ──────────────────────────────────────────────────────────

interface StepConfirmProps {
  apptType: AppointmentType;
  provider: Provider;
  slot: AvailabilitySlot;
  onBack: () => void;
  onConfirm: (notes: string) => Promise<void>;
  loading: boolean;
  error: string;
}

const StepConfirm: React.FC<StepConfirmProps> = ({
  apptType, provider, slot, onBack, onConfirm, loading, error,
}) => {
  const [notes, setNotes] = useState('');

  return (
    <div className="space-y-6">
      {error && <ErrorMsg msg={error} />}
      <div className="rounded-xl bg-gray-50 p-5 ring-1 ring-gray-200">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Appointment Summary</h2>
        <dl className="space-y-2 text-sm">
          <Row label="Type"     value={apptType.name} />
          <Row label="Duration" value={`${apptType.duration_minutes} min`} />
          <Row label="Format"   value={apptType.is_telehealth ? 'Telehealth' : 'In-Person'} />
          <Row label="Provider" value={provider.email ?? `Provider #${provider.id}`} />
          <Row label="Date"     value={formatDate(slot.start)} />
          <Row label="Time"     value={formatTime(slot.start)} />
        </dl>
      </div>

      <div>
        <label htmlFor="appt-notes" className="mb-1 block text-sm font-medium text-gray-700">
          Notes (optional)
        </label>
        <textarea
          id="appt-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any additional information for your care team…"
          aria-describedby="appt-notes-hint"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400"
        />
        <p id="appt-notes-hint" className="mt-1 text-xs text-gray-500">Optional — visible only to your care team.</p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Back
        </button>
        <button
          onClick={() => onConfirm(notes)}
          disabled={loading}
          className="flex-1 rounded-lg bg-helix-600 px-5 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60"
        >
          {loading ? 'Booking…' : 'Confirm Appointment'}
        </button>
      </div>
    </div>
  );
};

// ─── Main wizard ──────────────────────────────────────────────────────────────

const AppointmentBooking: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [apptType,  setApptType]  = useState<AppointmentType | null>(null);
  const [provider,  setProvider]  = useState<Provider | null>(null);
  const [slot,      setSlot]      = useState<AvailabilitySlot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const handleSelectType = (t: AppointmentType) => {
    setApptType(t);
    // Clear downstream selections when type changes (prevents stale slot data)
    setProvider(null);
    // COURSE_BUG [Section 10 - E2E]: setSlot(null) is missing here.
    // When the user navigates back to step 0 and selects a different appointment
    // type, the previously selected time slot is NOT cleared.  The wizard
    // carries the stale slot forward into the confirmation step, potentially
    // booking the wrong time.
    // Fix: add  setSlot(null);  here before setStep(1).
    setStep(1);
  };

  const handleSelectSlot = (p: Provider, s: AvailabilitySlot) => {
    setProvider(p);
    setSlot(s);
    setStep(2);
  };

  const handleConfirm = async (notes: string) => {
    if (!apptType || !provider || !slot) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // Fetch the current user's patient record
      const meResp = await api.get<{ success: true; data: { patient_id: number } }>('/auth/me');
      const patientId = meResp.data.data.patient_id;

      await api.post('/appointments', {
        patient_id: patientId,
        provider_id: provider.id,
        appointment_type_id: apptType.id,
        scheduled_at: slot.start,
        notes: notes || undefined,
      });

      navigate('/appointments', { state: { success: 'Appointment booked!' } });
    } catch (err: unknown) {
      const errMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to book appointment.';
      setSubmitError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Book an Appointment</h1>
        <p className="mt-1 text-sm text-gray-600">
          Follow the steps below to schedule your visit.
        </p>
      </div>

      {/* Step indicator */}
      <nav aria-label="Booking progress" className="mb-8">
      <ol className="flex items-center">
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <li className="flex flex-col items-center">
              <div
                aria-current={i === step ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${label}${i < step ? ' — completed' : i === step ? ' — current' : ''}`}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition ${
                  i < step
                    ? 'bg-helix-600 text-white'
                    : i === step
                    ? 'border-2 border-helix-600 bg-white text-helix-600'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < step ? '✓' : i + 1}
              </div>
              <span aria-hidden="true" className="mt-1 text-xs text-gray-600">{label}</span>
            </li>
            {i < STEPS.length - 1 && (
              <li aria-hidden="true" className={`mx-3 h-0.5 flex-1 ${i < step ? 'bg-helix-600' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        ))}
      </ol>
      </nav>

      {/* Steps */}
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        {step === 0 && <StepType onSelect={handleSelectType} />}
        {step === 1 && apptType && (
          <StepSlot
            apptType={apptType}
            onSelect={handleSelectSlot}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && apptType && provider && slot && (
          <StepConfirm
            apptType={apptType}
            provider={provider}
            slot={slot}
            onBack={() => setStep(1)}
            onConfirm={handleConfirm}
            loading={submitting}
            error={submitError}
          />
        )}
      </div>
    </div>
  );
};

// ─── Shared micro-components ──────────────────────────────────────────────────

const Spinner: React.FC = () => (
  <div className="flex justify-center py-8">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

const ErrorMsg: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
    {msg}
  </div>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between">
    <dt className="font-medium text-gray-500">{label}</dt>
    <dd className="text-gray-800">{value}</dd>
  </div>
);

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default AppointmentBooking;
