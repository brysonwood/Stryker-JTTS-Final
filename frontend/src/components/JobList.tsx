import React, { useEffect, useMemo, useState } from 'react';
import { listUsers, updateJob } from '../lib/api';
import { formatUserDisplayName } from '../lib/userDisplay';
import type { JobSummary, SessionUser, UserRecord } from '../types';
import CreateJobForm from './CreateJobForm';

type JobListProps = {
  currentUser: SessionUser;
  jobs: JobSummary[];
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  selectedJobId: number | null;
  token: string;
  onSelect: (jobId: number) => void;
  onOpenProfile: (userId: number) => void;
  onRefresh: () => Promise<void>;
};

function fmtStatus(value: string) {
  // Convert db status (e.g., 'in_progress') to display format (e.g., 'In Progress').
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function orderJobs(jobs: JobSummary[]) {
  // Sort jobs by priority first, then by ID for stable ordering.
  return [...jobs].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

export default function JobList({ currentUser, jobs, loading, error, isAdmin, selectedJobId, token, onSelect, onOpenProfile, onRefresh }: JobListProps) {
  // UI state: job creation modal, queue filtering, expanded job columns.
  const [creating, setCreating] = useState(false);
  // Queue filter: 'all' (admin), 'available', 'assigned_to_me', 'unassigned'.
  const [queueFilter, setQueueFilter] = useState<string>(isAdmin ? 'all' : 'available');
  // Track which job cards are expanded to show additional details.
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  // Technician list: loaded for assignment dropdowns (admin only).
  const [techUsers, setTechUsers] = useState<UserRecord[]>([]);
  // Draft assignment values: track unsaved assignment changes per job.
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  // Loading/error state for assignment operation.
  const [assignBusyJobId, setAssignBusyJobId] = useState<number | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Clear expanded state when filter changes.
  useEffect(() => {
    setExpandedColumns({});
  }, [queueFilter]);

  // Load technician list for assignment dropdown (admin only); cleanup on unmount/token change.
  useEffect(() => {
    if (!isAdmin) {
      setTechUsers([]);
      return;
    }
    let cancelled = false;
    // Fetch all users and filter to active technicians (role='user', not disabled).
    listUsers(token)
      .then((response) => {
        if (cancelled) return;
        setTechUsers(response.users.filter((user) => user.role === 'user' && !user.disabled));
      })
      .catch((loadError) => {
        if (cancelled) return;
        setAssignError(loadError instanceof Error ? loadError.message : 'Failed to load technicians');
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  // Close create form after successful job creation and refresh parent jobs list.
  async function handleCreated() {
    setCreating(false);
    await onRefresh();
  }

  // Apply job assignment change: call updateJob API then refresh job list.
  async function applyAssignment(jobId: number, assignedToId: number | null) {
    setAssignBusyJobId(jobId);
    setAssignError(null);
    try {
      // Update job with new assignee (null = unassigned).
      await updateJob(token, jobId, { assignedToId });
      // Refresh parent's job list to reflect change.
      await onRefresh();
    } catch (assignmentError) {
      setAssignError(assignmentError instanceof Error ? assignmentError.message : 'Failed to update assignment');
    } finally {
      setAssignBusyJobId(null);
    }
  }

  const baseJobs = useMemo(() => {
    if (queueFilter === 'all') return jobs;
    if (queueFilter === 'mine') return jobs.filter((job) => job.assignedTo?.id === currentUser.id);
    if (queueFilter === 'unassigned') return jobs.filter((job) => !job.assignedTo);
    if (queueFilter === 'high') return jobs.filter((job) => job.priority <= 2);
    return jobs.filter((job) => job.assignedTo?.id === currentUser.id || !job.assignedTo);
  }, [currentUser.id, jobs, queueFilter]);

  const columns = useMemo(() => ([
    { key: 'open', label: 'Open', items: orderJobs(baseJobs.filter((job) => job.status === 'open')) },
    { key: 'in_progress', label: 'In Progress', items: orderJobs(baseJobs.filter((job) => job.status === 'in_progress')) },
    { key: 'complete', label: 'Complete', items: orderJobs(baseJobs.filter((job) => job.status === 'complete')) },
    { key: 'cancelled', label: 'Cancelled', items: orderJobs(baseJobs.filter((job) => job.status === 'cancelled')) },
  ]), [baseJobs]);

  return (
    <section className="panel jobs-panel jobs-panel--board">
      <div className="panel-heading panel-heading-inline">
        <div>
          <p className="eyebrow">Queue</p>
          <h2>{isAdmin ? 'Dispatch Board' : 'My Field Board'}</h2>
          <p className="panel-copy">
            {isAdmin ? 'Work is organized like a board so dispatchers can triage by status and priority.' : 'Focus on work assigned to you plus unassigned jobs you can pick up next.'}
          </p>
        </div>
        <div className="panel-heading-actions">
          {!creating && isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)} type="button">
              + New job
            </button>
          ) : null}
          {!creating ? (
            <button className="btn btn-ghost btn-sm" onClick={() => onRefresh()} type="button">
              Refresh
            </button>
          ) : null}
        </div>
      </div>

      {creating ? (
        <CreateJobForm onCancel={() => setCreating(false)} onCreated={handleCreated} token={token} />
      ) : null}

      {!creating ? (
        <div className="queue-toolbar">
          <div className="queue-filters">
            <button className={`filter-pill ${queueFilter === (isAdmin ? 'all' : 'available') ? 'filter-pill--active' : ''}`} onClick={() => setQueueFilter(isAdmin ? 'all' : 'available')} type="button">
              {isAdmin ? 'All jobs' : 'Available to me'}
            </button>
            <button className={`filter-pill ${queueFilter === 'mine' ? 'filter-pill--active' : ''}`} onClick={() => setQueueFilter('mine')} type="button">
              My jobs
            </button>
            <button className={`filter-pill ${queueFilter === 'unassigned' ? 'filter-pill--active' : ''}`} onClick={() => setQueueFilter('unassigned')} type="button">
              Unassigned
            </button>
            <button className={`filter-pill ${queueFilter === 'high' ? 'filter-pill--active' : ''}`} onClick={() => setQueueFilter('high')} type="button">
              P1 / P2
            </button>
          </div>
          <div className="queue-toolbar__summary">{baseJobs.length} visible jobs</div>
        </div>
      ) : null}

      {loading ? <p className="panel-copy">Loading jobs...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {assignError ? <p className="form-error">{assignError}</p> : null}
      {!loading && baseJobs.length === 0 && !creating ? <p className="panel-copy">No jobs match the current queue filter.</p> : null}

      <div className="board-grid">
        {columns.map((column) => (
          <section className="board-column" key={column.key}>
            <div className="board-column__header">
              <div>
                <h3>{column.label}</h3>
                <p>{column.items.length} jobs</p>
              </div>
            </div>

            <div className="board-column__cards">
              {column.items.length === 0 ? <div className="board-empty">No jobs</div> : null}
              {(expandedColumns[column.key] ? column.items : column.items.slice(0, 10)).map((job) => {
                const isSelected = job.id === selectedJobId;
                const draftValue = assignmentDrafts[job.id] ?? (job.assignedTo?.id ? String(job.assignedTo.id) : '');
                const isSelfAssigned = job.assignedTo?.id === currentUser.id;
                const isUnassigned = !job.assignedTo;
                const busy = assignBusyJobId === job.id;
                const assignedUser = job.assignedTo;
                const assignedToId = assignedUser?.id;

                return (
                  <article className={`job-card board-card ${isSelected ? 'job-card--active' : ''}`} key={job.id}>
                    <button className="job-card__open" onClick={() => onSelect(job.id)} type="button">
                      <div className="job-card__topline">
                        <span className={`priority-chip p${job.priority}`}>P{job.priority}</span>
                        <span className={`status-chip status-${job.status}`}>{fmtStatus(job.status)}</span>
                      </div>

                      <h3>{job.description}</h3>
                      <p>{job.customer?.name || 'Unassigned customer'}</p>

                      <dl className="job-metadata">
                        <div>
                          <dt>Tasks</dt>
                          <dd>{job.tasks.length}</dd>
                        </div>
                        <div>
                          <dt>Assigned</dt>
                          <dd>{job.assignedTo ? formatUserDisplayName(job.assignedTo, 'Unknown User', 'compact') : 'Unassigned'}</dd>
                        </div>
                      </dl>
                    </button>

                    {isAdmin ? (
                      <div className="job-card__actions" onClick={(event) => event.stopPropagation()}>
                        <label className="job-card__assign-label" htmlFor={`assign-${job.id}`}>Assign</label>
                        <div className="job-card__assign-row">
                          <select
                            className="select-input job-card__select"
                            id={`assign-${job.id}`}
                            onChange={(event) => {
                              setAssignmentDrafts((current) => ({ ...current, [job.id]: event.target.value }));
                            }}
                            value={draftValue}
                          >
                            <option value="">Unassigned</option>
                            {techUsers.map((user) => (
                              <option key={user.id} value={user.id}>{formatUserDisplayName(user)}</option>
                            ))}
                          </select>
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => applyAssignment(job.id, draftValue ? Number(draftValue) : null)}
                            type="button"
                          >
                            {busy ? 'Saving...' : 'Apply'}
                          </button>
                        </div>
                        {assignedToId != null && (isAdmin || assignedToId === currentUser.id) ? (
                          <button className="btn btn-link" onClick={() => onOpenProfile(assignedToId)} type="button">
                            View profile
                          </button>
                        ) : null}
                        {assignedUser ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => applyAssignment(job.id, null)}
                            type="button"
                          >
                            {busy ? 'Saving...' : 'Unassign'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {!isAdmin ? (
                      <div className="job-card__actions" onClick={(event) => event.stopPropagation()}>
                        {isUnassigned ? (
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={busy}
                            onClick={() => applyAssignment(job.id, currentUser.id)}
                            type="button"
                          >
                            {busy ? 'Saving...' : 'Assign to me'}
                          </button>
                        ) : null}
                        {isSelfAssigned ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={busy}
                            onClick={() => applyAssignment(job.id, null)}
                            type="button"
                          >
                            {busy ? 'Saving...' : 'Unassign me'}
                          </button>
                        ) : null}
                        {assignedToId != null && assignedToId === currentUser.id ? (
                          <button className="btn btn-link" onClick={() => onOpenProfile(assignedToId)} type="button">
                            View profile
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {column.items.length > 10 ? (
              <div className="board-column__footer">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setExpandedColumns((current) => ({
                      ...current,
                      [column.key]: !current[column.key],
                    }));
                  }}
                  type="button"
                >
                  {expandedColumns[column.key] ? 'Show less' : `Show all ${column.items.length}`}
                </button>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  );
}
