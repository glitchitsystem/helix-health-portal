import request from "supertest";
import { createApp } from "../../server/src/app";
import jwt from "jsonwebtoken";
import { authenticatedRequest } from "../fixtures/api.helpers";
import {
  getTestDb,
  getTestPatientId,
  getTestProviderId,
} from "../fixtures/db.helpers";

const app = createApp();

describe("GET /api/appointments/:id", () => {
  let appointmentId: number;
  let patientAgent: Awaited<ReturnType<typeof authenticatedRequest>>;

  beforeEach(async () => {
    patientAgent = await authenticatedRequest("patient1");

    const db = getTestDb();
    const patientDbId = getTestPatientId("patient1@helixhealthportal.test");
    const providerDbId = getTestProviderId("provider@helixhealthportal.test");

    const result = db
      .prepare(
        `INSERT INTO appointments
           (patient_id, provider_id, appointment_type_id, scheduled_at, duration_minutes, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(
        patientDbId,
        providerDbId,
        1,
        "2026-09-15T10:00:00Z",
        30,
        "Annual physical",
        "scheduled",
      ) as { id: number };

    appointmentId = result.id;
  });

  afterEach(() => {
    const db = getTestDb();
    db.prepare("DELETE FROM appointments WHERE id = ?").run(appointmentId);
  });

  test("returns 200 with full appointment data for the owning patient", async () => {
    const patientDbId = getTestPatientId("patient1@helixhealthportal.test");
    const providerDbId = getTestProviderId("provider@helixhealthportal.test");

    const res = await patientAgent
      .get(`/api/appointments/${appointmentId}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: appointmentId,
      patient_id: patientDbId,
      provider_id: providerDbId,
      scheduled_at: expect.any(String),
      duration_minutes: 30,
      notes: "Annual physical",
      status: "scheduled",
    });
  });

  test("returns 403 when a different patient requests this appointment", async () => {
    const otherAgent = await authenticatedRequest("patient2");

    await otherAgent.get(`/api/appointments/${appointmentId}`).expect(403);
  });

  test("returns 200 with appointment data for a provider", async () => {
    const providerAgent = await authenticatedRequest("provider");

    const res = await providerAgent
      .get(`/api/appointments/${appointmentId}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: appointmentId,
      status: "scheduled",
      notes: "Annual physical",
    });
  });

  test("returns 200 with appointment data for an admin", async () => {
    const adminAgent = await authenticatedRequest("admin");

    const res = await adminAgent
      .get(`/api/appointments/${appointmentId}`)
      .expect(200);

    expect(res.body.data).toMatchObject({
      id: appointmentId,
      status: "scheduled",
      notes: "Annual physical",
    });
  });

  test("returns 401 when no Authorization header is provided", async () => {
    await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .expect(401);
  });

  test("returns 401 when a malformed token is provided", async () => {
    await request(app)
      .get(`/api/appointments/${appointmentId}`)
      .set("Authorization", "Bearer garbage")
      .expect(401);
  });

  test("returns 404 for a valid token requesting a non-existent appointment", async () => {
    await patientAgent.get("/api/appointments/999999").expect(404);
  });
});

describe("POST /api/appointments — error responses", () => {
  let patientDbId: number;
  let providerDbId: number;
  let providerAgent: Awaited<ReturnType<typeof authenticatedRequest>>;

  beforeEach(async () => {
    providerAgent = await authenticatedRequest("provider");
    patientDbId = getTestPatientId("patient1@helixhealthportal.test");
    providerDbId = getTestProviderId("provider@helixhealthportal.test");
  });

  test("returns 400 when provider_id is missing", async () => {
    const res = await providerAgent
      .post("/api/appointments")
      .send({
        patient_id: patientDbId,
        scheduled_at: "2026-09-20T09:00:00Z",
        duration_minutes: 30,
      })
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });

  test("returns 400 when scheduled_at is missing", async () => {
    const res = await providerAgent
      .post("/api/appointments")
      .send({
        provider_id: providerDbId,
        patient_id: patientDbId,
        duration_minutes: 30,
      })
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });

  test("returns 400 when duration_minutes is below the minimum of 15", async () => {
    const res = await providerAgent
      .post("/api/appointments")
      .send({
        provider_id: providerDbId,
        patient_id: patientDbId,
        scheduled_at: "2026-09-20T09:00:00Z",
        duration_minutes: 5,
      })
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });

  test("returns 404 when provider_id does not exist", async () => {
    const res = await providerAgent
      .post("/api/appointments")
      .send({
        provider_id: 999999,
        patient_id: patientDbId,
        appointment_type_id: 1,
        scheduled_at: "2026-09-20T09:00:00Z",
        duration_minutes: 30,
      })
      .expect(404);

    expect(res.body).toHaveProperty("error");
  });

  test("returns 404 when patient_id does not exist", async () => {
    const res = await providerAgent
      .post("/api/appointments")
      .send({
        provider_id: providerDbId,
        patient_id: 999999,
        appointment_type_id: 1,
        scheduled_at: "2026-09-20T09:00:00Z",
        duration_minutes: 30,
      })
      .expect(404);

    expect(res.body).toHaveProperty("error");
  });

  test("returns 403 when a patient books an appointment for a different patient", async () => {
    const patient2Agent = await authenticatedRequest("patient2");

    const res = await patient2Agent
      .post("/api/appointments")
      .send({
        provider_id: providerDbId,
        patient_id: patientDbId,
        appointment_type_id: 1,
        scheduled_at: "2026-09-20T09:00:00Z",
        duration_minutes: 30,
      })
      .expect(403);

    expect(res.body).toHaveProperty("error");
  });
});

describe("authentication middleware — GET /api/appointments", () => {
  test("returns 200 with a valid provider token", async () => {
    const providerAgent = await authenticatedRequest("provider");
    await providerAgent.get("/api/appointments").expect(200);
  });

  test("returns 401 with an error body when no Authorization header is provided", async () => {
    const res = await request(app).get("/api/appointments").expect(401);
    expect(res.body).toHaveProperty("error");
  });

  test("returns 401 when a malformed token value is provided", async () => {
    await request(app)
      .get("/api/appointments")
      .set("Authorization", "Bearer notarealtoken")
      .expect(401);
  });

  test("returns 401 with an expired-token error for an expired JWT", async () => {
    const secret = process.env["JWT_SECRET"] ?? "test-jwt-secret-not-for-production";
    const expiredToken = jwt.sign({ sub: "provider" }, secret, { expiresIn: -1 });

    const res = await request(app)
      .get("/api/appointments")
      .set("Authorization", `Bearer ${expiredToken}`)
      .expect(401);

    expect(res.body.error).toMatch(/expired/i);
  });
});
