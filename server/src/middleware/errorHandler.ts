/**
 * Global error-handler middleware.
 * Must be registered AFTER all routes (four-argument signature tells Express
 * this is an error handler).
 */

import { ErrorRequestHandler } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

/**
 * Centralised Express error handler. Logs the error and returns a structured
 * JSON response. In production the stack trace is omitted.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = (err as AppError).statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';

  console.error('[ERROR]', {
    status: statusCode,
    message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && err.details
      ? { details: (err as AppError).details }
      : {}),
  });
};

/**
 * Factory that creates an AppError with the given HTTP status code.
 */
export function createError(message: string, statusCode = 500, details?: unknown): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.details = details;
  return err;
}
