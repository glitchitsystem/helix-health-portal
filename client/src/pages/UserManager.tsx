/**
 * UserManager — admin tool to list, activate/deactivate, and assign roles to users.
 * Route: /admin/users (admin only)
 */

import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const ALL_ROLES = ['patient', 'provider', 'nurse', 'billing', 'admin'];

interface UserRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: number;
  roles: string; // comma-separated from GROUP_CONCAT
  mfa_enabled: number;
  created_at: string;
}

const UserManager: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  /* Role editing */
  const [editingRolesId, setEditingRolesId] = useState<number | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    api
      .get<UserRow[]>('/admin/users')
      .then((r) => setUsers(r.data))
      .catch(() => setError('Failed to load users.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggleActive = async (userId: number, currentlyActive: number) => {
    setActionMsg(null);
    const action = currentlyActive ? 'deactivate' : 'activate';
    try {
      await api.put(`/admin/users/${userId}/${action}`);
      setActionMsg(`User ${action}d successfully.`);
      load();
    } catch (err: any) {
      setActionMsg(err?.response?.data?.message ?? `Failed to ${action} user.`);
    }
  };

  const openRoleEditor = (u: UserRow) => {
    setEditingRolesId(u.id);
    setSelectedRoles(u.roles ? u.roles.split(',').map((r) => r.trim()) : []);
  };

  const saveRoles = async (userId: number) => {
    try {
      await api.put(`/admin/users/${userId}/roles`, { roles: selectedRoles });
      setEditingRolesId(null);
      setActionMsg('Roles updated.');
      load();
    } catch (err: any) {
      setActionMsg(err?.response?.data?.message ?? 'Failed to update roles.');
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading users…</div>;
  if (error) return <div className="rounded-md bg-red-50 p-4 text-red-700">{error}</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">User Management</h1>

      {actionMsg && (
        <div className="rounded-md bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-800">
          {actionMsg}
        </div>
      )}

      <div className="rounded-lg bg-white shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['User', 'Email', 'Roles', 'MFA', 'Status', 'Joined', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const roles = u.roles ? u.roles.split(',').map((r) => r.trim()) : [];
              const isSelf = currentUser?.id === u.id;
              return (
                <React.Fragment key={u.id}>
                  <tr className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {u.first_name} {u.last_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {roles.map((r) => (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.mfa_enabled ? (
                        <span className="text-green-600 font-medium">✓ On</span>
                      ) : (
                        <span className="text-gray-400">Off</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-600'
                        }`}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openRoleEditor(u)}
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          Roles
                        </button>
                        {!isSelf && (
                          <button
                            onClick={() => toggleActive(u.id, u.is_active)}
                            className={`text-xs hover:underline ${
                              u.is_active ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                        {isSelf && (
                          <span className="text-xs text-gray-400 italic">You</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingRolesId === u.id && (
                    <tr className="bg-indigo-50">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="flex flex-col gap-3">
                          <p className="text-sm font-medium text-gray-700">
                            Assign roles for {u.first_name} {u.last_name}:
                          </p>
                          <div className="flex gap-4 flex-wrap">
                            {ALL_ROLES.map((role) => (
                              <label
                                key={role}
                                className="flex items-center gap-2 cursor-pointer text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedRoles.includes(role)}
                                  onChange={(e) => {
                                    setSelectedRoles((prev) =>
                                      e.target.checked
                                        ? [...prev, role]
                                        : prev.filter((r) => r !== role),
                                    );
                                  }}
                                  className="h-4 w-4 text-indigo-600"
                                />
                                <span className="capitalize">{role}</span>
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-3">
                            <button
                              onClick={() => saveRoles(u.id)}
                              className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
                            >
                              Save Roles
                            </button>
                            <button
                              onClick={() => setEditingRolesId(null)}
                              className="px-4 py-1.5 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManager;
