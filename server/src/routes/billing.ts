/**
 * Billing routes — invoices, insurance plans, payments, disputes, payment plans.
 *
 * Mount points (set in app.ts):
 *   app.use('/api/patients',  billingRouter);      → /patients/:id/invoices etc.
 *   app.use('/api/invoices',  billingRouter);       → /invoices/:id etc.
 *   app.use('/api/billing',   billingRouter);       → /billing/disputes etc.
 *   app.use('/api/admin',     billingRouter);       → /admin/reports/revenue
 */

import { Router, Response, NextFunction } from 'express';
import { getDb } from '../db/database';
import { validateToken, requireRole } from '../middleware/auth';
import { auditAccess } from '../middleware/audit';
import { createError } from '../middleware/errorHandler';
import { createPaymentIntent } from '../services/stripeService';
import { AuthenticatedRequest } from '../types';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Resolves a patient record, enforcing that patients can only see their own data. */
function resolvePatient(
  req: AuthenticatedRequest,
  patientId: number,
): { id: number; user_id: number } {
  const db = getDb();
  const patient = db.prepare('SELECT id, user_id FROM patients WHERE id = ?').get(patientId) as
    | { id: number; user_id: number }
    | undefined;
  if (!patient) throw createError('Patient not found', 404);

  const roles = req.user!.roles ?? [];
  const isPatient = roles.includes('patient') && !roles.some((r: string) =>
    ['provider', 'nurse', 'admin', 'billing'].includes(r),
  );
  if (isPatient && patient.user_id !== req.user!.sub) {
    throw createError('Forbidden', 403);
  }
  return patient;
}

/** Returns invoice or throws 404. */
function resolveInvoice(invoiceId: number) {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
  if (!inv) throw createError('Invoice not found', 404);
  return inv;
}

// ── Patient insurance plans ────────────────────────────────────────────────────

/**
 * GET /patients/:id/insurance
 * Returns all insurance plans for a patient.
 */
router.get(
  '/:id/insurance',
  validateToken,
  auditAccess('insurance_plans'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const patient = resolvePatient(req, Number(req.params.id));
      const plans = db
        .prepare('SELECT * FROM insurance_plans WHERE patient_id = ? ORDER BY is_primary DESC, created_at')
        .all(patient.id);
      res.json({ success: true, data: plans });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /patients/:id/insurance
 * Adds a new insurance plan for a patient.
 */
router.post(
  '/:id/insurance',
  validateToken,
  auditAccess('insurance_plans'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const patient = resolvePatient(req, Number(req.params.id));
      const {
        insurer_name, plan_name, member_id, group_number,
        effective_date, expiration_date, is_primary,
        copay_amount, deductible_amount,
      } = req.body;

      if (!insurer_name || !plan_name || !member_id || !effective_date) {
        throw createError('insurer_name, plan_name, member_id, effective_date are required', 400);
      }

      // If new plan is primary, demote existing primary
      if (is_primary) {
        db.prepare('UPDATE insurance_plans SET is_primary = 0 WHERE patient_id = ?')
          .run(patient.id);
      }

      const result = db.prepare(`
        INSERT INTO insurance_plans
          (patient_id, insurer_name, plan_name, member_id, group_number,
           effective_date, expiration_date, is_primary, copay_amount, deductible_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        patient.id, insurer_name, plan_name, member_id, group_number ?? null,
        effective_date, expiration_date ?? null, is_primary ? 1 : 0,
        copay_amount ?? 0, deductible_amount ?? 0,
      );

      const plan = db.prepare('SELECT * FROM insurance_plans WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /patients/:id/insurance/:planId
 * Updates an existing insurance plan.
 */
router.put(
  '/:id/insurance/:planId',
  validateToken,
  auditAccess('insurance_plans'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const patient = resolvePatient(req, Number(req.params.id));
      const plan = db.prepare(
        'SELECT id FROM insurance_plans WHERE id = ? AND patient_id = ?',
      ).get(Number(req.params.planId), patient.id);
      if (!plan) throw createError('Insurance plan not found', 404);

      const allowed = [
        'insurer_name', 'plan_name', 'member_id', 'group_number',
        'effective_date', 'expiration_date', 'is_primary',
        'copay_amount', 'deductible_amount', 'deductible_met',
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => allowed.includes(k)),
      );

      if (updates.is_primary) {
        db.prepare('UPDATE insurance_plans SET is_primary = 0 WHERE patient_id = ?').run(patient.id);
      }

      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      if (sets) {
        db.prepare(`UPDATE insurance_plans SET ${sets} WHERE id = ?`)
          .run(...Object.values(updates), Number(req.params.planId));
      }

      const updated = db.prepare('SELECT * FROM insurance_plans WHERE id = ?').get(Number(req.params.planId));
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── Patient invoices ──────────────────────────────────────────────────────────

/**
 * GET /patients/:id/invoices?status=pending|paid|overdue|all
 */
router.get(
  '/:id/invoices',
  validateToken,
  auditAccess('invoices'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const patient = resolvePatient(req, Number(req.params.id));
      const status = req.query.status as string | undefined;

      let sql = `
        SELECT i.*,
               pd.first_name || ' ' || pd.last_name AS patient_name
        FROM invoices i
        JOIN patients p      ON p.id = i.patient_id
        JOIN patient_demographics pd ON pd.patient_id = p.id
        WHERE i.patient_id = ?
      `;
      const params: (string | number)[] = [patient.id];

      if (status && status !== 'all') {
        sql += ' AND i.status = ?';
        params.push(status);
      }
      sql += ' ORDER BY i.due_date DESC';

      res.json({ success: true, data: db.prepare(sql).all(...params) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /patients/:id/billing-summary
 */
router.get(
  '/:id/billing-summary',
  validateToken,
  auditAccess('invoices'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const patient = resolvePatient(req, Number(req.params.id));

      const totalOwed = (db.prepare(`
        SELECT COALESCE(SUM(patient_amount), 0) AS total
        FROM invoices
        WHERE patient_id = ? AND status IN ('pending','overdue')
      `).get(patient.id) as any).total;

      const lastPayment = db.prepare(`
        SELECT amount, paid_at FROM payments
        WHERE patient_id = ? AND status = 'succeeded'
        ORDER BY paid_at DESC LIMIT 1
      `).get(patient.id) as any;

      const nextDue = db.prepare(`
        SELECT patient_amount, due_date FROM invoices
        WHERE patient_id = ? AND status IN ('pending','overdue')
        ORDER BY due_date ASC LIMIT 1
      `).get(patient.id) as any;

      const pendingCount = (db.prepare(
        "SELECT COUNT(*) AS c FROM invoices WHERE patient_id = ? AND status = 'pending'",
      ).get(patient.id) as any).c;

      const overdueCount = (db.prepare(
        "SELECT COUNT(*) AS c FROM invoices WHERE patient_id = ? AND status = 'overdue'",
      ).get(patient.id) as any).c;

      res.json({
        success: true,
        data: {
          total_owed: totalOwed,
          last_payment_amount: lastPayment?.amount ?? null,
          last_payment_date: lastPayment?.paid_at ?? null,
          next_due_date: nextDue?.due_date ?? null,
          next_due_amount: nextDue?.patient_amount ?? null,
          pending_count: pendingCount,
          overdue_count: overdueCount,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── Single invoice ─────────────────────────────────────────────────────────────

/**
 * GET /invoices/:id
 * Returns an invoice with its line items and payment history.
 */
router.get(
  '/invoices/:id',
  validateToken,
  auditAccess('invoices'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const invoice = resolveInvoice(Number(req.params.id));

      // Role check: patients can only see their own
      const patient = db.prepare('SELECT user_id FROM patients WHERE id = ?').get(invoice.patient_id) as any;
      const roles = req.user!.roles ?? [];
      const isPatient = roles.includes('patient') && !roles.some((r: string) =>
        ['provider', 'nurse', 'admin', 'billing'].includes(r),
      );
      if (isPatient && patient.user_id !== req.user!.sub) throw createError('Forbidden', 403);

      const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(invoice.id);
      const payments = db.prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC').all(invoice.id);
      const plan = db.prepare('SELECT * FROM payment_plans WHERE invoice_id = ?').get(invoice.id);
      const dispute = db.prepare('SELECT * FROM billing_disputes WHERE invoice_id = ? ORDER BY submitted_at DESC LIMIT 1').get(invoice.id);

      res.json({ success: true, data: { invoice, items, payments, payment_plan: plan ?? null, dispute: dispute ?? null } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /invoices/:id/pay
 * Processes payment via mocked Stripe.
 */
router.post(
  '/invoices/:id/pay',
  validateToken,
  auditAccess('payments'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const invoice = resolveInvoice(Number(req.params.id));

      if (invoice.status === 'paid') throw createError('Invoice is already paid', 409);
      if (invoice.status === 'cancelled') throw createError('Invoice is cancelled', 422);

      const { payment_method = 'card', notes } = req.body;
      const amountToPay: number = invoice.patient_amount;

      // Mocked Stripe
      const result = createPaymentIntent(amountToPay, { invoice_id: String(invoice.id) });

      const paymentStatus = result.success ? 'succeeded' : 'failed';
      const paymentResult = db.prepare(`
        INSERT INTO payments
          (invoice_id, patient_id, amount, payment_method, stripe_payment_intent_id, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        invoice.id, invoice.patient_id, amountToPay,
        payment_method, result.payment_intent_id, paymentStatus, notes ?? null,
      );

      if (result.success) {
        db.prepare(`
          UPDATE invoices SET status = 'paid', paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?
        `).run(invoice.id);
      }

      const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentResult.lastInsertRowid);
      res.status(result.success ? 200 : 402).json({
        success: result.success,
        data: payment,
        error: result.error,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /invoices/:id/dispute
 * Files a billing dispute for an invoice.
 */
router.post(
  '/invoices/:id/dispute',
  validateToken,
  auditAccess('billing_disputes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const invoice = resolveInvoice(Number(req.params.id));

      // Check patient ownership
      const patient = db.prepare('SELECT user_id FROM patients WHERE id = ?').get(invoice.patient_id) as any;
      const roles = req.user!.roles ?? [];
      const isPatient = roles.includes('patient') && !roles.some((r: string) =>
        ['admin', 'billing'].includes(r),
      );
      if (isPatient && patient.user_id !== req.user!.sub) throw createError('Forbidden', 403);

      const { reason } = req.body;
      if (!reason) throw createError('reason is required', 400);

      // Check for existing open dispute
      const existing = db.prepare(
        "SELECT id FROM billing_disputes WHERE invoice_id = ? AND status IN ('open','under_review')",
      ).get(invoice.id);
      if (existing) throw createError('An open dispute already exists for this invoice', 409);

      const result = db.prepare(`
        INSERT INTO billing_disputes (invoice_id, patient_id, reason)
        VALUES (?, ?, ?)
      `).run(invoice.id, invoice.patient_id, reason);

      // Flag invoice as disputed
      db.prepare("UPDATE invoices SET status = 'disputed' WHERE id = ?").run(invoice.id);

      const dispute = db.prepare('SELECT * FROM billing_disputes WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ success: true, data: dispute });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /invoices/:id/payment-plan
 * Creates a payment plan for an invoice.
 */
router.post(
  '/invoices/:id/payment-plan',
  validateToken,
  auditAccess('payment_plans'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const invoice = resolveInvoice(Number(req.params.id));

      const { installments_total, next_due_date } = req.body;
      if (!installments_total || !next_due_date) {
        throw createError('installments_total and next_due_date are required', 400);
      }

      const existing = db.prepare(
        "SELECT id FROM payment_plans WHERE invoice_id = ? AND status = 'active'",
      ).get(invoice.id);
      if (existing) throw createError('An active payment plan already exists', 409);

      const installment = Math.ceil((invoice.patient_amount / installments_total) * 100) / 100;

      const result = db.prepare(`
        INSERT INTO payment_plans
          (invoice_id, patient_id, installment_amount, installments_total, next_due_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoice.id, invoice.patient_id, installment, installments_total, next_due_date);

      const plan = db.prepare('SELECT * FROM payment_plans WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  },
);

// ── Billing staff — disputes ──────────────────────────────────────────────────

/**
 * GET /billing/disputes?status=open|under_review|resolved|all
 */
router.get(
  '/disputes',
  validateToken,
  requireRole('admin', 'billing'),
  auditAccess('billing_disputes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const status = req.query.status as string | undefined;

      let sql = `
        SELECT bd.*,
               pd.first_name || ' ' || pd.last_name AS patient_name,
               i.total_amount, i.patient_amount
        FROM billing_disputes bd
        JOIN patients p ON p.id = bd.patient_id
        JOIN patient_demographics pd ON pd.patient_id = p.id
        JOIN invoices i ON i.id = bd.invoice_id
      `;
      const params: string[] = [];
      if (status && status !== 'all') {
        sql += ' WHERE bd.status = ?';
        params.push(status);
      }
      sql += ' ORDER BY bd.submitted_at DESC';

      res.json({ success: true, data: db.prepare(sql).all(...params) });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /billing/disputes/:id
 * Updates a dispute status (billing/admin only).
 */
router.put(
  '/disputes/:id',
  validateToken,
  requireRole('admin', 'billing'),
  auditAccess('billing_disputes'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();
      const dispute = db.prepare('SELECT * FROM billing_disputes WHERE id = ?').get(Number(req.params.id)) as any;
      if (!dispute) throw createError('Dispute not found', 404);

      const { status, resolution_notes } = req.body;
      const allowed = ['open', 'under_review', 'resolved', 'rejected'];
      if (!allowed.includes(status)) throw createError('Invalid status', 400);

      const resolvedAt = ['resolved', 'rejected'].includes(status)
        ? new Date().toISOString()
        : null;

      db.prepare(`
        UPDATE billing_disputes
        SET status = ?, resolution_notes = ?, resolved_at = ?
        WHERE id = ?
      `).run(status, resolution_notes ?? null, resolvedAt, dispute.id);

      // If resolved/rejected, revert invoice status to pending or paid
      if (['resolved', 'rejected'].includes(status)) {
        db.prepare(`
          UPDATE invoices SET status = 'pending' WHERE id = ? AND status = 'disputed'
        `).run(dispute.invoice_id);
      }

      res.json({ success: true, data: db.prepare('SELECT * FROM billing_disputes WHERE id = ?').get(dispute.id) });
    } catch (err) {
      next(err);
    }
  },
);

// ── Admin revenue report ──────────────────────────────────────────────────────

/**
 * GET /admin/reports/revenue
 * Monthly revenue breakdown and outstanding balances.
 */
router.get(
  '/reports/revenue',
  validateToken,
  requireRole('admin', 'billing'),
  auditAccess('reports'),
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const db = getDb();

      const revenueByMonth = db.prepare(`
        SELECT
          strftime('%Y-%m', paid_at) AS month,
          SUM(amount) AS revenue,
          COUNT(*)    AS payments_count
        FROM payments
        WHERE status = 'succeeded'
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `).all();

      const outstanding = db.prepare(`
        SELECT
          status,
          COUNT(*)          AS invoice_count,
          SUM(patient_amount) AS total_outstanding
        FROM invoices
        WHERE status IN ('pending','overdue','disputed')
        GROUP BY status
      `).all();

      const topPatients = db.prepare(`
        SELECT
          pd.first_name || ' ' || pd.last_name AS patient_name,
          SUM(i.patient_amount) AS total_billed
        FROM invoices i
        JOIN patients p ON p.id = i.patient_id
        JOIN patient_demographics pd ON pd.patient_id = p.id
        GROUP BY i.patient_id
        ORDER BY total_billed DESC
        LIMIT 10
      `).all();

      res.json({ success: true, data: { revenueByMonth, outstanding, topPatients } });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
