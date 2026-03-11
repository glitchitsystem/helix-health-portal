/**
 * Search routes — unified search across patients, providers, appointments, and notes.
 *
 * Mount point: app.use('/api', searchRouter);
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /search?q=<query>&type=patients|providers|appointments|notes|all
 *
 * Access rules:
 *  - Patients: search by name, MRN, DOB — providers and admin only
 *  - Providers: open to all authenticated users
 *  - Appointments: all authenticated, filtered to own for patient role
 *  - Notes: full-text on content — provider only
 */
router.get(
  '/search',
  validateToken,
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db   = getDb();
      const q    = ((req.query.q as string) ?? '').trim();
      const type = ((req.query.type as string) ?? 'all').toLowerCase();

      if (!q || q.length < 2) throw createError('Query must be at least 2 characters', 400);

      const roles      = req.user!.roles ?? [];
      const isAdmin    = roles.includes('admin');
      const isProvider = roles.includes('provider') || roles.includes('nurse');
      const isBilling  = roles.includes('billing');
      const isPatient  = roles.includes('patient') && !isAdmin && !isProvider && !isBilling;

      const like = `%${q}%`;
      const results: Record<string, any[]> = {
        patients: [],
        providers: [],
        appointments: [],
        notes: [],
      };

      // ── Patients (admin, provider, nurse, billing only) ──────────────────────
      if ((type === 'all' || type === 'patients') && (isAdmin || isProvider || isBilling)) {
        const rows = db.prepare(`
          SELECT
            p.id,
            pd.first_name || ' ' || pd.last_name AS full_name,
            p.mrn,
            pd.dob,
            u.email
          FROM patients p
          JOIN patient_demographics pd ON pd.patient_id = p.id
          JOIN users u ON u.id = p.user_id
          WHERE
            pd.first_name LIKE ?
            OR pd.last_name  LIKE ?
            OR (pd.first_name || ' ' || pd.last_name) LIKE ?
            OR p.mrn LIKE ?
            OR pd.dob LIKE ?
          ORDER BY pd.last_name, pd.first_name
          LIMIT 20
        `).all(like, like, like, like, like);

        results.patients = rows.map((r: any) => ({
          type: 'patient',
          id: r.id,
          title: r.full_name,
          subtitle: `MRN: ${r.mrn} · DOB: ${r.dob ?? 'unknown'}`,
          url: `/patients/${r.id}/chart`,
        }));
      }

      // ── Providers (all authenticated) ────────────────────────────────────────
      if (type === 'all' || type === 'providers') {
        const rows = db.prepare(`
          SELECT
            pr.id,
            u.email,
            pr.npi,
            ps.name AS specialty
          FROM providers pr
          JOIN users u ON u.id = pr.user_id
          LEFT JOIN provider_specialties ps ON ps.id = pr.specialty_id
          WHERE
            u.email LIKE ?
            OR pr.npi  LIKE ?
            OR ps.name LIKE ?
          ORDER BY u.email
          LIMIT 20
        `).all(like, like, like);

        results.providers = rows.map((r: any) => ({
          type: 'provider',
          id: r.id,
          title: r.email,
          subtitle: `NPI: ${r.npi} · ${r.specialty ?? 'Unknown specialty'}`,
          url: `/providers/${r.id}`,
        }));
      }

      // ── Appointments (own for patient, all for staff) ────────────────────────
      if (type === 'all' || type === 'appointments') {
        let sql = `
          SELECT
            a.id,
            a.status,
            a.scheduled_at,
            pd.first_name || ' ' || pd.last_name AS patient_name,
            at.name AS type_name
          FROM appointments a
          JOIN patients p      ON p.id = a.patient_id
          JOIN patient_demographics pd ON pd.patient_id = p.id
          JOIN appointment_types at ON at.id = a.appointment_type_id
          WHERE (
            pd.first_name LIKE ?
            OR pd.last_name  LIKE ?
            OR (pd.first_name || ' ' || pd.last_name) LIKE ?
            OR a.status LIKE ?
            OR at.name  LIKE ?
          )
        `;
        const apptParams: any[] = [like, like, like, like, like];

        if (req.query.date_from) {
          sql += ' AND a.scheduled_at >= ?';
          apptParams.push(req.query.date_from);
        }
        if (req.query.date_to) {
          sql += ' AND a.scheduled_at <= ?';
          apptParams.push(req.query.date_to);
        }
        if (isPatient) {
          // Patients can only search their own appointments
          const pat = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(req.user!.sub) as any;
          if (pat) {
            sql += ' AND a.patient_id = ?';
            apptParams.push(pat.id);
          }
        }
        sql += ' ORDER BY a.scheduled_at DESC LIMIT 20';

        const rows = db.prepare(sql).all(...apptParams);
        results.appointments = rows.map((r: any) => ({
          type: 'appointment',
          id: r.id,
          title: `${r.type_name} — ${r.patient_name}`,
          subtitle: `${new Date(r.scheduled_at).toLocaleString()} · ${r.status}`,
          url: `/appointments/${r.id}`,
        }));
      }

      // ── Clinical notes (provider/admin full-text only) ────────────────────────
      if ((type === 'all' || type === 'notes') && (isAdmin || isProvider)) {
        const rows = db.prepare(`
          SELECT
            cn.id,
            cn.note_type,
            cn.created_at,
            pd.first_name || ' ' || pd.last_name AS patient_name,
            u.email AS provider_email
          FROM clinical_notes cn
          JOIN patients p ON p.id = cn.patient_id
          JOIN patient_demographics pd ON pd.patient_id = p.id
          JOIN providers pr ON pr.id = cn.provider_id
          JOIN users u ON u.id = pr.user_id
          WHERE
            cn.subjective  LIKE ?
            OR cn.objective   LIKE ?
            OR cn.assessment  LIKE ?
            OR cn.plan        LIKE ?
          ORDER BY cn.created_at DESC
          LIMIT 20
        `).all(like, like, like, like);

        results.notes = rows.map((r: any) => ({
          type: 'note',
          id: r.id,
          title: `${r.note_type} note — ${r.patient_name}`,
          subtitle: `By ${r.provider_email} on ${new Date(r.created_at).toLocaleDateString()}`,
          url: `/notes/${r.id}`,
        }));
      }

      const total = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
      res.json({ success: true, data: { ...results, total, query: q } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
