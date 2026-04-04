import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';
import { buildDraft, toCsv } from '../services/invoiceDraft';
import { enqueuePdfJob, getPdfJobStatus } from '../services/pdfQueue';

type ExportFormat = 'json' | 'csv';

function parseExportFormat(value: unknown): ExportFormat {
  if (typeof value !== 'string') return 'json';
  const lower = value.toLowerCase();
  return lower === 'csv' ? 'csv' : 'json';
}

function parseOptionalPositiveInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export async function exportInvoiceDraft(req: Request, res: Response) {
  const format = parseExportFormat(req.query.format);
  const jobId = parseOptionalPositiveInt(req.query.jobId);

  if (req.query.jobId !== undefined && jobId === null) {
    return res.status(400).json({ error: 'jobId must be a positive integer' });
  }

  const payload = await buildDraft(jobId);
  if (jobId && payload.jobs.length === 0) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const scope = jobId ? `job-${jobId}` : 'all-jobs';

  if (format === 'csv') {
    // Send draft download.
    const csv = toCsv(payload);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="invoice-draft-${scope}-${stamp}.csv"`);
    return res.status(200).send(csv);
  }

  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="invoice-draft-${scope}-${stamp}.json"`);
  return res.status(200).json(payload);
}

export async function enqueueInvoicePdf(req: Request, res: Response) {
  // Parse optional job id.
  const jobId = parseOptionalPositiveInt(req.body?.jobId ?? req.query.jobId);
  if ((req.body?.jobId !== undefined || req.query.jobId !== undefined) && jobId === null) {
    return res.status(400).json({ error: 'jobId must be a positive integer' });
  }

  if (jobId) {
    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
  }

  const actorId = actorIdFromRequest(req);
  const status = await enqueuePdfJob({
    jobId,
    requestedBy: actorId,
  });

  await writeAuditLog({
    action: 'enqueue_pdf',
    entity: 'invoice',
    userId: actorId,
    data: { queueJobId: status.id, jobId: status.jobId },
  });

  return res.status(202).json({ job: status });
}

export async function getInvoicePdfStatus(req: Request, res: Response) {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'PDF job id required' });
  }

  const status = await getPdfJobStatus(id);
  if (!status) {
    return res.status(404).json({ error: 'PDF job not found' });
  }

  return res.json({ job: status });
}

export default { exportInvoiceDraft, enqueueInvoicePdf, getInvoicePdfStatus };
