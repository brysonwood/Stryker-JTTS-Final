import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';

// List parts.
export async function listParts(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid job id required' });
  }
  const parts = await prisma.part.findMany({ where: { jobId }, orderBy: { id: 'asc' } });
  return res.json({ parts });
}

// Create part.
export async function addPart(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return res.status(400).json({ error: 'Valid job id required' });
  }
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { sku, description, quantity, unitPrice, taxFlag } = req.body;
  const qty = quantity !== undefined ? Number(quantity) : 1;
  const price = unitPrice !== undefined ? Number(unitPrice) : 0;

  if (!Number.isInteger(qty) || qty <= 0) {
    return res.status(400).json({ error: 'quantity must be a positive integer' });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
  }

  const part = await prisma.part.create({
    data: {
      jobId,
      sku: String(sku).trim().toUpperCase(),
      description: description ? String(description).trim() : null,
      quantity: qty,
      unitPrice: price,
      taxFlag: taxFlag ? Boolean(taxFlag) : false,
    },
  });

  await writeAuditLog({
    action: 'create',
    entity: 'part',
    entityId: part.id,
    userId: actorIdFromRequest(req),
    data: { jobId, sku: part.sku, quantity: part.quantity, unitPrice: part.unitPrice },
  });

  return res.status(201).json({ part });
}

// Remove part.
export async function deletePart(req: Request, res: Response) {
  const jobId = Number(req.params.id);
  const partId = Number(req.params.partId);
  if (!Number.isInteger(jobId) || !Number.isInteger(partId)) {
    return res.status(400).json({ error: 'Valid job and part ids required' });
  }
  const existing = await prisma.part.findFirst({ where: { id: partId, jobId } });
  if (!existing) return res.status(404).json({ error: 'Part not found' });

  await prisma.part.delete({ where: { id: partId } });

  await writeAuditLog({
    action: 'delete',
    entity: 'part',
    entityId: partId,
    userId: actorIdFromRequest(req),
    data: { jobId, sku: existing.sku },
  });

  return res.status(204).send();
}

export default { listParts, addPart, deletePart };
