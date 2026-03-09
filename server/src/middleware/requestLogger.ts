/**
 * Request logging middleware.
 * Logs HTTP method, path, response status code, and request duration.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Attaches a start-time to each request and logs method / path / status /
 * duration once the response finishes.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      `[${level}] ${new Date().toISOString()} ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`,
    );
  });

  next();
}
