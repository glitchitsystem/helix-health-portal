/**
 * Audit middleware.
 * auditAccess(resource) — fires after the response finishes and writes a row
 * to audit_log_auth recording who accessed what.
 */

import { Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { AuthenticatedRequest, AuthEventType } from '../types';

/**
 * Returns middleware that logs every request for the given resource to the
 * audit_log_auth table once the response has been sent.
 *
 * @param resource - A human-readable label for the resource being accessed.
 * @param eventType - The audit event type to record (default: determined from HTTP method).
 */
export function auditAccess(resource: string, eventType?: AuthEventType) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      // Only audit successful responses (2xx)
      if (res.statusCode < 200 || res.statusCode >= 300) return;

      const db = getDb();
      const resolvedEventType =
        eventType ?? methodToEventType(req.method);
      const metadata = JSON.stringify({
        resource,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
      });

      try {
        db.prepare(
          `INSERT INTO audit_log_auth (user_id, event_type, ip_address, user_agent, metadata)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          req.user?.sub ?? null,
          resolvedEventType,
          req.ip ?? null,
          req.headers['user-agent'] ?? null,
          metadata,
        );
      } catch (err) {
        // Never crash the request because of audit failure — just log it.
        console.error('[AUDIT] Failed to write audit log entry:', err);
      }
    });

    next();
  };
}

/**
 * Converts an HTTP method to a generic audit event type label.
 */
function methodToEventType(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':    return 'access_read';
    case 'POST':   return 'access_write';
    case 'PUT':
    case 'PATCH':  return 'access_update';
    case 'DELETE': return 'access_delete';
    default:       return 'access_unknown';
  }
}
