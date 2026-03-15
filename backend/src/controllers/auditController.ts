import { Request, Response } from 'express';
import prisma from '../services/prismaClient';

function parseLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.round(parsed), 200);
}

// Get audit logs, optionally filtered by entity type or action.
export async function listAuditLogs(req: Request, res: Response) {
  const limit = parseLimit(req.query.limit);
  const entity = typeof req.query.entity === 'string' && req.query.entity.trim() ? req.query.entity.trim() : null;
  const action = typeof req.query.action === 'string' && req.query.action.trim() ? req.query.action.trim() : null;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(action ? { action } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return res.json({ logs });
}

export default { listAuditLogs };
