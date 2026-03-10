/**
 * Notifications routes — /api/notifications
 *
 * GET  /notifications?unread_only=true
 * PUT  /notifications/:id/read
 * PUT  /notifications/read-all
 * GET  /notifications/preferences
 * PUT  /notifications/preferences
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';

const router = Router();
router.use(validateToken);

// All notification types we support
const NOTIFICATION_TYPES = [
  'new_message',
  'appointment_reminder',
  'lab_result',
  'refill_approved',
  'refill_denied',
  'appointment_cancelled',
  'appointment_rescheduled',
];

// ─── GET /notifications ───────────────────────────────────────────────────────

router.get(
  '/',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const unreadOnly = req.query.unread_only === 'true';

      const rows = unreadOnly
        ? db.prepare(
            `SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 100`,
          ).all(userId)
        : db.prepare(
            `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
          ).all(userId);

      const unreadCount = (
        db.prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0').get(userId) as
          { cnt: number }
      ).cnt;

      res.json({ success: true, data: rows, unread_count: unreadCount });
    } catch (err) { next(err); }
  },
);

// ─── PUT /notifications/read-all ──────────────────────────────────────────────
// Must be listed before /:id/read to avoid route conflict

router.put(
  '/read-all',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      db.prepare(
        `UPDATE notifications
         SET is_read = 1, read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE user_id = ? AND is_read = 0`,
      ).run(userId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── PUT /notifications/:id/read ──────────────────────────────────────────────

router.put(
  '/:id/read',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const notifId = Number(req.params.id);

      const notif = db.prepare('SELECT id, user_id FROM notifications WHERE id = ?').get(notifId) as
        | { id: number; user_id: number }
        | undefined;
      if (!notif) return next(createError('Notification not found', 404));
      if (notif.user_id !== userId) return next(createError('Access denied', 403));

      db.prepare(
        `UPDATE notifications SET is_read = 1, read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      ).run(notifId);

      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── GET /notifications/preferences ──────────────────────────────────────────

router.get(
  '/preferences',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;

      // Ensure all notification types have a preference row (with defaults)
      for (const type of NOTIFICATION_TYPES) {
        db.prepare(
          `INSERT OR IGNORE INTO notification_preferences (user_id, notification_type)
           VALUES (?, ?)`,
        ).run(userId, type);
      }

      const prefs = db
        .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
        .all(userId);

      res.json({ success: true, data: prefs });
    } catch (err) { next(err); }
  },
);

// ─── PUT /notifications/preferences ──────────────────────────────────────────

router.put(
  '/preferences',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const updates = req.body as Array<{
        notification_type: string;
        in_app_enabled?: number;
        email_enabled?: number;
        sms_enabled?: number;
      }>;

      if (!Array.isArray(updates)) return next(createError('Body must be an array of preference objects', 400));

      for (const u of updates) {
        if (!NOTIFICATION_TYPES.includes(u.notification_type)) continue;
        db.prepare(
          `INSERT INTO notification_preferences
             (user_id, notification_type, in_app_enabled, email_enabled, sms_enabled)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, notification_type) DO UPDATE
             SET in_app_enabled = excluded.in_app_enabled,
                 email_enabled  = excluded.email_enabled,
                 sms_enabled    = excluded.sms_enabled`,
        ).run(
          userId,
          u.notification_type,
          u.in_app_enabled ?? 1,
          u.email_enabled ?? 1,
          u.sms_enabled ?? 0,
        );
      }

      const prefs = db.prepare('SELECT * FROM notification_preferences WHERE user_id = ?').all(userId);
      res.json({ success: true, data: prefs });
    } catch (err) { next(err); }
  },
);

export default router;
