/**
 * BillingHub — routes patients to their own billing dashboard and staff to the
 * shared workqueue.
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import BillingDashboard from './BillingDashboard';
import BillingWorkqueue from './BillingWorkqueue';

const BillingHub: React.FC = () => {
  const { user } = useAuth();
  const isPatientOnly = user?.roles.includes('patient') && !user.roles.some((role) => (
    ['admin', 'billing', 'provider', 'nurse'].includes(role)
  ));

  return isPatientOnly ? <BillingDashboard /> : <BillingWorkqueue />;
};

export default BillingHub;
