/**
 * AppointmentDetail — view a single appointment's full details.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import { Appointment } from '../types';

const STATUS_BADGE: Record<string, string> = {
  scheduled:   'bg-blue-100 text-blue-700',
  confirmed:   'bg-green-100 text-green-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  completed:   'bg-gray-100 text-gray-600',
  cancelled:   'bg-red-100 text-red-600',
  no_show:     'bg-orange-100 text-orange-700',
};

const AppointmentDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<{ success: true; data: Appointment }>(`/appointments/${id}`)
      .then((r) => setAppointment(r.data.data))
      .catch(() => setError('Appointment not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleCancel = async () => {
    if (!appointment) return;
    setCancelling(true);
    try {
      await api.post(`/appointments/${appointment.id}/cancel`, { reason: cancelReason });
      setAppointment((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
      setCancelModal(false);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to cancel.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <Spinner />;
  if (error || !appointment) return (
    <div className="py-10 text-center text-sm text-red-600">{error || 'Appointment not found.'}</div>
  );

  const canModify = !['cancelled', 'completed', 'no_show'].includes(appointment.status);

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-gray-500">
        <Link to="/appointments" className="hover:text-helix-600">Appointments</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-800">Detail</span>
      </nav>

      <div className="rounded-2xl bg-white p-7 shadow-sm ring-1 ring-gray-200">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {appointment.type_name ?? 'Appointment'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              ID #{appointment.id} &bull; Created {formatDate(appointment.created_at)}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              STATUS_BADGE[appointment.status] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {appointment.status.replace('_', ' ')}
          </span>
        </div>

        {/* Details grid */}
        <dl className="grid gap-y-4 gap-x-6 sm:grid-cols-2">
          <DetailRow label="Date & Time"     value={formatDateTime(appointment.scheduled_at)} />
          <DetailRow label="Duration"        value={`${appointment.duration_minutes} minutes`} />
          <DetailRow label="Format"          value={appointment.type_is_telehealth ? 'Telehealth' : 'In-Person'} />
          {appointment.location && <DetailRow label="Location" value={appointment.location} />}
          {appointment.patient_first_name && (
            <DetailRow
              label="Patient"
              value={`${appointment.patient_first_name} ${appointment.patient_last_name} (${appointment.patient_mrn})`}
            />
          )}
          {appointment.provider_email && (
            <DetailRow label="Provider" value={appointment.provider_email} />
          )}
          {appointment.notes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</dt>
              <dd className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{appointment.notes}</dd>
            </div>
          )}
          {appointment.telehealth_url && appointment.status !== 'cancelled' && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">Telehealth Link</dt>
              <dd className="mt-1">
                <a
                  href={appointment.telehealth_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-helix-600 underline break-all"
                >
                  {appointment.telehealth_url}
                </a>
              </dd>
            </div>
          )}
          {appointment.cancel_reason && (
            <div className="sm:col-span-2 rounded-lg bg-red-50 px-4 py-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-red-600">Cancellation Reason</dt>
              <dd className="mt-1 text-sm text-red-700">{appointment.cancel_reason}</dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        {canModify && (
          <div className="mt-6 flex gap-3 border-t border-gray-100 pt-6">
            <button
              onClick={() => navigate(`/appointments/${appointment.id}/reschedule`)}
              className="rounded-lg border border-helix-300 px-4 py-2 text-sm text-helix-700 hover:bg-helix-50"
            >
              Reschedule
            </button>
            <button
              onClick={() => setCancelModal(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Cancel Appointment
            </button>
          </div>
        )}
      </div>

      {/* Cancel modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Cancel Appointment</h2>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Reason for cancellation (optional)…"
              className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCancelModal(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
              >
                Keep
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {cancelling ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
    <dd className="mt-1 text-sm text-gray-800">{value}</dd>
  </div>
);

const Spinner: React.FC = () => (
  <div className="flex justify-center py-20">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
  </div>
);

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'long', year: 'numeric', month: 'long',
    day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default AppointmentDetail;
