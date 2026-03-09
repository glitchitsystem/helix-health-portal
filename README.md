# Helix Health Portal

A realistic, feature-rich **outpatient healthcare patient portal** built as the sample application for a QA automation course. Fully self-contained — no external services required.

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18 · TypeScript · React Router v6 · Tailwind CSS · Vite |
| Backend   | Node.js · Express 4 · TypeScript        |
| Database  | SQLite 3 via `better-sqlite3`           |
| Auth      | JWT (15 min) · Refresh tokens (7 days) · TOTP MFA |
| API Spec  | OpenAPI 3.0 (`openapi.yaml`)            |

---

## Prerequisites

- **Node.js** ≥ 18.0.0
- **npm** ≥ 8.0.0

---

## Installation

```bash
# 1. Clone the repository
git clone <repo-url>
cd helix-health-portal

# 2. Install all dependencies (root + workspaces)
npm install

# 3. Seed the database with test accounts
npm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rn00) and client (port 5173)npm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rn00) and client (port 5173)npm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnpm rnseparate terminals)

```bash
# Terminal 1 — API server with ts-node-dev (auto-restarts on save)
npm run dev --workspace=server

# Terminal 2 # Terminal 2 # Terminal 2 # Terminal 2 # Terminal 2 # Terminal 2 # or Production

```bash
npm run build
# Compiled server: server/dist/
# Co# Co# Co# Co# Co#ient/dist/
```

---

## Database Operations

| Command           | Description                             | Command           | Description                     ----------------------|
| `npm run seed`    | Create/initialise the DB and insert test data |
| `npm run db:reset`| Delete `db/h| `npm ruand re-seed from scratch |

The SQLiThe SQLiThe SQLiThe SQLiThe SQLiThe SQLiThit-ignored).

---

## Test Accounts

> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for ALL accou> **Password for.test` | Billing | — |
| `patient1@helixhealthportal.test` | Patient | TEST_Patient One · MRN-TEST-00001 |
| `patient2@helixhealthportal.test` | Patient | TEST_Patient Two · MRN-TEST-00002 |

---

## API Reference

The full OpThe full OpThe full OpTopenapi.yaml`](./openapi.yaml).

Base URL (dev): `http://localhost:4000/apiBase URL (dev): `http://localhost:4000/apiBase URL (dev): `http://localhost:4000/apiBase URL (dev): `http://localhost:4000/ap       — CreaBase URL (dev): `http://localhost:4000/apiBase URL (dev): `httthenticaBase URL (dev): `http://localhost:4000/apiBase URL (dev): `http://loT /Base URL (dev): `http://localhost:4000/apiBase URL (dev):uth/mfa/setuBase URL          — Generate TOTP secret + QR code
POST /auth/mfa/verify                — Verify code & enable MFA
POST /auth/mfa/validate              — Complete MFA login (second step)

POST /auth/password-reset/request    — Request password reset (mocked email)
POST /auth/password-reset/confirm    — Confirm reset with token
```

---

## Email / SMS

All emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll em and neAll emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll emAll eer terminal.

---

## Project Structure

```
helix-health-portal/
├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── client/                  # Re├── clie�├── client/                  # Re├── client/      �─├── client/                  # Re├── client/              ├── middleware/      # auth, audit, errorHandler, requestLogger
│       ├── services/        # authService, tokenService, emailService
│       �│       ��   │       �│       ��   │       �│       ��   │       �│       ��   │       �│       ��   │       �│       ��   │       �│       ��   │       ─ seed.ts              # Test data seeder
├── tests/
│   ├── unit/                # Unit test stubs (for course students)
│   ├── integration/         # Integration test stubs
│   ├── e2e/                 # End-to-end test stubs (Playwright)
│   └── fixtures/            # Shared test fixtures
├── .github/
│   └── workflows/
│       └── ci.yml           # CI scaffold
├── openapi.yaml             # OpenAPI 3.0 spec
└── package.json             # npm workspaces root
```

---

## Running Tests

```bash
# All workspaces
npm test

# Server only
npm test --workspace=server

# Client only
npm test --workspace=client
```

Test stubs are in `tests/` — students fill these in during the course.

---

## Resetting the Database

```bash
npm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetnpm run db:resetn:5173
NODE_ENV=development
```

> **Never commit a real `JWT_SECRET` to version control.**

---

## Phase Roadmap

| Phase | Status | Features |
|-------|--------|---------|
| 1 | ✅ Complete | Foundation · Authentication · MFA �| 1 | ✅ Complete | Foundation · Authentication · MFA �3 | 1��� Planned | La| 1 | ✅ Complete | F Plan| 1 | ✅ Complete | Foundation · Authent
| 5 | �| 5 | �| 5 | �| 5 | �| 5 | �| 5 | �| 5 lanned | Admin panel |
