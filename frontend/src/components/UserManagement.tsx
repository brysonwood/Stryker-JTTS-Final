import React, { FormEvent, useEffect, useState } from 'react';
import { createUser, listUsers, updateUser } from '../lib/api';
import { formatUserDisplayName } from '../lib/userDisplay';
import type { UserRecord } from '../types';

type Props = {
  token: string;
  onOpenProfile: (userId: number) => void;
};

export default function UserManagement({ token, onOpenProfile }: Props) {
  // Users list state: all users fetched on mount.
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Create user form state: new user input fields.
  const [creating, setCreating] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  // General action error (for disable/enable, etc.).
  const [actionError, setActionError] = useState<string | null>(null);
  // Fetch users from backend.
  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await listUsers(token);
      setUsers(res.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }
  // Load users on mount or token change.
  useEffect(() => {
    loadUsers();
  }, [token]);
  // Toggle user disabled status (enable/disable account).
  async function toggleDisabled(user: UserRecord) {
    setActionError(null);
    try {
      // Update user disabled flag and refresh list.
      await updateUser(token, user.id, { disabled: !user.disabled });
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async function toggleRole(user: UserRecord) {
    setActionError(null);
    try {
      await updateUser(token, user.id, { role: user.role === 'admin' ? 'user' : 'admin' });
      await loadUsers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update role');
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim() || !newEmail.trim() || !newPassword) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      await createUser(token, { firstName: newFirstName.trim(), lastName: newLastName.trim(), email: newEmail.trim(), password: newPassword, role: newRole });
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setCreating(false);
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <section className="panel user-mgmt-panel">
      <div className="panel-heading-inline">
        <div>
          <p className="eyebrow">Administration</p>
          <h2>User accounts</h2>
          <p className="panel-copy">Manage technician and admin access, roles, and credentials.</p>
        </div>
        <div className="panel-heading-actions">
          {!creating && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} type="button">
              + Add user
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={loadUsers} type="button">
            Refresh
          </button>
        </div>
      </div>

      {creating && (
        <form className="create-job-form stack-form" onSubmit={handleCreate}>
          <div className="form-grid">
            <label>
              <span>First Name</span>
              <input
                autoFocus
                placeholder="Maria"
                required
                type="text"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
              />
            </label>
            <label>
              <span>Last Name</span>
              <input
                placeholder="Garcia"
                required
                type="text"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
              />
            </label>
            <label>
              <span>Email address</span>
              <input
                placeholder="technician@example.local"
                required
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </label>
            <label>
              <span>Password <span className="field-hint">min. 8 characters</span></span>
              <input
                minLength={8}
                placeholder="Temporary password"
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              <span>Role</span>
              <select className="select-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="user">User — technician</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          {createError && <p className="form-error">{createError}</p>}
          <div className="form-actions">
            <button className="btn btn-primary btn-sm" disabled={createLoading} type="submit">
              {createLoading ? 'Creating…' : 'Create user'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setCreating(false); setCreateError(null); }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {actionError && <p className="form-error">{actionError}</p>}
      {loading && <p className="panel-copy">Loading users…</p>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && users.length > 0 && (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{formatUserDisplayName(user)}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${user.disabled ? 'badge-disabled' : 'badge-active'}`}>
                      {user.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {new Date(user.createdAt).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onOpenProfile(user.id)}
                        type="button"
                      >
                        Profile
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleRole(user)}
                        type="button"
                      >
                        Make {user.role === 'admin' ? 'user' : 'admin'}
                      </button>
                      <button
                        className={`btn btn-sm ${user.disabled ? 'btn-ghost' : 'btn-danger'}`}
                        onClick={() => toggleDisabled(user)}
                        type="button"
                      >
                        {user.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="panel-copy">No users found.</p>
      )}
    </section>
  );
}
