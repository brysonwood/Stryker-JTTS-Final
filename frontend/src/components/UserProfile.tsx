import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { fetchUserProfile, updateUserProfile } from '../lib/api';
import { formatUserDisplayName } from '../lib/userDisplay';
import type { SessionUser, UserProfileResponse, UserRecord } from '../types';

type Props = {
  token: string;
  userId: number;
  currentUser: SessionUser;
  isAdmin: boolean;
  onOpenJob: (jobId: number) => void;
  onOpenProfile: (userId: number) => void;
  onCurrentUserUpdated: (user: SessionUser) => void;
};

function formatDate(value?: string | null) {
  // Format timestamp text.
  if (!value) return 'Never';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDuration(minutes: number) {
  // Format minutes text.
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (!hours) return `${remaining}m`;
  return `${hours}h ${remaining}m`;
}

export default function UserProfile({ token, userId, currentUser, isAdmin, onOpenJob, onOpenProfile, onCurrentUserUpdated }: Props) {
  // Profile response state.
  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Profile edit state.
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [disabled, setDisabled] = useState(false);
  // Save request state.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  // Check edit permissions.
  const canEditProfile = isAdmin || currentUser.id === userId;
  const viewingSelf = currentUser.id === userId;

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const profile = await fetchUserProfile(token, userId);
      setData(profile);
      setFirstName(profile.profile.firstName);
      setLastName(profile.profile.lastName);
      setEmail(profile.profile.email);
      setRole(profile.profile.role);
      setDisabled(Boolean(profile.profile.disabled));
      setPassword('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load profile');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, [token, userId]);

  const headerName = useMemo(() => formatUserDisplayName(data?.profile), [data?.profile]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditProfile || !data) return;

    // Build minimal update payload so unchanged fields are skipped.
    const payload: {
      firstName?: string;
      lastName?: string;
      email?: string;
      password?: string;
      role?: string;
      disabled?: boolean;
    } = {};

    if (firstName.trim() && firstName.trim() !== data.profile.firstName) payload.firstName = firstName.trim();
    if (lastName.trim() && lastName.trim() !== data.profile.lastName) payload.lastName = lastName.trim();
    if (email.trim() && email.trim().toLowerCase() !== data.profile.email.toLowerCase()) payload.email = email.trim();
    if (password.trim()) payload.password = password.trim();

    if (isAdmin) {
      if (role !== data.profile.role) payload.role = role;
      if (disabled !== Boolean(data.profile.disabled)) payload.disabled = disabled;
    }

    if (!Object.keys(payload).length) {
      setSaveStatus('No changes to save');
      window.setTimeout(() => setSaveStatus(null), 1800);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const response = await updateUserProfile(token, userId, payload);
      setPassword('');
      setSaveStatus('Profile updated');
      window.setTimeout(() => setSaveStatus(null), 2000);
      await loadProfile();

      if (response.user.id === currentUser.id) {
        onCurrentUserUpdated({
          ...currentUser,
          firstName: response.user.firstName,
          lastName: response.user.lastName,
          email: response.user.email,
          role: response.user.role,
        });
      }
    } catch (updateError) {
      setSaveError(updateError instanceof Error ? updateError.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel profile-panel">
      <div className="panel-heading panel-heading-inline">
        <div>
          <p className="eyebrow">User Profile</p>
          <h2>{headerName}</h2>
          <p className="panel-copy">
            {viewingSelf
              ? 'Your account and work performance snapshot.'
              : 'Technician profile, workload snapshot, and account controls.'}
          </p>
        </div>
      </div>

      {loading ? <p className="panel-copy">Loading profile...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {data ? (
        <>
          <div className="metric-strip profile-metrics">
            <article><span>Assigned jobs</span><strong>{data.stats.assignedJobs}</strong></article>
            <article><span>Open</span><strong>{data.stats.openJobs}</strong></article>
            <article><span>In progress</span><strong>{data.stats.inProgressJobs}</strong></article>
            <article><span>Completed</span><strong>{data.stats.completedJobs}</strong></article>
            <article><span>Logged hours</span><strong>{data.stats.loggedHours.toFixed(2)}h</strong></article>
            <article><span>Billable hours</span><strong>{data.stats.billableHours.toFixed(2)}h</strong></article>
            <article><span>Last activity</span><strong>{formatDate(data.stats.lastEntryAt)}</strong></article>
            <article><span>Role</span><strong>{data.profile.role}</strong></article>
          </div>

          <section className="detail-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Account Settings</p>
                <h3>Edit Profile</h3>
              </div>
            </div>

            {canEditProfile ? (
              <form className="create-job-form stack-form" onSubmit={handleSave}>
                <div className="form-grid">
                  <label>
                    <span>First Name</span>
                    <input required type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
                  </label>
                  <label>
                    <span>Last Name</span>
                    <input required type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                  </label>
                  <label>
                    <span>Email</span>
                    <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label>
                    <span>New Password <span className="field-hint">optional, min 8 chars</span></span>
                    <input minLength={8} placeholder="Leave blank to keep current" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                  </label>
                  {isAdmin ? (
                    <label>
                      <span>Role</span>
                      <select className="select-input" value={role} onChange={(event) => setRole(event.target.value)}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  ) : null}
                  {isAdmin ? (
                    <label className="checkbox-row">
                      <input checked={disabled} onChange={(event) => setDisabled(event.target.checked)} type="checkbox" />
                      <span>Disable account</span>
                    </label>
                  ) : null}
                </div>
                {saveError ? <p className="form-error">{saveError}</p> : null}
                {saveStatus ? <p className="status-note">{saveStatus}</p> : null}
                <div className="form-actions">
                  <button className="btn btn-primary btn-sm" disabled={saving} type="submit">
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="panel-copy">You can view this profile but only admins or the account owner can edit it.</p>
            )}
          </section>

          <div className="profile-grid">
            <section className="detail-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Assigned Work</p>
                  <h3>Recent Assigned Jobs</h3>
                </div>
              </div>
              {data.recentAssignedJobs.length === 0 ? (
                <p className="panel-copy">No assigned jobs found.</p>
              ) : (
                <div className="record-list">
                  {data.recentAssignedJobs.map((job) => (
                    <article className="record-card" key={`assigned-${job.id}`}>
                      <div className="record-card__title">
                        <strong>{job.label}</strong>
                        <button className="btn btn-link" onClick={() => onOpenJob(job.id)} type="button">Open job</button>
                      </div>
                      <p>{job.customer}</p>
                      <div className="record-card__meta">
                        <span className={`status-chip status-${job.status}`}>{job.status.replace(/_/g, ' ')}</span>
                        <span className={`priority-chip p${job.priority}`}>P{job.priority}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="detail-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Time Activity</p>
                  <h3>Recent Entries</h3>
                </div>
              </div>
              {data.recentEntries.length === 0 ? (
                <p className="panel-copy">No time entries in the current profile scope.</p>
              ) : (
                <div className="record-list">
                  {data.recentEntries.map((entry) => (
                    <article className="record-card" key={`entry-${entry.id}`}>
                      <div className="record-card__title">
                        <strong>{entry.jobLabel}</strong>
                        {entry.jobId ? (
                          <button className="btn btn-link" onClick={() => onOpenJob(entry.jobId || 0)} type="button">Open job</button>
                        ) : null}
                      </div>
                      <p>{entry.customer}</p>
                      <div className="record-card__meta">
                        <span>{formatDate(entry.start)}</span>
                        <span>{formatDuration(entry.duration)}</span>
                        <span>{entry.billable ? 'Billable' : 'Non-billable'}</span>
                      </div>
                      {entry.notes ? <p className="panel-copy">{entry.notes}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>

          {isAdmin && data.workedJobs.length > 0 ? (
            <section className="detail-section detail-section--compact">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Quick Navigation</p>
                  <h3>Worked Jobs</h3>
                </div>
              </div>
              <div className="record-card__meta">
                {data.workedJobs.map((job) => (
                  <button className="btn btn-ghost btn-sm" key={`worked-${job.id}`} onClick={() => onOpenJob(job.id)} type="button">
                    {job.label}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {isAdmin && !viewingSelf ? (
            <section className="detail-section detail-section--compact">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Admin Shortcut</p>
                  <h3>Switch Profiles</h3>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onOpenProfile(currentUser.id)} type="button">
                Back to My Profile
              </button>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
