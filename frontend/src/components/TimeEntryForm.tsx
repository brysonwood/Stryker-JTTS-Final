import React, { FormEvent, useMemo, useState } from 'react';
import { createTimeEntry, deleteTimeEntry } from '../lib/api';
import { formatUserDisplayName } from '../lib/userDisplay';
import type { TimeEntryRecord } from '../types';

type TimeEntryFormProps = {
  entries: TimeEntryRecord[];
  jobId: number;
  token: string;
  onCreated: () => Promise<void>;
  onOpenProfile?: (userId: number) => void;
  canOpenProfile?: (userId: number) => boolean;
};

function toDateTimeLocalValue(date: Date) {
  // Convert JavaScript Date to local datetime string for <input type="datetime-local">.
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDuration(minutes?: number | null) {
  // Format duration in minutes as human-readable string (e.g., '2h 30m').
  if (minutes === undefined || minutes === null) {
    return 'Pending';
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${remainder}m`;
  }
  return `${hours}h ${remainder}m`;
}

export default function TimeEntryForm({ entries, jobId, token, onCreated, onOpenProfile, canOpenProfile }: TimeEntryFormProps) {
  // Initialize form with current time as start, current + 30 minutes as end.
  const initialStart = useMemo(() => toDateTimeLocalValue(new Date()), []);
  const initialEnd = useMemo(() => toDateTimeLocalValue(new Date(Date.now() + 30 * 60000)), []);
  // Form state: time entry creation form fields.
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [notes, setNotes] = useState('');
  const [billable, setBillable] = useState(true);
  // Submit/delete state and error handling.
  const [submitting, setSubmitting] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Form submission handler: validate, submit, refresh parent.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await createTimeEntry(token, {
        jobId,
        start: new Date(start).toISOString(),
        end: end ? new Date(end).toISOString() : undefined,
        notes,
        billable,
      });
      setNotes('');
      await onCreated();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to save time entry');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(entryId: number) {
    setDeletingEntryId(entryId);
    setError(null);
    try {
      await deleteTimeEntry(token, entryId);
      await onCreated();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete time entry');
    } finally {
      setDeletingEntryId(null);
    }
  }

  return (
    <section className="detail-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Time Tracking</p>
          <h3>Manual entry</h3>
        </div>
      </div>

      <form className="stack-form time-entry-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>Start</span>
            <input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            <span>End</span>
            <input required type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>

        <label>
          <span>Notes</span>
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Describe the service work completed"
            rows={3}
            value={notes}
          />
        </label>

        <label className="checkbox-row">
          <input checked={billable} onChange={(event) => setBillable(event.target.checked)} type="checkbox" />
          <span>Billable labor</span>
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="form-actions form-actions--spacious">
          <button className="btn btn-primary" disabled={submitting} type="submit">
            {submitting ? 'Saving...' : 'Add time entry'}
          </button>
        </div>
      </form>

      <div className="record-list record-list--spacious">
        {entries.length ? (
          entries.map((entry) => (
            <article className="record-card" key={entry.id}>
              <div className="record-card__title">
                <strong>{formatDuration(entry.duration)}</strong>
                <span>{entry.billable ? 'Billable' : 'Non-billable'}</span>
              </div>
              <p>{entry.notes || 'No notes added.'}</p>
              <div className="record-card__meta">
                {onOpenProfile && entry.user && (canOpenProfile ? canOpenProfile(entry.userId) : true) ? (
                  <button className="btn btn-link" onClick={() => onOpenProfile(entry.userId)} type="button">
                    {formatUserDisplayName(entry.user)}
                  </button>
                ) : (
                  <span>{entry.user ? formatUserDisplayName(entry.user) : `User #${entry.userId}`}</span>
                )}
                <span>{new Date(entry.start).toLocaleString()}</span>
                <button
                  className="btn btn-link"
                  disabled={deletingEntryId === entry.id}
                  onClick={() => handleDelete(entry.id)}
                  type="button"
                >
                  {deletingEntryId === entry.id ? 'Removing...' : 'Remove entry'}
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="panel-copy">No time entries have been recorded for this job yet.</p>
        )}
      </div>
    </section>
  );
}
