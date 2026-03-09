/**
 * Shell layout — sidebar navigation + header + main content area.
 * Nav links are filtered by the authenticated user's role.
 */

import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  label: string;
  to: string;
  roles: string[]; // empty array = available to all authenticated users
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      to: '/dashboard',    roles: [],                                    icon: '🏠' },
  { label: 'My Records',     to: '/records',      roles: ['patient'],                           icon: '📋' },
  { label: 'Appointments',   to: '/appointments', roles: ['patient', 'provider', 'nurse'],      icon: '📅' },
  { label: 'Lab Results',    to: '/labs',         roles: ['patient', 'provider', 'nurse'],      icon: '🔬' },
  { label: 'Patients',       to: '/patients',     roles: ['admin', 'provider', 'nurse'],        icon: '👥' },
  { label: 'Billing',        to: '/billing',      roles: ['patient', 'billing', 'admin'],       icon: '💳' },
  { label: 'Messages',       to: '/messages',     roles: [],                                    icon: '✉️' },
  { label: 'MFA Setup',      to: '/mfa/setup',    roles: [],                                    icon: '🔐' },
  { label: 'Admin',          to: '/admin',        roles: ['admin'],                             icon: '⚙️' },
];

/**
 * Main application shell layout rendered for all authenticated views.
 */
const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const userRoles = user?.roles ?? [];

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.some((r) => userRoles.includes(r)),
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* ── Sidebar ── */}
      <aside
        className={`${
          sidebarOpen ? 'w-60' : 'w-16'
        } flex flex-shrink-0 flex-col bg-helix-900 text-white transition-all duration-200`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4">
          {sidebarOpen && (
            <Link to="/dashboard" className="text-lg font-bold tracking-tight text-white">
              🏥 Helix
            </Link>
          )}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded p-1 text-helix-300 hover:bg-helix-800 hover:text-white"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-helix-700 text-white'
                    : 'text-helix-200 hover:bg-helix-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {sidebarOpen && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Role badge */}
        {sidebarOpen && (
          <div className="px-4 pb-4">
            <div className="rounded-md bg-helix-800 px-3 py-2 text-xs text-helix-300">
              Roles: {userRoles.join(', ') || 'none'}
            </div>
          </div>
        )}
      </aside>

      {/* ── Main area ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-800">Helix Health Portal</h1>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              <span className="h-7 w-7 rounded-full bg-helix-600 text-center leading-7 text-white text-xs">
                {user?.email.charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:block">{user?.email}</span>
              <span className="text-xs">▾</span>
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-md border border-gray-200 bg-white shadow-lg z-50">
                <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
                  {user?.email}
                </div>
                <Link
                  to="/mfa/setup"
                  onClick={() => setUserMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  MFA Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
