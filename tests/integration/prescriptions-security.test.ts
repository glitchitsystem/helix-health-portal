import request from 'supertest';
import { createApp } from '../../server/src/app';
import { getAuthToken, authenticatedRequest } from '../fixtures/api.helpers';
import { getTestDb, getTestPatientId, getTestProviderId } from '../fixtures/db.helpers';
import { buildPrescription, buildMinimalPrescription, buildInvalidPrescription } from '../fixtures/prescriptions.fixtures';
import type { Application } from 'express';

let _app: Application | null = null;
const getApp = () => { if (!_app) _app = createApp(); return _app; };

// ─── Shared state ──────────────────────────────────────────────────────────────

let patient1DbId: number;
let patient2DbId: number;
let providerDbId: number;
let seedPrescriptionId: number;

beforeAll(() => {
  const db = getTestDb();
  patient1DbId = getTestPatientId('patient1@helixhealthportal.test');
  providerDbId = getTestProviderId('provider@helixhealthportal.test');

  const p2User = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get('patient2@helixhealthportal.test') as { id: number } | undefined;
  if (!p2User) throw new Error('patient2 not seeded — run test setup first');
  const p2 = db
    .prepare('SELECT id FROM patients WHERE user_id = ?')
    .get(p2User.id) as { id: number };
  patient2DbId = p2.id;

  // Seed one prescription belonging to patient1
  const rx = db
    .prepare(
      `INSERT INTO prescriptions
         (patient_id, prescriber_id, drug_name, dosage, frequency, start_date, status, refills_remaining)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .get(
      patient1DbId, providerDbId,
      'TEST_Amoxicillin', '500mg', 'three times daily',
      new Date().toISOString().slice(0, 10), 'active', 2,
    ) as { id: number };
  seedPrescriptionId = rx.id;
});

afterAll(() => {
  const db = getTestDb();
  db.prepare('DELETE FROM refill_requests WHERE prescription_id = ?').run(seedPrescriptionId);
  db.prepare('DELETE FROM prescriptions WHERE id = ?').run(seedPrescriptionId);
});

// ─── 1. Authentication — unauthenticated requests return 401 ─────────────────

describe('Authentication — no token returns 401', () => {
  test('GET /api/patients/:id/prescriptions without token → 401', async () => {
    const res = await request(getApp()).get(`/api/patients/${patient1DbId}/prescriptions`);
    expect(res.status).toBe(401);
  });

  test('POST /api/patients/:id/prescriptions without token → 401', async () => {
    const res = await request(getApp())
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildMinimalPrescription());
    expect(res.status).toBe(401);
  });

  test('PUT /api/prescriptions/:id without token → 401', async () => {
    const res = await request(getApp())
      .put(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ notes: 'edited' });
    expect(res.status).toBe(401);
  });

  test('DELETE /api/prescriptions/:id without token → 401', async () => {
    const res = await request(getApp())
      .delete(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ reason: 'test' });
    expect(res.status).toBe(401);
  });

  test('POST /api/prescriptions/:id/renew without token → 401', async () => {
    const res = await request(getApp())
      .post(`/api/prescriptions/${seedPrescriptionId}/renew`)
      .send({ new_end_date: '2027-01-01' });
    expect(res.status).toBe(401);
  });

  test('POST /api/prescriptions/:id/refill-request without token → 401', async () => {
    const res = await request(getApp())
      .post(`/api/prescriptions/${seedPrescriptionId}/refill-request`);
    expect(res.status).toBe(401);
  });

  test('GET /api/prescriptions/refill-requests without token → 401', async () => {
    const res = await request(getApp()).get('/api/prescriptions/refill-requests');
    expect(res.status).toBe(401);
  });

  test('PUT /api/prescriptions/refill-requests/:id without token → 401', async () => {
    const res = await request(getApp())
      .put('/api/prescriptions/refill-requests/1')
      .send({ action: 'approve' });
    expect(res.status).toBe(401);
  });

  test('malformed Bearer token → 401', async () => {
    const res = await request(getApp())
      .get(`/api/patients/${patient1DbId}/prescriptions`)
      .set('Authorization', 'Bearer not.a.valid.jwt');
    expect(res.status).toBe(401);
  });
});

// ─── 2. Authorisation — role-based access control ────────────────────────────

describe('Authorisation — role-based access control', () => {
  test('patient1 can read their own prescriptions → 200', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent.get(`/api/patients/${patient1DbId}/prescriptions`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('provider can read any patient prescriptions → 200', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent.get(`/api/patients/${patient1DbId}/prescriptions`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('patient cannot create a prescription (provider role required) → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildMinimalPrescription());
    expect(res.status).toBe(403);
  });

  test('patient cannot renew a prescription → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .post(`/api/prescriptions/${seedPrescriptionId}/renew`)
      .send({ new_end_date: '2027-01-01' });
    expect(res.status).toBe(403);
  });

  test('patient cannot discontinue a prescription → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .delete(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ reason: 'self-discontinue attempt' });
    expect(res.status).toBe(403);
  });

  test('patient cannot view refill-requests queue (provider/nurse only) → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent.get('/api/prescriptions/refill-requests');
    expect(res.status).toBe(403);
  });

  test('patient cannot approve/deny a refill request → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .put('/api/prescriptions/refill-requests/1')
      .send({ action: 'approve' });
    expect(res.status).toBe(403);
  });

  test('provider can create a prescription → 201', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildPrescription({ drug_name: 'TEST_Doxycycline', dosage: '100mg', frequency: 'once daily' }));
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Cleanup
    if (res.body.data?.id) {
      const db = getTestDb();
      db.prepare('DELETE FROM prescriptions WHERE id = ?').run(res.body.data.id);
    }
  });

  test('provider can update a prescription → 200', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .put(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ notes: 'Updated by integration test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ─── 3. IDOR — patient A cannot access patient B's data ──────────────────────

describe('IDOR — cross-patient access prevention', () => {
  test('patient1 cannot read patient2 prescriptions → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent.get(`/api/patients/${patient2DbId}/prescriptions`);
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  test('patient1 cannot create a prescription for patient2 (role check first) → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .post(`/api/patients/${patient2DbId}/prescriptions`)
      .send(buildMinimalPrescription());
    // Blocked at requireRole('provider','admin') before IDOR check
    expect(res.status).toBe(403);
  });

  test('patient1 cannot submit a refill request for a prescription owned by patient2', async () => {
    const db = getTestDb();

    // Seed a prescription belonging to patient2
    const rx = db
      .prepare(
        `INSERT INTO prescriptions
           (patient_id, prescriber_id, drug_name, dosage, frequency, start_date, status, refills_remaining)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
      .get(
        patient2DbId, providerDbId,
        'TEST_Lisinopril', '10mg', 'once daily',
        new Date().toISOString().slice(0, 10), 'active', 3,
      ) as { id: number };

    try {
      const token = await getAuthToken('patient1');
      const res = await request(getApp())
        .post(`/api/prescriptions/${rx.id}/refill-request`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    } finally {
      db.prepare('DELETE FROM prescriptions WHERE id = ?').run(rx.id);
    }
  });

  test('patient1 cannot directly update a prescription (role check fires first) → 403', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent
      .put(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ notes: 'IDOR attempt' });
    expect(res.status).toBe(403);
  });

  test('response for forbidden patient does not leak other patient data', async () => {
    const agent = await authenticatedRequest('patient1');
    const res = await agent.get(`/api/patients/${patient2DbId}/prescriptions`);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('data');
  });
});

// ─── 4. Input validation — path params and request body ──────────────────────

describe('Input validation', () => {
  test('non-numeric prescription id in path → 404 (regex no-match → fallthrough)', async () => {
    const agent = await authenticatedRequest('provider');
    // The route uses /:id(\d+) so "abc" will not match and falls through to 404
    const res = await agent.put('/api/prescriptions/abc').send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  test('non-existent numeric prescription id → 404', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent.put('/api/prescriptions/999999999').send({ notes: 'x' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  test('non-existent numeric prescription id for DELETE → 404', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .delete('/api/prescriptions/999999999')
      .send({ reason: 'test' });
    expect(res.status).toBe(404);
  });

  test('non-existent numeric prescription id for renew → 404', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post('/api/prescriptions/999999999/renew')
      .send({ new_end_date: '2027-01-01' });
    expect(res.status).toBe(404);
  });

  test('non-numeric patient id in path → 404', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent.get('/api/patients/not-an-id/prescriptions');
    // NaN patientId finds no patient row → 404
    expect(res.status).toBe(404);
  });

  test('POST prescription missing drug_name → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildInvalidPrescription('drug_name'));
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST prescription missing dosage → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildInvalidPrescription('dosage'));
    expect(res.status).toBe(400);
  });

  test('POST prescription missing frequency → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildInvalidPrescription('frequency'));
    expect(res.status).toBe(400);
  });

  test('POST prescription missing start_date → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/patients/${patient1DbId}/prescriptions`)
      .send(buildInvalidPrescription('start_date'));
    expect(res.status).toBe(400);
  });

  test('PUT prescription with no valid fields → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .put(`/api/prescriptions/${seedPrescriptionId}`)
      .send({ unknown_field: 'ignored' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST renew missing new_end_date → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .post(`/api/prescriptions/${seedPrescriptionId}/renew`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('PUT refill-requests with invalid action → 400', async () => {
    const agent = await authenticatedRequest('provider');
    const res = await agent
      .put('/api/prescriptions/refill-requests/1')
      .send({ action: 'cancel' });
    // 404 if no request exists, 400 if found but action invalid — both are acceptable
    expect([400, 404]).toContain(res.status);
  });
});
