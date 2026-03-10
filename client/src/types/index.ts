/**
 * Shared TypeScript types for the Helix Health Portal client.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  roles: string[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginMfaResponse {
  mfaRequired: true;
  mfaChallengeToken: string;
}

// ─── API wrappers ─────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Context ──────────────────────────────────────────────────────────────────

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Returns null on success, error message string on failure */
  login: (email: string, password: string) => Promise<string | null | { mfaRequired: true; mfaChallengeToken: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

// ─── Phase 2: Clinical Types ──────────────────────────────────────────────────

export interface AppointmentType {
  id: number;
  name: string;
  duration_minutes: number;
  color_hex: string;
  is_telehealth: number;
  is_active: number;
}

export interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  appointment_type_id: number;
  status: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  telehealth_url: string | null;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  type_name?: string;
  type_color?: string;
  type_is_telehealth?: number;
  patient_first_name?: string;
  patient_last_name?: string;
  patient_mrn?: string;
  provider_email?: string;
}

export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

export interface Provider {
  id: number;
  user_id: number;
  npi: string;
  specialty_id: number | null;
  license_number: string | null;
  created_at: string;
  email?: string;
  specialty_name?: string;
}

export interface Diagnosis {
  id: number;
  patient_id: number;
  icd10_code: string;
  icd10_description: string;
  status: string;
  onset_date: string | null;
  resolved_date: string | null;
  severity: string | null;
  notes: string | null;
  created_at: string;
}

export interface Medication {
  id: number;
  patient_id: number;
  name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date: string | null;
  status: string;
  prescriber_id: number | null;
  notes: string | null;
  created_at: string;
}

export interface Allergy {
  id: number;
  patient_id: number;
  allergen: string;
  reaction_type: string;
  severity: string;
  onset_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface Vitals {
  id: number;
  patient_id: number;
  recorded_at: string;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  heart_rate: number | null;
  temperature: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  o2_saturation: number | null;
}

export interface LabResult {
  id: number;
  patient_id: number;
  test_name: string;
  test_code: string | null;
  value: string;
  unit: string | null;
  reference_range_low: number | null;
  reference_range_high: number | null;
  status: string;
  collected_at: string;
  resulted_at: string | null;
  notes: string | null;
}

export interface ClinicalNote {
  id: number;
  patient_id: number;
  provider_id: number;
  appointment_id: number | null;
  note_type: string;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  is_locked: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  provider_email?: string;
  addenda?: NoteAddendum[];
}

export interface NoteAddendum {
  id: number;
  note_id: number;
  author_id: number;
  content: string;
  created_at: string;
  author_email?: string;
}

export interface NoteTemplate {
  id: number;
  name: string;
  note_type: string;
  subjective_template: string | null;
  objective_template: string | null;
  assessment_template: string | null;
  plan_template: string | null;
  created_by: number | null;
  is_shared: number;
}

export interface Document {
  id: number;
  patient_id: number;
  filename: string;      // original file name
  file_type: string;     // MIME type
  file_size: number;     // bytes
  storage_path: string;
  description: string | null;
  uploaded_by: number | null;
  created_at: string;
}

export interface HealthSummary {
  latest_vitals: Vitals | null;
  active_medications: Medication[];
  active_diagnoses: Diagnosis[];
  recent_labs: LabResult[];
  active_allergies: Allergy[];
}

// ─── Phase 3: Prescriptions & Communications ──────────────────────────────────

export interface Prescription {
  id: number;
  patient_id: number;
  prescriber_id: number;
  drug_name: string;
  drug_ndc: string | null;
  dosage: string;
  frequency: string;
  route: string;
  quantity: number;
  refills_remaining: number;
  start_date: string;
  end_date: string | null;
  status: string;
  is_controlled: number;
  schedule_class: string | null;
  pharmacy_name: string | null;
  pharmacy_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  prescriber_email?: string;
}

export interface DrugInteraction {
  drug_a: string;
  drug_b: string;
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
}

export interface RefillRequest {
  id: number;
  prescription_id: number;
  patient_id: number;
  requested_at: string;
  status: string;
  pharmacy_notes: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  notes: string | null;
  // joined
  drug_name?: string;
  patient_name?: string;
}

export interface MessageThread {
  id: number;
  subject: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  is_archived: number;
  // computed
  unread_count?: number;
  last_message?: string;
  participants?: ThreadParticipant[];
}

export interface ThreadParticipant {
  user_id: number;
  email: string;
  last_read_at: string | null;
}

export interface Message {
  id: number;
  thread_id: number;
  sender_id: number;
  sender_email?: string;
  body: string;
  is_priority: number;
  created_at: string;
}

export interface AppNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  data_json: string | null;
  is_read: number;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  notification_type: string;
  in_app_enabled: number;
  email_enabled: number;
  sms_enabled: number;
}
