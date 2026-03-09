/**
 * Unauthorized page — shown when a user accesses a route they lack the role for.
 */

import React from 'react';
import { Link } from 'react-router-dom';

const Unauthorized: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
    <div className="text-center">
      <div className="mb-4 text-6xl">🚫</div>
      <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
      <p className="mt-2 text-gray-500">
        You don&apos;t have permission to view this page.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 inline-block rounded-lg bg-helix-600 px-5 py-2 text-sm font-semibold
                   text-white hover:bg-helix-700"
      >
        Back to Dashboard
      </Link>
    </div>
  </div>
);

export default Unauthorized;
