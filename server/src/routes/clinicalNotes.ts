/**
 * Clinical Notes routes
 *
 * Mounted at /api:
 *  GET  /patients/:patientId/notes    — list notes for patient
 *  POST /patients/:patientId/notes    — create SOAP note
 *  GET  /notes/:id                    — get single note; auto-locks if >24h old
 *  PUT  /notes/:id                    — update note (only if not locked)
 *  POST /notes/:id/addendum           — add addendum to locked note
 *  GET  /note-templates               — templates visible to current user
 *  POST /note-templates               — create a template
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(validateToken);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCK_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours in ms

/**
 * If the note is older than 24 hours and not yet locked, lock it and return
 * the updated note. Otherwise return the note as-is.
 */
function autoLockIfNeeded(noteId: number): Record<string, unknown> {
  const db = getDb();
  const note = db.prepare('SELECT * FROM clinical_notes WHERE id = ?').get(noteId) as
    Record<string, unknown> | undefined;
  if (!note) throw new Error('Note not found');

  if (!note.is_locked) {
    const ageMs = Date.now() - new Date(String(note.created_at)).getTime();
    if (ageMs >= LOCK_AFTER_MS) {
      const lockedAt = new Date().toISOString();
      db.prepare(
        `UPDATE clinical_notes SET is_locked = 1, locked_at = ? WHERE id = ?`,
      ).run(lockedAt, noteId);
      return { ...note, is_locked: 1, locked_at: lockedAt };
    }
  }
  return note;
}

/**
 * Returns the provider record for the authenticated user, or throws.
 */
function getProviderForUser(userId: number): { id: number } {
  const db = getDb();
  const provider = db
    .prepare('SELECT id FROM providers WHERE user_id = ?')
    .get(userId) as { id: number } | undefined;
  if (!provider) throw createError('Provider record not found for this user', 404);
  return provider;
}

/**
 * Validates that a patient exists and the requesting user is allowed to access it.
 * Returns patient or calls next(error).
 */
function validatePatientAccess(
  req: AuthenticatedRequest,
  next: NextFunction,
): { id: number; user_id: number } | null {
  const db = getDb();
  const patientId = Number(req.params.patientId);
  const user = req.user!;

  const patient = db
    .prepare('SELECT id, user_id FROM patients WHERE id = ?')
    .get(patientId) as { id: number; user_id: number } | undefined;

  if (!patient) {
    next(createError('Patient not found', 404));
    return null;
  }

  if (
    user.roles.includes('patient') &&
    !user.roles.some((r) => ['admin', 'provider', 'nurse'].includes(r))
  ) {
    if (patient.user_id !== user.sub) {
      next(createError('Access denied', 403));
      return null;
    }
  }
  return patient;
}

// ─── GET /patients/:patientId/notes ──────────────────────────────────────────

router.get(
  '/patients/:patientId/notes',
  auditAccess('clinical_notes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = validatePatientAccess(req, next);
      if (!patient) return;

      const db = getDb();
      const user = req.user!;

      let rows: unknown[];

      if (
        user.roles.includes('patient') &&
        !user.roles.some((r) => ['admin', 'provider', 'nurse'].includes(r))
      ) {
        // Patients only see their own notes
        rows = db
          .prepare(
            `SELECT cn.*, u.email AS provider_email
             FROM clinical_notes cn
             JOIN providers prov ON prov.id = cn.provider_id
             JOIN users u ON u.id = prov.user_id
             WHERE cn.patient_id = ?
             ORDER BY cn.created_at DESC`,
          )
          .all(patient.id);
      } else {
        rows = db
          .prepare(
            `SELECT cn.*, u.email AS provider_email
             FROM clinical_notes cn
             JOIN providers prov ON prov.id = cn.provider_id
             JOIN users u ON u.id = prov.user_id
             WHERE cn.patient_id = ?
             ORDER BY cn.created_at DESC`,
          )
          .all(patient.id);
      }

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /patients/:patientId/notes ─────────────────────────────────────────

router.post(
  '/patients/:patientId/notes',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('clinical_notes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = validatePatientAccess(req, next);
      if (!patient) return;

      const db = getDb();
      const provider = getProviderForUser(req.user!.sub);

      const {
        note_type = 'soap',
        subjective,
        objective,
        assessment,
        plan,
        appointment_id,
      } = req.body as Record<string, unknown>;

      const validTypes = ['soap', 'progress', 'discharge', 'referral', 'procedure', 'other'];
      if (!validTypes.includes(String(note_type))) {
        return next(createError(`Invalid note_type. Must be one of: ${validTypes.join(', ')}`, 400));
      }

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO clinical_notes
             (patient_id, provider_id, appointment_id, note_type,
              subjective, objective, assessment, plan)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          patient.id,
          provider.id,
          appointment_id ?? null,
          note_type,
          subjective ?? null,
          objective ?? null,
          assessment ?? null,
          plan ?? null,
        );

      const created = db
        .prepare('SELECT * FROM clinical_notes WHERE id = ?')
        .get(Number(lastInsertRowid));
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /notes/:id ───────────────────────────────────────────────────────────

router.get(
  '/notes/:id',
  auditAccess('clinical_notes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const noteId = Number(req.params.id);
      const user = req.user!;

      const note = autoLockIfNeeded(noteId);

      // Patients can only view their own notes
      if (
        user.roles.includes('patient') &&
        !user.roles.some((r) => ['admin', 'provider', 'nurse'].includes(r))
      ) {
        const patient = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patient || patient.id !== Number(note.patient_id)) {
          return next(createError('Access denied', 403));
        }
      }

      // Load addenda
      const addenda = db
        .prepare(
          `SELECT na.*, u.email AS author_email
           FROM note_addenda na
           JOIN users u ON u.id = na.author_id
           WHERE na.note_id = ?
           ORDER BY na.created_at ASC`,
        )
        .all(noteId);

      res.json({ success: true, data: { ...note, addenda } });
    } catch (err) {
      next(err);
    }
  },
);

// ─── PUT /notes/:id ───────────────────────────────────────────────────────────

router.put(
  '/notes/:id',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('clinical_notes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const noteId = Number(req.params.id);

      const note = autoLockIfNeeded(noteId);

      if (note.is_locked) {
        return next(
          createError(
            'This note is locked and cannot be edited. Use the addendum endpoint instead.',
            409,
          ),
        );
      }

      const { subjective, objective, assessment, plan, note_type } =
        req.body as Record<string, unknown>;

      db.prepare(
        `UPDATE clinical_notes
         SET subjective  = COALESCE(?, subjective),
             objective   = COALESCE(?, objective),
             assessment  = COALESCE(?, assessment),
             plan        = COALESCE(?, plan),
             note_type   = COALESCE(?, note_type)
         WHERE id = ?`,
      ).run(
        subjective ?? null,
        objective ?? null,
        assessment ?? null,
        plan ?? null,
        note_type ?? null,
        noteId,
      );

      const updated = db
        .prepare('SELECT * FROM clinical_notes WHERE id = ?')
        .get(noteId);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /notes/:id/addendum ─────────────────────────────────────────────────

router.post(
  '/notes/:id/addendum',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('clinical_notes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const noteId = Number(req.params.id);
      const { content } = req.body as { content?: string };

      if (!content?.trim()) {
        return next(createError('Addendum content is required', 400));
      }

      const note = db
        .prepare('SELECT id FROM clinical_notes WHERE id = ?')
        .get(noteId);
      if (!note) return next(createError('Note not found', 404));

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO note_addenda (note_id, author_id, content) VALUES (?, ?, ?)`,
        )
        .run(noteId, req.user!.sub, content.trim());

      const created = db
        .prepare('SELECT * FROM note_addenda WHERE id = ?')
        .get(Number(lastInsertRowid));
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /note-templates ──────────────────────────────────────────────────────

router.get(
  '/note-templates',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('note_templates'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;

      // Show shared templates + user's own templates
      const rows = db
        .prepare(
          `SELECT * FROM note_templates
           WHERE is_shared = 1 OR created_by = ?
           ORDER BY name ASC`,
        )
        .all(user.sub);

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /note-templates ─────────────────────────────────────────────────────

router.post(
  '/note-templates',
  requireRole('admin', 'provider', 'nurse'),
  auditAccess('note_templates'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;
      const {
        name,
        note_type = 'soap',
        subjective_template,
        objective_template,
        assessment_template,
        plan_template,
        is_shared = false,
      } = req.body as Record<string, unknown>;

      if (!name) return next(createError('name is required', 400));

      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO note_templates
             (name, note_type, subjective_template, objective_template,
              assessment_template, plan_template, created_by, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          String(name),
          note_type,
          subjective_template ?? null,
          objective_template ?? null,
          assessment_template ?? null,
          plan_template ?? null,
          user.sub,
          is_shared ? 1 : 0,
        );

      const created = db
        .prepare('SELECT * FROM note_templates WHERE id = ?')
        .get(Number(lastInsertRowid));
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
