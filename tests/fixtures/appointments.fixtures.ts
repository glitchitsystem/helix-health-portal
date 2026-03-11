/**
 * tests/fixtures/appointments.fixtures.ts
 *
 * Factory functions for appointment and availability slot test data.
 */

import { faker } from '@faker-js/faker';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type AppointmentTypeName =
  | 'Annual Physical'
  | 'Follow-up'
  | 'Telehealth Consult'
  | 'Urgent Care';

export interface AppointmentPayload {
  patientId:           number;
  providerId:          number;
  appointmentTypeName: AppointmentTypeName;
  scheduledAt:         string; // ISO-8601
  status:              AppointmentStatus;
  location?:           string;
  notes?:              string;
}

export interface AvailabilitySlot {
  date:         string; // YYYY-MM-DD
  time:         string; // HH:MM
  durationMins: number;
  providerId:   number;
  isAvailable:  boolean;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Returns an ISO string for a date N days from now (default: 1).
 * Time is always 09:00 UTC to ensure determinism.
 */
export function futureDate(daysFromNow = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns an ISO string for a date N days in the past.
 * Time is always 10:00 UTC.
 */
export function pastDate(daysAgo = 1): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

/**
 * Returns a date string YYYY-MM-DD for N weeks from now.
 */
export function futureDateString(weeksFromNow = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
}

// ─── Appointment type constants ───────────────────────────────────────────────

export const APPOINTMENT_TYPES: Record<AppointmentTypeName, { durationMins: number; isTelehealth: boolean }> = {
  'Annual Physical':    { durationMins: 60, isTelehealth: false },
  'Follow-up':          { durationMins: 30, isTelehealth: false },
  'Telehealth Consult': { durationMins: 30, isTelehealth: true  },
  'Urgent Care':        { durationMins: 45, isTelehealth: false },
};

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Builds an appointment payload for POST /api/patients/:id/appointments.
 */
export function buildAppointment(
  overrides: Partial<AppointmentPayload> & Pick<AppointmentPayload, 'patientId' | 'providerId'>,
): AppointmentPayload {
  const typeName = overrides.appointmentTypeName ?? 'Follow-up';
  return {
    patientId:           overrides.patientId,
    providerId:          overrides.providerId,
    appointmentTypeName: typeName,
    scheduledAt:         overrides.scheduledAt ?? futureDate(faker.number.int({ min: 1, max: 30 })),
    status:              overrides.status ?? 'scheduled',
    location:            overrides.location ?? `Room ${faker.number.int({ min: 100, max: 199 })}`,
    notes:               overrides.notes,
  };
}

/**
 * Builds a completed past appointment payload.
 */
export function buildCompletedAppointment(
  overrides: Pick<AppointmentPayload, 'patientId' | 'providerId'> & Partial<AppointmentPayload>,
): AppointmentPayload {
  return buildAppointment({
    ...overrides,
    scheduledAt: pastDate(faker.number.int({ min: 7, max: 90 })),
    status: 'completed',
  });
}

/**
 * Builds a cancelled appointment payload.
 */
export function buildCancelledAppointment(
  overrides: Pick<AppointmentPayload, 'patientId' | 'providerId'> & Partial<AppointmentPayload>,
): AppointmentPayload {
  return buildAppointment({
    ...overrides,
    scheduledAt: pastDate(faker.number.int({ min: 1, max: 30 })),
    status: 'cancelled',
  });
}

/**
 * Builds an availability slot object for testing schedule endpoints.
 */
export function buildAvailabilitySlot(
  overrides: Partial<AvailabilitySlot> & Pick<AvailabilitySlot, 'providerId'>,
): AvailabilitySlot {
  const typeName = faker.helpers.arrayElement(Object.keys(APPOINTMENT_TYPES)) as AppointmentTypeName;
  return {
    date:         overrides.date ?? futureDateString(1),
    time:         overrides.time ?? '09:00',
    durationMins: overrides.durationMins ?? APPOINTMENT_TYPES[typeName].durationMins,
    providerId:   overrides.providerId,
    isAvailable:  overrides.isAvailable ?? true,
  };
}

/**
 * Generate N future appointment payloads for the same provider.
 * Slots are spaced 1 day apart to avoid conflicts.
 */
export function buildAppointmentList(
  count: number,
  patientId: number,
  providerId: number,
): AppointmentPayload[] {
  return Array.from({ length: count }, (_, i) =>
    buildAppointment({
      patientId,
      providerId,
      scheduledAt: futureDate(i + 1),
    }),
  );
}

// ─── Conflict detection helpers ───────────────────────────────────────────────

/**
 * Returns two overlapping appointment payloads for the same provider/time.
 * Useful for testing the back-to-back conflict bug (Bug 2).
 */
export function buildConflictingAppointments(
  patientId1: number,
  patientId2: number,
  providerId: number,
): [AppointmentPayload, AppointmentPayload] {
  const sharedTime = futureDate(5);
  return [
    buildAppointment({ patientId: patientId1, providerId, scheduledAt: sharedTime,  appointmentTypeName: 'Follow-up' }),
    buildAppointment({ patientId: patientId2, providerId, scheduledAt: sharedTime,  appointmentTypeName: 'Follow-up' }),
  ];
}

/**
 * Returns two back-to-back appointments — first ends exactly when second starts.
 * This tests Bug 2: the >= vs > off-by-one in countConflicts().
 */
export function buildBackToBackAppointments(
  patientId1: number,
  patientId2: number,
  providerId: number,
): [AppointmentPayload, AppointmentPayload] {
  const firstStart  = futureDate(3);
  // Follow-up = 30 min; second starts exactly 30 min after first
  const d = new Date(firstStart);
  d.setMinutes(d.getMinutes() + 30);
  const secondStart = d.toISOString();

  return [
    buildAppointment({ patientId: patientId1, providerId, scheduledAt: firstStart,  appointmentTypeName: 'Follow-up' }),
    buildAppointment({ patientId: patientId2, providerId, scheduledAt: secondStart, appointmentTypeName: 'Follow-up' }),
  ];
}
