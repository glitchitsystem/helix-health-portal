/**
 * Prescriptions routes
 *
 * GET    /patients/:patientId/prescriptions?status=active|all
 * POST   /patients/:patientId/prescriptions    — provider only; runs drug interaction check
 * PUT    /prescriptions/:id                    — provider/nurse
 * POST   /prescriptions/:id/renew              — provider only
 * DELETE /prescriptions/:id                    — discontinue with reason
 * POST   /prescriptions/:id/refill-request     — patient requests refill
 * GET    /refill-requests                       — provider sees pending requests
 * PUT    /refill-requests/:id                   — approve or deny
 *
 * Mounting:
 *   app.use('/api/patients',      prescriptionsRouter);
 *   app.use('/api/prescriptions', prescriptionsRouter);
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { checkDrugInteractions } from '../services/drugInteractionService';
import { validatePrescriptionDosage } from '../services/prescriptionValidation';
import { notifyRefillReview } from '../services/notificationService';

const router = Router();
router.use(validateToken);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the patient row or calls next(404). Enforces patient → own data only. */
function resolvePatient(req: AuthenticatedRequest, next: NextFunction): { id: number; user_id: number } | null {
  const db = getDb();
  const patientId = Number(req.params.patientId);
  const patient = db.prepare('SELECT id, user_id FROM patients WHERE id = ?').get(patientId) as
    | { id: number; user_id: number }
    | undefined;
  if (!patient) { next(createError('Patient not found', 404)); return null; }
  const user = req.user!;
  if (user.roles.includes('patient') && !user.roles.some(r => ['admin','provider','nurse'].includes(r))) {
    if (patient.user_id !== user.sub) { next(createError('Access denied', 403)); return null; }
  }
  return patient;
}

/** Returns the prescription row or calls next(404). */
function resolvePrescription(id: number, next: NextFunction): Record<string, unknown> | null {
  const db = getDb();
  const rx = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!rx) { next(createError('Prescription not found', 404)); return null; }
  return rx;
}

// ─── GET /patients/:patientId/prescriptions ───────────────────────────────────

router.get(
  '/:patientId/prescriptions',
  requireRole('patient', 'provider', 'nurse', 'admin'),
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = resolvePatient(req, next);
      if (!patient) return;

      const db = getDb();
      const statusFilter = req.query.status === 'all' ? null : (req.query.status as string | null) ?? 'active';

      const query = statusFilter
        ? `SELECT p.*, u.email AS prescriber_email
           FROM prescriptions p
           JOIN providers pr ON pr.id = p.prescriber_id
           JOIN users u ON u.id = pr.user_id
           WHERE p.patient_id = ? AND p.status = ?
           ORDER BY p.created_at DESC`
        : `SELECT p.*, u.email AS prescriber_email
           FROM prescriptions p
           JOIN providers pr ON pr.id = p.prescriber_id
           JOIN users u ON u.id = pr.user_id
           WHERE p.patient_id = ?
           ORDER BY p.created_at DESC`;

      const rows = statusFilter
        ? db.prepare(query).all(patient.id, statusFilter)
        : db.prepare(query).all(patient.id);

      res.json({ success: true, data: rows });
    } catch (err) { next(err); }
  },
);

// ─── POST /patients/:patientId/prescriptions ──────────────────────────────────

router.post(
  '/:patientId/prescriptions',
  requireRole('provider', 'admin'),
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = resolvePatient(req, next);
      if (!patient) return;

      const db = getDb();
      const user = req.user!;

      // Look up the provider record for the authenticated user
      const providerRow = db.prepare('SELECT id FROM providers WHERE user_id = ?').get(user.sub) as
        | { id: number }
        | undefined;
      if (!providerRow) return next(createError('Provider record not found for current user', 403));

      const {
        drug_name, drug_ndc, dosage, frequency, route = 'oral',
        quantity = 30, refills_remaining = 0,
        start_date, end_date, status = 'active',
        is_controlled = 0, schedule_class,
        pharmacy_name, pharmacy_phone, notes,
      } = req.body as Record<string, unknown>;

      if (!drug_name || !dosage || !frequency || !start_date) {
        return next(createError('drug_name, dosage, frequency, and start_date are required', 400));
      }

      // ── Dosage validation ─────────────────────────────────────────────────
      const dosageCheck = validatePrescriptionDosage(
        drug_name as string,
        dosage as string,
        frequency as string,
      );
      if (!dosageCheck.valid) {
        return next(createError(dosageCheck.error ?? 'Dosage validation failed', 400));
      }

      // ── Drug interaction check ────────────────────────────────────────────
      const activeMeds = db
        .prepare("SELECT name FROM medications WHERE patient_id = ? AND status = 'active'")
        .all(patient.id) as { name: string }[];
      const activeNames = activeMeds.map(m => m.name);

      const interactions = checkDrugInteractions(
        drug_name as string,
        activeNames,
        patient.id,
        user.sub,
      );

      // ── Insert prescription ───────────────────────────────────────────────
      const { lastInsertRowid } = db.prepare(
        `INSERT INTO prescriptions
           (patient_id, prescriber_id, drug_name, drug_ndc, dosage, frequency, route,
            quantity, refills_remaining, start_date, end_date, status,
            is_controlled, schedule_class, pharmacy_name, pharmacy_phone, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        patient.id, providerRow.id,
        drug_name, drug_ndc ?? null, dosage, frequency, route,
        quantity, refills_remaining,
        start_date, end_date ?? null, status,
        is_controlled ? 1 : 0, schedule_class ?? null,
        pharmacy_name ?? null, pharmacy_phone ?? null, notes ?? null,
      );

      const created = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(Number(lastInsertRowid));

      res.status(201).json({
        success: true,
        data: created,
        interactions: interactions.length > 0 ? interactions : undefined,
        warnings: interactions.length > 0
          ? interactions.map(i => `${i.severity.toUpperCase()} interaction: ${i.drug_a} ↔ ${i.drug_b}`)
          : undefined,
      });
    } catch (err) { next(err); }
  },
);

// ─── PUT /prescriptions/:id ───────────────────────────────────────────────────

router.put(
  '/:id(\\d+)',
  requireRole('provider', 'nurse', 'admin'),
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const rx = resolvePrescription(Number(req.params.id), next);
      if (!rx) return;

      const allowed = ['dosage','frequency','route','quantity','refills_remaining',
                       'end_date','status','pharmacy_name','pharmacy_phone','notes'];
      const updates: string[] = [];
      const values: unknown[] = [];
      for (const key of allowed) {
        if (key in req.body) { updates.push(`${key} = ?`); values.push(req.body[key]); }
      }
      if (updates.length === 0) return next(createError('No valid fields to update', 400));
      values.push(Number(req.params.id));

      db.prepare(`UPDATE prescriptions SET ${updates.join(', ')} WHERE id = ?`).run(...values);
      const updated = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(Number(req.params.id));
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

// ─── POST /prescriptions/:id/renew ────────────────────────────────────────────

router.post(
  '/:id(\\d+)/renew',
  requireRole('provider', 'admin'),
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const rx = resolvePrescription(Number(req.params.id), next);
      if (!rx) return;

      const { new_end_date, refills_remaining = 1 } = req.body as { new_end_date?: string; refills_remaining?: number };
      if (!new_end_date) return next(createError('new_end_date is required', 400));

      db.prepare(
        `UPDATE prescriptions SET status = 'active', end_date = ?, refills_remaining = ? WHERE id = ?`,
      ).run(new_end_date, refills_remaining, Number(req.params.id));

      const updated = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(Number(req.params.id));
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

// ─── DELETE /prescriptions/:id — discontinue ─────────────────────────────────

router.delete(
  '/:id(\\d+)',
  requireRole('provider', 'admin'),
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const rx = resolvePrescription(Number(req.params.id), next);
      if (!rx) return;

      const { reason } = req.body as { reason?: string };
      const notes = reason ? `Discontinued: ${reason}` : 'Discontinued';

      db.prepare(
        `UPDATE prescriptions SET status = 'discontinued', notes = ? WHERE id = ?`,
      ).run(notes, Number(req.params.id));

      res.json({ success: true, message: 'Prescription discontinued' });
    } catch (err) { next(err); }
  },
);

// ─── POST /prescriptions/:id/refill-request ───────────────────────────────────

router.post(
  '/:id(\\d+)/refill-request',
  auditAccess('prescriptions'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const rxId = Number(req.params.id);
      const rx = resolvePrescription(rxId, next);
      if (!rx) return;

      // Only the patient linked to this prescription can request a refill
      const user = req.user!;
      if (user.roles.includes('patient') && !user.roles.some(r => ['admin','provider','nurse'].includes(r))) {
        const patientRow = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(user.sub) as { id: number } | undefined;
        if (!patientRow || patientRow.id !== rx.patient_id) {
          return next(createError('Access denied', 403));
        }
      }

      if ((rx.refills_remaining as number) <= 0) {
        return next(createError('No refills remaining — contact your provider', 422));
      }

      // Prevent duplicate pending requests
      const existing = db.prepare(
        `SELECT id FROM refill_requests WHERE prescription_id = ? AND status = 'pending'`,
      ).get(rxId);
      if (existing) return next(createError('A pending refill request already exists', 409));

      const { pharmacy_notes } = req.body as { pharmacy_notes?: string };
      const patientRow = db.prepare('SELECT id FROM patients WHERE id = ?').get(rx.patient_id as number) as { id: number };

      const { lastInsertRowid } = db.prepare(
        `INSERT INTO refill_requests (prescription_id, patient_id, pharmacy_notes)
         VALUES (?, ?, ?)`,
      ).run(rxId, patientRow.id, pharmacy_notes ?? null);

      const created = db.prepare('SELECT * FROM refill_requests WHERE id = ?').get(Number(lastInsertRowid));
      res.status(201).json({ success: true, data: created });
    } catch (err) { next(err); }
  },
);

// ─── GET /refill-requests ─────────────────────────────────────────────────────

router.get(
  '/refill-requests',
  requireRole('provider', 'nurse', 'admin'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const statusFilter = (req.query.status as string) || 'pending';

      const rows = db.prepare(
        `SELECT rr.*,
                p.drug_name,
                pd.first_name || ' ' || pd.last_name AS patient_name
         FROM refill_requests rr
         JOIN prescriptions p ON p.id = rr.prescription_id
         JOIN patient_demographics pd ON pd.patient_id = rr.patient_id
         WHERE rr.status = ?
         ORDER BY rr.requested_at ASC`,
      ).all(statusFilter);

      res.json({ success: true, data: rows });
    } catch (err) { next(err); }
  },
);

// ─── PUT /refill-requests/:id — approve or deny ───────────────────────────────

router.put(
  '/refill-requests/:id',
  requireRole('provider', 'admin'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const rrId = Number(req.params.id);
      const rr = db.prepare('SELECT * FROM refill_requests WHERE id = ?').get(rrId) as Record<string, unknown> | undefined;
      if (!rr) return next(createError('Refill request not found', 404));

      const { action, notes } = req.body as { action: 'approve' | 'deny'; notes?: string };
      if (!['approve', 'deny'].includes(action)) return next(createError('action must be approve or deny', 400));

      const newStatus = action === 'approve' ? 'approved' : 'denied';
      const user = req.user!;

      const providerRow = db.prepare('SELECT id FROM providers WHERE user_id = ?').get(user.sub) as { id: number } | undefined;

      db.prepare(
        `UPDATE refill_requests
         SET status = ?, reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), notes = ?
         WHERE id = ?`,
      ).run(newStatus, providerRow?.id ?? null, notes ?? null, rrId);

      // Notify patient
      const rx = db.prepare('SELECT patient_id, drug_name FROM prescriptions WHERE id = ?').get(rr.prescription_id as number) as
        | { patient_id: number; drug_name: string }
        | undefined;
      if (rx) {
        const patientUser = db.prepare('SELECT user_id FROM patients WHERE id = ?').get(rx.patient_id) as { user_id: number } | undefined;
        if (patientUser) {
          notifyRefillReview(patientUser.user_id, rx.drug_name, newStatus === 'approved', rr.prescription_id as number);
        }
      }

      // If approved, decrement refills_remaining
      if (newStatus === 'approved') {
        db.prepare(
          `UPDATE prescriptions SET refills_remaining = MAX(0, refills_remaining - 1) WHERE id = ?`,
        ).run(rr.prescription_id as number);
      }

      const updated = db.prepare('SELECT * FROM refill_requests WHERE id = ?').get(rrId);
      res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  },
);

export default router;
