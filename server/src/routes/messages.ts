/**
 * Messaging routes — /api/messages
 *
 * GET  /messages/threads           — list threads for current user
 * POST /messages/threads           — create new thread
 * GET  /messages/threads/:id       — get thread with all messages
 * POST /messages/threads/:id/messages  — send message
 * PUT  /messages/threads/:id/read  — mark as read
 * POST /messages/threads/:id/archive  — archive thread
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../types';
import { notifyNewMessage } from '../services/notificationService';

const router = Router();
router.use(validateToken);

// ─── Guard: must be a participant ─────────────────────────────────────────────

function assertParticipant(
  threadId: number,
  userId: number,
  next: NextFunction,
): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT 1 FROM message_thread_participants WHERE thread_id = ? AND user_id = ?')
    .get(threadId, userId);
  if (!row) { next(createError('Thread not found or access denied', 404)); return false; }
  return true;
}

// ─── GET /threads ─────────────────────────────────────────────────────────────

router.get(
  '/threads',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const showArchived = req.query.archived === 'true';

      const threads = db.prepare(
        `SELECT
           mt.*,
           mtp.last_read_at,
           (SELECT COUNT(*) FROM messages m
            WHERE m.thread_id = mt.id
              AND (mtp.last_read_at IS NULL OR m.created_at > mtp.last_read_at)) AS unread_count,
           (SELECT m2.body FROM messages m2 WHERE m2.thread_id = mt.id ORDER BY m2.created_at DESC LIMIT 1) AS last_message
         FROM message_threads mt
         JOIN message_thread_participants mtp ON mtp.thread_id = mt.id AND mtp.user_id = ?
         WHERE mt.is_archived = ?
         ORDER BY mt.updated_at DESC`,
      ).all(userId, showArchived ? 1 : 0);

      res.json({ success: true, data: threads });
    } catch (err) { next(err); }
  },
);

// ─── POST /threads ────────────────────────────────────────────────────────────

router.post(
  '/threads',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const { subject, participant_ids, body } = req.body as {
        subject?: string;
        participant_ids?: number[];
        body?: string;
      };

      if (!subject) return next(createError('subject is required', 400));
      if (!body)    return next(createError('body is required', 400));
      if (!participant_ids || participant_ids.length === 0) {
        return next(createError('participant_ids is required', 400));
      }

      const allParticipantIds = [...new Set([userId, ...participant_ids])];

      const { lastInsertRowid: threadId } = db.prepare(
        `INSERT INTO message_threads (subject, created_by) VALUES (?, ?)`,
      ).run(subject, userId);

      const tid = Number(threadId);

      // Add all participants
      const addParticipant = db.prepare(
        `INSERT OR IGNORE INTO message_thread_participants (thread_id, user_id) VALUES (?, ?)`,
      );
      for (const uid of allParticipantIds) { addParticipant.run(tid, uid); }

      // Send first message
      const { lastInsertRowid: msgId } = db.prepare(
        `INSERT INTO messages (thread_id, sender_id, body) VALUES (?, ?, ?)`,
      ).run(tid, userId, body);

      // Notify recipients
      notifyNewMessage(tid, subject, userId);

      const thread = db.prepare(
        `SELECT mt.*, mtp.last_read_at FROM message_threads mt
         JOIN message_thread_participants mtp ON mtp.thread_id = mt.id AND mtp.user_id = ?
         WHERE mt.id = ?`,
      ).get(userId, tid);

      const firstMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(msgId));

      res.status(201).json({ success: true, data: { thread, first_message: firstMessage } });
    } catch (err) { next(err); }
  },
);

// ─── GET /threads/:id ─────────────────────────────────────────────────────────

router.get(
  '/threads/:id',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const threadId = Number(req.params.id);

      if (!assertParticipant(threadId, userId, next)) return;

      const thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(threadId);

      const messages = db.prepare(
        `SELECT m.*, u.email AS sender_email
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.thread_id = ?
         ORDER BY m.created_at ASC`,
      ).all(threadId);

      const participants = db.prepare(
        `SELECT mtp.user_id, mtp.last_read_at, u.email
         FROM message_thread_participants mtp
         JOIN users u ON u.id = mtp.user_id
         WHERE mtp.thread_id = ?`,
      ).all(threadId);

      res.json({ success: true, data: { thread, messages, participants } });
    } catch (err) { next(err); }
  },
);

// ─── POST /threads/:id/messages — send message ────────────────────────────────

router.post(
  '/threads/:id/messages',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const threadId = Number(req.params.id);

      if (!assertParticipant(threadId, userId, next)) return;

      const thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(threadId) as
        | { id: number; subject: string; is_archived: number }
        | undefined;

      if (!thread) return next(createError('Thread not found', 404));
      if (thread.is_archived) return next(createError('Cannot send to an archived thread', 422));

      const { body, is_priority = false } = req.body as { body?: string; is_priority?: boolean };
      if (!body) return next(createError('body is required', 400));

      const { lastInsertRowid } = db.prepare(
        `INSERT INTO messages (thread_id, sender_id, body, is_priority) VALUES (?, ?, ?, ?)`,
      ).run(threadId, userId, body, is_priority ? 1 : 0);

      const message = db.prepare(
        `SELECT m.*, u.email AS sender_email FROM messages m
         JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      ).get(Number(lastInsertRowid));

      notifyNewMessage(threadId, thread.subject, userId);

      res.status(201).json({ success: true, data: message });
    } catch (err) { next(err); }
  },
);

// ─── PUT /threads/:id/read ────────────────────────────────────────────────────

router.put(
  '/threads/:id/read',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const threadId = Number(req.params.id);

      if (!assertParticipant(threadId, userId, next)) return;

      db.prepare(
        `UPDATE message_thread_participants
         SET last_read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE thread_id = ? AND user_id = ?`,
      ).run(threadId, userId);

      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

// ─── POST /threads/:id/archive ────────────────────────────────────────────────

router.post(
  '/threads/:id/archive',
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const userId = req.user!.sub;
      const threadId = Number(req.params.id);

      if (!assertParticipant(threadId, userId, next)) return;

      // Only the thread creator or an admin can archive
      const thread = db.prepare('SELECT created_by FROM message_threads WHERE id = ?').get(threadId) as
        | { created_by: number }
        | undefined;
      if (!thread) return next(createError('Thread not found', 404));

      const user = req.user!;
      if (thread.created_by !== userId && !user.roles.includes('admin')) {
        return next(createError('Only the thread creator can archive', 403));
      }

      db.prepare(`UPDATE message_threads SET is_archived = 1 WHERE id = ?`).run(threadId);
      res.json({ success: true });
    } catch (err) { next(err); }
  },
);

export default router;
