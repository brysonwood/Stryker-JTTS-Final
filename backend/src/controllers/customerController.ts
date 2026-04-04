import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';

// List customers.
export async function listCustomers(req: Request, res: Response) {
  const customers = await prisma.customer.findMany({ orderBy: { name: 'asc' } });
  return res.json({ customers });
}

// Create customer.
export async function createCustomer(req: Request, res: Response) {
  const { name, billing } = req.body;
  const customer = await prisma.customer.create({
    data: {
      name: String(name).trim(),
      billing: billing ? String(billing).trim() : null,
    },
  });

  await writeAuditLog({
    action: 'create',
    entity: 'customer',
    entityId: customer.id,
    userId: actorIdFromRequest(req),
    data: { name: customer.name },
  });

  return res.status(201).json({ customer });
}

export default { listCustomers, createCustomer };
