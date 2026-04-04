import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import prisma from './prismaClient';

type CleanupOptions = {
  retentionDays?: number;
  dryRun?: boolean;
  maxRecords?: number;
};

type CleanupError = {
  photoId: number;
  key: string;
  message: string;
};

function resolvePublicEndpoint() {
  if (process.env.S3_PUBLIC_ENDPOINT) {
    return process.env.S3_PUBLIC_ENDPOINT;
  }

  if (!process.env.S3_ENDPOINT) {
    return 'http://localhost:9000';
  }

  return process.env.S3_ENDPOINT.replace('://minio:', '://localhost:');
}

function createS3Client(endpoint: string | undefined) {
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || '',
      secretAccessKey: process.env.S3_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });
}

const cleanupClient = createS3Client(resolvePublicEndpoint());
const S3_BUCKET = process.env.S3_BUCKET || 'stryker-uploads';

// Remove expired photos.
export async function runMediaRetentionCleanup(options: CleanupOptions = {}) {
  const retentionDays = Number.isFinite(Number(options.retentionDays))
    ? Math.max(1, Math.min(365, Math.round(Number(options.retentionDays))))
    : 21;
  const dryRun = options.dryRun !== undefined ? Boolean(options.dryRun) : false;
  const maxRecords = Number.isFinite(Number(options.maxRecords))
    ? Math.max(1, Math.min(5000, Math.round(Number(options.maxRecords))))
    : 500;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const targets = await prisma.photo.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, key: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: maxRecords,
  });

  let deletedRecords = 0;
  let deletedObjects = 0;
  const errors: CleanupError[] = [];

  if (!dryRun) {
    for (const target of targets) {
      try {
        await cleanupClient.send(
          new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: target.key,
          }),
        );
        deletedObjects += 1;
      } catch (error) {
        errors.push({
          photoId: target.id,
          key: target.key,
          message: error instanceof Error ? error.message : 'object delete failed',
        });
      }

      try {
        await prisma.photo.delete({ where: { id: target.id } });
        deletedRecords += 1;
      } catch (error) {
        errors.push({
          photoId: target.id,
          key: target.key,
          message: error instanceof Error ? error.message : 'metadata delete failed',
        });
      }
    }
  }

  return {
    retentionDays,
    dryRun,
    maxRecords,
    cutoff: cutoff.toISOString(),
    matched: targets.length,
    deletedRecords,
    deletedObjects,
    failures: errors.length,
    errors,
  };
}
