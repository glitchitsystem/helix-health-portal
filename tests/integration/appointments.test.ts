// Integration tests for POST /api/appointments — appointment booking.
// Covers successful booking, conflict detection, back-to-back scheduling,
// and role/permission enforcement.

import request from "supertest";
import { getAuthToken, authenticatedRequest } from "../fixtures/api.helpers";
import {
  getTestDb,
  getTestPatientId,
  getTestProviderId,
  countRows,
} from "../fixtures/db.helpers";
import { futureDate } from "../fixtures/appointments.fixtures";

describe("POST /api/appointments — appointment booking", () => {
  let followUpTypeId: number;
  let annualPhysicalTypeId: number;
  let patientDbId: number;
  let patientDbId2: number;
  let providerDbId: number;

  beforeAll(() => {
    const db = getTestDb();

    const followUp = db
      .prepare(
        `INSERT INTO appointment_types (name, duration_minutes)
         VALUES ('Follow-up', 30)
         ON CONFLICT (name) DO UPDATE SET name = name
         RETURNING id`,
      )
      .get() as { id: number };
    followUpTypeId = followUp.id;

    const annualPhysical = db
      .prepare(
        `INSERT INTO appointment_types (name, duration_minutes)
         VALUES ('Annual Physical', 60)
         ON CONFLICT (name) DO UPDATE SET name = name
         RETURNING id`,
      )
      .get() as { id: number };
    annualPhysicalTypeId = annualPhysical.id;
  });

  afterAll(() => {
    const db = getTestDb();
    const typeIds = [followUpTypeId, annualPhysicalTypeId];
    const placeholders = typeIds.map(() => "?").join(", ");
    const apptIds = (
      db
        .prepare(
          `SELECT id FROM appointments WHERE appointment_type_id IN (${placeholders})`,
        )
        .all(...typeIds) as { id: number }[]
    ).map((r) => r.id);
    if (apptIds.length) {
      const apptPlaceholders = apptIds.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM appointment_reminders WHERE appointment_id IN (${apptPlaceholders})`,
      ).run(...apptIds);
      db.prepare(
        `DELETE FROM appointments WHERE id IN (${apptPlaceholders})`,
      ).run(...apptIds);
    }
    db.prepare(
      `DELETE FROM appointment_types WHERE id IN (${placeholders})`,
    ).run(...typeIds);
  });

  beforeEach(() => {
    patientDbId = getTestPatientId("patient1@helixhealthportal.test");
    patientDbId2 = getTestPatientId("patient2@helixhealthportal.test");
    providerDbId = getTestProviderId("provider@helixhealthportal.test");
  });

  describe("successful booking", () => {
    let createdId: number | null = null;

    beforeEach(() => {
      createdId = null;
    });

    afterEach(() => {
      if (createdId === null) return;
      const db = getTestDb();
      db.prepare(
        "DELETE FROM appointment_reminders WHERE appointment_id = ?",
      ).run(createdId);
      db.prepare("DELETE FROM appointments WHERE id = ?").run(createdId);
    });

    test("returns 201 with the new appointment when a provider books for a patient", async () => {
      const agent = await authenticatedRequest("provider");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: futureDate(10),
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        patient_id: patientDbId,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        status: "scheduled",
        duration_minutes: 30,
      });
      expect(typeof res.body.data.id).toBe("number");
      expect(typeof res.body.data.scheduled_at).toBe("string");

      createdId = res.body.data.id as number;
      expect(countRows("appointments", "id = ?", [createdId])).toBe(1);
    });

    test("returns 201 when a patient books their own appointment", async () => {
      const agent = await authenticatedRequest("patient1");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: futureDate(11),
      });

      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ patient_id: patientDbId });

      createdId = res.body.data.id as number;
    });

    test("returns 201 when an admin books an appointment", async () => {
      const agent = await authenticatedRequest("admin");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: futureDate(12),
      });

      expect(res.status).toBe(201);

      createdId = res.body.data.id as number;
    });
  });

  describe("conflict detection", () => {
    let setupId1: number | null = null;
    let setupId2: number | null = null;
    let createdId: number | null = null;

    beforeEach(() => {
      setupId1 = null;
      setupId2 = null;
      createdId = null;
    });

    afterEach(() => {
      const db = getTestDb();
      for (const id of [setupId1, setupId2, createdId]) {
        if (id === null) continue;
        db.prepare(
          "DELETE FROM appointment_reminders WHERE appointment_id = ?",
        ).run(id);
        db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
      }
    });

    test("returns 409 when booking a slot already taken by the same provider", async () => {
      const db = getTestDb();
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO appointments
             (patient_id, provider_id, appointment_type_id, status, scheduled_at, duration_minutes, created_by)
           VALUES (?, ?, ?, 'scheduled', ?, 30, 1)`,
        )
        .run(patientDbId, providerDbId, followUpTypeId, futureDate(20));
      setupId1 = Number(lastInsertRowid);

      const agent = await authenticatedRequest("provider");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId2,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: futureDate(20),
      });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error");
    });

    test("returns 409 when booking a slot that partially overlaps an existing appointment (starts 15 min in)", async () => {
      const db = getTestDb();
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO appointments
             (patient_id, provider_id, appointment_type_id, status, scheduled_at, duration_minutes, created_by)
           VALUES (?, ?, ?, 'scheduled', ?, 30, 1)`,
        )
        .run(patientDbId, providerDbId, followUpTypeId, futureDate(21));
      setupId2 = Number(lastInsertRowid);

      const base = new Date(futureDate(21));
      const overlappingStart = new Date(
        base.getTime() + 15 * 60_000,
      ).toISOString();

      const agent = await authenticatedRequest("provider");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId2,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: overlappingStart,
      });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error");
    });

    // TODO: requires second provider — add in Stage 5
    test.todo(
      "two patients can book the same time slot with different providers (conflict scopes to provider_id)",
    );
  });

  describe("back-to-back scheduling", () => {
    let setupId: number | null = null;
    let createdId: number | null = null;

    beforeEach(() => {
      setupId = null;
      createdId = null;
    });

    afterEach(() => {
      const db = getTestDb();
      for (const id of [setupId, createdId]) {
        if (id === null) continue;
        db.prepare(
          "DELETE FROM appointment_reminders WHERE appointment_id = ?",
        ).run(id);
        db.prepare("DELETE FROM appointments WHERE id = ?").run(id);
      }
    });

    test("returns 409 when a new appointment starts exactly when an existing one ends", async () => {
      const db = getTestDb();
      const setupStart = futureDate(25);
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO appointments
             (patient_id, provider_id, appointment_type_id, status, scheduled_at, duration_minutes, created_by)
           VALUES (?, ?, ?, 'scheduled', ?, 30, 1)`,
        )
        .run(patientDbId, providerDbId, followUpTypeId, setupStart);
      setupId = Number(lastInsertRowid);

      const secondStart = new Date(
        new Date(setupStart).getTime() + 30 * 60_000,
      ).toISOString();

      const agent = await authenticatedRequest("provider");
      const res = await agent.post("/api/appointments").send({
        patient_id: patientDbId2,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        scheduled_at: secondStart,
      });

      if (res.status === 201) createdId = res.body.data?.id ?? null;

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty("error");
    });

    test.todo(
      "returns 201 for consecutive appointments with no gap between them",
    );
    test.todo(
      "returns 409 when a second appointment starts one minute before the first ends",
    );
  });

  describe("role and permission enforcement", () => {
    let createdId: number | null = null;

    beforeEach(() => {
      createdId = null;
    });

    afterEach(() => {
      if (createdId === null) return;
      const db = getTestDb();
      db.prepare(
        "DELETE FROM appointment_reminders WHERE appointment_id = ?",
      ).run(createdId);
      db.prepare("DELETE FROM appointments WHERE id = ?").run(createdId);
    });

    test("returns 201 when a patient books an appointment for themselves", async () => {
      const agent = await authenticatedRequest("patient1");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: patientDbId,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(30),
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        patient_id: patientDbId,
        provider_id: providerDbId,
        appointment_type_id: followUpTypeId,
        status: "scheduled",
      });

      createdId = res.body.data.id as number;
    });

    test("returns 403 when a patient books an appointment for a different patient", async () => {
      const agent = await authenticatedRequest("patient1");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: patientDbId2,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(31),
        })
        .expect(403);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 404 when provider books for a non-existent patient", async () => {
      const agent = await authenticatedRequest("provider");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: 999999,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(32),
        })
        .expect(404);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 404 when provider books with a non-existent appointment_type_id", async () => {
      const agent = await authenticatedRequest("provider");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: patientDbId,
          provider_id: providerDbId,
          appointment_type_id: 999999,
          scheduled_at: futureDate(33),
        })
        .expect(404);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 404 when provider books with a non-existent provider_id", async () => {
      const agent = await authenticatedRequest("provider");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: patientDbId,
          provider_id: 999999,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(34),
        })
        .expect(404);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 400 when scheduled_at is missing", async () => {
      const agent = await authenticatedRequest("provider");
      const res = await agent
        .post("/api/appointments")
        .send({
          patient_id: patientDbId,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
        })
        .expect(400);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 401 when no Authorization header is provided", async () => {
      const app = (
        require("../../server/src/app") as {
          createApp: () => import("express").Application;
        }
      ).createApp();
      const res = await request(app)
        .post("/api/appointments")
        .send({
          patient_id: patientDbId,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(35),
        })
        .expect(401);

      expect(res.body).toHaveProperty("error");
    });

    test("returns 401 when a malformed token is provided", async () => {
      const app = (
        require("../../server/src/app") as {
          createApp: () => import("express").Application;
        }
      ).createApp();
      const res = await request(app)
        .post("/api/appointments")
        .set("Authorization", "Bearer this.is.not.a.valid.token")
        .send({
          patient_id: patientDbId,
          provider_id: providerDbId,
          appointment_type_id: followUpTypeId,
          scheduled_at: futureDate(36),
        })
        .expect(401);

      expect(res.body).toHaveProperty("error");
    });
  });
});
