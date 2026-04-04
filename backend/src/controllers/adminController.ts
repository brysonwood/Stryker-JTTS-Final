import { Request, Response } from 'express';
import prisma from '../services/prismaClient';
import { actorIdFromRequest, writeAuditLog } from '../services/audit';
import { runMediaRetentionCleanup } from '../services/mediaRetention';
import { formatCompactUserName } from '../services/userDisplay';

type AggregatePoint = {
  id: number;
  label: string;
  minutes?: number;
  hours?: number;
  cost?: number;
  count?: number;
  billableHours?: number;
};

type TrendPoint = AggregatePoint & {
  minutes: number;
  billableHours: number;
};

type DashboardJobRecord = {
  id: number;
  description: string;
  status: string;
  priority: number;
  createdAt: Date;
  customer: { name: string } | null;
  assignedTo: { id: number; firstName: string | null; lastName: string | null; email: string } | null;
};

type DashboardTimeEntryRecord = {
  id: number;
  userId: number;
  jobId: number | null;
  duration: number | null;
  billable: boolean;
  start: Date;
  user: { id: number; firstName: string | null; lastName: string | null; email: string };
  job: { id: number; description: string } | null;
};

type DashboardPartRecord = {
  jobId: number;
  quantity: number;
  unitPrice: number;
  job: { id: number; description: string } | null;
};

type DashboardJobRollup = {
  id: number;
  label: string;
  customer: string;
  status: string;
  priority: number;
  createdAt: string;
  assignedToId: number | null;
  assignedTo: string | null;
  totalHours: number;
  billableHours: number;
  partsCost: number;
};

function parseDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }
  return Math.min(Math.round(parsed), 365);
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return fallback;
}

export async function getDashboard(req: Request, res: Response) {
  const days = parseDays(req.query.days);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [jobs, timeEntries, parts]: [DashboardJobRecord[], DashboardTimeEntryRecord[], DashboardPartRecord[]] = await Promise.all([
    prisma.job.findMany({
      where: { OR: [{ createdAt: { gte: since } }, { timeEntries: { some: { start: { gte: since } } } }] },
      select: {
        id: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        customer: { select: { name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.timeEntry.findMany({
      where: { start: { gte: since }, jobId: { not: null } },
      select: {
        id: true,
        userId: true,
        jobId: true,
        duration: true,
        billable: true,
        start: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        job: { select: { id: true, description: true } },
      },
    }),
    prisma.part.findMany({
      where: { job: { createdAt: { gte: since } } },
      select: {
        jobId: true,
        quantity: true,
        unitPrice: true,
        job: { select: { id: true, description: true } },
      },
    }),
  ]);

  const employeeMap = new Map<number, AggregatePoint>();
  const billableByEmployeeMap = new Map<number, AggregatePoint>();
  const hoursByJobMap = new Map<number, AggregatePoint>();
  const billableByJobMap = new Map<number, AggregatePoint>();
  const hoursTrendMap = new Map<string, TrendPoint>();
  const jobsByStatusMap = new Map<string, AggregatePoint>();

  for (const job of jobs) {
    const current = jobsByStatusMap.get(job.status) || {
      id: jobsByStatusMap.size + 1,
      label: job.status,
      count: 0,
    };
    current.count = (current.count || 0) + 1;
    jobsByStatusMap.set(job.status, current);
  }

  for (const entry of timeEntries) {
    const minutes = Math.max(0, entry.duration || 0);
    const userLabel = formatCompactUserName(entry.user) || 'Unknown User';
    const currentUser = employeeMap.get(entry.userId) || { id: entry.userId, label: userLabel, minutes: 0 };
    currentUser.minutes = (currentUser.minutes || 0) + minutes;
    employeeMap.set(entry.userId, currentUser);

    if (entry.billable) {
      const billableUser = billableByEmployeeMap.get(entry.userId) || { id: entry.userId, label: userLabel, minutes: 0 };
      billableUser.minutes = (billableUser.minutes || 0) + minutes;
      billableByEmployeeMap.set(entry.userId, billableUser);
    }

    if (entry.jobId && entry.job) {
      const currentJob = hoursByJobMap.get(entry.jobId) || { id: entry.jobId, label: entry.job.description, minutes: 0 };
      currentJob.minutes = (currentJob.minutes || 0) + minutes;
      hoursByJobMap.set(entry.jobId, currentJob);

      if (entry.billable) {
        const billableJob = billableByJobMap.get(entry.jobId) || { id: entry.jobId, label: entry.job.description, minutes: 0 };
        billableJob.minutes = (billableJob.minutes || 0) + minutes;
        billableByJobMap.set(entry.jobId, billableJob);
      }
    }

    const dayKey = entry.start.toISOString().slice(0, 10);
    const currentDay = hoursTrendMap.get(dayKey) || { id: hoursTrendMap.size + 1, label: dayKey, minutes: 0, billableHours: 0 };
    currentDay.minutes = (currentDay.minutes || 0) + minutes;
    currentDay.billableHours = Number((((currentDay.billableHours || 0) * 60 + (entry.billable ? minutes : 0)) / 60).toFixed(2));
    hoursTrendMap.set(dayKey, currentDay);
  }

  const partsByJobMap = new Map<number, AggregatePoint>();
  for (const part of parts) {
    if (!part.job) continue;
    const partCost = Math.max(0, (part.quantity || 0) * (part.unitPrice || 0));
    const current = partsByJobMap.get(part.jobId) || { id: part.jobId, label: part.job.description, cost: 0 };
    current.cost = (current.cost || 0) + partCost;
    partsByJobMap.set(part.jobId, current);
  }

  const timeByEmployee = Array.from(employeeMap.values())
    .map((item) => ({ ...item, hours: Number(((item.minutes || 0) / 60).toFixed(2)) }))
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0))
    .slice(0, 8);

  const billableByEmployee = Array.from(billableByEmployeeMap.values())
    .map((item) => ({ ...item, hours: Number(((item.minutes || 0) / 60).toFixed(2)) }))
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0))
    .slice(0, 8);

  const hoursByJob = Array.from(hoursByJobMap.values())
    .map((item) => ({ ...item, hours: Number(((item.minutes || 0) / 60).toFixed(2)) }))
    .sort((a, b) => (b.minutes || 0) - (a.minutes || 0))
    .slice(0, 8);

  const partsCosts = Array.from(partsByJobMap.values())
    .map((item) => ({ ...item, cost: Number((item.cost || 0).toFixed(2)) }))
    .sort((a, b) => (b.cost || 0) - (a.cost || 0))
    .slice(0, 8);

  const jobsByStatus = Array.from(jobsByStatusMap.values())
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const hoursTrend = Array.from(hoursTrendMap.values())
    .map((item) => ({
      ...item,
      hours: Number(((item.minutes || 0) / 60).toFixed(2)),
      billableHours: Number(item.billableHours || 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const jobRollups: DashboardJobRollup[] = jobs
    .map((job) => {
      const totalMinutesForJob = hoursByJobMap.get(job.id)?.minutes || 0;
      const billableMinutesForJob = billableByJobMap.get(job.id)?.minutes || 0;
      const partsCost = Number(((partsByJobMap.get(job.id)?.cost || 0)).toFixed(2));

      return {
        id: job.id,
        label: job.description,
        customer: job.customer?.name || 'Unknown customer',
        status: job.status,
        priority: job.priority,
        createdAt: job.createdAt.toISOString(),
        assignedToId: job.assignedTo?.id || null,
        assignedTo: formatCompactUserName(job.assignedTo),
        totalHours: Number((totalMinutesForJob / 60).toFixed(2)),
        billableHours: Number((billableMinutesForJob / 60).toFixed(2)),
        partsCost,
      };
    })
    .sort((a, b) => {
      const statusWeight = (value: string) => ({ in_progress: 0, open: 1, complete: 2, cancelled: 3 }[value] ?? 4);
      return statusWeight(a.status) - statusWeight(b.status) || b.priority - a.priority || b.totalHours - a.totalHours;
    })
    .slice(0, 16);

  const totalMinutes = timeEntries.reduce((acc, entry) => acc + Math.max(0, entry.duration || 0), 0);
  const billableMinutes = timeEntries
    .filter((entry) => entry.billable)
    .reduce((acc, entry) => acc + Math.max(0, entry.duration || 0), 0);
  const totalPartsCost = Number(partsCosts.reduce((acc, item) => acc + (item.cost || 0), 0).toFixed(2));

  return res.json({
    windowDays: days,
    generatedAt: new Date().toISOString(),
    totals: {
      jobs: jobs.length,
      timeEntries: timeEntries.length,
      loggedHours: Number((totalMinutes / 60).toFixed(2)),
      billableHours: Number((billableMinutes / 60).toFixed(2)),
      partsCost: totalPartsCost,
      openJobs: jobs.filter((job) => job.status === 'open').length,
      inProgressJobs: jobs.filter((job) => job.status === 'in_progress').length,
      unassignedJobs: jobs.filter((job) => !job.assignedTo).length,
    },
    charts: {
      timeByEmployee,
      billableByEmployee,
      hoursByJob,
      partsCosts,
      jobsByStatus,
      hoursTrend,
    },
    jobs: jobRollups,
  });
}

export async function runRetentionCleanup(req: Request, res: Response) {
  const dryRun = parseBoolean(req.body?.dryRun ?? req.query.dryRun, true);
  const retentionDays = Number(req.body?.retentionDays ?? req.query.retentionDays);
  const maxRecords = Number(req.body?.maxRecords ?? req.query.maxRecords);

  const result = await runMediaRetentionCleanup({
    dryRun,
    retentionDays: Number.isFinite(retentionDays) ? retentionDays : undefined,
    maxRecords: Number.isFinite(maxRecords) ? maxRecords : undefined,
  });

  await writeAuditLog({
    action: 'retention_cleanup',
    entity: 'photo',
    userId: actorIdFromRequest(req),
    data: {
      dryRun: result.dryRun,
      retentionDays: result.retentionDays,
      matched: result.matched,
      deletedRecords: result.deletedRecords,
      deletedObjects: result.deletedObjects,
      failures: result.failures,
    },
  });

  return res.json(result);
}

export default { getDashboard, runRetentionCleanup };
