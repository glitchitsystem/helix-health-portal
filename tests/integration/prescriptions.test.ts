import { authenticatedRequest } from "../fixtures/api.helpers";
import {
  getTestDb,
  getTestPatientId,
  getTestProviderId,
} from "../fixtures/db.helpers";

describe("role-based access control", () => {
  let patientDbId: number;
  let prescriptionId: number;

  beforeEach(() => {
    const db = getTestDb();
    patientDbId = getTestPatientId("patient1@helixhealthportal.test");
    const providerDbId = getTestProviderId("provider@helixhealthportal.test");

    const result = db
      .prepare(
        `INSERT INTO prescriptions
           (patient_id, prescriber_id, drug_name, dosage, frequency, start_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(
        patientDbId,
        providerDbId,
        "Amoxicillin",
        "500mg",
        "three times daily",
        new Date().toISOString().slice(0, 10),
        "active",
      ) as { id: number };

    prescriptionId = result.id;
  });

  afterEach(() => {
    const db = getTestDb();
    db.prepare("DELETE FROM prescriptions WHERE id = ?").run(prescriptionId);
  });

  test("patient1 can access their own prescriptions → 200", async () => {
    const agent = await authenticatedRequest("patient1");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("patient2 cannot access patient1's prescriptions → 403", async () => {
    const agent = await authenticatedRequest("patient2");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(403);

    expect(res.body).toHaveProperty("error");
  });

  test("provider can access patient1's prescriptions → 200", async () => {
    const agent = await authenticatedRequest("provider");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("nurse can access patient1's prescriptions → 200", async () => {
    const agent = await authenticatedRequest("nurse");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test("billing user cannot access patient1's prescriptions → 403", async () => {
    const agent = await authenticatedRequest("billing");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(403);

    expect(res.body).toHaveProperty("error");
  });

  test("admin can access patient1's prescriptions → 200", async () => {
    const agent = await authenticatedRequest("admin");

    const res = await agent
      .get(`/api/patients/${patientDbId}/prescriptions`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
