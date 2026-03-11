/**
 * Medical Records routes — /api/patients/:id/*  and  /api/documents/*
 *
 * Endpoints (all under /api/patients/:patientId):
 *  GET  /patients/:id/summary          — aggregated health summary
 *  --- Diagnoses ---
 *  GET  /patients/:id/diagnoses
 *  POST /patients/:id/diagnoses
 *  PUT  /patients/:id/diagnoses/:dxId
 *  DELETE /patients/:id/diagnoses/:dxId
 *  --- Medications ---
 *  GET  /patients/:id/medications
 *  POST /patients/:id/medications
 *  PUT  /patients/:id/medications/:medId
 *  DELETE /patients/:id/medications/:medId
 *  --- Allergies ---
 *  GET  /patients/:id/allergies
 *  POST /patients/:id/allergies
 *  PUT  /patients/:id/allergies/:alId
 *  DELETE /patients/:id/allergies/:alId
 *  --- Vitals ---
 *  GET  /patients/:id/vitals
 *  POST /patients/:id/vitals
 *  PUT  /patients/:id/vitals/:vId
 *  DELETE /patients/:id/vitals/:vId
 *  --- Lab Results ---
 *  GET  /patients/:id/labs
 *  POST /patients/:id/labs
 *  PUT  /patients/:id/labs/:labId
 *  DELETE /patients/:id/labs/:labId
 *  --- Documents ---
 *  GET  /patients/:id/documents
 *  POST /patients/:id/documents  (multipart upload)
 *
 * Standalone:
 *  GET  /documents/:id/download
 */

import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(validateToken);

// ─── File upload storage ──────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(__dirname, '../../../../uploads/documents');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Unsupported file type'));
  },
});

// ─── Access-control helper ────────────────────────────────────────────────────

/**
 * Verifies the requesting user can access the given patient's records.
 * - Patients may only view their own records.
 * - Providers, nurses, and admins may view any patient's records.
 * Returns the verified patient row, or calls next(error).
 */
function getPatientOrFail(
  req: AuthenticatedRequest,
  next: NextFunction,
): { id: number } | null {
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

  // Patients can only view their own data
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

// ─── Patient list / detail ────────────────────────────────────────────────────

/**
 * GET /patients?user_id=X
 * Staff can list all patients; patient role can query own user_id.
 */
router.get(
  '/',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;
      const userIdFilter = req.query.user_id ? Number(req.query.user_id) : null;

      // Patients can only query their own record
      if (user.roles.includes('patient') && !user.roles.some(r => ['admin','provider','nurse'].includes(r))) {
        const patient = db.prepare(
          `SELECT p.*, d.first_name, d.last_name, d.dob, d.gender, d.phone,
                  d.address_line1, d.city, d.state, d.zip
           FROM patients p
           LEFT JOIN patient_demographics d ON d.patient_id = p.id
           WHERE p.user_id = ?`
        ).all(user.sub);
        return res.json({ success: true, data: patient });
      }

      // Staff — optional user_id filter
      const rows = userIdFilter
        ? db.prepare(
            `SELECT p.*, d.first_name, d.last_name, d.dob, d.gender, d.phone,
                    d.address_line1, d.city, d.state, d.zip
             FROM patients p
             LEFT JOIN patient_demographics d ON d.patient_id = p.id
             WHERE p.user_id = ?`
          ).all(userIdFilter)
        : db.prepare(
            `SELECT p.*, d.first_name, d.last_name, d.dob, d.gender, d.phone,
                    d.address_line1, d.city, d.state, d.zip
             FROM patients p
             LEFT JOIN patient_demographics d ON d.patient_id = p.id
             ORDER BY p.created_at DESC LIMIT 200`
          ).all();

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /patients/:id — single patient detail (demographics join).
 */
router.get(
  '/:patientId',
  auditAccess('medical_records'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;

      const db = getDb();
      const row = db.prepare(
        `SELECT p.*, d.first_name, d.last_name, d.dob, d.gender, d.phone,
                d.address_line1, d.city, d.state, d.zip
         FROM patients p
         LEFT JOIN patient_demographics d ON d.patient_id = p.id
         WHERE p.id = ?`
      ).get(patient.id);

      res.json({ success: true, data: row });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Summary ──────────────────────────────────────────────────────────────────

router.get(
  '/:patientId/summary',
  auditAccess('medical_records'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;

      const db = getDb();
      const pid = patient.id;

      const latestVitals = db
        .prepare('SELECT * FROM vitals WHERE patient_id = ? ORDER BY recorded_at DESC LIMIT 1')
        .get(pid);

      const activeMeds = db
        .prepare("SELECT * FROM medications WHERE patient_id = ? AND status = 'active' ORDER BY name")
        .all(pid);

      const activeDiagnoses = db
        .prepare("SELECT * FROM diagnoses WHERE patient_id = ? AND status IN ('active','chronic') ORDER BY created_at DESC")
        .all(pid);

      const recentLabs = db
        .prepare('SELECT * FROM lab_results WHERE patient_id = ? ORDER BY collected_at DESC LIMIT 10')
        .all(pid);

      const activeAllergies = db
        .prepare("SELECT * FROM allergies WHERE patient_id = ? AND status = 'active'")
        .all(pid);

      res.json({
        success: true,
        data: {
          latest_vitals: latestVitals ?? null,
          active_medications: activeMeds,
          active_diagnoses: activeDiagnoses,
          recent_labs: recentLabs,
          active_allergies: activeAllergies,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Generic CRUD factory ─────────────────────────────────────────────────────

/**
 * Generates a sub-router with standard CRUD endpoints for a clinical resource
 * table that is tied to a patient via patient_id.
 */
function buildCrudRouter(options: {
  table: string;
  resource: string;
  requiredFields: string[];
  allowedFields: string[];
  writeRoles?: string[];
}): Router {
  const { table, resource, requiredFields, allowedFields, writeRoles = ['admin', 'provider', 'nurse'] } = options;
  const sub = Router({ mergeParams: true });

  // GET — list all records for patient
  sub.get(
    '/',
    auditAccess(resource),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;
      try {
        const rows = getDb()
          .prepare(`SELECT * FROM ${table} WHERE patient_id = ? ORDER BY created_at DESC`)
          .all(patient.id);
        res.json({ success: true, data: rows });
      } catch (err) { next(err); }
    },
  );

  // POST — create
  sub.post(
    '/',
    requireRole(...writeRoles),
    auditAccess(resource),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;
      try {
        const body = req.body as Record<string, unknown>;
        for (const f of requiredFields) {
          if (!body[f]) return next(createError(`${f} is required`, 400));
        }

        const fields = allowedFields.filter((f) => body[f] !== undefined);
        const values = fields.map((f) => body[f] ?? null);

        const { lastInsertRowid } = getDb()
          .prepare(
            `INSERT INTO ${table} (patient_id, ${fields.join(', ')}, created_by)
             VALUES (?, ${fields.map(() => '?').join(', ')}, ?)`,
          )
          .run(patient.id, ...values, req.user!.sub);

        const created = getDb()
          .prepare(`SELECT * FROM ${table} WHERE id = ?`)
          .get(Number(lastInsertRowid));
        res.status(201).json({ success: true, data: created });
      } catch (err) { next(err); }
    },
  );

  // PUT — update single record
  sub.put(
    '/:recordId',
    requireRole(...writeRoles),
    auditAccess(resource),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;
      try {
        const recordId = Number(req.params.recordId);
        const existing = getDb()
          .prepare(`SELECT id FROM ${table} WHERE id = ? AND patient_id = ?`)
          .get(recordId, patient.id);
        if (!existing) return next(createError(`${resource} record not found`, 404));

        const body = req.body as Record<string, unknown>;
        const fields = allowedFields.filter((f) => body[f] !== undefined);
        if (!fields.length) return next(createError('No updatable fields provided', 400));

        const setClause = fields.map((f) => `${f} = ?`).join(', ');
        getDb()
          .prepare(`UPDATE ${table} SET ${setClause} WHERE id = ? AND patient_id = ?`)
          .run(...fields.map((f) => body[f] ?? null), recordId, patient.id);

        const updated = getDb()
          .prepare(`SELECT * FROM ${table} WHERE id = ?`)
          .get(recordId);
        res.json({ success: true, data: updated });
      } catch (err) { next(err); }
    },
  );

  // DELETE
  sub.delete(
    '/:recordId',
    requireRole(...writeRoles),
    auditAccess(resource),
    (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;
      try {
        const recordId = Number(req.params.recordId);
        const existing = getDb()
          .prepare(`SELECT id FROM ${table} WHERE id = ? AND patient_id = ?`)
          .get(recordId, patient.id);
        if (!existing) return next(createError(`${resource} record not found`, 404));

        getDb()
          .prepare(`DELETE FROM ${table} WHERE id = ? AND patient_id = ?`)
          .run(recordId, patient.id);
        res.json({ success: true, data: { id: recordId, deleted: true } });
      } catch (err) { next(err); }
    },
  );

  return sub;
}

// ─── Sub-routers for each clinical entity ─────────────────────────────────────

const diagnosesRouter = buildCrudRouter({
  table: 'diagnoses',
  resource: 'diagnoses',
  requiredFields: ['icd10_code', 'icd10_description'],
  allowedFields: ['icd10_code', 'icd10_description', 'status', 'onset_date', 'resolved_date', 'severity', 'notes'],
});

const medicationsRouter = buildCrudRouter({
  table: 'medications',
  resource: 'medications',
  requiredFields: ['name', 'dosage', 'frequency', 'start_date'],
  allowedFields: ['name', 'dosage', 'frequency', 'route', 'start_date', 'end_date', 'status', 'prescriber_id', 'notes'],
});

const allergiesRouter = buildCrudRouter({
  table: 'allergies',
  resource: 'allergies',
  requiredFields: ['allergen', 'reaction_type', 'severity'],
  allowedFields: ['allergen', 'reaction_type', 'severity', 'onset_date', 'status', 'notes'],
});

const vitalsRouter = buildCrudRouter({
  table: 'vitals',
  resource: 'vitals',
  requiredFields: ['recorded_at'],
  allowedFields: [
    'recorded_at', 'bp_systolic', 'bp_diastolic', 'heart_rate',
    'temperature', 'weight_kg', 'height_cm', 'o2_saturation', 'recorded_by',
  ],
  writeRoles: ['admin', 'provider', 'nurse'],
});

// COURSE_BUG [Section 10 - Access Control]: The GET vitals list handler below
// adds an extra provider check that uses the non-existent `req.user.role`
// (singular) instead of `req.user.roles` (array).  Because `req.user.role`
// is always undefined, the condition `req.user.role === 'provider'` is always
// false, so the secondary patient-assignment guard is never enforced.  Any
// authenticated provider can therefore read vitals for ANY patient, regardless
// of whether they are assigned to that patient.
// Fix: replace `(req.user as any).role === 'provider'` with
//       `req.user!.roles.includes('provider')` AND add a DB query that verifies
//       the provider has at least one appointment with this patient.
vitalsRouter.get(
  '/_access_check',
  (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    // Stub — intentionally bypassed. See COURSE_BUG comment above.
    // The real access check in getPatientOrFail does NOT verify provider assignment.
    if ((req.user as any).role === 'provider') { // COURSE_BUG: .role is always undefined
      const db = getDb();
      const patientId = Number(req.params.patientId);
      const assigned = db
        .prepare(
          `SELECT 1 FROM appointments WHERE patient_id = ? AND provider_id =
           (SELECT id FROM providers WHERE user_id = ?) LIMIT 1`,
        )
        .get(patientId, req.user!.sub);
      if (!assigned) {
        return next(createError('Provider not assigned to this patient', 403));
      }
    }
    next();
  },
);

const labsRouter = buildCrudRouter({
  table: 'lab_results',
  resource: 'lab_results',
  requiredFields: ['test_name', 'value', 'collected_at'],
  allowedFields: [
    'test_name', 'test_code', 'value', 'unit',
    'reference_range_low', 'reference_range_high', 'status',
    'collected_at', 'resulted_at', 'ordered_by', 'notes',
  ],
  writeRoles: ['admin', 'provider', 'nurse'],
});

// Mount sub-routers
router.use('/:patientId/diagnoses',   diagnosesRouter);
router.use('/:patientId/medications', medicationsRouter);
router.use('/:patientId/allergies',   allergiesRouter);
router.use('/:patientId/vitals',      vitalsRouter);
router.use('/:patientId/labs',        labsRouter);

// ─── Documents ────────────────────────────────────────────────────────────────

// POST /patients/:patientId/documents
router.post(
  '/:patientId/documents',
  auditAccess('documents'),
  upload.single('file'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;

      if (!req.file) return next(createError('No file uploaded', 400));

      const { description } = req.body as { description?: string };
      const relativePath = path.relative(
        path.resolve(__dirname, '../../../../'),
        req.file.path,
      );

      const db = getDb();
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO documents (patient_id, filename, file_type, file_size, storage_path, description, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          patient.id,
          req.file.originalname,
          req.file.mimetype,
          req.file.size,
          relativePath,
          description ?? null,
          req.user!.sub,
        );

      // Log upload access
      db.prepare(
        `INSERT INTO document_access_logs (document_id, accessed_by, access_type)
         VALUES (?, ?, 'upload')`,
      ).run(Number(lastInsertRowid), req.user!.sub);

      const created = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(lastInsertRowid));
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  },
);

// GET /patients/:patientId/documents
router.get(
  '/:patientId/documents',
  auditAccess('documents'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const patient = getPatientOrFail(req, next);
      if (!patient) return;

      const rows = getDb()
        .prepare('SELECT * FROM documents WHERE patient_id = ? ORDER BY created_at DESC')
        .all(patient.id);

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /documents/:id/download (standalone, not under /:patientId) ──────────

router.get(
  '/doc/:documentId/download',
  auditAccess('documents'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const docId = Number(req.params.documentId);
      const user = req.user!;

      const doc = db
        .prepare('SELECT * FROM documents WHERE id = ?')
        .get(docId) as Record<string, unknown> | undefined;
      if (!doc) return next(createError('Document not found', 404));

      // Patients can only download their own documents
      if (user.roles.includes('patient')) {
        const patientRow = db
          .prepare('SELECT id FROM patients WHERE user_id = ?')
          .get(user.sub) as { id: number } | undefined;
        if (!patientRow || patientRow.id !== Number(doc.patient_id)) {
          return next(createError('Access denied', 403));
        }
      }

      // Log access
      db.prepare(
        `INSERT INTO document_access_logs (document_id, accessed_by, access_type)
         VALUES (?, ?, 'download')`,
      ).run(docId, user.sub);

      const fullPath = path.resolve(
        __dirname, '../../../../',
        String(doc.storage_path),
      );

      if (!fs.existsSync(fullPath)) {
        return next(createError('File not found on disk', 404));
      }

      res.download(fullPath, String(doc.filename));
    } catch (err) {
      next(err);
    }
  },
);

export default router;
