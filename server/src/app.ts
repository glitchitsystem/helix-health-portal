/**
 * Express application factory.
 * Separated from the server entry point so it can be imported in tests.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import authRouter          from './routes/auth';
import appointmentsRouter  from './routes/appointments';
import medicalRecordsRouter from './routes/medicalRecords';
import clinicalNotesRouter  from './routes/clinicalNotes';
import providersRouter      from './routes/providers';

/**
 * Creates and configures the Express application.
 *
 * @returns Configured Express app instance.
 */
export function createApp(): express.Application {
  const app = express();

  // ── Security headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  // ── Body parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Global rate limiter (generous — tighter limits on auth routes below) ─
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests, please try again later.' },
    }),
  );

  // ── Auth-specific rate limiter ───────────────────────────────────────────
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many authentication attempts, please try again later.' },
  });

  // ── Request logging ──────────────────────────────────────────────────────
  app.use(requestLogger);

  // ── Health check (no auth, no rate limit) ────────────────────────────────
  app.get('/api/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/auth',         authLimiter, authRouter);
  app.use('/api/appointments',  appointmentsRouter);
  app.use('/api/providers',     providersRouter);
  app.use('/api/patients',      medicalRecordsRouter);
  app.use('/api/documents',     medicalRecordsRouter);  // for /documents/doc/:id/download alias
  app.use('/api',               clinicalNotesRouter);   // /notes/:id, /note-templates, /patients/:id/notes

  // ── 404 fallback ─────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // ── Global error handler (must be last) ──────────────────────────────────
  app.use(errorHandler);

  return app;
}
