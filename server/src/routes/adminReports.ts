/**
 * Admin reporting routes.
 *
 * Mount point: app.use('/api/admin', adminReportsRouter);
 *
 * Endpoints:
 *   GET /admin/reports/utilisation   — appointment stats by provider
 *   GET /admin/reports/population    — anonymised population health stats
 *   GET /admin/reports/provider-load — patients/appointments per provider
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { AuthenticatedRequest } from '../types';

const router = Router();

/**
 * GET /admin/reports/utilisation
 * Appointments per day/week, no-show rate, cancellation rate, by provider.
 */
router.get(
  '/reports/utilisation',
  validateToken,
  requireRole('admin', 'billing'),
  auditAccess('reports'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      // Appointments per day (last 30 days)
      const byDay = db.prepare(`
        SELECT
          strftime('%Y-%m-%d', scheduled_at) AS day,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'no_show'    THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN status = 'cancelled'  THEN 1 ELSE 0 END) AS cancellations,
          SUM(CASE WHEN status = 'completed'  THEN 1 ELSE 0 END) AS completed
        FROM appointments
        WHERE scheduled_at >= datetime('now', '-30 days')
        GROUP BY day
        ORDER BY day DESC
      `).all();

      // Appointments per week (last 12 weeks)
      const byWeek = db.prepare(`
        SELECT
          strftime('%Y-W%W', scheduled_at) AS week,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'no_show'   THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations
        FROM appointments
        WHERE scheduled_at >= datetime('now', '-84 days')
        GROUP BY week
        ORDER BY week DESC
      `).all();

      // By provider
      const byProvider = db.prepare(`
        SELECT
          u.email AS provider_email,
          COUNT(*) AS total,
          SUM(CASE WHEN a.status = 'no_show'   THEN 1 ELSE 0 END) AS no_shows,
          SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) AS cancellations,
          SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) AS completed,
          ROUND(100.0 * SUM(CASE WHEN a.status = 'no_show'   THEN 1 ELSE 0 END) / COUNT(*), 1)
            AS no_show_rate_pct,
          ROUND(100.0 * SUM(CASE WHEN a.status = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*), 1)
            AS cancellation_rate_pct
        FROM appointments a
        JOIN providers pr ON pr.id = a.provider_id
        JOIN users u ON u.id = pr.user_id
        WHERE a.scheduled_at >= datetime('now', '-90 days')
        GROUP BY a.provider_id
        ORDER BY total DESC
      `).all();

      // Overall rates
      const overall = db.prepare(`
        SELECT
          COUNT(*) AS total,
          ROUND(100.0 * SUM(CASE WHEN status = 'no_show'   THEN 1 ELSE 0 END) / COUNT(*), 1) AS no_show_pct,
          ROUND(100.0 * SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*), 1) AS cancellation_pct
        FROM appointments
        WHERE scheduled_at >= datetime('now', '-90 days')
      `).get();

      res.json({ success: true, data: { byDay, byWeek, byProvider, overall } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/reports/population
 * Aggregate population health statistics — anonymised, no PII.
 */
router.get(
  '/reports/population',
  validateToken,
  requireRole('admin'),
  auditAccess('reports'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      // Age distribution (grouped into brackets)
      const ageDistribution = db.prepare(`
        SELECT
          CASE
            WHEN (strftime('%Y', 'now') - strftime('%Y', dob)) < 18  THEN '<18'
            WHEN (strftime('%Y', 'now') - strftime('%Y', dob)) < 30  THEN '18-29'
            WHEN (strftime('%Y', 'now') - strftime('%Y', dob)) < 45  THEN '30-44'
            WHEN (strftime('%Y', 'now') - strftime('%Y', dob)) < 60  THEN '45-59'
            WHEN (strftime('%Y', 'now') - strftime('%Y', dob)) < 75  THEN '60-74'
            ELSE '75+'
          END AS age_bracket,
          COUNT(*) AS patient_count
        FROM patient_demographics
        WHERE dob IS NOT NULL
        GROUP BY age_bracket
        ORDER BY age_bracket
      `).all();

      // Top 10 diagnoses
      const topDiagnoses = db.prepare(`
        SELECT
          icd10_code,
          icd10_description,
          COUNT(DISTINCT patient_id) AS patient_count
        FROM diagnoses
        WHERE status = 'active'
        GROUP BY icd10_code
        ORDER BY patient_count DESC
        LIMIT 10
      `).all();

      // Average vitals (non-PII aggregate)
      const avgVitals = db.prepare(`
        SELECT
          ROUND(AVG(bp_systolic),  1) AS avg_systolic,
          ROUND(AVG(bp_diastolic), 1) AS avg_diastolic,
          ROUND(AVG(heart_rate),   1) AS avg_heart_rate,
          ROUND(AVG(weight_kg),    1) AS avg_weight_kg,
          ROUND(AVG(o2_saturation),1) AS avg_o2_saturation,
          COUNT(*)                    AS reading_count
        FROM vitals
        WHERE recorded_at >= datetime('now', '-12 months')
      `).get();

      // Total patients
      const totalPatients = (db.prepare('SELECT COUNT(*) AS c FROM patients').get() as any).c;

      res.json({ success: true, data: { ageDistribution, topDiagnoses, avgVitals, totalPatients } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/reports/provider-load
 * Patients per provider and appointments per provider this month.
 */
router.get(
  '/reports/provider-load',
  validateToken,
  requireRole('admin'),
  auditAccess('reports'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      const providerLoad = db.prepare(`
        SELECT
          u.email AS provider_email,
          ps.name AS specialty,
          COUNT(DISTINCT a.patient_id)                     AS unique_patients,
          COUNT(DISTINCT a.id)                             AS total_appointments,
          SUM(CASE
            WHEN strftime('%Y-%m', a.scheduled_at) = strftime('%Y-%m', 'now')
            THEN 1 ELSE 0
          END) AS appointments_this_month
        FROM providers pr
        JOIN users u ON u.id = pr.user_id
        LEFT JOIN provider_specialties ps ON ps.id = pr.specialty_id
        LEFT JOIN appointments a ON a.provider_id = pr.id
        GROUP BY pr.id
        ORDER BY total_appointments DESC
      `).all();

      res.json({ success: true, data: providerLoad });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/users
 * List all users with their roles (admin only).
 */
router.get(
  '/users',
  validateToken,
  requireRole('admin'),
  auditAccess('users'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const users = db.prepare(`
        SELECT
          u.id,
          u.email,
          u.is_active,
          u.email_verified,
          u.created_at,
          u.updated_at,
          GROUP_CONCAT(r.name, ',') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `).all();
      res.json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /admin/users/:id/roles
 * Assign roles to a user (admin only).
 */
router.put(
  '/users/:id/roles',
  validateToken,
  requireRole('admin'),
  auditAccess('users'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = Number(req.params.id);
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) throw { message: 'User not found', statusCode: 404 };

      const { roles } = req.body as { roles: string[] };
      if (!Array.isArray(roles)) throw { message: 'roles must be an array', statusCode: 400 };

      // Replace roles
      db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(userId);
      for (const roleName of roles) {
        const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as any;
        if (role) {
          db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
        }
      }

      res.json({ success: true, data: { user_id: userId, roles } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /admin/users/:id/deactivate
 * Deactivates a user account (admin only).
 */
router.put(
  '/users/:id/deactivate',
  validateToken,
  requireRole('admin'),
  auditAccess('users'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = Number(req.params.id);
      if (userId === req.user!.sub) throw { message: 'Cannot deactivate your own account', statusCode: 422 };
      const result = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
      if (result.changes === 0) throw { message: 'User not found', statusCode: 404 };
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /admin/users/:id/activate
 * Reactivates a user account (admin only).
 */
router.put(
  '/users/:id/activate',
  validateToken,
  requireRole('admin'),
  auditAccess('users'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = Number(req.params.id);
      const result = db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(userId);
      if (result.changes === 0) throw { message: 'User not found', statusCode: 404 };
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/audit-log?user_id=&event_type=&date_from=&date_to=&limit=
 * Paginated audit log viewer (admin only).
 */
router.get(
  '/audit-log',
  validateToken,
  requireRole('admin'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const req = _req;
      const { user_id, event_type, date_from, date_to, limit = '100', offset = '0' } = req.query as Record<string, string>;

      let sql = `
        SELECT
          a.id,
          a.user_id,
          u.email AS user_email,
          a.event_type,
          a.ip_address,
          a.user_agent,
          a.metadata,
          a.created_at
        FROM audit_log_auth a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (user_id)    { sql += ' AND a.user_id = ?';    params.push(Number(user_id)); }
      if (event_type) { sql += ' AND a.event_type LIKE ?'; params.push(`%${event_type}%`); }
      if (date_from)  { sql += ' AND a.created_at >= ?'; params.push(date_from); }
      if (date_to)    { sql += ' AND a.created_at <= ?'; params.push(date_to); }

      sql += ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`;
      params.push(Math.min(Number(limit), 500), Number(offset));

      const rows = db.prepare(sql).all(...params);
      const total = (db.prepare(`SELECT COUNT(*) AS c FROM audit_log_auth`).get() as any).c;

      res.json({ success: true, data: { rows, total, limit: Number(limit), offset: Number(offset) } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/system-health
 * Basic system health metrics (admin only).
 */
router.get(
  '/system-health',
  validateToken,
  requireRole('admin'),
  (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const fs = require('fs');
      const path = require('path');

      const dbPath = path.resolve(__dirname, '../../../db/helix.db');
      let dbSizeBytes = 0;
      try { dbSizeBytes = fs.statSync(dbPath).size; } catch { /* file may be elsewhere */ }

      const activeUsers = (db.prepare(
        'SELECT COUNT(DISTINCT user_id) AS c FROM refresh_tokens WHERE revoked_at IS NULL AND expires_at > ?',
      ).get(new Date().toISOString()) as any).c;

      const totalUsers    = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c;
      const totalPatients = (db.prepare('SELECT COUNT(*) AS c FROM patients').get() as any).c;
      const totalAppts    = (db.prepare('SELECT COUNT(*) AS c FROM appointments').get() as any).c;

      const recentAuditEvents = db.prepare(`
        SELECT event_type, COUNT(*) AS c
        FROM audit_log_auth
        WHERE created_at >= datetime('now', '-24 hours')
        GROUP BY event_type
        ORDER BY c DESC
      `).all();

      res.json({
        success: true,
        data: {
          db_size_bytes: dbSizeBytes,
          db_size_mb: Math.round(dbSizeBytes / 1024 / 1024 * 100) / 100,
          active_sessions: activeUsers,
          total_users: totalUsers,
          total_patients: totalPatients,
          total_appointments: totalAppts,
          uptime_seconds: process.uptime(),
          node_version: process.version,
          recent_audit_events_24h: recentAuditEvents,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
