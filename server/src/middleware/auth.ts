/**
 * Authentication & authorisation middleware.
 *
 *  - validateToken()              — verifies the Bearer JWT and attaches the
 *                                   decoded payload to req.user
 *  - requireRole(...roles)        — 403 if the authenticated user lacks any
 *                                   of the required roles
 *  - requirePermission(res, act)  — 403 if the user's roles don't grant the
 *                                   specified resource/action permission
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from '../db/database';
import { JwtPayload, AuthenticatedRequest } from '../types';
import { createError } from './errorHandler';

const JWT_SECRET = process.env.JWT_SECRET ?? 'helix-dev-secret-change-in-production';

/**
 * Validates the Authorization: Bearer <token> header.
 * Attaches the decoded JWT payload to `req.user` on success.
 */
export function validateToken(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(createError('Missing or malformed Authorization header', 401));
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
    req.user = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(createError('Access token expired', 401));
    }
    return next(createError('Invalid access token', 401));
  }
}

/**
 * Returns middleware that allows only users who possess at least one of the
 * specified roles.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(createError('Unauthenticated', 401));

    const hasRole = user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) {
      return next(createError(`Access denied. Required role(s): ${allowedRoles.join(', ')}`, 403));
    }
    next();
  };
}

/**
 * Returns middleware that allows only users whose roles grant the specified
 * resource/action permission (checked against the role_permissions table).
 */
export function requirePermission(resource: string, action: string) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) return next(createError('Unauthenticated', 401));

    const db = getDb();

    // Admins bypass all permission checks
    if (user.roles.includes('admin')) return next();

    const placeholders = user.roles.map(() => '?').join(', ');
    const row = db
      .prepare(
        `SELECT 1
         FROM role_permissions rp
         JOIN roles r         ON r.id = rp.role_id
         JOIN permissions p   ON p.id = rp.permission_id
         WHERE r.name IN (${placeholders})
           AND p.resource = ?
           AND p.action   = ?
         LIMIT 1`,
      )
      .get([...user.roles, resource, action]);

    if (!row) {
      return next(
        createError(`Access denied. Required permission: ${resource}:${action}`, 403),
      );
    }
    next();
  };
}
