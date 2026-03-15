import { randomUUID } from 'crypto';
import { createClient } from 'redis';

type PdfJobState = 'queued' | 'processing' | 'completed' | 'failed';

export type PdfQueueJob = {
  id: string;
  jobId: number | null;
  requestedBy: number | null;
  createdAt: string;
};

export type PdfJobStatus = {
  id: string;
  state: PdfJobState;
  jobId: number | null;
  requestedBy: number | null;
  createdAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
};

const QUEUE_KEY = 'pdf_jobs_queue';
const STATUS_KEY_PREFIX = 'pdf_jobs_status:';
const STATUS_TTL_SECONDS = 60 * 60 * 24 * 2;

const fallbackQueue: PdfQueueJob[] = [];
const fallbackStatus = new Map<string, PdfJobStatus>();
let redisClient: any = null;
let redisInitAttempted = false;

async function getRedisClient() {
  if (redisClient) return redisClient;
  if (redisInitAttempted) return null;
  redisInitAttempted = true;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    // Try to connect with a short timeout - fall back to in-memory if Redis isn't available.
    const client = createClient({
      url,
      socket: {
        connectTimeout: 500,
        reconnectStrategy: () => false,
      },
    } as any);
    client.on('error', () => undefined);

    await Promise.race([
      client.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis connect timeout')), 700)),
    ]);

    redisClient = client;
    return redisClient;
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function statusToHash(status: PdfJobStatus) {
  return {
    id: status.id,
    state: status.state,
    jobId: status.jobId === null ? '' : String(status.jobId),
    requestedBy: status.requestedBy === null ? '' : String(status.requestedBy),
    createdAt: status.createdAt,
    updatedAt: status.updatedAt,
    outputPath: status.outputPath || '',
    error: status.error || '',
  };
}

function hashToStatus(hash: Record<string, string>): PdfJobStatus {
  return {
    id: hash.id,
    state: (hash.state as PdfJobState) || 'queued',
    jobId: hash.jobId ? Number(hash.jobId) : null,
    requestedBy: hash.requestedBy ? Number(hash.requestedBy) : null,
    createdAt: hash.createdAt,
    updatedAt: hash.updatedAt,
    outputPath: hash.outputPath || undefined,
    error: hash.error || undefined,
  };
}

export async function enqueuePdfJob(input: { jobId: number | null; requestedBy: number | null }) {
  const job: PdfQueueJob = {
    id: randomUUID(),
    jobId: input.jobId,
    requestedBy: input.requestedBy,
    createdAt: nowIso(),
  };

  const status: PdfJobStatus = {
    id: job.id,
    state: 'queued',
    jobId: job.jobId,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt,
    updatedAt: job.createdAt,
  };

  const redis = await getRedisClient();
  if (redis) {
    await redis.lPush(QUEUE_KEY, JSON.stringify(job));
    await redis.hSet(STATUS_KEY_PREFIX + job.id, statusToHash(status));
    await redis.expire(STATUS_KEY_PREFIX + job.id, STATUS_TTL_SECONDS);
  } else {
    // Local fallback keeps development and single-node deployments functional without Redis.
    fallbackQueue.push(job);
    fallbackStatus.set(job.id, status);
  }

  return status;
}

export async function getPdfJobStatus(id: string) {
  const redis = await getRedisClient();
  if (redis) {
    const hash = await redis.hGetAll(STATUS_KEY_PREFIX + id);
    if (!hash || !hash.id) return null;
    return hashToStatus(hash);
  }
  return fallbackStatus.get(id) || null;
}

export async function dequeuePdfJob(timeoutSeconds = 5): Promise<PdfQueueJob | null> {
  const redis = await getRedisClient();
  if (redis) {
    // BRPOP blocks briefly to avoid hot-loop polling in worker processes.
    const popped = await redis.brPop(QUEUE_KEY, timeoutSeconds);
    if (!popped?.element) return null;
    return JSON.parse(popped.element) as PdfQueueJob;
  }

  if (!fallbackQueue.length) return null;
  return fallbackQueue.shift() || null;
}

export async function updatePdfJobStatus(
  id: string,
  patch: Partial<Pick<PdfJobStatus, 'state' | 'outputPath' | 'error'>>,
) {
  const current = await getPdfJobStatus(id);
  if (!current) return null;

  const next: PdfJobStatus = {
    ...current,
    ...patch,
    updatedAt: nowIso(),
  };

  const redis = await getRedisClient();
  if (redis) {
    await redis.hSet(STATUS_KEY_PREFIX + id, statusToHash(next));
    await redis.expire(STATUS_KEY_PREFIX + id, STATUS_TTL_SECONDS);
  } else {
    fallbackStatus.set(id, next);
  }

  return next;
}
