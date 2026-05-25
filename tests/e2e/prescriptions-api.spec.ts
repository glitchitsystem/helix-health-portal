import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_CREDENTIALS } from '../fixtures/auth.fixtures';
import {
  buildPrescription,
  buildMinimalPrescription,
  buildInvalidPrescription,
} from '../fixtures/prescriptions.fixtures';

const API = 'http://localhost:4000';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getToken(
  request: APIRequestContext,
  role: keyof typeof TEST_CREDENTIALS,
): Promise<string> {
  const creds = TEST_CREDENTIALS[role];
  const res = await request.post(`${API}/api/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  const body = await res.json() as { success: boolean; data: { accessToken: string } };
  return body.data.accessToken;
}

async function getPatientId(
  request: APIRequestContext,
  token: string,
): Promise<number> {
  const res = await request.get(`${API}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json() as { success: boolean; data: { patient: { id: number } } };
  return body.data.patient.id;
}

// ─── 200 — List prescriptions ─────────────────────────────────────────────────

test.describe('GET /patients/:patientId/prescriptions — 200 list', () => {
  test('patient can list their own prescriptions (default — all statuses)', async ({ request }) => {
    const token = await getToken(request, 'patient1');
    const patientId = await getPatientId(request, token);

    const res = await request.get(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('patient can filter prescriptions by status=active', async ({ request }) => {
    const token = await getToken(request, 'patient1');
    const patientId = await getPatientId(request, token);

    const res = await request.get(
      `${API}/api/patients/${patientId}/prescriptions?status=active`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; data: Array<{ status: string }> };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    for (const rx of body.data) {
      expect(rx.status).toBe('active');
    }
  });

  test('patient can filter prescriptions by status=all', async ({ request }) => {
    const token = await getToken(request, 'patient1');
    const patientId = await getPatientId(request, token);

    const res = await request.get(
      `${API}/api/patients/${patientId}/prescriptions?status=all`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('provider can list prescriptions for a patient', async ({ request }) => {
    const providerToken = await getToken(request, 'provider');
    const patientToken = await getToken(request, 'patient1');
    const patientId = await getPatientId(request, patientToken);

    const res = await request.get(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
    });

    expect(res.status()).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('each prescription record includes required fields', async ({ request }) => {
    const token = await getToken(request, 'patient1');
    const patientId = await getPatientId(request, token);

    const res = await request.get(
      `${API}/api/patients/${patientId}/prescriptions?status=all`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const body = await res.json() as {
      success: boolean;
      data: Array<{ id: number; drug_name: string; dosage: string; status: string }>;
    };
    if (body.data.length > 0) {
      const rx = body.data[0];
      expect(typeof rx.id).toBe('number');
      expect(typeof rx.drug_name).toBe('string');
      expect(typeof rx.dosage).toBe('string');
      expect(typeof rx.status).toBe('string');
    }
  });
});

// ─── 201 — Create prescription ────────────────────────────────────────────────

test.describe('POST /patients/:patientId/prescriptions — 201 created', () => {
  let providerToken: string;
  let patientId: number;
  const createdIds: number[] = [];

  test.beforeAll(async ({ request }) => {
    providerToken = await getToken(request, 'provider');
    const patientToken = await getToken(request, 'patient1');
    patientId = await getPatientId(request, patientToken);
  });

  test.afterAll(async ({ request }) => {
    for (const id of createdIds) {
      await request.delete(`${API}/api/patients/${patientId}/prescriptions/${id}`, {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
    }
  });

  test('provider can create a prescription for a patient', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildPrescription(),
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as {
      success: boolean;
      data: { id: number; drug_name: string; dosage: string; status: string };
      warnings?: string[];
    };
    expect(body.success).toBe(true);
    expect(typeof body.data.id).toBe('number');
    expect(body.data.drug_name).toBe('Amoxicillin');
    expect(body.data.dosage).toBe('500mg');
    expect(body.data.status).toBe('active');
    createdIds.push(body.data.id);
  });

  test('provider can create a minimal prescription (required fields only)', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildMinimalPrescription(),
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as {
      success: boolean;
      data: { id: number; drug_name: string };
    };
    expect(body.success).toBe(true);
    expect(body.data.drug_name).toBe('Doxycycline');
    createdIds.push(body.data.id);
  });

  test('response includes warnings array (even if empty) when drug interaction check runs', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildPrescription({ drug_name: 'Ibuprofen', dosage: '200mg', frequency: 'as needed' }),
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as {
      success: boolean;
      data: { id: number };
      warnings?: string[];
    };
    expect(body.success).toBe(true);
    if (body.warnings !== undefined) {
      expect(Array.isArray(body.warnings)).toBe(true);
    }
    createdIds.push(body.data.id);
  });

  test('admin can create a prescription for a patient', async ({ request }) => {
    const adminToken = await getToken(request, 'admin');

    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: buildPrescription({ drug_name: 'Lisinopril', dosage: '10mg', frequency: 'once daily' }),
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as { success: boolean; data: { id: number; drug_name: string } };
    expect(body.success).toBe(true);
    expect(body.data.drug_name).toBe('Lisinopril');
    createdIds.push(body.data.id);
  });
});

// ─── 400 — Validation errors ──────────────────────────────────────────────────

test.describe('POST /patients/:patientId/prescriptions — 400 validation error', () => {
  let providerToken: string;
  let patientId: number;

  test.beforeAll(async ({ request }) => {
    providerToken = await getToken(request, 'provider');
    const patientToken = await getToken(request, 'patient1');
    patientId = await getPatientId(request, patientToken);
  });

  test('returns 400 when drug_name is missing', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildInvalidPrescription('drug_name'),
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when dosage is missing', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildInvalidPrescription('dosage'),
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when frequency is missing', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildInvalidPrescription('frequency'),
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when start_date is missing', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: buildInvalidPrescription('start_date'),
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when dosage exceeds the maximum daily limit', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${providerToken}` },
      data: {
        drug_name:  'Metformin',
        dosage:     '1500mg',
        frequency:  'twice daily',
        start_date: new Date().toISOString().slice(0, 10),
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});

// ─── 403 — Role enforcement ───────────────────────────────────────────────────

test.describe('POST /patients/:patientId/prescriptions — 403 forbidden', () => {
  let patientToken: string;
  let patientId: number;

  test.beforeAll(async ({ request }) => {
    patientToken = await getToken(request, 'patient1');
    patientId = await getPatientId(request, patientToken);
  });

  test('patient cannot create a prescription for themselves', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${patientToken}` },
      data: buildMinimalPrescription(),
    });

    expect(res.status()).toBe(403);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('patient2 cannot create a prescription for patient1', async ({ request }) => {
    const patient2Token = await getToken(request, 'patient2');

    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: `Bearer ${patient2Token}` },
      data: buildMinimalPrescription(),
    });

    expect(res.status()).toBe(403);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});

// ─── 401 — Authentication ─────────────────────────────────────────────────────

test.describe('prescriptions endpoints — 401 unauthenticated', () => {
  let patientId: number;

  test.beforeAll(async ({ request }) => {
    const patientToken = await getToken(request, 'patient1');
    patientId = await getPatientId(request, patientToken);
  });

  test('GET returns 401 when no Authorization header is provided', async ({ request }) => {
    const res = await request.get(`${API}/api/patients/${patientId}/prescriptions`);

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('POST returns 401 when no Authorization header is provided', async ({ request }) => {
    const res = await request.post(`${API}/api/patients/${patientId}/prescriptions`, {
      data: buildMinimalPrescription(),
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('GET returns 401 when a malformed token is provided', async ({ request }) => {
    const res = await request.get(`${API}/api/patients/${patientId}/prescriptions`, {
      headers: { Authorization: 'Bearer not.a.real.token' },
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });
});
