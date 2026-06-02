// Verifies that seedCompletePatientScenario() produces
//  records that the API can retrieve and return correctly

import { buildCompletePatientRecord } from '../fixtures/patients.fixtures';
import {
  getTestDb,
  seedMinimalData,
  seedCompletePatientScenario,
  cleanupCompletePatientScenario,
} from '../fixtures/db.helpers';
import { authenticatedRequest } from '../fixtures/api.helpers';

describe('Patient factory integration test', () => {
  let patientDbId: number;
  let scenarioIds: {
    userDbId: number;
    patientDbId: number;
    insuranceId: number;
    appointmentId: number;
  };

  beforeAll(() => {
    const seedIds = seedMinimalData();

    const db = getTestDb();
    const providerRow = db
      .prepare('SELECT id FROM providers WHERE user_id = ?')
      .get(seedIds.providerId) as { id: number };

    const record = buildCompletePatientRecord();
    scenarioIds = seedCompletePatientScenario(record, providerRow.id, 1);
    patientDbId = scenarioIds.patientDbId;
  });

  afterAll(() => {
    cleanupCompletePatientScenario(scenarioIds);
  });

  it('GET /api/patients/:id returns the seeded patient', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent.get(`/api/patients/${patientDbId}`).expect(200);

    expect(res.body.data.first_name).toMatch(/^TEST_/);
    expect(res.body.data.mrn).toMatch(/^MRN-TEST-/);
  });

  it('GET /api/patients/:id/appointments returns the seeded appointment', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .get(`/api/appointments?patient_id=${patientDbId}`)
      .expect(200);

    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('patient_id', patientDbId);
  });
});
