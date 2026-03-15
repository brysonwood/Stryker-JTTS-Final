import React, { useState } from 'react';
import { addPart, deletePart } from '../lib/api';
import type { PartRecord } from '../types';

type PartsFormProps = {
  parts: PartRecord[];
  jobId: number;
  token: string;
  onSaved: () => Promise<void>;
};

const EMPTY = { sku: '', description: '', quantity: '1', unitPrice: '0.00', taxFlag: false };

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function PartsForm({ parts, jobId, token, onSaved }: PartsFormProps) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalCost = parts.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  function setField(field: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      if (field === 'taxFlag') {
        setForm((prev) => ({ ...prev, taxFlag: e.target.checked }));
      } else {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
      }
    };
  }
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sku.trim()) { setError('SKU is required'); return; }
    setError(null);
    setBusy(true);
    try {
      await addPart(token, jobId, {
        sku: form.sku,
        description: form.description || undefined,
        quantity: Number(form.quantity),
        unitPrice: Number(form.unitPrice),
        taxFlag: form.taxFlag,
      });
      setForm(EMPTY);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add part');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(partId: number) {
    setBusy(true);
    setError(null);
    try {
      await deletePart(token, jobId, partId);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove part');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="detail-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Parts</p>
          <h3>Usage — {formatCurrency(totalCost)} total</h3>
        </div>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="record-list">
        {parts.length ? (
          parts.map((part) => (
            <article className="record-card" key={part.id}>
              <div className="record-card__title">
                <strong>{part.sku}</strong>
                <span>×{part.quantity}</span>
              </div>
              <p>{part.description || 'No description'}</p>
              <div className="record-card__meta">
                <span>{formatCurrency(part.unitPrice)} ea &mdash; {formatCurrency(part.quantity * part.unitPrice)}</span>
                <span>{part.taxFlag ? 'Taxable' : 'Non-taxable'}</span>
                <button
                  className="btn btn-link"
                  type="button"
                  disabled={busy}
                  onClick={() => handleDelete(part.id)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="panel-copy">No parts recorded for this job yet.</p>
        )}
      </div>

      <form className="stack-form" onSubmit={handleAdd}>
        <p className="eyebrow">Add Part</p>
        <div className="form-grid">
          <label>
            SKU *
            <input
              value={form.sku}
              onChange={setField('sku')}
              placeholder="WD-40"
              required
            />
          </label>
          <label>
            Description
            <input
              value={form.description}
              onChange={setField('description')}
              placeholder="Optional description"
            />
          </label>
          <label>
            Qty
            <input
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={setField('quantity')}
            />
          </label>
          <label>
            Unit Price ($)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unitPrice}
              onChange={setField('unitPrice')}
            />
          </label>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={form.taxFlag} onChange={setField('taxFlag')} />
          Taxable
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Add Part'}
        </button>
      </form>
    </section>
  );
}
