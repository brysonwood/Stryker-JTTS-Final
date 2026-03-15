import React, { FormEvent, useEffect, useState } from 'react';
import { createJob, listCustomers } from '../lib/api';
import type { CustomerSummary } from '../types';

type CreateJobFormProps = {
  token: string;
  onCreated: () => Promise<void>;
  onCancel: () => void;
};

export default function CreateJobForm({ token, onCreated, onCancel }: CreateJobFormProps) {
  // Customer list state: loaded on mount, used for job customer assignment.
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  // Job creation form state: customer, description, priority (1-5), estimated hours.
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('3');
  const [estimatedHours, setEstimatedHours] = useState('');
  // Submit state: loading and validation errors.
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Load customer list on mount; pre-select first customer.
  useEffect(() => {
    listCustomers(token)
      .then((res) => {
        setCustomers(res.customers);
        // Auto-select first customer for UX convenience.
        if (res.customers.length > 0) {
          setCustomerId(String(res.customers[0].id));
        }
      })
      .catch((err) => {
        setCustomersError(err instanceof Error ? err.message : 'Failed to load customers');
      })
      .finally(() => {
        setCustomersLoading(false);
      });
  }, [token]);
  // Form submission: validate inputs and create job via API.
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Validate required fields before submission.
    if (!customerId) {
      setError('Select a customer');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createJob(token, {
        customerId: Number(customerId),
        description: description.trim(),
        priority: Number(priority) || 3,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      });
      setDescription('');
      setEstimatedHours('');
      setPriority('3');
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-job-form stack-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label>
          <span>Customer</span>
          {customersLoading ? (
            <input disabled placeholder="Loading customers…" type="text" />
          ) : customersError ? (
            <p className="form-error">{customersError}</p>
          ) : (
            <select
              className="select-input"
              disabled={submitting}
              onChange={(e) => setCustomerId(e.target.value)}
              value={customerId}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </label>

        <label>
          <span>Priority</span>
          <select
            className="select-input"
            disabled={submitting}
            onChange={(e) => setPriority(e.target.value)}
            value={priority}
          >
            <option value="1">P1 — Critical</option>
            <option value="2">P2 — High</option>
            <option value="3">P3 — Normal</option>
            <option value="4">P4 — Low</option>
            <option value="5">P5 — Backlog</option>
          </select>
        </label>
      </div>

      <label>
        <span>Description</span>
        <input
          disabled={submitting}
          maxLength={500}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description of the work to be performed"
          required
          type="text"
          value={description}
        />
      </label>

      <label>
        <span>Estimated hours <em className="field-hint">(optional)</em></span>
        <input
          disabled={submitting}
          min="0"
          onChange={(e) => setEstimatedHours(e.target.value)}
          placeholder="e.g. 4"
          step="0.5"
          type="number"
          value={estimatedHours}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        <button className="btn btn-primary" disabled={submitting || customersLoading} type="submit">
          {submitting ? 'Creating…' : 'Create job'}
        </button>
        <button className="btn btn-ghost" disabled={submitting} onClick={onCancel} type="button">
          Cancel
        </button>
      </div>
    </form>
  );
}
