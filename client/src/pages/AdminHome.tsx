/**
 * AdminHome — landing page for admin users.
 */

import React from 'react';
import { Link } from 'react-router-dom';

const ADMIN_CARDS = [
  {
    title: 'Reports',
    description: 'Utilisation, population health, provider load, and revenue visibility.',
    to: '/admin/reports',
  },
  {
    title: 'Users',
    description: 'Manage user access, activation, and role assignments.',
    to: '/admin/users',
  },
  {
    title: 'Audit Log',
    description: 'Review recent authentication and administrative activity.',
    to: '/admin/audit-log',
  },
  {
    title: 'System Health',
    description: 'Check uptime, active sessions, and platform health metrics.',
    to: '/admin/system-health',
  },
  {
    title: 'Billing',
    description: 'Open the billing workqueue and revenue reporting tools.',
    to: '/billing',
  },
  {
    title: 'Patient Directory',
    description: 'Jump into patient charts, records, and billing context.',
    to: '/patients',
  },
];

const AdminHome: React.FC = () => (
  <div className="mx-auto max-w-6xl space-y-6 py-8">
    <div className="rounded-2xl bg-helix-900 p-6 text-white">
      <h1 className="text-2xl font-bold">Admin Console</h1>
      <p className="mt-2 text-sm text-helix-100">
        Quick access to operational dashboards, user administration, audit review, and billing workflows.
      </p>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {ADMIN_CARDS.map((card) => (
        <Link
          key={card.to}
          to={card.to}
          className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:ring-helix-300"
        >
          <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
          <p className="mt-2 text-sm text-gray-500">{card.description}</p>
          <p className="mt-4 text-sm font-semibold text-helix-700">Open →</p>
        </Link>
      ))}
    </div>
  </div>
);

export default AdminHome;
