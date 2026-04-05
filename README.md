# Helix Health Portal

[![CI](https://github.com/your-org/helix-health-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/helix-health-portal/actions/workflows/ci.yml)
[![Seed Check](https://github.com/your-org/helix-health-portal/actions/workflows/seed-check.yml/badge.svg)](https://github.com/your-org/helix-health-portal/actions/workflows/seed-check.yml)
![Node 18 or 20](https://img.shields.io/badge/node-18%20or%2020-green)

> A realistic outpatient healthcare portal — sample application for the **QA Automation Course**.  
> Zero external infrastructure required. SQLite, runs entirely on localhost.

---

## Contents

1. [Tech Stack](#tech-stack)
2. [Prerequisites](#prerequisites)
3. [Installation & Quick Start](#installation--quick-start)
4. [Project Structure](#project-structure)
5. [Available npm Scripts](#available-npm-scripts)
6. [Test Accounts](#test-accounts)
7. [Running Tests](#running-tests)
8. [Resetting the Database](#resetting-the-database)
9. [Intentional Bugs — Section 10](#intentional-bugs--section-10)
10. [OpenAPI Spec](#openapi-spec)
11. [Environment Variables](#environment-variables)
12. [Known Limitations](#known-limitations)

---

## Tech Stack

| Layer      | Technology                                                      |
|------------|-----------------------------------------------------------------|
| Frontend   | React 18 · TypeScript · React Router v6 · Tailwind CSS · Vite  |
| Backend    | Node.js · Express 4 · TypeScript · ts-node-dev                 |
| Database   | SQLite 3 via `better-sqlite3` (synchronous, no daemon needed)  |
| Auth       | JWT (15 min access) · Refresh tokens (7 days) · TOTP MFA       |
| API Spec   | OpenAPI 3.0 (`openapi.yaml`)                                   |
| Testing    | Jest · Supertest · Playwright                                  |
| CI         | GitHub Actions (ci.yml · nightly.yml · seed-check.yml)         |

---

## Prerequisites

- **Node.js** 18.x or 20.x
- **npm** >= 8.0.0
- No database server, no Docker, no cloud account required
- On Windows, use **Node 20 LTS** to avoid native build issues with `better-sqlite3`

---

## Cross-Platform Setup

Use **Volta** as the official setup path for this repo on both Windows and macOS.
It gives students one consistent workflow and avoids OS-specific version-manager instructions.

```bash
# Windows (PowerShell)
winget install Volta.Volta

# macOS
curl https://get.volta.sh | bash
```

This repo pins Node for Volta in [`package.json`](/c:/Users/Drago/projects/helix-health-portal/package.json), so after Volta is installed, running `node`, `npm`, or `npm ci` inside the repo will use the pinned version automatically.

If you already use `fnm` or `nvm`, this repo also includes [`.nvmrc`](/c:/Users/Drago/projects/helix-health-portal/.nvmrc) pinned to `20`.

---

## Installation & Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd helix-health-portal

# 2. Install all dependencies (root + workspaces)
npm ci

# 3. Seed the database with test data
npm run db:setup

# 4. Start the development servers
npm run dev
```

- **API server** → http://localhost:4000
- **React client** → http://localhost:3000

Log in with any [test account](#test-accounts) using password `TestPass123!`.

---

## Project Structure

```
helix-health-portal/
├── client/                       # React 18 frontend (Vite + Tailwind)
│   ├── src/
│   │   ├── components/           # Layout, ProtectedRoute
│   │   ├── contexts/             # AuthContext
│   │   ├── pages/                # Login, Register, Dashboard, MFA pages
│   │   ├── services/             # api.ts (Axios wrapper)
│   │   └── types/                # Shared TypeScript types
│   └── vite.config.ts
├── server/                       # Express 4 API server
│   ├── src/
│   │   ├── app.ts                # Express app factory
│   │   ├── index.ts              # HTTP listener
│   │   ├── db/                   # better-sqlite3 connection
│   │   ├── middleware/           # auth, audit, errorHandler, requestLogger
│   │   ├── routes/               # auth, appointments, prescriptions, …
│   │   └── services/             # authService, tokenService, emailService,
│   │                             #   prescriptionValidation
│   └── tsconfig.json
├── db/
│   ├── migrations/               # SQL migration files (001–004)
│   ├── schema.sql                # Base schema
│   └── seed.ts                   # Seeder — all phases
├── tests/
│   ├── unit/                     # Unit test stubs (students fill in)
│   ├── integration/              # Integration test stubs
│   ├── e2e/                      # Playwright E2E stubs
│   └── fixtures/                 # Shared helpers (auth, patients, db, api)
├── .github/
│   └── workflows/
│       ├── ci.yml                # PR + push pipeline (5 jobs)
│       ├── nightly.yml           # Nightly full suite across 3 browsers
│       └── seed-check.yml        # Validates seed on every DB-related push
├── jest.config.ts                # Root Jest config (projects)
├── jest.unit.config.ts           # Unit test config + coverage
├── jest.integration.config.ts    # Integration test config (serial)
├── playwright.config.ts          # 4 browser projects (Chromium/FF/WK/mobile)
├── openapi.yaml                  # Complete OpenAPI 3.0 specification
└── package.json                  # npm workspaces root
```

---

## Available npm Scripts

Run from the **repository root** unless noted.

| Script                                          | Description                                          |
|-------------------------------------------------|------------------------------------------------------|
| `npm run dev`                                   | Start server (port 4000) + client (port 3000) concurrently |
| `npm run dev --workspace=server`                | Start API server only                                |
| `npm run dev --workspace=client`                | Start React client only                              |
| `npm run build`                                 | Build server (`server/dist/`) + client (`client/dist/`) |
| `npm run db:setup`                              | Create/update `db/helix.db` schema and seed test data |
| `npm run seed`                                  | Seed `db/helix.db` with all-phase test data          |
| `npm run db:reset`                              | Delete `db/helix.db` and re-seed from scratch        |
| `npm run lint`                                  | ESLint across all workspaces                         |
| `npx jest`                                      | Run all Jest tests (unit + integration)              |
| `npx jest --config jest.unit.config.ts`         | Unit tests only                                      |
| `npx jest --config jest.integration.config.ts`  | Integration tests only (serial, uses test DB)        |
| `npx playwright test`                           | All Playwright E2E tests (all browser projects)      |
| `npx playwright test --project=chromium`        | E2E — Chromium only                                  |
| `npx playwright test --project=firefox`         | E2E — Firefox only                                   |
| `npx playwright test --project=webkit`          | E2E — WebKit only                                    |
| `npx playwright test --headed`                  | E2E — visible browser windows (useful for debugging) |
| `npx @redocly/cli preview-docs openapi.yaml`    | Browse the OpenAPI spec interactively                |

---

## Test Accounts

> **Password for ALL accounts:** `TestPass123!`

### Staff Accounts

| Email                                      | Role     | Notes                                 |
|--------------------------------------------|----------|---------------------------------------|
| `admin@helixhealthportal.test`             | Admin    | Full system access                    |
| `provider@helixhealthportal.test`          | Provider | General Practice · NPI: 0000000001    |
| `cardiologist@helixhealthportal.test`      | Provider | Cardiology · NPI: 0000000002          |
| `dermatologist@helixhealthportal.test`     | Provider | Dermatology · NPI: 0000000003         |
| `orthopedic@helixhealthportal.test`        | Provider | Orthopedic Surgery · NPI: 0000000004  |
| `nurse@helixhealthportal.test`             | Nurse    | Clinical read/write access            |
| `billing@helixhealthportal.test`           | Billing  | Billing & insurance access only       |

### Patient Accounts

| Email                                        | MRN               | Notes                                         |
|----------------------------------------------|-------------------|-----------------------------------------------|
| `patient1@helixhealthportal.test`            | MRN-TEST-00001    | TEST_Patient One                              |
| `patient2@helixhealthportal.test`            | MRN-TEST-00002    | TEST_Patient Two                              |
| `patient03@helixhealthportal.test`           | MRN-TEST-00003    | Complex cardiac meds (6 medications)          |
| `patient04@helixhealthportal.test`           | MRN-TEST-00004    | 12-month vitals history                       |
| `patient05@helixhealthportal.test`           | MRN-TEST-00005    | Complex diabetes meds (6 medications)         |
| `patient06–patient09@helixhealthportal.test` | MRN-TEST-00006–09 | General patients                              |
| `patient10@helixhealthportal.test`           | MRN-TEST-00010    | 12-month vitals history                       |
| `patient11@helixhealthportal.test`           | MRN-TEST-00011    | General patient                               |
| `patient12@helixhealthportal.test`           | MRN-TEST-00012    | Complex psychiatric meds (6 medications)      |
| `patient13–patient15@helixhealthportal.test` | MRN-TEST-00013–15 | General patients                              |
| `patient16@helixhealthportal.test`           | MRN-TEST-00016    | 12-month vitals history                       |
| `patient17@helixhealthportal.test`           | MRN-TEST-00017    | Complex HIV meds (5 medications)              |
| `patient18–patient22@helixhealthportal.test` | MRN-TEST-00018–22 | General patients                              |

---

## Running Tests

### Unit Tests

```bash
npx jest --config jest.unit.config.ts
```

Tests live in `tests/unit/`. Target coverage: `server/src/services/`. Thresholds: 80% lines, 70% branches.

### Integration Tests

```bash
npx jest --config jest.integration.config.ts
```

Tests live in `tests/integration/`. Runs against `db/helix.test.db` (created automatically via `TEST_DB_PATH`). Serial execution (`maxWorkers: 1`) to prevent DB conflicts.

### E2E Tests (Playwright)

```bash
# Terminal 1 — start the app
npm run dev

# Terminal 2 — run tests
npx playwright test --project=chromium
```

Full cross-browser suite (Chromium + Firefox + WebKit + mobile Chrome):

```bash
npx playwright test
```

View the HTML report after a run:

```bash
npx playwright show-report
```

### Full Suite

```bash
npx jest && npx playwright test
```

---

## Resetting the Database

```bash
# Recommended
npm run db:reset

# Manual equivalent
node scripts/reset-db.cjs && npm run db:setup
```

Use `npm run db:setup` for first-time setup. If you want a clean, repeatable local database state, use `npm run db:reset`.

The test database (`db/helix.test.db`) is managed entirely by the test setup and is never shared with the development database.

---

## Intentional Bugs — Section 10

There are **5 deliberately planted bugs**, each marked with a `// COURSE_BUG` comment. Students discover them by writing tests and tracing failures.

**Do not read the spoilers until you have attempted to find each bug yourself.**

---

### Bug 1 — Unit Test Target

**File:** `server/src/services/prescriptionValidation.ts`  
**Symptom:** A prescription exactly at the maximum daily dose is incorrectly accepted by the API.

<details>
<summary>Spoiler — click to reveal</summary>

`validatePrescriptionDosage()` uses strict greater-than (`>`) when comparing the calculated daily dose to the maximum:

```typescript
// COURSE_BUG [Section 10 - Prescriptions]: uses > instead of >=
if (dailyDoseMg > maxDailyMg) { ... }
```

**Fix:** Change `>` to `>=`. A prescription exactly at the maximum must be rejected.

</details>

---

### Bug 2 — Integration Test Target

**File:** `server/src/routes/appointments.ts` — `countConflicts()` SQL  
**Symptom:** Back-to-back appointments (end time = start time of next) are not detected as conflicts.

<details>
<summary>Spoiler — click to reveal</summary>

The conflict-detection SQL uses strict greater-than for the end-time boundary:

```sql
-- COURSE_BUG [Section 10 - Appointments]: > should be >=
AND datetime(a.scheduled_at, '+' || a.duration_minutes || ' minutes') > ?
```

**Fix:** Change `> ?` to `>= ?`.

</details>

---

### Bug 3 — E2E Test Target

**File:** `client/src/pages/AppointmentBooking.tsx` — `handleSelectType()`  
**Symptom:** Navigating back to re-select appointment type retains the previously chosen time slot, creating a stale booking.

<details>
<summary>Spoiler — click to reveal</summary>

```typescript
// COURSE_BUG [Section 10 - Booking UI]: setSlot(null) is missing
setType(newType);
setStep(1);
```

**Fix:** Add `setSlot(null);` before `setStep(1)` inside `handleSelectType()`.

</details>

---

### Bug 4 — Auth / Security Test Target

**File:** `server/src/routes/auth.ts` — `POST /api/auth/password-reset/confirm`  
**Symptom:** A password-reset token with exactly 0 ms of remaining validity is incorrectly rejected with HTTP 401.

<details>
<summary>Spoiler — click to reveal</summary>

```typescript
// COURSE_BUG [Section 10 - Auth]: off-by-one on expiry check
if (!(timeRemaining > 0)) {
  return next(createError('Token has expired', 401));
}
```

**Fix:** Change `!(timeRemaining > 0)` to `!(timeRemaining >= 0)`.

</details>

---

### Bug 5 — Access Control Test Target

**File:** `server/src/routes/medicalRecords.ts` — `vitalsRouter.get('/_access_check')`  
**Symptom:** Provider-patient assignment check silently passes for every request because `req.user.role` is always `undefined`.

<details>
<summary>Spoiler — click to reveal</summary>

```typescript
// COURSE_BUG [Section 10 - Access Control]: .role is always undefined;
// JWT payload uses roles: string[], not role: string
if ((req.user as any).role === 'provider') { ... }
```

**Fix:** Replace with `req.user!.roles.includes('provider')` and add a database lookup verifying the provider has a scheduled appointment with the target patient.

</details>

---

## OpenAPI Spec

The complete API is documented in [`openapi.yaml`](./openapi.yaml).

**Preview interactively (no install needed):**

```bash
npx @redocly/cli preview-docs openapi.yaml
# Opens Redoc at http://localhost:8080
```

The spec covers all Phase 1–4 domains: Auth, Patients, Appointments, Medical Records, Prescriptions, Drug Interactions, Messages, Notifications, Billing, Insurance, Search, and Admin.

---

## Environment Variables

| Variable         | Default (dev)            | Description                                     |
|------------------|--------------------------|-------------------------------------------------|
| `PORT`           | `4000`                   | API server port                                 |
| `CLIENT_URL`     | `http://localhost:3000`  | Allowed CORS origin                             |
| `JWT_SECRET`     | *(required)*             | Secret for signing access tokens                |
| `REFRESH_SECRET` | *(required)*             | Secret for signing refresh tokens               |
| `NODE_ENV`       | `development`            | `development` / `test` / `production`           |
| `TEST_DB_PATH`   | `db/helix.test.db`       | SQLite path used by integration tests           |
| `MOCK_EMAIL`     | `true`                   | Log emails to console instead of sending        |
| `MOCK_SMS`       | `true`                   | Log SMS to console instead of sending           |
| `MOCK_TOTP`      | `true`                   | Accept TOTP code `000000` in test mode          |
| `VERBOSE_TESTS`  | `false`                  | Print `console.log` output during Jest runs     |

> **Never commit real secrets to version control.**

---

## Known Limitations

- **Payments are mocked** — no Stripe integration; payment endpoints simulate success.
- **Email & SMS log to console only** — no SMTP or Twilio credentials required.
- **TOTP test bypass** — when `MOCK_TOTP=true`, the MFA code `000000` is always accepted.
- **SQLite concurrency** — SQLite supports ~1 concurrent writer; use PostgreSQL for production deployments under load.
- **No file storage** — document uploads stored as blobs in the DB; no S3 integration.
- **Appointment seed count** — slot collision prevention means the seeder produces ~53 appointments rather than exactly 60; this is expected behaviour.
