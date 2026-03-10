/**
 * ProviderSchedule — day/week calendar view of a provider's appointments.
 * Route: /schedule
 *
 * No external calendar library — built with Tailwind CSS grid.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Appointment } from '../types';

type ViewMode = 'day' | 'week';

const HOUR_START = 7;
const HOUR_END = 19;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString([], opts);
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_COLORS: Record<string, string> = {
  scheduled:  'bg-blue-100 text-blue-800 ring-blue-200',
  confirmed:  'bg-green-100 text-green-700 ring-green-200',
  completed:  'bg-gray-100 text-gray-600 ring-gray-200',
  cancelled:  'bg-red-100 text-red-600 ring-red-200 opacity-60',
  no_show:    'bg-orange-100 text-orange-700 ring-orange-200',
};

const ProviderSchedule: React.FC = () => {
  const { user } = useAuth();

  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(new Date());     // selected date for day view / week anchor
  const [providerId, setProviderId] = useState<number | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch the authenticated user's provider record
  useEffect(() => {
    if (!user) return;
    api.get<{ data: { id: number }[] }>('/providers/me')
      .then(r => setProviderId(r.data.data?.[0]?.id ?? null))
      .catch(() => {
        // Fall back to searching by user_id
        api.get<{ data: { id: number }[] }>(`/providers?user_id=${user.id}`)
          .then(r => setProviderId(r.data.data?.[0]?.id ?? null))
          .catch(() => null);
      });
  }, [user]);

  const fetchAppointments = useCallback(() => {
    if (!providerId) return;
    setLoading(true);
    setError('');

    const weekStart = view === 'week' ? startOfWeek(anchor) : anchor;
    const weekEnd   = view === 'week' ? addDays(weekStart, 6) : anchor;

    api.get<{ data: Appointment[] }>('/appointments', {
      params: {
        provider_id: providerId,
        date_from: isoDate(weekStart),
        date_to:   isoDate(weekEnd),
      },
    })
      .then(r => setAppointments(r.data.data))
      .catch(() => setError('Failed to load schedule.'))
      .finally(() => setLoading(false));
  }, [providerId, anchor, view]);

  useEffect(() => { fetchAppointments(); }, [fetchAppointments]);

  // ─── Date range helpers ────────────────────────────────────────────────────
  const weekDates: Date[] = view === 'week'
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
    : [anchor];

  const prev = () => setAnchor(d => addDays(d, view === 'week' ? -7 : -1));
  const next = () => setAnchor(d => addDays(d, view === 'week' ? 7 : 1));

  const rangeLabel = view === 'week'
    ? `${fmt(weekDates[0], { month: 'short', day: 'numeric' })} – ${fmt(weekDates[6], { month: 'short', day: 'numeric', year: 'numeric' })}`
    : fmt(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Group appointments by date string and then by hour
  const apptsByDate: Record<string, Appointment[]> = {};
  for (const a of appointments) {
    const dateKey = isoDate(new Date(a.scheduled_at));
    (apptsByDate[dateKey] ??= []).push(a);
  }

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

  // For each cell (day × hour), find appointments
  function apptsForCell(day: Date, hour: number): Appointment[] {
    const dateKey = isoDate(day);
    return (apptsByDate[dateKey] ?? []).filter(a => {
      const h = new Date(a.scheduled_at).getHours();
      return h === hour;
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={prev} className="rounded-lg p-2 hover:bg-gray-100">‹</button>
          <h2 className="min-w-[18rem] text-center text-base font-semibold text-gray-800">{rangeLabel}</h2>
          <button onClick={next} className="rounded-lg p-2 hover:bg-gray-100">›</button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-lg border px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            Today
          </button>
        </div>
        <div className="flex rounded-lg border overflow-hidden">
          {(['day', 'week'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 text-sm capitalize transition ${
                view === v ? 'bg-helix-600 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="px-6 py-2 text-sm text-red-600">{error}</p>}

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex justify-center pt-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-helix-200 border-t-helix-600" />
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky top-0 w-14 bg-white border-b border-r" />
                {weekDates.map(day => {
                  const isToday = isoDate(day) === isoDate(new Date());
                  return (
                    <th key={isoDate(day)} className="sticky top-0 bg-white border-b text-center py-2 font-normal">
                      <div className="text-xs text-gray-500">{DAY_LABELS[day.getDay()]}</div>
                      <div className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        isToday ? 'bg-helix-600 text-white' : 'text-gray-700'
                      }`}>
                        {day.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {hours.map(hour => (
                <tr key={hour} className="h-12">
                  <td className="border-r border-b text-right pr-2 text-gray-400 align-top pt-1">
                    {hour === 12 ? '12 PM' : hour < 12 ? `${hour} AM` : `${hour - 12} PM`}
                  </td>
                  {weekDates.map(day => {
                    const cellAppts = apptsForCell(day, hour);
                    return (
                      <td key={isoDate(day)} className="relative border-b border-r align-top p-0.5">
                        {cellAppts.map(a => (
                          <AppointmentChip key={a.id} appointment={a} />
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 border-t px-6 py-2 text-xs text-gray-500">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <span key={status} className={`rounded-full px-2 py-0.5 ring-1 ${cls} capitalize`}>
            {status.replace('_', ' ')}
          </span>
        ))}
      </div>
    </div>
  );
};

const AppointmentChip: React.FC<{ appointment: Appointment }> = ({ appointment: a }) => {
  const time = new Date(a.scheduled_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const colorClass = STATUS_COLORS[a.status] ?? 'bg-gray-100 text-gray-600 ring-gray-200';
  return (
    <Link
      to={`/appointments/${a.id}`}
      className={`mb-0.5 flex flex-col rounded ring-1 px-1.5 py-0.5 truncate leading-tight ${colorClass}`}
      title={`${a.patient_first_name} ${a.patient_last_name} – ${a.type_name}`}
    >
      <span className="font-medium truncate">
        {a.patient_first_name} {a.patient_last_name}
      </span>
      <span className="opacity-75">{time} · {a.type_name}</span>
      {a.type_is_telehealth ? <span className="opacity-60">📹 Telehealth</span> : null}
    </Link>
  );
};

export default ProviderSchedule;
