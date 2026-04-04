import React, { FormEvent, useEffect, useState } from 'react';
import { createTask, deletePhoto, downloadInvoiceDraft, fetchMediaLink, listUsers, updateJob, updateTask } from '../lib/api';
import { formatUserDisplayName } from '../lib/userDisplay';
import type { JobDetailRecord, SessionUser, TaskRecord, UserRecord } from '../types';
import PartsForm from './PartsForm';
import PhotoUploader from './PhotoUploader';
import TimeEntryForm from './TimeEntryForm';

type JobDetailProps = {
  job: JobDetailRecord | null;
  loading: boolean;
  error: string | null;
  token: string;
  onRefresh: () => Promise<void>;
  onBackToBoard?: () => void;
  onOpenProfile: (userId: number) => void;
  currentUser: SessionUser;
  isAdmin?: boolean;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fmtStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function JobDetail({ job, loading, error, token, onRefresh, onBackToBoard, onOpenProfile, currentUser, isAdmin = false }: JobDetailProps) {
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [techUsers, setTechUsers] = useState<UserRecord[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState('');
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState<number | null>(null);

  // Edit state.
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editEstHours, setEditEstHours] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // New task state.
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskHrs, setNewTaskHrs] = useState('');
  const [addingTaskLoading, setAddingTaskLoading] = useState(false);
  const [addTaskError, setAddTaskError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskDesc, setEditTaskDesc] = useState('');
  const [editTaskHrs, setEditTaskHrs] = useState('');
  const [editingTaskBusy, setEditingTaskBusy] = useState(false);
  const [editTaskError, setEditTaskError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setAssignmentDraft(job.assignedTo?.id ? String(job.assignedTo.id) : '');
  }, [job?.assignedTo?.id, job?.id]);

  useEffect(() => {
    if (!isAdmin) {
      setTechUsers([]);
      return;
    }

    let cancelled = false;
    listUsers(token)
      .then((response) => {
        if (!cancelled) {
          setTechUsers(response.users.filter((user) => user.role === 'user' && !user.disabled));
        }
      })
      .catch((usersError) => {
        if (!cancelled) {
          setAssignmentError(usersError instanceof Error ? usersError.message : 'Failed to load technicians');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  function openEditForm() {
    if (!job) return;
    setEditStatus(job.status);
    setEditPriority(String(job.priority));
    setEditEstHours(job.estimatedHours ? String(job.estimatedHours) : '');
    setUpdateError(null);
    setEditing(true);
  }

  async function handleUpdateJob(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!job) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      await updateJob(token, job.id, {
        status: editStatus,
        priority: Number(editPriority),
        estimatedHours: editEstHours ? Number(editEstHours) : undefined,
      });
      setEditing(false);
      await onRefresh();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update job');
    } finally {
      setUpdating(false);
    }
  }

  async function applyAssignment(assignedToId: number | null) {
    if (!job) return;
    setAssignmentBusy(true);
    setAssignmentError(null);
    try {
      await updateJob(token, job.id, { assignedToId });
      await onRefresh();
    } catch (assignError) {
      setAssignmentError(assignError instanceof Error ? assignError.message : 'Failed to update assignment');
    } finally {
      setAssignmentBusy(false);
    }
  }

  async function copyShareLink() {
    if (!job) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?job=${job.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('Link copied');
      window.setTimeout(() => setShareStatus(null), 2000);
    } catch {
      setShareStatus(shareUrl);
    }
  }

  async function handleToggleTask(task: TaskRecord) {
    if (!job) return;
    const nextStatus = task.status === 'complete' ? 'open' : 'complete';
    try {
      await updateTask(token, job.id, task.id, { status: nextStatus });
      await onRefresh();
    } catch {
      // Ignore transient errors.
    }
  }

  function beginTaskEdit(task: TaskRecord) {
    setEditingTaskId(task.id);
    setEditTaskDesc(task.description);
    setEditTaskHrs(task.estimatedHrs ? String(task.estimatedHrs) : '');
    setEditTaskError(null);
  }

  function cancelTaskEdit() {
    setEditingTaskId(null);
    setEditTaskDesc('');
    setEditTaskHrs('');
    setEditTaskError(null);
  }

  async function saveTaskEdit(task: TaskRecord) {
    if (!job || !editTaskDesc.trim()) return;
    setEditingTaskBusy(true);
    setEditTaskError(null);
    try {
      await updateTask(token, job.id, task.id, {
        description: editTaskDesc.trim(),
        estimatedHrs: editTaskHrs ? Number(editTaskHrs) : undefined,
      });
      cancelTaskEdit();
      await onRefresh();
    } catch (taskError) {
      setEditTaskError(taskError instanceof Error ? taskError.message : 'Failed to update task');
    } finally {
      setEditingTaskBusy(false);
    }
  }

  async function handleAddTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!job || !newTaskDesc.trim()) return;
    setAddingTaskLoading(true);
    setAddTaskError(null);
    try {
      await createTask(token, job.id, {
        description: newTaskDesc.trim(),
        estimatedHrs: newTaskHrs ? Number(newTaskHrs) : undefined,
      });
      setNewTaskDesc('');
      setNewTaskHrs('');
      setAddingTask(false);
      await onRefresh();
    } catch (err) {
      setAddTaskError(err instanceof Error ? err.message : 'Failed to add task');
    } finally {
      setAddingTaskLoading(false);
    }
  }

  async function exportDraft(format: 'json' | 'csv') {
    if (!job) return;
    setExportError(null);
    setExporting(true);
    try {
      const { blob, filename } = await downloadInvoiceDraft(token, { format, jobId: job.id });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export invoice draft');
    } finally {
      setExporting(false);
    }
  }

  async function openPhoto(photoId: number) {
    setMediaError(null);
    try {
      const response = await fetchMediaLink(token, photoId);
      window.open(response.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (linkError) {
      setMediaError(linkError instanceof Error ? linkError.message : 'Failed to open photo');
    }
  }

  async function handleDeletePhoto(photoId: number) {
    setDeletingPhotoId(photoId);
    setMediaError(null);
    try {
      await deletePhoto(token, photoId);
      await onRefresh();
    } catch (deleteError) {
      setMediaError(deleteError instanceof Error ? deleteError.message : 'Failed to delete photo');
    } finally {
      setDeletingPhotoId(null);
    }
  }

  if (loading) {
    return <section className="panel detail-panel"><p className="panel-copy">Loading selected job…</p></section>;
  }

  if (error) {
    return <section className="panel detail-panel"><p className="form-error">{error}</p></section>;
  }

  if (!job) {
    return (
      <section className="panel detail-panel empty-state">
        <p className="eyebrow">Job Detail</p>
        <h2>Select a job</h2>
        <p className="panel-copy">Choose a job from the queue to inspect tasks, labor, parts, and photos.</p>
      </section>
    );
  }

  const doneTasks = job.tasks.filter((t) => t.status === 'complete').length;
  const canOpenProfile = (userId: number) => isAdmin || userId === currentUser.id;
  const assignedUser = job.assignedTo;
  const assignedUserId = assignedUser?.id;

  return (
    <section className="panel detail-panel">
      {/* Header section. */}
      <div className="panel-heading detail-heading">
        <div>
          <p className="eyebrow">{job.customer?.name || 'No customer'}</p>
          <h2>{job.description}</h2>
          <p className="panel-copy">Created {formatDate(job.createdAt)}</p>
        </div>
        <div className="panel-heading-actions">
          {onBackToBoard ? (
            <button className="btn btn-ghost btn-sm" onClick={onBackToBoard} type="button">
              Back
            </button>
          ) : null}
          {!editing && (
            <button className="btn btn-primary btn-sm" onClick={openEditForm} type="button">
              Edit job
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => onRefresh()} type="button">
            Refresh
          </button>
          <button className="btn btn-ghost btn-sm" onClick={copyShareLink} type="button">
            Copy link
          </button>
        </div>
      </div>

      {shareStatus ? <p className="status-note">{shareStatus}</p> : null}

      <section className="detail-section detail-section--compact">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Assignment</p>
            <h3>Owner</h3>
          </div>
        </div>

        <div className="assignment-panel">
          <div className="assignment-panel__current">
            <span className="assignment-panel__label">Assignee</span>
            <strong className="assignment-panel__name">{assignedUser ? formatUserDisplayName(assignedUser) : 'Unassigned'}</strong>
            {assignedUserId != null && canOpenProfile(assignedUserId) ? (
              <button className="btn btn-primary btn-sm assignment-panel__profile-btn" onClick={() => onOpenProfile(assignedUserId)} type="button">
                View Assignee Profile
              </button>
            ) : null}
            {assignedUserId != null && !canOpenProfile(assignedUserId) ? (
              <p className="panel-copy">Only admins or the assignee can open this profile.</p>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="assignment-panel__controls">
              <span className="assignment-panel__label">Reassign job</span>
              <select className="select-input" onChange={(event) => setAssignmentDraft(event.target.value)} value={assignmentDraft}>
                <option value="">Unassigned</option>
                {techUsers.map((user) => (
                  <option key={user.id} value={user.id}>{formatUserDisplayName(user)}</option>
                ))}
              </select>
              <div className="form-actions">
                <button className="btn btn-primary btn-sm" disabled={assignmentBusy} onClick={() => applyAssignment(assignmentDraft ? Number(assignmentDraft) : null)} type="button">
                  {assignmentBusy ? 'Saving...' : 'Apply assignment'}
                </button>
                {job.assignedTo ? (
                  <button className="btn btn-ghost btn-sm" disabled={assignmentBusy} onClick={() => applyAssignment(null)} type="button">
                    {assignmentBusy ? 'Saving...' : 'Unassign'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!isAdmin ? (
            <div className="assignment-panel__controls">
              <span className="assignment-panel__label">My assignment actions</span>
              {!job.assignedTo ? (
                <button className="btn btn-primary btn-sm" disabled={assignmentBusy} onClick={() => applyAssignment(currentUser.id)} type="button">
                  {assignmentBusy ? 'Saving...' : 'Assign to me'}
                </button>
              ) : null}
              {job.assignedTo?.id === currentUser.id ? (
                <button className="btn btn-ghost btn-sm" disabled={assignmentBusy} onClick={() => applyAssignment(null)} type="button">
                  {assignmentBusy ? 'Saving...' : 'Unassign me'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {assignmentError ? <p className="form-error">{assignmentError}</p> : null}
      </section>

      {/* Inline edit form. */}
      {editing && (
        <form className="edit-job-form" onSubmit={handleUpdateJob}>
          <h4>Edit job details</h4>
          <div className="form-grid">
            <label>
              <span>Status</span>
              <select
                className="select-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                className="select-input"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
              >
                <option value="1">P1 — Critical</option>
                <option value="2">P2 — High</option>
                <option value="3">P3 — Normal</option>
                <option value="4">P4 — Low</option>
                <option value="5">P5 — Minimal</option>
              </select>
            </label>
            <label>
              <span>Estimated hours</span>
              <input
                min="0"
                placeholder="e.g. 8"
                step="0.5"
                type="number"
                value={editEstHours}
                onChange={(e) => setEditEstHours(e.target.value)}
              />
            </label>
          </div>
          {updateError && <p className="form-error">{updateError}</p>}
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" disabled={updating} type="submit">
              {updating ? 'Saving…' : 'Save changes'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Summary metrics row. */}
      <div className="metric-strip">
        <article>
          <span>Status</span>
          <strong>
            <span className={`status-chip status-${job.status}`}>{fmtStatus(job.status)}</span>
          </strong>
        </article>
        <article>
          <span>Priority</span>
          <strong>
            <span className={`priority-chip p${job.priority}`}>P{job.priority}</span>
          </strong>
        </article>
        <article>
          <span>Assigned to</span>
          <strong>{job.assignedTo ? formatUserDisplayName(job.assignedTo) : 'Unassigned'}</strong>
        </article>
        <article>
          <span>Est. hours</span>
          <strong>{job.estimatedHours ? `${job.estimatedHours}h` : '—'}</strong>
        </article>
      </div>

      {/* Task section. */}
      <section className="detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Scope</p>
            <h3>Tasks {job.tasks.length > 0 ? `(${doneTasks}/${job.tasks.length} done)` : ''}</h3>
          </div>
        </div>

        <div className="record-list">
          {job.tasks.map((task) => (
            <div className={`task-row${task.status === 'complete' ? ' task-row--done' : ''}`} key={task.id}>
              <button
                aria-label={task.status === 'complete' ? 'Reopen task' : 'Mark complete'}
                className={`task-row__toggle${task.status === 'complete' ? ' task-row__toggle--done' : ''}`}
                disabled={editingTaskBusy}
                onClick={() => handleToggleTask(task)}
                type="button"
              >
                {task.status === 'complete' ? '✓' : ''}
              </button>
              <div className="task-row__body">
                {editingTaskId === task.id ? (
                  <div className="task-edit-inline">
                    <input
                      className="select-input"
                      onChange={(event) => setEditTaskDesc(event.target.value)}
                      placeholder="Task description"
                      type="text"
                      value={editTaskDesc}
                    />
                    <input
                      className="select-input task-edit-inline__hrs"
                      min="0"
                      onChange={(event) => setEditTaskHrs(event.target.value)}
                      placeholder="Hrs"
                      step="0.5"
                      type="number"
                      value={editTaskHrs}
                    />
                  </div>
                ) : (
                  <>
                    <p className="task-row__name">{task.description}</p>
                    {task.estimatedHrs ? (
                      <p className="task-row__meta">{task.estimatedHrs}h estimated</p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="task-row__actions">
                {editingTaskId === task.id ? (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={editingTaskBusy || !editTaskDesc.trim()}
                      onClick={() => saveTaskEdit(task)}
                      type="button"
                    >
                      {editingTaskBusy ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={editingTaskBusy} onClick={cancelTaskEdit} type="button">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => beginTaskEdit(task)} type="button">
                    Edit
                  </button>
                )}
                <span className={`status-chip status-${task.status}`}>{fmtStatus(task.status)}</span>
              </div>
            </div>
          ))}

          {editTaskError ? <p className="form-error">{editTaskError}</p> : null}

          {job.tasks.length === 0 && !addingTask && (
            <p className="panel-copy">No tasks attached yet.</p>
          )}
        </div>

        {addingTask ? (
          <form className="add-task-inline" onSubmit={handleAddTask}>
            <div className="add-task-row">
              <input
                autoFocus
                placeholder="Task description…"
                required
                type="text"
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
              />
              <input
                className="hrs-field"
                min="0"
                placeholder="Hrs"
                step="0.5"
                type="number"
                value={newTaskHrs}
                onChange={(e) => setNewTaskHrs(e.target.value)}
              />
              <button className="btn btn-primary btn-sm" disabled={addingTaskLoading} type="submit">
                {addingTaskLoading ? '…' : 'Add'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setAddingTask(false); setAddTaskError(null); }}
                type="button"
              >
                Cancel
              </button>
            </div>
            {addTaskError && <p className="form-error" style={{ marginTop: '0.4rem' }}>{addTaskError}</p>}
          </form>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setAddingTask(true)}
            style={{ marginTop: '0.6rem' }}
            type="button"
          >
            + Add task
          </button>
        )}
      </section>

      {/* Time section. */}
      <TimeEntryForm
        entries={job.timeEntries}
        jobId={job.id}
        onCreated={onRefresh}
        canOpenProfile={canOpenProfile}
        onOpenProfile={(userId) => {
          if (canOpenProfile(userId)) {
            onOpenProfile(userId);
          }
        }}
        token={token}
      />

      {/* Photo section. */}
      <PhotoUploader jobId={job.id} onUploaded={onRefresh} token={token} />

      <section className="detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Uploaded assets</p>
            <h3>Photos ({job.photos.length})</h3>
          </div>
        </div>

        {mediaError ? <p className="form-error">{mediaError}</p> : null}

        <div className="record-list">
          {job.photos.length ? (
            job.photos.map((photo) => (
              <article className="record-card" key={photo.id}>
                <div className="record-card__title">
                  <strong>{photo.mime}</strong>
                  <div className="record-card__meta">
                    <button className="btn btn-link" onClick={() => openPhoto(photo.id)} type="button">
                      Open signed URL
                    </button>
                    {isAdmin || photo.uploaderId === currentUser.id ? (
                      <button
                        className="btn btn-link"
                        disabled={deletingPhotoId === photo.id}
                        onClick={() => handleDeletePhoto(photo.id)}
                        type="button"
                      >
                        {deletingPhotoId === photo.id ? 'Removing...' : 'Delete photo'}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p>{photo.key}</p>
                <div className="record-card__meta">
                  {photo.uploader && canOpenProfile(photo.uploaderId) ? (
                    <button className="btn btn-link" onClick={() => onOpenProfile(photo.uploaderId)} type="button">
                      {formatUserDisplayName(photo.uploader)}
                    </button>
                  ) : (
                    <span>{`User #${photo.uploaderId}`}</span>
                  )}
                  <span>{formatDate(photo.createdAt)}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="panel-copy">No photos yet.</p>
          )}
        </div>
      </section>

      {/* Parts section. */}
      <PartsForm jobId={job.id} onSaved={onRefresh} parts={job.parts} token={token} />

      {/* Invoice section. */}
      <section className="detail-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Billing</p>
            <h3>Invoice draft</h3>
          </div>
        </div>
        <p className="panel-copy">Download a draft invoice for this job including parts, labor, and totals.</p>
        <div className="record-card__meta" style={{ marginTop: '0.75rem' }}>
          <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={() => exportDraft('json')} type="button">
            {exporting ? 'Exporting…' : 'Export JSON'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={() => exportDraft('csv')} type="button">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
        {exportError ? <p className="form-error">{exportError}</p> : null}
      </section>
    </section>
  );
}
