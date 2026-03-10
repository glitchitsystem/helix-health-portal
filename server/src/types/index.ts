/**
 * Shared TypeScript types for the Helix Health Portal server.
 */

import { Request } from 'express';

// ─── Domain Models ────────────────────────────────────────────────────────────

export interface User {
  id: number;
  email: string;
  password_hash: string;
  is_active: number;
  email_verified: number;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
}

export interface Permission {
  id: number;
  resource: string;
  action: string;
  description: string | null;
}

export interface RefreshToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface MfaSecret {
  user_id: number;
  secret: string;
  is_enabled: number;
  created_at: string;
}

export interface AuditLogAuthEntry {
  id: number;
  user_id: number | null;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: string | null;
  created_at: string;
}

export interface Patient {
  id: number;
  user_id: number;
  mrn: string;
  created_at: string;
  updated_at: string;
}

export interface PatientDemographics {
  patient_id: number;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

export interface Provider {
  id: number;
  user_id: number;
  npi: string;
  specialty_id: number | null;
  license_number: string | null;
  created_at: string;
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: number;        // user id
  email: string;
  roles: string[];
  iat?: number;
  exp?: number;
}

// ─── Express Augmentations ────────────────────────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ─── Auth Event Types ─────────────────────────────────────────────────────────

export type AuthEventType =
  | 'register'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'token_refresh'
  | 'password_reset_request'
  | 'password_reset_confirm'
  | 'mfa_setup'
  | 'mfa_enabled'
  | 'mfa_validated'
  | 'account_locked'
  | 'access_read'
  | 'access_write'
  | 'access_delete';

// ─── Phase 2: Clinical Domain Models ─────────────────────────────────────────

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
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentReminder {
  id: number;
  appointment_id: number;
  reminder_type: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
}

export interface Waitlist {
  id: number;
  patient_id: number;
  provider_id: number | null;
  appointment_type_id: number | null;
  requested_at: string;
  priority: number;
  status: string;
  notes: string | null;
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
  created_by: number | null;
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
  created_by: number | null;
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
  created_by: number | null;
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
  recorded_by: number | null;
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
  ordered_by: number | null;
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
}

export interface NoteAddendum {
  id: number;
  note_id: number;
  author_id: number;
  content: string;
  created_at: string;
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
  filename: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  description: string | null;
  uploaded_by: number | null;
  created_at: string;
}

export interface DocumentAccessLog {
  id: number;
  document_id: number;
  accessed_by: number;
  accessed_at: string;
  access_type: string;
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
}

export interface DrugInteractionLog {
  id: number;
  patient_id: number;
  drug_a: string;
  drug_b: string;
  severity: string;
  description: string;
  checked_at: string;
  checked_by: number | null;
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
}

export interface MessageThread {
  id: number;
  subject: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  is_archived: number;
}

export interface MessageThreadParticipant {
  thread_id: number;
  user_id: number;
  joined_at: string;
  last_read_at: string | null;
}

export interface Message {
  id: number;
  thread_id: number;
  sender_id: number;
  body: string;
  is_priority: number;
  created_at: string;
}

export interface Notification {
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
  user_id: number;
  notification_type: string;
  in_app_enabled: number;
  email_enabled: number;
  sms_enabled: number;
}
