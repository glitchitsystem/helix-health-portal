/**
 * App.tsx — root router configuration for Helix Health Portal.
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

// Public pages
import Login          from './pages/Login';
import Register       from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword  from './pages/ResetPassword';
import MFAVerify      from './pages/MFAVerify';
import Unauthorized   from './pages/Unauthorized';

// Authenticated pages
import Dashboard from './pages/Dashboard';
import MFASetup  from './pages/MFASetup';

/** Placeholder for features not yet built (Phase 2+). */
const ComingSoon: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="mb-4 text-5xl">🚧</div>
    <h2 className="text-xl font-bold text-gray-700">{title}</h2>
    <p className="mt-2 text-sm text-gray-500">This feature is coming in a future phase.</p>
  </div>
);

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        {/* ── Public routes ──────────────────────────────────────────── */}
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/mfa/validate"    element={<MFAVerify />} />
        <Route path="/unauthorized"    element={<Unauthorized />} />

        {/* ── Protected routes (any authenticated user) ──────────────── */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard"    element={<Dashboard />} />
            <Route path="/mfa/setup"    element={<MFASetup />} />
            <Route path="/messages"     element={<ComingSoon title="Messages" />} />
            <Route path="/appointments" element={<ComingSoon title="Appointments" />} />

            {/* Patient-only */}
            <Route element={<ProtectedRoute allowedRoles={['patient']} />}>
              <Route path="/records" element={<ComingSoon title="My Records" />} />
            </Route>

            {/* Provider / nurse / patient */}
            <Route element={<ProtectedRoute allowedRoles={['patient', 'provider', 'nurse']} />}>
              <Route path="/labs" element={<ComingSoon title="Lab Results" />} />
            </Route>

            {/* Billing / patient / admin */}
            <Route element={<ProtectedRoute allowedRoles={['patient', 'billing', 'admin']} />}>
              <Route path="/billing" element={<ComingSoon title="Billing" />} />
            </Route>

            {/* Provider / nurse / admin */}
            <Route element={<ProtectedRoute allowedRoles={['admin', 'provider', 'nurse']} />}>
              <Route path="/patients" element={<ComingSoon title="Patient List" />} />
            </Route>

            {/* Admin only */}
            <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
              <Route path="/admin" element={<ComingSoon title="Admin Panel" />} />
            </Route>
          </Route>
        </Route>

        {/* ── Default redirect ───────────────────────────────────────── */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
