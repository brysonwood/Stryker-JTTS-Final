import { Request, Response } from 'express';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import prisma from '../services/prismaClient';
import { publicUserSelect } from '../services/publicSelects';
import { processUpload } from '../workers/thumbnailWorker';
import { writeAuditLog } from '../services/audit';

const S3_BUCKET = process.env.S3_BUCKET || 'stryker-uploads';

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

const signingClient = createS3Client(resolvePublicEndpoint());

async function deleteStoredObject(key: string | null | undefined) {
  if (!key) {
    return;
  }

  await signingClient.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    }),
  );
}

function sanitizeFilename(name: string) {
  const sanitized = name.replace(/[^a-zA-Z0-9.\-_]/g, '');
  return sanitized || 'upload.bin';
}

async function ensureJobExists(jobId: number) {
  if (!prisma) {
    return true;
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  return Boolean(job);
}

// Create upload URL.
export async function uploadInit(req: Request, res: Response) {
  const { filename, mime, size, jobId } = req.body;
  if (!filename || !mime) return res.status(400).json({ error: 'filename and mime required' });

  const numericJobId = jobId === undefined ? null : Number(jobId);
  if (numericJobId !== null && (!Number.isInteger(numericJobId) || numericJobId <= 0)) {
    return res.status(400).json({ error: 'Valid jobId required when provided' });
  }

  if (numericJobId !== null && !(await ensureJobExists(numericJobId))) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const numericSize = size === undefined ? 0 : Number(size);
  if (!Number.isFinite(numericSize) || numericSize < 0 || numericSize > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File size must be between 0 and 10MB' });
  }

  const sanitized = sanitizeFilename(filename);
  const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: mime,
  });

  try {
    const uploadUrl = await getSignedUrl(signingClient, command, { expiresIn: 60 * 10 });
    return res.json({ uploadUrl, key });
  } catch (err) {
    console.error('uploadInit error', err);
    return res.status(500).json({ error: 'Failed to create signed URL' });
  }
}

// Save photo metadata.
export async function uploadComplete(req: Request, res: Response) {
  const { key, mime, size, jobId, gps } = req.body;
  if (!key || !jobId) return res.status(400).json({ error: 'key and jobId required' });

  const numericJobId = Number(jobId);
  if (!Number.isInteger(numericJobId) || numericJobId <= 0) {
    return res.status(400).json({ error: 'Valid jobId required' });
  }

  if (!(await ensureJobExists(numericJobId))) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const uploader = (req as any).user;
  if (!uploader || !uploader.id) return res.status(401).json({ error: 'Authentication required' });

  try {
    let photo = await prisma.photo.create({
      data: {
        jobId: numericJobId,
        uploaderId: Number(uploader.id),
        key,
        mime: mime || 'image/jpeg',
        size: size ? Number(size) : 0,
        gps: gps ? gps : undefined,
      },
      include: {
        uploader: { select: publicUserSelect },
      },
    });

    await writeAuditLog({
      action: 'create',
      entity: 'photo',
      entityId: photo.id,
      userId: Number(uploader.id),
      data: { jobId: numericJobId, key: photo.key, mime: photo.mime, size: photo.size },
    });

    processUpload(key, photo.mime)
      .then(async (thumb) => {
        if (!thumb?.thumbnailKey) {
          return;
        }
        await prisma.photo.update({
          where: { id: photo.id },
          data: { thumbnailKey: thumb.thumbnailKey },
        });
      })
      .catch((error) => console.error('thumbnail worker error', error));

    return res.json({ photo });
  } catch (err) {
    console.error('uploadComplete error', err);
    return res.status(500).json({ error: 'Failed to record photo metadata' });
  }
}

// Get photo link.
export async function getMedia(req: Request, res: Response) {
  const photoId = Number(req.params.id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return res.status(400).json({ error: 'Valid photo id required' });
  }

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      uploader: { select: publicUserSelect },
    },
  });

  if (!photo) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: photo.key,
    });
    const downloadUrl = await getSignedUrl(signingClient, command, { expiresIn: 60 * 10 });
    return res.json({ photo, downloadUrl });
  } catch (err) {
    console.error('getMedia error', err);
    return res.status(500).json({ error: 'Failed to create download URL' });
  }
}

// Delete photo objects.
export async function deleteMedia(req: Request, res: Response) {
  const actor = (req as any).user;
  if (!actor?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const photoId = Number(req.params.id);
  if (!Number.isInteger(photoId) || photoId <= 0) {
    return res.status(400).json({ error: 'Valid photo id required' });
  }

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    select: {
      id: true,
      jobId: true,
      key: true,
      thumbnailKey: true,
      uploaderId: true,
      mime: true,
      size: true,
    },
  });

  if (!photo) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  const isAdmin = actor.role === 'admin';
  const isUploader = Number(actor.id) === photo.uploaderId;
  if (!isAdmin && !isUploader) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  try {
    await deleteStoredObject(photo.key);
    await deleteStoredObject(photo.thumbnailKey);
  } catch (err) {
    console.error('deleteMedia storage error', err);
    return res.status(500).json({ error: 'Failed to delete photo object' });
  }

  try {
    await prisma.photo.delete({ where: { id: photoId } });
  } catch (err) {
    console.error('deleteMedia metadata error', err);
    return res.status(500).json({ error: 'Failed to delete photo metadata' });
  }

  await writeAuditLog({
    action: 'delete',
    entity: 'photo',
    entityId: photoId,
    userId: Number(actor.id),
    data: {
      jobId: photo.jobId,
      key: photo.key,
      thumbnailKey: photo.thumbnailKey,
      uploaderId: photo.uploaderId,
      mime: photo.mime,
      size: photo.size,
    },
  });

  return res.status(204).send();
}

export default { uploadInit, uploadComplete, getMedia, deleteMedia };
