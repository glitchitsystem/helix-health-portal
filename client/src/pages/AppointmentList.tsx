/**
 * AppointmentList — shows a patient's upcoming and past appointments
 * with cancel and reschedule actions.
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../services/api';
import { Appointment } from '../types';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'upcoming' | 'past';

const STATUS_BADGE: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-700',
  confirmed:   'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed:   'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-600',
  no_show:     'bg-orange-100 text-orange-700',
};

const AppointmentList: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const successMsg = (location.state as { success?: string } | null)?.success;

  const [tab, setTab] = useState<Tab>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchAppointments = async () => {
    setLoading(true);
    setError('');
    try {
      const now = new Date().toISOString();
      const params =
        tab === 'upcoming'
          ? { date_from: now }
          : { date_to: now };

      const r = await api.get<{ success: true; data: Appointment[] }>('/appointments', { params });
      setAppointments(r.data.data);
    } catch {
      setError('Failed to load appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAppointments(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancel = async () => {
    if (!cancelId) return;
    setBusy(true);
    setActionError('');
    try {
      await api.post(`/appointments/${cancelId}/cancel`, { reason: cancelReason });
      setCancelId(null);
      setCancelReason('');
      fetchAppointments();
    } catch (err: unknown) {
      setActionError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to cancel appointment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleId || !rescheduleTime) return;
    setBusy(true);
    setActionError('');
    try {
      await api.post(`/appointments/${rescheduleId}/reschedule`, {
        scheduled_at: new Date(rescheduleTime).toISOString(),
      });
      setRescheduleId(null);
      setRescheduleTime('');
      fetchAppointments();
    } catch (err: unknown) {
      setActionError(
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to reschedule appointment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const isPatient = user?.roles.includes('patient') && !user.roles.some(r => ['admin','provider','nurse'].includes(r));
  const canModify = (a: Appointment) =>
    !['cancelled', 'completed', 'no_show'].includes(a.status);

  return (
    <div className="mx-auto max-w-4xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
        {isPatient && (
          <Link
            to="/appointments/book"
            className="rounded-lg bg-helix-600 px-4 py-2 text-sm font-semibold text-white hover:bg-helix-700"
          >
            + Book Appointment
          </Link>
        )}
      </div>

      {successMsg && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
          {successMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {(['upcoming', 'past'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
              tab === t ? 'bg-white text-helix-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {error && <ErrorMsg msg={error} />}

      {!loading && !error && appointments.length === 0 && (
        <div className="rounded-xl bg-white p-10 text-center ring-1 ring-gray-200">
          <p className="text-sm text-gray-500">
            No {tab} appointments found.
          </p>
          {isPatient && tab === 'upcoming' && (
            <Link
              to="/appointments/book"
              className="mt-3 inline-block text-sm text-helix-600 underline"
            >
              Book your first appointment →
            </Link>
          )}
        </div>
      )}

      <div className="space-y-3">
        {appointments.map((a) => (
          <div
            key={a.id}
            className="rounded-xl bg-white p-5 ring-1 ring-gray-200 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: a.type_color ?? '#6366f1' }}
                  />
                  <span className="font-semibold text-gray-800">
                    {a.type_name ?? 'Appointment'}
                  </span>
                  <span
                    className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_BADGE[a.status] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {a.status.replace('_', ' ')}
                  </span>
                  {a.type_is_telehealth ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
                      Telehealth
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-gray-600">
                  {formatDateTime(a.scheduled_at)} &bull; {a.duration_minutes} min
                </p>
                {a.patient_first_name && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Patient: {a.patient_first_name} {a.patient_last_name} ({a.patient_mrn})
                  </p>
                )}
                {a.provider_email && (
                  <p className="text-xs text-gray-500">Provider: {a.provider_email}</p>
                )}
                {a.location && (
                  <p className="text-xs text-gray-500">📍 {a.location}</p>
                )}
                {a.telehealth_url && a.status !== 'cancelled' && (
                  <a
                    href={a.telehealth_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-helix-600 underline"
                  >
                    Join telehealth call
                  </a>
                )}
              </div>

              <div className="flex flex-shrink-0 gap-2">
                <Link
                  to={`/appointments/${a.id}`}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  View
                </Link>
                {canModify(a) && (
                  <>
                    <button
                      onClick={() => { setRescheduleId(a.id); setActionError(''); }}
                      className="rounded-lg border border-helix-300 px-3 py-1.5 text-xs text-helix-700 hover:bg-helix-50"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => { setCancelId(a.id); setActionError(''); }}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cancel modal */}
      {cancelId !== null && (
        <Modal title="Cancel Appointment" onClose={() => setCancelId(null)}>
          {actionError && <ErrorMsg msg={actionError} />}
          <p className="mb-3 text-sm text-gray-600">
            Please provide a reason for cancellation (optional).
          </p>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            placeholder="Reason…"
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setCancelId(null)}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Keep Appointment
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? 'Cancelling…' : 'Confirm Cancel'}
            </button>
          </div>
        </Modal>
      )}

      {/* Reschedule modal */}
      {rescheduleId !== null && (
        <Modal title="Reschedule Appointment" onClose={() => setRescheduleId(null)}>
          {actionError && <ErrorMsg msg={actionError} />}
          <p className="mb-3 text-sm text-gray-600">Select a new date and time.</p>
          <input
            type="datetime-local"
            value={rescheduleTime}
            onChange={(e) => setRescheduleTime(e.target.value)}
            className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-helix-400"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setRescheduleId(null)}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReschedule}
              disabled={busy || !rescheduleTime}
              className="flex-1 rounded-lg bg-helix-600 py-2 text-sm font-semibold text-white hover:bg-helix-700 disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Reschedule'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short', year: 'numeric', month: 'short',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const Spinner: React.FC = () => (
  <div className="flex justify-center py-10">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

const ErrorMsg: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
    {msg}
  </div>
);

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}
const Modal: React.FC<ModalProps> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      {children}
    </div>
  </div>
);

export default AppointmentList;
