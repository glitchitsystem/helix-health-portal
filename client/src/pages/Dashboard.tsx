/**
 * Dashboard page — the home screen after login.
 * Displays a welcome message and role-appropriate quick-action cards.
 */

import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface QuickAction {
  label: string;
  description: string;
  to: string;
  icon: string;
  roles: string[]; // empty = all roles
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "My Appointments",
    description: "View and manage upcoming appointments",
    to: "/appointments",
    icon: "📅",
    roles: ["patient", "provider", "nurse"],
  },
  {
    label: "Lab Results",
    description: "Review recent laboratory results",
    to: "/labs",
    icon: "🔬",
    roles: ["patient", "provider", "nurse"],
  },
  {
    label: "Billing",
    description: "View statements and make payments",
    to: "/billing",
    icon: "💳",
    roles: ["patient", "billing", "admin"],
  },
  {
    label: "Messages",
    description: "Secure messages with your care team",
    to: "/messages",
    icon: "✉️",
    roles: [],
  },
  {
    label: "Patient List",
    description: "Manage and search registered patients",
    to: "/patients",
    icon: "👥",
    roles: ["admin", "provider", "nurse"],
  },
  {
    label: "Admin Panel",
    description: "User management and system settings",
    to: "/admin",
    icon: "⚙️",
    roles: ["admin"],
  },
  {
    label: "MFA Setup",
    description: "Enable or update two-factor authentication",
    to: "/mfa/setup",
    icon: "🔐",
    roles: [],
  },
];

/**
 * Strips the email domain for a friendlier greeting.
 */
function getFirstName(email: string): string {
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const roles = user?.roles ?? [];

  const visibleActions = QUICK_ACTIONS.filter(
    (a) => a.roles.length === 0 || a.roles.some((r) => roles.includes(r)),
  );

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-gradient-to-r from-helix-700 to-helix-500 p-6 text-white shadow">
        <p className="text-sm font-medium opacity-80">Welcome back,</p>
        <h2 className="mt-1 text-2xl font-bold">
          {getFirstName(user?.email ?? "User")}
        </h2>
        <p className="mt-1 text-sm opacity-70">
          Roles: {roles.join(", ") || "none"} &nbsp;·&nbsp;{" "}
          {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-800">
          Quick Actions
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-5
                         shadow-sm transition hover:border-helix-300 hover:shadow-md"
            >
              <span className="mt-0.5 text-3xl">{action.icon}</span>
              <div>
                <p className="font-semibold text-gray-800">{action.label}</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  {action.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
