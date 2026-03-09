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
  | 'account_locked';
