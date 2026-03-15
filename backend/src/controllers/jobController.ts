import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { publicUserSelect } from '../services/publicSelects';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';

// Create a new job for a customer.
export async function createJob(req: Request, res: Response) {
  const { customerId, description, priority, estimatedHours, assignedToId, status } = req.body;
  const numericCustomerId = Number(customerId);
  if (!Number.isInteger(numericCustomerId) || numericCustomerId <= 0) {
    return res.status(400).json({ error: 'Valid customerId required' });
  }
  const customer = await prisma.customer.findUnique({ where: { id: numericCustomerId } });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const job = await prisma.job.create({
    data: {
      customerId: numericCustomerId,
      description: String(description).trim(),
      priority: priority !== undefined ? Number(priority) : 3,
      estimatedHours: estimatedHours !== undefined ? Number(estimatedHours) : null,
      assignedToId: assignedToId ? Number(assignedToId) : null,
      status: status || 'open',
    },
    include: {
      customer: true,
      assignedTo: { select: publicUserSelect },
    },
  });

  await writeAuditLog({
    action: 'create',
    entity: 'job',
    entityId: job.id,
    userId: actorIdFromRequest(req),
    data: { customerId: numericCustomerId, status: job.status, priority: job.priority },
  });

  return res.status(201).json({ job });
}

// Update job fields - status, priority, hours, or assignment.
export async function updateJob(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid job id required' });
  }
  const existing = await prisma.job.findUnique({ where: { id: jobId } });
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const { description, priority, estimatedHours, assignedToId, status } = req.body;
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      ...(description !== undefined && { description: String(description).trim() }),
      ...(priority !== undefined && { priority: Number(priority) }),
      ...(estimatedHours !== undefined && { estimatedHours: estimatedHours ? Number(estimatedHours) : null }),
      ...(assignedToId !== undefined && { assignedToId: assignedToId ? Number(assignedToId) : null }),
      ...(status !== undefined && { status: String(status) }),
    },
    include: {
      customer: true,
      assignedTo: { select: publicUserSelect },
    },
  });

  await writeAuditLog({
    action: 'update',
    entity: 'job',
    entityId: job.id,
    userId: actorIdFromRequest(req),
    data: { description, priority, estimatedHours, assignedToId, status },
  });

  return res.json({ job });
}

// Get all jobs with customer, assignee, and task info.
export async function listJobs(req: Request, res: Response) {
  const jobs = await prisma.job.findMany({
    include: {
      customer: true,
      assignedTo: { select: publicUserSelect },
      tasks: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ jobs });
}

// Get a full job record including tasks, time entries, parts, and photos.
export async function getJob(req: Request, res: Response) {
  const { id } = req.params;
  const job = await prisma.job.findUnique({
    where: { id: Number(id) },
    include: {
      tasks: true,
      timeEntries: {
        include: {
          user: { select: publicUserSelect },
          task: true,
        },
        orderBy: { start: 'desc' },
      },
      parts: true,
      photos: {
        include: {
          uploader: { select: publicUserSelect },
        },
        orderBy: { createdAt: 'desc' },
      },
      customer: true,
      assignedTo: { select: publicUserSelect },
    },
  });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
}

export default { listJobs, getJob, createJob, updateJob };
