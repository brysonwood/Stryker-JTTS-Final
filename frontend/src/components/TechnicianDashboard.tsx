import React, { useState, useMemo } from 'react';
import { updateJob } from '../lib/api';
import type { JobSummary, SessionUser } from '../types';

type Props = {
  jobs: JobSummary[];
  loading: boolean;
  error: string | null;
  onOpenJob: (jobId: number) => void;
  onRefresh: () => Promise<void>;
  token: string;
  user: SessionUser;
};

function fmtStatus(value: string) {
  // Convert db status (e.g., 'in_progress') to display format (e.g., 'In Progress').
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function orderJobs(jobs: JobSummary[]) {
  // Sort jobs by priority first, then by ID for stable ordering.
  return [...jobs].sort((a, b) => a.priority - b.priority || a.id - b.id);
}

export default function TechnicianDashboard({ jobs, loading, error, onOpenJob, onRefresh, token, user }: Props) {
  // Assignment state: busy flag and error handling.
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignBusyJobId, setAssignBusyJobId] = useState<number | null>(null);
  // Reassign a job (unassign from self if assignedToId is null).
  async function applyAssignment(jobId: number, assignedToId: number | null) {
    setAssignBusyJobId(jobId);
    setAssignmentError(null);
    try {
      // Update job assignment and refresh parent list.
      await updateJob(token, jobId, { assignedToId });
      await onRefresh();
    } catch (assignmentErr) {
      setAssignmentError(assignmentErr instanceof Error ? assignmentErr.message : 'Failed to update assignment');
    } finally {
      setAssignBusyJobId(null);
    }
  }
  // Job views: assigned to me (active), unassigned (available), recently completed (last 5).
  const assignedJobs = useMemo(
    () => orderJobs(jobs.filter((job) => job.assignedTo?.id === user.id && job.status !== 'complete')),
    [jobs, user.id],
  );
  const unassignedJobs = useMemo(
    () => orderJobs(jobs.filter((job) => !job.assignedTo && job.status !== 'complete')),
    [jobs],
  );
  const recentlyCompleted = useMemo(
    () => orderJobs(jobs.filter((job) => job.assignedTo?.id === user.id && job.status === 'complete')).slice(0, 5),
    [jobs, user.id],
  );

  return (
    <section className="panel admin-panel">
      <div className="panel-heading-inline">
        <div>
          <p className="eyebrow">My Work</p>
          <h2>Technician Dashboard</h2>
          <p className="panel-copy">Assigned work comes first, followed by unassigned backlog you can pull next.</p>
        </div>
      </div>

      <div className="metric-strip admin-metrics">
        <article>
          <span>Assigned</span>
          <strong>{assignedJobs.length}</strong>
        </article>
        <article>
          <span>Unassigned queue</span>
          <strong>{unassignedJobs.length}</strong>
        </article>
        <article>
          <span>Completed by me</span>
          <strong>{recentlyCompleted.length}</strong>
        </article>
        <article>
          <span>High priority</span>
          <strong>{assignedJobs.filter((job) => job.priority <= 2).length}</strong>
        </article>
      </div>

      {loading ? <p className="panel-copy">Loading your work board...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {assignmentError ? <p className="form-error">{assignmentError}</p> : null}

      <div className="tech-dashboard-grid">
        <section className="tech-lane">
          <div className="tech-lane__header">
            <div>
              <h3>Assigned to Me</h3>
              <p className="panel-copy">Work currently in your lane.</p>
            </div>
          </div>
          <div className="tech-list">
            {assignedJobs.length === 0 ? <div className="board-empty">No assigned work.</div> : null}
            {assignedJobs.map((job) => (
              <article className="job-card board-card" key={job.id}>
                <button className="job-card__open" onClick={() => onOpenJob(job.id)} type="button">
                  <div className="job-card__topline">
                    <span className={`priority-chip p${job.priority}`}>P{job.priority}</span>
                    <span className={`status-chip status-${job.status}`}>{fmtStatus(job.status)}</span>
                  </div>
                  <h3>{job.description}</h3>
                  <p>{job.customer.name}</p>
                  <dl className="job-metadata">
                    <div>
                      <dt>Tasks</dt>
                      <dd>{job.tasks.length}</dd>
                    </div>
                    <div>
                      <dt>Estimate</dt>
                      <dd>{job.estimatedHours ? `${job.estimatedHours}h` : '—'}</dd>
                    </div>
                  </dl>
                </button>
                <div className="job-card__actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={assignBusyJobId === job.id}
                    onClick={() => applyAssignment(job.id, null)}
                    type="button"
                  >
                    {assignBusyJobId === job.id ? 'Saving...' : 'Unassign me'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="tech-lane">
          <div className="tech-lane__header">
            <div>
              <h3>Unassigned Queue</h3>
              <p className="panel-copy">Available work ready to be picked up.</p>
            </div>
          </div>
          <div className="tech-list">
            {unassignedJobs.length === 0 ? <div className="board-empty">No unassigned jobs.</div> : null}
            {unassignedJobs.map((job) => (
              <article className="job-card board-card" key={job.id}>
                <button className="job-card__open" onClick={() => onOpenJob(job.id)} type="button">
                  <div className="job-card__topline">
                    <span className={`priority-chip p${job.priority}`}>P{job.priority}</span>
                    <span className={`status-chip status-${job.status}`}>{fmtStatus(job.status)}</span>
                  </div>
                  <h3>{job.description}</h3>
                  <p>{job.customer.name}</p>
                  <dl className="job-metadata">
                    <div>
                      <dt>Tasks</dt>
                      <dd>{job.tasks.length}</dd>
                    </div>
                    <div>
                      <dt>Assigned</dt>
                      <dd>Unassigned</dd>
                    </div>
                  </dl>
                </button>
                <div className="job-card__actions">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={assignBusyJobId === job.id}
                    onClick={() => applyAssignment(job.id, user.id)}
                    type="button"
                  >
                    {assignBusyJobId === job.id ? 'Saving...' : 'Assign to me'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}