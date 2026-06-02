# Part 5 — Integration testing
## Helix QA Academy: AI-Assisted Testing for Healthcare Applications

---

# Section 5.2 — Tool deep dive: Supertest

## Section Introduction (instructor reads aloud, ~2 minutes)

To write integration tests for an Express application, you need a way to make HTTP requests against that application without starting a real server and without opening a browser. Supertest is the tool that makes this possible. It wraps your Express app object, lets you make GET, POST, PUT, and DELETE requests directly in code, and returns a response object you can assert against using familiar Jest matchers.

Supertest is already installed in the Helix project. In this section you are going to understand exactly what it does, how it differs from making real HTTP requests, how to set request headers and bodies, and how to chain assertions on the response. Every integration test you write in Part 5 will use the patterns introduced here.

By the end of this section you will be able to write a Supertest request for any Helix endpoint, attach an Authorization token, assert on the status code and response body, and understand what is actually happening under the hood when you call `request(app).get('/api/appointments')`.

---

## 5.2.1 What Supertest Does

Supertest is built on top of the `superagent` HTTP client library. When you call `request(app)`, Supertest binds the Express app to an ephemeral port on localhost (one that is chosen automatically and released when the test ends), makes the HTTP request to that port, and returns the response. Your Express app never knows it is being tested — it handles the request exactly as it would in production.

[KNOWLEDGE BOX]  
**Supertest vs. a real HTTP client**

| | Supertest `request(app)` | Fetch / Axios against `localhost:3000` |
|---|---|---|
| Server must be running | No — Supertest starts and stops it automatically | Yes — you must start `npm run dev` before running tests |
| Port conflicts | Never — ephemeral port assigned per test | Possible — if port 3000 is in use, tests fail |
| Test isolation | High — each call gets its own connection | Lower — shared persistent server state |
| Speed | Fast — no network round-trip | Slower — real TCP connection |
| CI compatibility | Yes — no external process to manage | Requires separate process management |

This is why Supertest is the standard tool for Express integration testing. You import your app as a module, pass it to `request()`, and make requests against it directly — no server startup, no port management, no teardown.

### Where Supertest Lives in Helix

Supertest is already installed as a dev dependency:

```json
// package.json (root)
"devDependencies": {
  "supertest": "^6.3.4",
  "@types/supertest": "^6.0.2",
  ...
}
```

The Helix fixtures folder also provides pre-built helpers that wrap Supertest, so you will often use those helpers rather than calling `request(app)` directly. Understanding the underlying tool is still essential — the helpers use it internally, and you will need to reach for raw Supertest when the helpers do not cover your scenario.

---

## 5.2.2 Making Your First Supertest Request

Let's look at the simplest possible integration test to establish the pattern.

ACTION: Open `server/src/app.ts` in VS Code. Note the export at the bottom of the file.  
SPEAKER NOTE: Helix exports a `createApp` factory function as a named export from `app.ts`. Tests call `createApp()` to get a fresh app instance. This is the standard pattern that makes testing possible — if the server were started immediately on `import`, you could not import it without starting a server. The `index.ts` file is the entry point that starts the actual server. Tests import from `app.ts`, never from `index.ts`.

[KNOWLEDGE BOX]  
**The app.ts / index.ts split**

```typescript
// server/src/app.ts — exports the configured Express app as a named export
export function createApp(): express.Application { ... }

// server/src/index.ts — starts the server, never imported in tests
import { createApp } from './app';
import { getDb } from './db/database';
const PORT = Number(process.env.PORT ?? 4000);
getDb();
const app = createApp();
app.listen(PORT, () => console.log(`Helix listening on port ${PORT}`));
```

This split is the single most important design decision that makes integration testing possible without starting a real server. If you ever work on a codebase that does not have this separation, requesting it from the team is a concrete, high-value QA contribution.

ACTION: Create a new file at `tests/integration/appointments.test.ts`.  
SPEAKER NOTE: The `tests/integration/` directory already exists in the Helix project. It contains a `.gitkeep` file. You can ignore that file — just create your test file alongside it.

ACTION: Type the following into `appointments.test.ts`:

```typescript
// tests/integration/appointments.test.ts

import request from 'supertest';
import { createApp } from '../../server/src/app';

const app = createApp();

describe('GET /api/appointments', () => {

  test('returns 401 when no Authorization header is present', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .expect(401);

    expect(res.body).toHaveProperty('error');
  });

});
```

ACTION: Run this test using the integration config:

```bash
npx jest --config jest.integration.config.ts tests/integration/appointments.test.ts
```

SPEAKER NOTE: This test should pass immediately. It requires no seed data and no authentication — its entire purpose is to verify that an unauthenticated request returns a 401. If it returns a 200, there is a bug in the `validateToken` middleware registration for the appointments router. That is the kind of wiring bug that only an integration test surfaces.

CHECKPOINT 1: Your first integration test passes. The `request(app).get()` pattern is clear.  
SPEAKER NOTE: If the test fails with a module resolution error rather than a test assertion failure, check that the import path is correct: `../../server/src/app` — two directory levels up from `tests/integration/` to reach the project root, then into `server/src/app`.

---

## 5.2.3 Setting Headers: Authorization Tokens

Every Helix endpoint except `/api/auth/login` and `/api/auth/refresh` requires a valid JWT access token in the `Authorization: Bearer <token>` header. Supertest lets you set headers with the `.set()` method.

```typescript
const res = await request(app)
  .get('/api/appointments')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

Getting a token involves calling the login endpoint first. The Helix fixtures handle this for you:

```typescript
// tests/fixtures/api.helpers.ts
import { getAuthToken, authenticatedRequest } from '../fixtures/api.helpers';

// Option 1: Get the token, attach it manually
const token = await getAuthToken('patient1');
const res = await request(app)
  .get('/api/appointments')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);

// Option 2: Use the pre-authenticated agent (recommended for suites)
const agent = await authenticatedRequest('provider');
const res = await agent.get('/api/appointments').expect(200);
```

[KNOWLEDGE BOX]  
**`request(app)` vs. `request.agent(app)`**

| | `request(app)` | `request.agent(app)` |
|---|---|---|
| **State across requests** | Stateless — headers reset each call | Stateful — headers and cookies persist across calls |
| **Use case** | Single one-off assertions | Series of requests with shared auth (most tests) |
| **Setup** | None | `agent.set('Authorization', ...)` once |

For most Helix integration tests, you will use `authenticatedRequest(role)` from the fixtures, which returns a pre-configured agent. This saves you from repeating `.set('Authorization', ...)` on every request in the test.

---

## 5.2.4 Making POST, PUT, and DELETE Requests

Every HTTP method follows the same pattern. Use `.send()` to attach a JSON body, and `.set('Content-Type', 'application/json')` if needed (Supertest infers this from `.send()` with an object, so it is usually not necessary to set it explicitly).

```typescript
// POST with a JSON body
const res = await agent
  .post('/api/appointments')
  .send({
    provider_id: 1,
    patient_id:  2,
    scheduled_at: '2026-06-15T10:00:00Z',
    duration_minutes: 30,
    reason: 'Annual physical',
  })
  .expect(201);

// PUT — update an existing resource
const res = await agent
  .put(`/api/appointments/${appointmentId}`)
  .send({ reason: 'Follow-up consultation' })
  .expect(200);

// DELETE — soft delete (appointments sets status = 'cancelled')
const res = await agent
  .delete(`/api/appointments/${appointmentId}`)
  .expect(200);
```

SPEAKER NOTE: When building the URL for PUT and DELETE, you always need a resource ID. That ID must come from a record that exists in the test database. If you hard-code an ID like `123`, your test will succeed on the machine where that record exists and fail everywhere else. Always create the record in a `beforeEach` and use the ID returned by the creation call. Section 5.3 covers this setup and teardown pattern in detail.

---

## 5.2.5 Asserting on Status Codes, Response Bodies, and Headers

Supertest provides two assertion mechanisms: the `.expect()` chained method and Jest's `expect()` on the response object after `await`. Both work, and you will use both.

### The `.expect()` chain (Supertest's built-in)

```typescript
// Assert status code only
await request(app).get('/api/appointments').set('Authorization', `Bearer ${token}`).expect(200);

// Assert status code + a body property value
await request(app)
  .get('/api/appointments')
  .set('Authorization', `Bearer ${token}`)
  .expect(200)
  .expect('Content-Type', /json/);   // regex match against header value
```

The `.expect(statusCode)` form is the most common. It throws an assertion error with
a clear message if the actual status code differs — including the full response body in the error output, which helps you understand *why* the status was wrong.

### Jest `expect()` on the response object

```typescript
const res = await agent.get('/api/appointments').expect(200);

// Assert response body shape
expect(res.body).toHaveProperty('data');
expect(Array.isArray(res.body.data)).toBe(true);
expect(res.body.data.length).toBeGreaterThan(0);

// Assert a specific field on the first record
expect(res.body.data[0]).toMatchObject({
  id:         expect.any(Number),
  patient_id: expect.any(Number),
  status:     expect.stringMatching(/^(scheduled|confirmed|completed|cancelled|no_show)$/),
});

// Assert a field is NOT present (e.g., PHI should not be exposed)
expect(res.body.data[0]).not.toHaveProperty('ssn');
```

[KNOWLEDGE BOX]  
**`toMatchObject` vs. `toEqual` for API responses**

Use `toMatchObject` when asserting on API responses. It verifies that the response object *contains* the expected fields with the expected values, without failing if there are additional fields present. `toEqual` requires an exact match — add one extra field to the response and the test breaks. For API contracts, you care that the required fields are present and correct; extra fields are acceptable.

```typescript
// ✓ Preferred — passes as long as these fields are correct
expect(res.body.data[0]).toMatchObject({
  drug_name: 'Metformin',
  status:    'active',
});

// ✗ Brittle — fails if the API adds any new field
expect(res.body.data[0]).toEqual({
  id: 1,
  drug_name: 'Metformin',
  status: 'active',
  // ... must list every single field
});
```

---

## 5.2.6 Reading Supertest Error Output

When a Supertest assertion fails, the error message includes the full response body. This is intentional and extremely useful — the response body usually contains the reason the request failed.

```
Expected status 200 but got 403

Response body:
{
  "error": "Access denied to this patient record",
  "statusCode": 403
}
```

Learn to read this output before reaching for `console.log`. The most common causes of unexpected status codes in Helix integration tests:

| Unexpected status | Most likely cause |
|---|---|
| `401` when expecting `200` | Token expired, missing, or malformed |
| `403` when expecting `200` | Wrong role for this endpoint, or patient/data mismatch |
| `404` when expecting `200` | Record does not exist in the test DB — seed data is missing |
| `400` when expecting `201` | Request body is missing a required field |
| `500` in any test | Route handler or SQL error — check the server logs in the terminal |

SPEAKER NOTE: When students see a `500`, the first step is always to look at the terminal output where Jest is running. The Helix Express app logs all unhandled errors to the console with a stack trace. That stack trace is more informative than the `500` response body alone.

ACTION: In `appointments.test.ts`, add a second intentionally failing test to observe the error output:

```typescript
test('INTENTIONAL FAILURE — observe Supertest error output', async () => {
  const res = await request(app)
    .get('/api/appointments')
    .expect(999); // No server returns 999
});
```

ACTION: Run the test file again and read the error output carefully.  
SPEAKER NOTE: The output will show the actual status code and the full response body inline. This is the output you will read in every failing integration test. Once students have seen it, delete or comment out this intentional failure test.

CHECKPOINT 2: You understand how to make GET, POST, PUT, and DELETE requests with Supertest, how to attach Authorization headers, and how to read failure output when an assertion does not match.  
SPEAKER NOTE: Before moving on, ensure the intentional failure test has been deleted. A failing test committed to the repository is a CI blocker.

---
