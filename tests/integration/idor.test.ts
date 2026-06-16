import request from "supertest";
import { getTestDb } from "../fixtures/db.helpers";
import { createApp } from "../../server/src/app";
import type { Application } from "express";

let _app: Application | null = null;
const getApp = () => {
  if (!_app) _app = createApp();
  return _app;
};

let patient1DbId: number;
let patient2DbId: number;
const TOKEN_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGGaFS3QB1RwzP7nPxKhO7hLe9W"; // TestPass123!

beforeAll(() => {
  const db = getTestDb();

  // Resolve patient1 (seeded by setup.ts)
  const p1 = db
    .prepare(
      `
    SELECT p.id FROM patients p
    JOIN users u ON p.user_id = u.id
    WHERE u.email = 'patient1@helixhealthportal.test'
  `,
    )
    .get() as { id: number } | undefined;
  if (!p1) throw new Error("patient1 not found — run the test setup first");
  patient1DbId = p1.id;

  // Seed patient2 idempotently
  const patientRole = db
    .prepare(`SELECT id FROM roles WHERE name = 'patient'`)
    .get() as { id: number };

  let p2UserId: number;
  const existingUser = db
    .prepare(
      `SELECT id FROM users WHERE email = 'patient2@helixhealthportal.test'`,
    )
    .get() as { id: number } | undefined;

  if (existingUser) {
    p2UserId = existingUser.id;
  } else {
    const r = db
      .prepare(
        `INSERT INTO users (email, password_hash, email_verified, is_active) VALUES (?, ?, 1, 1) RETURNING id`,
      )
      .get("patient2@helixhealthportal.test", TOKEN_HASH) as { id: number };
    p2UserId = r.id;
    db.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`,
    ).run(p2UserId, patientRole.id);
  }

  let p2: { id: number } | undefined = db
    .prepare(`SELECT id FROM patients WHERE user_id = ?`)
    .get(p2UserId) as { id: number } | undefined;

  if (!p2) {
    p2 = db
      .prepare(
        `INSERT INTO patients (user_id, mrn) VALUES (?, 'MRN-TEST-00002') RETURNING id`,
      )
      .get(p2UserId) as { id: number };
    db.prepare(
      `INSERT OR IGNORE INTO patient_demographics (patient_id, first_name, last_name) VALUES (?, 'TEST_Patient', 'Two')`,
    ).run(p2!.id);
  }
  patient2DbId = p2!.id;
});

async function loginAs(email: string): Promise<string> {
  const res = await request(getApp())
    .post("/api/auth/login")
    .send({ email, password: "TestPass123!" });
  return res.body.data.accessToken as string;
}

describe("IDOR › GET /api/patients/:id", () => {
  test("patient can access their own record", async () => {
    const token = await loginAs("patient1@helixhealthportal.test");
    const res = await request(getApp())
      .get(`/api/patients/${patient1DbId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test("patient is blocked from accessing another patient's record", async () => {
    const token = await loginAs("patient1@helixhealthportal.test");
    const res = await request(getApp())
      .get(`/api/patients/${patient2DbId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test("provider can access any patient's record", async () => {
    const token = await loginAs("provider@helixhealthportal.test");
    const res = await request(getApp())
      .get(`/api/patients/${patient2DbId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
