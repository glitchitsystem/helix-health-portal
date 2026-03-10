/**
 * Appointments routes — /api/appointments
 *
 * Endpoints:
 *  GET    /appointments/availability   — available time slots for a provider
 *  GET    /appointments                — filtered list
 *  GET    /appointments/:id            — single appointment with patient + provider details
 *  POST   /appointments                — book appointment
 *  PUT    /appointments/:id            — update appointment details
 *  DELETE /appointments/:id            — soft delete (sets status = 'cancelled')
 *  POST   /appointments/:id/cancel     — cancel with reason
 *  POST   /appointments/:id/reschedule — reschedule to new datetime
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

// All appointment routes require authentication
router.use(validateToken);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Asserts that a patient in a request can only access their own appointments,
 * unless they are a provider/nurse/admin.
 */
function assertPatientAccess(
  req: AuthenticatedRequest,
  patientId: number,
  next: NextFunction,
): boolean {
  const user = req.user!;
  if (user.roles.includes('admin') || user.roles.includes('provider') || user.roles.includes('nurse')) {
    return true;
  }
  if (user.roles.includes('patient')) {
    const db = getDb();
    const patient = db
      .prepare('SELECT id FROM patients WHERE id = ? AND user_id = ?')
      .get(patientId, user.sub) as { id: number } | undefined;
    if (!patient) {
      next(createError('Access denied to this patient record', 403));
      return false;
    }
    return true;
  }
  next(createError('Access denied', 403));
  return false;
}

/**
 * Checks whether a provider has any overlapping appointments for a given
 * time window.  Returns the count of conflicting appointments.
 *
 * A conflict exists when the new window overlaps an existing appointment:
 *   existing.start < new.end  AND  existing.end > new.start
 */
function countConflicts(
  providerId: number,
  startIso: string,
  durationMinutes: number,
  excludeAppointmentId?: number,
): number {
  const db = getDb();
  // Compute end time in SQLite using datetime()
  const query = excludeAppointmentId
    ? `SELECT COUNT(*) as cnt FROM appointments
       WHERE provider_id = ?
         AND status NOT IN ('cancelled','no_show')
         AND id != ?
         AND scheduled_at < datetime(?, '+' || ? || ' minutes')
         AND datetime(scheduled_at, '+' || duration_minutes || ' minutes') > ?`
    : `SELECT COUNT(*) as cnt FROM appointments
       WHERE provider_id = ?
         AND status NOT IN ('cancelled','no_show')
         AND scheduled_at < datetime(?, '+' || ? || ' minutes')
         AND datetime(scheduled_at, '+' || duration_minutes || ' minutes') > ?`;

  const args = excludeAppointmentId
    ? [providerId, excludeAppointmentId, startIso, durationMinutes, startIso]
    : [providerId, startIso, durationMinutes, startIso];

  const row = db.prepare(query).get(...args) as { cnt: number };
  return row.cnt;
}

/**
 * Mocked reminder scheduling — logs to console.
 */
function scheduleReminders(appointmentId: number, scheduledAt: string): void {
  const db = getDb();
  const appt24h = new Date(new Date(scheduledAt).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const appt1h  = new Date(new Date(scheduledAt).getTime() - 60 * 60 * 1000).toISOString();

  const insert = db.prepare(
    `INSERT INTO appointment_reminders (appointment_id, reminder_type, scheduled_at, status)
     VALUES (?, ?, ?, 'pending')`,
  );
  insert.run(appointmentId, 'email', appt24h);
  insert.run(appointmentId, 'email', appt1h);

  console.log(`[NOTIFICATION] Reminders scheduled for appointment ${appointmentId} at ${appt24h} and ${appt1h}`);
}

/**
 * Mocked reminder cancellation.
 */
function cancelReminders(appointmentId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE appointment_reminders
     SET status = 'cancelled'
     WHERE appointment_id = ? AND status = 'pending'`,
  ).run(appointmentId);
  console.log(`[NOTIFICATION] Reminders cancelled for appointment ${appointmentId}`);
}

// ─── GET /appointments/availability ──────────────────────────────────────────

/**
 * Return available time slots for a provider on a given date.
 * Query params: provider_id (required), date (required, YYYY-MM-DD),
 *               appointment_type_id (optional, defaults to 30-min slot)
 *
 * Working hours assumed: 08:00–17:00 local time (stored as UTC here — simplified).
 */
router.get(
  '/availability',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider_id, date, appointment_type_id } = req.query as Record<string, string>;

      if (!provider_id || !date) {
        return next(createError('provider_id and date are required', 400));
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return next(createError('date must be in YYYY-MM-DD format', 400));
      }

      const db = getDb();

      // Verify provider exists
      const provider = db.prepare('SELECT id FROM providers WHERE id = ?').get(Number(provider_id));
      if (!provider) return next(createError('Provider not found', 404));

      // Determine slot duration
      let slotMinutes = 30;
      if (appointment_type_id) {
        const apptType = db
          .prepare('SELECT duration_minutes FROM appointment_types WHERE id = ? AND is_active = 1')
          .get(Number(appointment_type_id)) as { duration_minutes: number } | undefined;
        if (apptType) slotMinutes = apptType.duration_minutes;
      }

      // Build slots: 08:00 to 17:00 in slotMinutes increments
      const slots: Array<{ start: string; end: string; available: boolean }> = [];
      const dayStart = new Date(`${date}T08:00:00.000Z`);
      const dayEnd   = new Date(`${date}T17:00:00.000Z`);

      for (
        let slotStart = new Date(dayStart);
        slotStart.getTime() + slotMinutes * 60_000 <= dayEnd.getTime();
        slotStart = new Date(slotStart.getTime() + slotMinutes * 60_000)
      ) {
        const slotEnd  = new Date(slotStart.getTime() + slotMinutes * 60_000);
        const startIso = slotStart.toISOString();
        const conflicts = countConflicts(Number(provider_id), startIso, slotMinutes);
        slots.push({
          start: startIso,
          end: slotEnd.toISOString(),
          available: conflicts === 0,
        });
      }

      res.json({ success: true, data: { slots, slot_duration_minutes: slotMinutes } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /appointments ────────────────────────────────────────────────────────

router.get(
  '/',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;
      const { patient_id, provider_id, status, date_from, date_to } = req.query as Record<string, string>;

      // Patients can only see their own appointments
      let effectivePatientId: number | undefined;
      if (user.roles.includes('patient')) {
        const patientRow = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patientRow) return next(createError('Patient record not found', 404));
        effectivePatientId = patientRow.id;
      } else if (patient_id) {
        effectivePatientId = Number(patient_id);
      }

      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (effectivePatientId) {
        conditions.push('a.patient_id = ?');
        params.push(effectivePatientId);
      }
      if (provider_id) {
        conditions.push('a.provider_id = ?');
        params.push(Number(provider_id));
      }
      if (status) {
        conditions.push('a.status = ?');
        params.push(status);
      }
      if (date_from) {
        conditions.push('a.scheduled_at >= ?');
        params.push(date_from);
      }
      if (date_to) {
        conditions.push('a.scheduled_at <= ?');
        params.push(date_to);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const rows = db
        .prepare(
          `SELECT
             a.*,
             at.name          AS type_name,
             at.color_hex     AS type_color,
             at.is_telehealth AS type_is_telehealth,
             pd.first_name    AS patient_first_name,
             pd.last_name     AS patient_last_name,
             p.mrn            AS patient_mrn,
             u_prov.email     AS provider_email,
             u_prov.id        AS provider_user_id
           FROM appointments a
           JOIN appointment_types at ON at.id = a.appointment_type_id
           JOIN patients p           ON p.id  = a.patient_id
           JOIN patient_demographics pd ON pd.patient_id = p.id
           JOIN providers prov       ON prov.id = a.provider_id
           JOIN users u_prov         ON u_prov.id = prov.user_id
           ${where}
           ORDER BY a.scheduled_at ASC`,
        )
        .all(...params);

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /appointments/:id ────────────────────────────────────────────────────

router.get(
  '/:id',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const apptId = Number(req.params.id);

      const row = db
        .prepare(
          `SELECT
             a.*,
             at.name          AS type_name,
             at.duration_minutes AS type_duration,
             at.color_hex     AS type_color,
             at.is_telehealth AS type_is_telehealth,
             pd.first_name    AS patient_first_name,
             pd.last_name     AS patient_last_name,
             p.mrn            AS patient_mrn,
             p.user_id        AS patient_user_id
           FROM appointments a
           JOIN appointment_types at ON at.id = a.appointment_type_id
           JOIN patients p           ON p.id  = a.patient_id
           JOIN patient_demographics pd ON pd.patient_id = p.id
           JOIN providers prov       ON prov.id = a.provider_id
           WHERE a.id = ?`,
        )
        .get(apptId) as (Record<string, unknown> & { patient_user_id: number }) | undefined;

      if (!row) return next(createError('Appointment not found', 404));

      // Patients can only view their own appointments
      const user = req.user!;
      if (
        user.roles.includes('patient') &&
        Number(row.patient_user_id) !== user.sub
      ) {
        return next(createError('Access denied', 403));
      }

      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /appointments ───────────────────────────────────────────────────────

router.post(
  '/',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;
      const { patient_id, provider_id, appointment_type_id, scheduled_at, location, notes } =
        req.body as Record<string, unknown>;

      if (!patient_id || !provider_id || !appointment_type_id || !scheduled_at) {
        return next(createError('patient_id, provider_id, appointment_type_id, and scheduled_at are required', 400));
      }

      // Patients can only book for themselves
      if (user.roles.includes('patient')) {
        const patientRow = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patientRow || patientRow.id !== Number(patient_id)) {
          return next(createError('Patients may only book appointments for themselves', 403));
        }
      }

      // Validate foreign keys
      const patientExists = db.prepare('SELECT id FROM patients WHERE id = ?').get(Number(patient_id));
      if (!patientExists) return next(createError('Patient not found', 404));

      const apptType = db
        .prepare('SELECT id, duration_minutes, is_telehealth FROM appointment_types WHERE id = ? AND is_active = 1')
        .get(Number(appointment_type_id)) as
        | { id: number; duration_minutes: number; is_telehealth: number }
        | undefined;
      if (!apptType) return next(createError('Appointment type not found or inactive', 404));

      const provider = db
        .prepare('SELECT id FROM providers WHERE id = ?')
        .get(Number(provider_id));
      if (!provider) return next(createError('Provider not found', 404));

      // Conflict detection
      const conflicts = countConflicts(
        Number(provider_id),
        String(scheduled_at),
        apptType.duration_minutes,
      );
      if (conflicts > 0) {
        return next(createError('Provider is not available at the requested time', 409));
      }

      const telehealth_url = apptType.is_telehealth
        ? `https://telehealth.helixhealthportal.test/join/${Math.random().toString(36).slice(2)}`
        : null;

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO appointments
             (patient_id, provider_id, appointment_type_id, status, scheduled_at,
              duration_minutes, location, telehealth_url, notes, created_by)
           VALUES (?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          Number(patient_id),
          Number(provider_id),
          Number(appointment_type_id),
          String(scheduled_at),
          apptType.duration_minutes,
          location ?? null,
          telehealth_url,
          notes ?? null,
          user.sub,
        );

      const newId = Number(lastInsertRowid);
      scheduleReminders(newId, String(scheduled_at));

      const created = db.prepare('SELECT * FROM appointments WHERE id = ?').get(newId);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /appointments/:id ────────────────────────────────────────────────────

router.put(
  '/:id',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const apptId = Number(req.params.id);

      const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId) as
        | Record<string, unknown>
        | undefined;
      if (!existing) return next(createError('Appointment not found', 404));
      if (existing.status === 'cancelled') {
        return next(createError('Cannot update a cancelled appointment', 400));
      }

      const { status, location, notes, telehealth_url } = req.body as Record<string, unknown>;

      const validStatuses = ['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show'];
      if (status && !validStatuses.includes(String(status))) {
        return next(createError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400));
      }

      db.prepare(
        `UPDATE appointments
         SET status        = COALESCE(?, status),
             location      = COALESCE(?, location),
             notes         = COALESCE(?, notes),
             telehealth_url = COALESCE(?, telehealth_url)
         WHERE id = ?`,
      ).run(status ?? null, location ?? null, notes ?? null, telehealth_url ?? null, apptId);

      const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── DELETE /appointments/:id ─────────────────────────────────────────────────

router.delete(
  '/:id',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const apptId = Number(req.params.id);

      const existing = db.prepare('SELECT id FROM appointments WHERE id = ?').get(apptId);
      if (!existing) return next(createError('Appointment not found', 404));

      db.prepare(
        `UPDATE appointments SET status = 'cancelled', cancel_reason = 'Deleted by staff' WHERE id = ?`,
      ).run(apptId);
      cancelReminders(apptId);

      res.json({ success: true, data: { id: apptId, status: 'cancelled' } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /appointments/:id/cancel ────────────────────────────────────────────

router.post(
  '/:id/cancel',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const apptId = Number(req.params.id);
      const user = req.user!;
      const { reason } = req.body as { reason?: string };

      const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId) as
        | Record<string, unknown>
        | undefined;
      if (!existing) return next(createError('Appointment not found', 404));
      if (existing.status === 'cancelled') {
        return next(createError('Appointment is already cancelled', 400));
      }

      // Patients can only cancel their own appointments
      if (user.roles.includes('patient')) {
        const patientRow = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patientRow || patientRow.id !== Number(existing.patient_id)) {
          return next(createError('Access denied', 403));
        }
      }

      db.prepare(
        `UPDATE appointments SET status = 'cancelled', cancel_reason = ? WHERE id = ?`,
      ).run(reason ?? 'Cancelled by request', apptId);

      cancelReminders(apptId);
      console.log(`[NOTIFICATION] Appointment ${apptId} cancelled. Reason: ${reason ?? 'N/A'}`);

      const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /appointments/:id/reschedule ────────────────────────────────────────

router.post(
  '/:id/reschedule',
  auditAccess('appointments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const apptId = Number(req.params.id);
      const user = req.user!;
      const { scheduled_at } = req.body as { scheduled_at?: string };

      if (!scheduled_at) {
        return next(createError('scheduled_at is required', 400));
      }

      const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId) as
        | Record<string, unknown>
        | undefined;
      if (!existing) return next(createError('Appointment not found', 404));
      if (existing.status === 'cancelled') {
        return next(createError('Cannot reschedule a cancelled appointment', 400));
      }

      // Patients can only reschedule their own appointments
      if (user.roles.includes('patient')) {
        const patientRow = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patientRow || patientRow.id !== Number(existing.patient_id)) {
          return next(createError('Access denied', 403));
        }
      }

      // Check for conflicts (exclude this appointment itself)
      const conflicts = countConflicts(
        Number(existing.provider_id),
        scheduled_at,
        Number(existing.duration_minutes),
        apptId,
      );
      if (conflicts > 0) {
        return next(createError('Provider is not available at the requested time', 409));
      }

      // Cancel old reminders and create new ones
      cancelReminders(apptId);

      db.prepare(
        `UPDATE appointments SET scheduled_at = ?, status = 'scheduled' WHERE id = ?`,
      ).run(scheduled_at, apptId);

      scheduleReminders(apptId, scheduled_at);
      console.log(`[NOTIFICATION] Appointment ${apptId} rescheduled to ${scheduled_at}`);

      const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptId);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
