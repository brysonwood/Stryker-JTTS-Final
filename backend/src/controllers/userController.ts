import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import bcrypt from 'bcryptjs';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';
import { publicUserSelect } from '../services/publicSelects';
import { formatCompactUserName } from '../services/userDisplay';

type UserProfileAssignedJob = {
  id: number;
  description: string;
  status: string;
  priority: number;
  createdAt: Date;
  customer: { name: string } | null;
};

type UserProfileUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  disabled: boolean;
  createdAt: Date;
};

type UserProfileTimeEntry = {
  id: number;
  start: Date;
  duration: number | null;
  billable: boolean;
  notes: string | null;
  job: {
    id: number;
    description: string;
    customer: { name: string } | null;
  } | null;
};

function parseTargetUserId(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export async function listUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    select: publicUserSelect,
    orderBy: { createdAt: 'asc' },
  });
  return res.json({ users });
}

export async function getUserProfile(req: Request, res: Response) {
  const actor = (req as any).user;
  if (!actor?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const targetId = parseTargetUserId(req.params.id);
  if (!targetId) {
    return res.status(400).json({ error: 'Valid user id required' });
  }

  const isAdmin = actor.role === 'admin';
  // Non-admin users can only view their own profile data.
  if (!isAdmin && Number(actor.id) !== targetId) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const [user, assignedJobs, timeEntries]: [
    UserProfileUser | null,
    UserProfileAssignedJob[],
    UserProfileTimeEntry[],
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: publicUserSelect }),
    prisma.job.findMany({
      where: { assignedToId: targetId },
      select: {
        id: true,
        description: true,
        status: true,
        priority: true,
        customer: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.timeEntry.findMany({
      where: { userId: targetId, jobId: { not: null } },
      select: {
        id: true,
        start: true,
        duration: true,
        billable: true,
        notes: true,
        job: {
          select: {
            id: true,
            description: true,
            customer: { select: { name: true } },
          },
        },
      },
      orderBy: { start: 'desc' },
      take: 20,
    }),
  ]);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const totalMinutes = timeEntries.reduce((sum: number, item: UserProfileTimeEntry) => sum + Math.max(0, item.duration || 0), 0);
  const billableMinutes = timeEntries
    .filter((item: UserProfileTimeEntry) => item.billable)
    .reduce((sum: number, item: UserProfileTimeEntry) => sum + Math.max(0, item.duration || 0), 0);

  const completedJobs = assignedJobs.filter((job: UserProfileAssignedJob) => job.status === 'complete').length;
  const inProgressJobs = assignedJobs.filter((job: UserProfileAssignedJob) => job.status === 'in_progress').length;
  const openJobs = assignedJobs.filter((job: UserProfileAssignedJob) => job.status === 'open').length;
  const workedJobsMap = new Map<number, { id: number; label: string; customer: string }>();

  // Deduplicate recent worked jobs so repeat time entries do not flood the profile list.
  for (const entry of timeEntries) {
    if (!entry.job) continue;
    workedJobsMap.set(entry.job.id, {
      id: entry.job.id,
      label: entry.job.description,
      customer: entry.job.customer?.name || 'Unknown Customer',
    });
  }

  return res.json({
    profile: user,
    displayName: formatCompactUserName(user),
    stats: {
      assignedJobs: assignedJobs.length,
      openJobs,
      inProgressJobs,
      completedJobs,
      timeEntries: timeEntries.length,
      loggedHours: Number((totalMinutes / 60).toFixed(2)),
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      lastEntryAt: timeEntries[0]?.start?.toISOString() || null,
    },
    recentAssignedJobs: assignedJobs.map((job: UserProfileAssignedJob) => ({
      id: job.id,
      label: job.description,
      customer: job.customer?.name || 'Unknown Customer',
      status: job.status,
      priority: job.priority,
      createdAt: job.createdAt.toISOString(),
    })),
    workedJobs: Array.from(workedJobsMap.values()).slice(0, 12),
    recentEntries: timeEntries.map((entry: UserProfileTimeEntry) => ({
      id: entry.id,
      start: entry.start.toISOString(),
      duration: entry.duration || 0,
      billable: entry.billable,
      notes: entry.notes || null,
      jobId: entry.job?.id || null,
      jobLabel: entry.job?.description || 'Unknown Job',
      customer: entry.job?.customer?.name || 'Unknown Customer',
    })),
  });
}

export async function createUser(req: Request, res: Response) {
  const { firstName, lastName, email, password, role } = req.body;
  if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
    return res.status(400).json({ error: 'First name required' });
  }
  if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
    return res.status(400).json({ error: 'Last name required' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const user = await prisma.user.create({
    data: {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: role === 'admin' ? 'admin' : 'user',
    },
    select: publicUserSelect,
  });

  await writeAuditLog({
    action: 'create',
    entity: 'user',
    entityId: user.id,
    userId: actorIdFromRequest(req),
    data: { firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
  });

  return res.status(201).json({ user });
}

export async function updateUser(req: Request, res: Response) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'Valid user id required' });
  }

  const actorId = actorIdFromRequest(req);
  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { firstName, lastName, role, disabled, password } = req.body;

  // Prevent admin from disabling themselves
  if (disabled === true && targetId === actorId) {
    return res.status(400).json({ error: 'You cannot disable your own account' });
  }

  const updateData: Record<string, unknown> = {};
  if (firstName !== undefined && typeof firstName === 'string' && firstName.trim()) updateData.firstName = firstName.trim();
  if (lastName !== undefined && typeof lastName === 'string' && lastName.trim()) updateData.lastName = lastName.trim();
  if (role !== undefined) updateData.role = role === 'admin' ? 'admin' : 'user';
  if (disabled !== undefined) updateData.disabled = Boolean(disabled);
  if (password && typeof password === 'string' && password.length >= 8) {
    updateData.password = bcrypt.hashSync(password, 10);
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: publicUserSelect,
  });

  await writeAuditLog({
    action: 'update',
    entity: 'user',
    entityId: user.id,
    userId: actorId,
    data: { firstName: user.firstName, lastName: user.lastName, role: user.role, disabled: user.disabled },
  });

  return res.json({ user });
}

export async function updateUserProfile(req: Request, res: Response) {
  const actor = (req as any).user;
  if (!actor?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const targetId = parseTargetUserId(req.params.id);
  if (!targetId) {
    return res.status(400).json({ error: 'Valid user id required' });
  }

  const isAdmin = actor.role === 'admin';
  const isSelf = Number(actor.id) === targetId;
  // Admins can edit any profile; standard users are restricted to self-service updates.
  if (!isAdmin && !isSelf) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { firstName, lastName, email, password, role, disabled } = req.body;
  const updateData: Record<string, unknown> = {};

  if (firstName !== undefined) {
    if (typeof firstName !== 'string' || !firstName.trim()) {
      return res.status(400).json({ error: 'Valid first name required' });
    }
    updateData.firstName = firstName.trim();
  }

  if (lastName !== undefined) {
    if (typeof lastName !== 'string' || !lastName.trim()) {
      return res.status(400).json({ error: 'Valid last name required' });
    }
    updateData.lastName = lastName.trim();
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (conflict && conflict.id !== targetId) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    updateData.email = normalizedEmail;
  }

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    updateData.password = bcrypt.hashSync(password, 10);
  }

  if (isAdmin) {
    if (role !== undefined) {
      updateData.role = role === 'admin' ? 'admin' : 'user';
    }

    if (disabled !== undefined) {
      if (Boolean(disabled) && isSelf) {
        return res.status(400).json({ error: 'You cannot disable your own account' });
      }
      updateData.disabled = Boolean(disabled);
    }
  }

  const hasUpdates = Object.keys(updateData).length > 0;
  if (!hasUpdates) {
    return res.status(400).json({ error: 'No valid changes provided' });
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: publicUserSelect,
  });

  await writeAuditLog({
    action: 'update_profile',
    entity: 'user',
    entityId: user.id,
    userId: actorIdFromRequest(req),
    data: {
      by: isSelf ? 'self' : 'admin',
      changed: Object.keys(updateData),
      role: user.role,
      disabled: user.disabled,
    },
  });

  return res.json({ user });
}

export default { listUsers, getUserProfile, createUser, updateUser, updateUserProfile };
