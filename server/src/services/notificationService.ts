/**
 * notificationService.ts
 *
 * Mocked notification system — all notifications are logged to console with
 * the prefix [NOTIFICATION] and persisted to the notifications table.
 *
 * In a production system this would send real emails/SMS; here it is all mocked.
 */

import { getDb } from '../db/database';

export type NotificationType =
  | 'new_message'
  | 'appointment_reminder'
  | 'lab_result'
  | 'refill_approved'
  | 'refill_denied'
  | 'appointment_cancelled'
  | 'appointment_rescheduled';

interface NotifyOptions {
  userId: number;
  type: NotificationType;
  title: string;
  body: string;
  dataJson?: Record<string, unknown>;
}

/**
 * Creates a notification row and logs a console mock for email/SMS delivery.
 */
export function notify(opts: NotifyOptions): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, body, data_json)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      opts.userId,
      opts.type,
      opts.title,
      opts.body,
      opts.dataJson ? JSON.stringify(opts.dataJson) : null,
    );

    // Mock email/SMS delivery
    console.log(`[NOTIFICATION] → user#${opts.userId} [${opts.type}] ${opts.title}: ${opts.body}`);
  } catch (err) {
    console.error('[NOTIFICATION] Failed to persist notification:', err);
  }
}

/** Notify all participants of a thread about a new message (except the sender). */
export function notifyNewMessage(
  threadId: number,
  subject: string,
  senderId: number,
): void {
  try {
    const db = getDb();
    const participants = db
      .prepare(
        `SELECT user_id FROM message_thread_participants WHERE thread_id = ? AND user_id != ?`,
      )
      .all(threadId, senderId) as { user_id: number }[];

    for (const p of participants) {
      notify({
        userId: p.user_id,
        type: 'new_message',
        title: 'New message received',
        body: `You have a new message in thread: "${subject}"`,
        dataJson: { thread_id: threadId },
      });
    }
  } catch (err) {
    console.error('[NOTIFICATION] notifyNewMessage failed:', err);
  }
}

/** Notify prescriber (and optionally patient) that a refill was reviewed. */
export function notifyRefillReview(
  patientUserId: number,
  drugName: string,
  approved: boolean,
  prescriptionId: number,
): void {
  notify({
    userId: patientUserId,
    type: approved ? 'refill_approved' : 'refill_denied',
    title: approved ? 'Refill request approved' : 'Refill request denied',
    body: approved
      ? `Your refill request for ${drugName} has been approved.`
      : `Your refill request for ${drugName} has been denied. Contact your provider for details.`,
    dataJson: { prescription_id: prescriptionId },
  });
}

/** Appointment reminder — called by scheduler (or manually for seed data). */
export function notifyAppointmentReminder(
  userId: number,
  appointmentId: number,
  scheduledAt: string,
  hoursAhead: 24 | 1,
): void {
  notify({
    userId,
    type: 'appointment_reminder',
    title: `Appointment reminder (${hoursAhead}h)`,
    body: `Reminder: You have an appointment on ${new Date(scheduledAt).toLocaleString()}.`,
    dataJson: { appointment_id: appointmentId },
  });
}

/** Lab result available. */
export function notifyLabResult(userId: number, testName: string, labResultId: number): void {
  notify({
    userId,
    type: 'lab_result',
    title: 'Lab result available',
    body: `Your ${testName} result is now available.`,
    dataJson: { lab_result_id: labResultId },
  });
}

/** Appointment cancelled or rescheduled. */
export function notifyAppointmentChange(
  userId: number,
  appointmentId: number,
  change: 'cancelled' | 'rescheduled',
): void {
  notify({
    userId,
    type: change === 'cancelled' ? 'appointment_cancelled' : 'appointment_rescheduled',
    title: change === 'cancelled' ? 'Appointment cancelled' : 'Appointment rescheduled',
    body:
      change === 'cancelled'
        ? 'Your appointment has been cancelled. Please reschedule if needed.'
        : 'Your appointment has been rescheduled. Please review the new time.',
    dataJson: { appointment_id: appointmentId },
  });
}
