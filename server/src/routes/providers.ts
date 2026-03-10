/**
 * Providers routes — /api/providers
 *
 * GET /providers/me         — returns the authenticated user's provider record
 * GET /providers?user_id=X  — query provider by user_id (admin/staff)
 * GET /providers             — list providers (admin/staff)
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(validateToken);

// GET /providers/me — authenticated user's own provider record
router.get(
  '/me',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const user = req.user!;
      const providers = db
        .prepare(
          `SELECT p.*, s.name AS specialty_name, u.email
           FROM providers p
           LEFT JOIN provider_specialties s ON s.id = p.specialty_id
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.user_id = ?`,
        )
        .all(user.sub);
      res.json({ success: true, data: providers });
    } catch (err) {
      next(err);
    }
  },
);

// GET /providers?user_id=X  or  GET /providers  — list
router.get(
  '/',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userIdFilter = req.query.user_id ? Number(req.query.user_id) : null;

      const rows = userIdFilter
        ? db
            .prepare(
              `SELECT p.*, s.name AS specialty_name, u.email
               FROM providers p
               LEFT JOIN provider_specialties s ON s.id = p.specialty_id
               LEFT JOIN users u ON u.id = p.user_id
               WHERE p.user_id = ?`,
            )
            .all(userIdFilter)
        : db
            .prepare(
              `SELECT p.*, s.name AS specialty_name, u.email
               FROM providers p
               LEFT JOIN provider_specialties s ON s.id = p.specialty_id
               LEFT JOIN users u ON u.id = p.user_id
               ORDER BY u.email`,
            )
            .all();

      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
