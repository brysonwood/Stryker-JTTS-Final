import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { publicUserSelect } from '../services/publicSelects';
import { writeAuditLog } from '../services/audit';

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeDuration(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

// Get all time entries for a job.
export async function listJobTimeEntries(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid job id required' });
  }

  const entries = await prisma.timeEntry.findMany({
    where: { jobId },
    include: {
      user: { select: publicUserSelect },
      task: true,
    },
    orderBy: { start: 'desc' },
  });

  return res.json({ entries });
}

// Log a time entry - needs either start+end or an explicit duration.
export async function createTimeEntry(req: Request, res: Response) {
  const actor = (req as any).user;
  if (!actor?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const jobId = Number(req.body.jobId);
  const taskId = parseOptionalNumber(req.body.taskId);
  const start = parseDate(req.body.start);
  const end = parseDate(req.body.end);
  const explicitDuration = parseOptionalNumber(req.body.duration);
  const billable = req.body.billable === undefined ? true : Boolean(req.body.billable);
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid jobId required' });
  }

  if (!start) {
    return res.status(400).json({ error: 'Valid start time required' });
  }

  if (!end && explicitDuration === null) {
    return res.status(400).json({ error: 'Either end or duration is required' });
  }

  if (end && end.getTime() < start.getTime()) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  const duration = explicitDuration !== null ? explicitDuration : end ? computeDuration(start, end) : null;
  if (duration === null || duration < 0) {
    return res.status(400).json({ error: 'Duration must be zero or greater' });
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (taskId !== null) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.jobId !== jobId) {
      return res.status(400).json({ error: 'Task does not belong to the selected job' });
    }
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: Number(actor.id),
      jobId,
      taskId: taskId ?? undefined,
      start,
      end: end ?? undefined,
      duration,
      notes: notes || undefined,
      billable,
    },
    include: {
      user: { select: publicUserSelect },
      task: true,
    },
  });

  await writeAuditLog({
    action: 'create',
    entity: 'time_entry',
    entityId: entry.id,
    userId: Number(actor.id),
    data: { jobId, taskId: taskId ?? null, duration: entry.duration, billable: entry.billable },
  });

  return res.status(201).json({ entry });
}

// Delete a time entry - only the owner or an admin can do this.
export async function deleteTimeEntry(req: Request, res: Response) {
  const actor = (req as any).user;
  if (!actor?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ error: 'Valid time entry id required' });
  }

  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry) {
    return res.status(404).json({ error: 'Time entry not found' });
  }

  const isAdmin = actor.role === 'admin';
  const isOwner = Number(actor.id) === entry.userId;
  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  await prisma.timeEntry.delete({ where: { id: entryId } });

  await writeAuditLog({
    action: 'delete',
    entity: 'time_entry',
    entityId: entryId,
    userId: Number(actor.id),
    data: {
      jobId: entry.jobId,
      ownerUserId: entry.userId,
      duration: entry.duration,
      billable: entry.billable,
    },
  });

  return res.status(204).send();
}

export default { createTimeEntry, listJobTimeEntries, deleteTimeEntry };