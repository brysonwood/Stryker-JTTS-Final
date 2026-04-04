import type { Request } from 'express';
import type { InputJsonValue } from '@prisma/client/runtime/library';
import prisma from './prismaClient';

type AuditInput = {
  action: string;
  entity: string;
  entityId?: number | null;
  userId?: number | null;
  data?: Record<string, unknown>;
};

function toInputJson(data: Record<string, unknown> | undefined): InputJsonValue | undefined {
  if (!data) {
    return undefined;
  }
  // Drop undefined values.
  return JSON.parse(JSON.stringify(data)) as InputJsonValue;
}

// Resolve actor id.
export function actorIdFromRequest(req: Request) {
  const actor = (req as any).user;
  const id = Number(actor?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Keep audit logging non-blocking for request handlers.
export async function writeAuditLog(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        data: toInputJson(input.data),
      },
    });
  } catch (error) {
    // Ignore logging failures.
    console.error('audit log write failed', error);
  }
}
