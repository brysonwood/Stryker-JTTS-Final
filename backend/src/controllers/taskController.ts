import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';

// Add a task to a job.
export async function createTask(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid job id required' });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { description, estimatedHrs, status } = req.body;
  const task = await prisma.task.create({
    data: {
      jobId,
      description: String(description).trim(),
      estimatedHrs: estimatedHrs !== undefined ? Number(estimatedHrs) : null,
      status: status || 'open',
    },
  });

  await writeAuditLog({
    action: 'create',
    entity: 'task',
    entityId: task.id,
    userId: actorIdFromRequest(req),
    data: { jobId, status: task.status },
  });

  return res.status(201).json({ task });
}

// Update a task's description, estimated hours, or status.
export async function updateTask(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(jobId) || !Number.isInteger(taskId)) {
    return res.status(400).json({ error: 'Valid job and task ids required' });
  }
  const existing = await prisma.task.findFirst({ where: { id: taskId, jobId } });
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const { description, estimatedHrs, status } = req.body;
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(description !== undefined && { description: String(description).trim() }),
      ...(estimatedHrs !== undefined && { estimatedHrs: estimatedHrs ? Number(estimatedHrs) : null }),
      ...(status !== undefined && { status: String(status) }),
    },
  });

  await writeAuditLog({
    action: 'update',
    entity: 'task',
    entityId: task.id,
    userId: actorIdFromRequest(req),
    data: { jobId, description, estimatedHrs, status },
  });

  return res.json({ task });
}

export default { createTask, updateTask };
