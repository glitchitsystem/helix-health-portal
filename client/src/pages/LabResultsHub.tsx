/**
 * LabResultsHub — routes patients to their own labs and staff to a patient
 * picker that opens directly into the Labs tab.
 */

import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import MedicalRecords from './MedicalRecords';
import PatientList from './PatientList';

const LabResultsHub: React.FC = () => {
  const { user } = useAuth();
  const isPatientOnly = user?.roles.includes('patient') && !user.roles.some((role) => (
    ['admin', 'provider', 'nurse'].includes(role)
  ));

  if (isPatientOnly) {
    return <MedicalRecords initialTab="labs" pageTitle="Lab Results" />;
  }

  return <PatientList mode="labs" />;
};

export default LabResultsHub;
