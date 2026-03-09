# Helix Health Portal Application Build Prompt
**Use this prompt when starting a new Claude conversation to build the Helix Health Portal Patient Portal.**

---

## SYSTEM CONTEXT (paste at the start of every new build session)

```
You are a senior full-stack engineer helping build Helix Health Portal — a realistic, feature-rich 
outpatient healthcare patient portal used as the sample application for a QA automation 
course. The app must be locally runnable with zero external infrastructure.

Tech stack:
- Frontend: React 18 + TypeScript + React Router v6 + Tailwind CSS
- Backend: Node.js + Express 4 + TypeScript
- Database: SQLite 3 via better-sqlite3 (synchronous, no server required)
- Auth: JWT access tokens (15min expiry) + refresh tokens (7 days) + TOTP-based MFA
- API: RESTful JSON, OpenAPI 3.0 spec maintained alongside code
- Email/SMS: Mocked — log to console, never send real messages
- Payments: Mocked Stripe — simulate success/failure responses locally

Project structure:
Helix Health Portal/
├── client/          # React frontend
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/   # API client functions
│   │   └── types/
├── server/          # Express backend
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── db/
│   │   └── types/
├── db/
│   ├── schema.sql
│   ├── seed.ts
│   └── migrations/
├── tests/           # Placeholder folders for course students
│   ├── unit/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── .github/
│   └── workflows/   # CI scaffold
├── openapi.yaml
├── package.json     # Root workspace
└── README.md
```

Core principles for this codebase:
1. TESTABILITY FIRST: Every feature must be easy to test. Use dependency injection, 
   avoid global state, keep business logic in pure functions separate from route handlers.
2. REALISTIC COMPLEXITY: This is a teaching app but must feel like a real healthcare system.
   Don't cut corners on data relationships, validation, or error handling.
3. INTENTIONAL BUGS: When requested, seed deliberate bugs for course debugging exercises.
   Always comment them clearly: // COURSE_BUG: [description] — students will find this.
4. DATA SAFETY BY DESIGN: The app must enforce role-based access at the middleware level,
   log all PHI access to the audit table, and never expose one patient's data to another.
5. SEED DATA: All seed data must be obviously synthetic. Use the prefix TEST_ on names,
   fake SSN format 000-00-XXXX, fake MRN format MRN-TEST-XXXXX.
6. OPENAPI SPEC: Keep openapi.yaml up to date as routes are added. Students use this
   to generate API tests in the course.
```

---

## PHASE 1 PROMPT — Foundation & Auth

```
We are starting Phase 1 of the Helix Health Portal build. Deliver everything needed to run the 
app skeleton with working authentication.

Deliverables for Phase 1:

1. ROOT PACKAGE.JSON & WORKSPACE SETUP
   - npm workspaces for client and server
   - Root scripts: dev (runs both), build, test, seed
   - TypeScript configured for both workspaces

2. DATABASE SCHEMA (db/schema.sql)
   Create tables for:
   - users (id, email, password_hash, is_active, email_verified, created_at, updated_at)
   - roles (id, name, description)
   - permissions (id, resource, action, description)
   - user_roles (user_id, role_id)
   - role_permissions (role_id, permission_id)
   - refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at)
   - mfa_secrets (user_id, secret, is_enabled, created_at)
   - audit_log_auth (id, user_id, event_type, ip_address, user_agent, metadata, created_at)
   - patients (id, user_id, mrn, created_at, updated_at)
   - patient_demographics (patient_id, first_name, last_name, dob, gender, phone, address_line1, address_line2, city, state, zip, emergency_contact_name, emergency_contact_phone)
   - providers (id, user_id, npi, specialty_id, license_number, created_at)
   - provider_specialties (id, name, description)

3. EXPRESS SERVER SETUP (server/src/)
   - Express app with CORS, helmet, rate limiting, JSON body parser
   - SQLite database singleton (better-sqlite3)
   - Global error handler middleware
   - Request logging middleware (log method, path, status, duration)
   - Auth middleware: validateToken(), requireRole(...roles), requirePermission(resource, action)
   - Audit middleware: auditAccess(resource) — logs every request to audit_log_auth

4. AUTH ROUTES (POST /api/auth/*)
   - POST /register — validate email/password, hash password (bcrypt), send verification email (mocked — log token to console), create patient record and assign patient role
   - POST /login — verify credentials, check account active + email verified, check lockout (5 failed attempts = 15min lockout), issue JWT + refresh token, log event
   - POST /logout — revoke refresh token, log event
   - POST /refresh — exchange refresh token for new access token
   - POST /mfa/setup — generate TOTP secret, return QR code URI
   - POST /mfa/verify — verify TOTP code, enable MFA on account
   - POST /mfa/validate — validate TOTP during login (second step)
   - POST /password-reset/request — generate signed token (30min expiry), log to console
   - POST /password-reset/confirm — validate token, update password, revoke all refresh tokens

5. REACT CLIENT SETUP (client/src/)
   - Vite + React 18 + TypeScript + Tailwind CSS
   - React Router v6 with protected route wrapper
   - Auth context: stores user, token, role; exposes login(), logout(), refresh()
   - Axios instance with request interceptor (attach Bearer token) and response interceptor (auto-refresh on 401)
   - Pages: Login, Register, ForgotPassword, ResetPassword, MFASetup, MFAVerify
   - Basic shell layout: sidebar nav (links vary by role), header with user menu, main content area

6. SEED DATA (db/seed.ts)
   Create the following test accounts (password for all: TestPass123!):
   - admin@Helix Health Portal.test — Admin role
   - provider@Helix Health Portal.test — Provider role (Dr. TEST Provider, NPI: 0000000001)
   - nurse@Helix Health Portal.test — Nurse role
   - billing@Helix Health Portal.test — Billing role
   - patient1@Helix Health Portal.test — Patient role (TEST Patient One, MRN-TEST-00001)
   - patient2@Helix Health Portal.test — Patient role (TEST Patient Two, MRN-TEST-00002)

7. README.md
   Installation and setup instructions. List all test accounts and passwords.
   Include: how to reset the database, how to run in watch mode.

For each file, provide the complete code. Do not abbreviate or use placeholders.
Use TypeScript throughout. Include JSDoc comments on all exported functions.
```

---

## PHASE 2 PROMPT — Core Clinical Features

```
Phase 1 is complete. Now build Phase 2: the core clinical features.

Add to db/schema.sql (migration file db/migrations/002_clinical.sql):
- appointments (id, patient_id, provider_id, appointment_type_id, status, scheduled_at, duration_minutes, location, telehealth_url, notes, created_by, created_at, updated_at)
- appointment_types (id, name, duration_minutes, color_hex, is_telehealth, is_active)
- appointment_reminders (id, appointment_id, reminder_type, scheduled_at, sent_at, status)
- waitlist (id, patient_id, provider_id, appointment_type_id, requested_at, priority, status, notes)
- medical_records (id, patient_id, record_type, created_by, created_at, updated_at)
- diagnoses (id, patient_id, icd10_code, icd10_description, status, onset_date, resolved_date, severity, notes, created_by, created_at)
- medications (id, patient_id, name, dosage, frequency, route, start_date, end_date, status, prescriber_id, notes, created_by, created_at)
- allergies (id, patient_id, allergen, reaction_type, severity, onset_date, status, notes, created_by, created_at)
- vitals (id, patient_id, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, weight_kg, height_cm, o2_saturation, recorded_by)
- lab_results (id, patient_id, test_name, test_code, value, unit, reference_range_low, reference_range_high, status, collected_at, resulted_at, ordered_by, notes)
- clinical_notes (id, patient_id, provider_id, appointment_id, note_type, subjective, objective, assessment, plan, is_locked, locked_at, created_at, updated_at)
- note_addenda (id, note_id, author_id, content, created_at)
- note_templates (id, name, note_type, subjective_template, objective_template, assessment_template, plan_template, created_by, is_shared)
- documents (id, patient_id, filename, file_type, file_size, storage_path, description, uploaded_by, created_at)
- document_access_logs (id, document_id, accessed_by, accessed_at, access_type)

Build all Express routes and React pages for:

APPOINTMENTS (/api/appointments)
- GET /appointments?patient_id&provider_id&status&date_from&date_to — filtered list
- GET /appointments/:id — single appointment with patient and provider details
- POST /appointments — book appointment (validate: provider available, no conflicts, valid type)
- PUT /appointments/:id — update appointment details
- DELETE /appointments/:id — soft delete
- POST /appointments/:id/cancel — cancel with reason, trigger mocked reminder cancellation
- POST /appointments/:id/reschedule — reschedule to new time, validate availability
- GET /appointments/availability?provider_id&date&appointment_type_id — available slots

MEDICAL RECORDS (/api/patients/:id/*)
- Full CRUD for: diagnoses, medications, allergies, vitals, lab_results
- GET /patients/:id/summary — aggregated health summary (latest vitals, active meds, active diagnoses, recent labs)
- POST /patients/:id/documents — upload document (simulate file storage with local disk)
- GET /patients/:id/documents — list documents
- GET /documents/:id/download — download with access log entry

CLINICAL NOTES (/api/notes, /api/patients/:id/notes)
- GET /patients/:id/notes — list notes (providers see all, patients see their own)
- POST /patients/:id/notes — create SOAP note
- GET /notes/:id — get single note
- PUT /notes/:id — update note (only if not locked; auto-lock after 24 hours via a check on read)
- POST /notes/:id/addendum — add addendum to locked note
- GET /note-templates — list templates available to current user
- POST /note-templates — create template

REACT PAGES TO BUILD:
- Patient: AppointmentBooking (3-step wizard: choose type → choose provider/time → confirm)
- Patient: AppointmentList (upcoming + past, with cancel/reschedule actions)
- Patient: AppointmentDetail
- Patient/Provider: MedicalRecords (tabbed: Diagnoses, Medications, Allergies, Vitals, Labs)
- Provider: NoteEditor (SOAP form with template picker, autosave draft)
- Provider: NoteViewer (read-only for locked notes, with addendum button)
- Provider: PatientChart (full clinical view of a single patient)
- Provider: ProviderSchedule (day/week calendar view of appointments)
- Shared: DocumentVault (list + upload)

SEED DATA to add:
- 4 appointment types: Annual Physical (60min), Follow-up (30min), Telehealth Consult (30min), Urgent Care (45min)
- 10 appointments across the two test patients spanning the past 3 months and next 2 weeks
- 3 diagnoses, 2 active medications, 1 allergy, 5 vital sign readings per test patient
- 3 lab results per test patient (one flagged out of range)
- 2 clinical notes per test patient (one locked, one editable)
- 1 waitlist entry

For each file, provide the complete code. Include validation, error handling, 
role-based access enforcement, and audit logging on all PHI access.
```

---

## PHASE 3 PROMPT — Prescriptions & Communications

```
Phase 2 is complete. Build Phase 3: prescriptions and communications.

Add migration db/migrations/003_comms.sql:
- prescriptions (id, patient_id, prescriber_id, drug_name, drug_ndc, dosage, frequency, route, quantity, refills_remaining, start_date, end_date, status, is_controlled, schedule_class, pharmacy_name, pharmacy_phone, notes, created_at, updated_at)
- drug_interactions_log (id, patient_id, drug_a, drug_b, severity, description, checked_at, checked_by)
- refill_requests (id, prescription_id, patient_id, requested_at, status, pharmacy_notes, reviewed_by, reviewed_at, notes)
- message_threads (id, subject, created_by, created_at, updated_at, is_archived)
- message_thread_participants (thread_id, user_id, joined_at, last_read_at)
- messages (id, thread_id, sender_id, body, is_priority, created_at)
- message_attachments (id, message_id, filename, file_type, file_size, storage_path)
- notifications (id, user_id, type, title, body, data_json, is_read, read_at, created_at)
- notification_preferences (user_id, notification_type, in_app_enabled, email_enabled, sms_enabled)

Build all routes and React pages for:

PRESCRIPTIONS (/api/patients/:id/prescriptions, /api/prescriptions)
- GET /patients/:id/prescriptions?status=active|all
- POST /patients/:id/prescriptions — create (provider only; run mocked drug interaction check)
- PUT /prescriptions/:id — update
- POST /prescriptions/:id/renew — renew with new end date and refill count
- DELETE /prescriptions/:id — discontinue with reason
- POST /prescriptions/:id/refill-request — patient requests refill
- GET /prescriptions/refill-requests — provider sees pending refill requests
- PUT /prescriptions/refill-requests/:id — approve or deny refill request

DRUG INTERACTION CHECK (mocked service):
- On prescription creation, check if any active medications have a known interaction
- Maintain a hardcoded list of 10 interaction pairs with severity levels (mild/moderate/severe)
- Log every check to drug_interactions_log
- Return interaction warnings to the prescriber (do not block, just warn)

SECURE MESSAGING (/api/messages)
- GET /messages/threads — list threads for current user
- POST /messages/threads — create new thread (patient initiates to care team, provider initiates to patient)
- GET /messages/threads/:id — get thread with all messages
- POST /messages/threads/:id/messages — send message
- PUT /messages/threads/:id/read — mark thread as read (update last_read_at)
- POST /messages/threads/:id/archive — archive thread

NOTIFICATIONS (/api/notifications)
- GET /notifications?unread_only=true
- PUT /notifications/:id/read
- PUT /notifications/read-all
- GET /notifications/preferences
- PUT /notifications/preferences

MOCKED NOTIFICATION TRIGGERS — log to console with prefix [NOTIFICATION]:
- New message received
- Appointment reminder (24h and 1h before)
- Lab result available
- Prescription refill approved/denied
- Appointment cancelled or rescheduled

REACT PAGES:
- Patient/Provider: MessageInbox (thread list with unread counts)
- Patient/Provider: MessageThread (message history + reply composer)
- Patient/Provider: NewMessage (recipient picker + subject + body)
- Patient: PrescriptionList (active, show refill remaining, refill request button)
- Provider: PrescriptionManager (create, renew, view refill requests)
- Shared: NotificationCenter (list, mark read, preferences link)
- Shared: NotificationPreferences

SEED DATA:
- 2 active prescriptions per test patient
- 1 controlled substance prescription (Schedule III) for patient1
- 1 drug interaction pair pre-loaded (Warfarin + Aspirin, severity: severe)
- 3 message threads: patient1↔provider, patient2↔provider, one admin broadcast
- 5 notifications per test user (mix of read and unread)
```

---

## PHASE 4 PROMPT — Billing, Search & Reporting

```
Phase 3 is complete. Build Phase 4: billing, search, and reporting.

Add migration db/migrations/004_billing.sql:
- insurance_plans (id, patient_id, insurer_name, plan_name, member_id, group_number, effective_date, expiration_date, is_primary, copay_amount, deductible_amount, deductible_met, created_at, updated_at)
- invoices (id, patient_id, appointment_id, status, total_amount, insurance_amount, patient_amount, due_date, paid_at, created_at, updated_at)
- invoice_items (id, invoice_id, cpt_code, description, quantity, unit_price, insurance_adjustment, patient_responsibility)
- payments (id, invoice_id, patient_id, amount, payment_method, stripe_payment_intent_id, status, paid_at, notes)
- payment_plans (id, invoice_id, patient_id, installment_amount, installments_total, installments_paid, next_due_date, status, created_at)
- billing_disputes (id, invoice_id, patient_id, reason, status, submitted_at, resolved_at, resolution_notes)

Build all routes and React pages for:

BILLING (/api/billing, /api/patients/:id/billing)
- GET /patients/:id/invoices?status=pending|paid|all
- GET /invoices/:id — invoice with line items and payment history
- POST /invoices/:id/pay — process payment (mocked Stripe: always succeed unless amount > 10000)
- GET /patients/:id/insurance — list insurance plans
- POST /patients/:id/insurance — add insurance plan
- PUT /patients/:id/insurance/:planId — update insurance plan
- GET /patients/:id/billing-summary — total owed, last payment, next due
- POST /invoices/:id/dispute — file billing dispute
- GET /billing/disputes — billing staff sees all disputes
- PUT /billing/disputes/:id — update dispute status
- POST /invoices/:id/payment-plan — create payment plan
- GET /admin/reports/revenue — total revenue by month, outstanding balances (admin/billing only)

SEARCH (/api/search)
- GET /search?q=&type=patients|providers|appointments|all
- Patients: search by name, MRN, DOB (providers and admin only)
- Providers: search by name, specialty, NPI
- Appointments: search by patient name, date range, status
- Full-text search on clinical notes content (provider only)

ADMIN REPORTS (/api/admin/reports)
- GET /admin/reports/utilisation — appointments per day/week, no-show rate, cancellation rate, by provider
- GET /admin/reports/population — aggregate stats: age distribution, top 10 diagnoses, avg vitals (all anonymised, no PII)
- GET /admin/reports/provider-load — patients per provider, appointments per provider this month

REACT PAGES:
- Patient: BillingDashboard (summary, invoice list, insurance on file)
- Patient: InvoiceDetail (line items, EOB breakdown, pay button)
- Patient: PaymentFlow (enter card details → mocked success screen)
- Patient: InsuranceManager (add/edit insurance plans)
- Billing Staff: BillingWorkqueue (all outstanding invoices, dispute queue)
- Admin: ReportsDashboard (tabs for utilisation, population, provider load)
- Admin: UserManager (list all users, assign roles, deactivate accounts)
- Admin: AuditLogViewer (filterable table of all audit events, export to CSV)
- Admin: SystemHealthDashboard (db size, active users, recent errors)
- Shared: GlobalSearchResults (unified results across all types)

SEED DATA:
- 2 insurance plans per test patient
- 3 invoices per test patient (1 paid, 1 pending, 1 overdue)
- 5 invoice line items with realistic CPT codes per invoice
- 1 payment record for the paid invoice
- 1 billing dispute
- 1 payment plan
```

---

## PHASE 5 PROMPT — Course Prep & Polish

```
Phase 4 is complete. Phase 5 prepares the app for course use.

1. INTENTIONAL BUGS (seed for course debugging exercises)
   Add the following bugs, each commented with // COURSE_BUG: [description]:

   Bug 1 (Section 10 - Unit): In the prescription dosage validation function, 
   the maximum daily dose check uses > instead of >= causing one boundary case to pass incorrectly.
   
   Bug 2 (Section 10 - Integration): The appointment conflict detection query has an off-by-one 
   error — it misses appointments that end exactly when the new one starts.
   
   Bug 3 (Section 10 - E2E): The appointment booking wizard does not clear the selected time 
   slot when the user navigates back to step 1 and changes the appointment type.
   
   Bug 4 (Section 10 - Auth): The password reset token expiry check uses > instead of >= 
   so tokens expire one second early.
   
   Bug 5 (Section 10 - Access Control): The GET /patients/:id/vitals endpoint checks 
   req.user.role === 'provider' but does not verify the provider is assigned to this patient.

2. EXTENDED SEED DATA
   Using the TEST_ naming convention, generate:
   - 20 test patients with full demographics, varying ages (18–85), diverse conditions
   - 3 additional providers across different specialties
   - 60 appointments spread across the past 6 months and next 4 weeks
   - Enough data to make the reporting endpoints return meaningful charts
   - 5 patients with complex medication lists (5+ active medications) for interaction testing
   - 3 patients with complete vital sign histories (monthly readings for 12 months)

3. TEST FIXTURES LIBRARY (tests/fixtures/)
   Create the following fixture files students will use in the course:

   auth.fixtures.ts — exported constants for all test user credentials
   patients.fixtures.ts — factory functions using Faker.js for generating test patients
   appointments.fixtures.ts — factory functions for appointments and availability
   prescriptions.fixtures.ts — factory functions including controlled substance cases
   db.helpers.ts — helper functions: resetTestDb(), seedMinimalData(), getTestPatientId()
   api.helpers.ts — Supertest and Playwright request helpers with pre-authenticated clients

4. GITHUB ACTIONS SCAFFOLD (.github/workflows/)
   Create three workflow files:
   
   ci.yml — triggered on pull_request to main:
     - Job 1: install and build
     - Job 2: lint and type check
     - Job 3: unit tests (Jest) with coverage
     - Job 4: integration tests (Jest + Supertest)
     - Job 5: E2E tests (Playwright, headless Chromium only)
     - Upload test reports as artifacts
   
   nightly.yml — triggered on schedule (2am UTC):
     - Full test suite including all browsers
     - Generate and email (mocked) a test health report
   
   seed-check.yml — triggered on push to main:
     - Verify the seed script runs without errors on a fresh database

5. OPENAPI SPEC COMPLETION (openapi.yaml)
   Ensure the OpenAPI 3.0 spec is complete and accurate for all endpoints built in Phases 1-4.
   Include: request/response schemas, auth requirements, error responses (400, 401, 403, 404, 500),
   example request bodies and responses for every endpoint.
   This spec is used by students in Section 7 to generate API tests.

6. PLAYWRIGHT CONFIG (playwright.config.ts)
   Configure for:
   - Projects: chromium (default), firefox, webkit (for nightly only)
   - Base URL: http://localhost:3000
   - Screenshots: on failure only
   - Video: retain-on-failure
   - Trace: on-first-retry
   - Test timeout: 30 seconds
   - Workers: 4 in CI, 1 in local

7. JEST CONFIG (jest.config.ts)
   Configure for:
   - Separate configs for unit/ and integration/
   - Coverage thresholds: 70% for branches, 80% for lines (intentionally achievable for students)
   - Coverage reporters: lcov, text, html
   - Setup file: tests/setup.ts (resets test database before each integration test suite)

8. FINAL README.md
   Complete documentation including:
   - Prerequisites and installation
   - All npm scripts explained
   - All test accounts with roles and passwords
   - How to run each test type
   - How to reset and re-seed the database
   - How to find the intentional course bugs (hint section, spoilers hidden)
   - Project structure diagram
   - Known limitations (this is a teaching app, not production-ready)
```

---

## ONGOING SESSION PROMPTS

### Adding a new feature mid-course
```
Add a new feature to Helix Health Portal: [FEATURE NAME].

Requirements:
- [list requirements]

Follow all existing patterns in the codebase:
- Use the existing auth middleware and role checking
- Add audit logging for all PHI access
- Use synthetic TEST_ prefixed seed data
- Add the route to openapi.yaml
- Add placeholder test files in tests/unit/ and tests/integration/
- Do not break any existing functionality
```

### Generating a course debugging exercise
```
Create a debugging exercise for Section 10 of the Helix Health Portal QA course.

The exercise should:
- Introduce a subtle bug in [FEATURE AREA] of Helix Health Portal
- Be detectable using [VS Code debugger / Playwright trace viewer / reading error output]
- Have a clear, specific fix
- Comment the bug with // COURSE_BUG: [student-facing description without revealing the fix]
- Include a hint file at tests/debugging-exercises/[exercise-name].hint.md

The bug should be realistic — the kind of mistake a developer would actually make.
```

### Generating the OpenAPI spec for a new route
```
I've just added this Express route to Helix Health Portal:
[paste route code]

Generate the OpenAPI 3.0 YAML spec entry for this route including:
- Path, method, summary, description
- Request parameters (path, query, body) with schemas and examples
- All possible response codes with schemas and examples
- Security requirements (BearerAuth)
- Tags for grouping
```

---

*Helix Health Portal Build Prompt v1.0 — Use with Claude Sonnet or Opus for best results*
