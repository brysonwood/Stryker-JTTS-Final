// Runs in background after photo upload completion is recorded.
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

type ThumbnailResult = {
  thumbnailKey: string;
  width: number;
  height: number;
  bytes: number;
} | null;

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

const workerClient = createS3Client(process.env.S3_ENDPOINT || 'http://localhost:9000');

async function streamToBuffer(body: any): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (typeof body.transformToByteArray === 'function') {
    const array = await body.transformToByteArray();
    return Buffer.from(array);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function buildThumbnailKey(objectKey: string) {
  const lastSlash = objectKey.lastIndexOf('/');
  const baseName = lastSlash >= 0 ? objectKey.slice(lastSlash + 1) : objectKey;
  const safeBase = baseName.replace(/\.[a-zA-Z0-9]+$/, '');
  return `thumbnails/${safeBase}.jpg`;
}

// Resize and save a thumbnail for the uploaded image.
async function processUpload(objectKey: string, mime?: string): Promise<ThumbnailResult> {
  if (mime && !mime.startsWith('image/')) {
    return null;
  }

  const source = await workerClient.send(
    new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey,
    }),
  );

  const sourceBuffer = await streamToBuffer(source.Body);
  if (!sourceBuffer.length) {
    return null;
  }

  const transformed = sharp(sourceBuffer).rotate().resize(320, 320, {
    fit: 'inside',
    withoutEnlargement: true,
  });

  const metadata = await transformed.metadata();
  const thumbBuffer = await transformed.jpeg({ quality: 75 }).toBuffer();
  const thumbnailKey = buildThumbnailKey(objectKey);

  await workerClient.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: thumbnailKey,
      Body: thumbBuffer,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=604800',
    }),
  );

  return {
    thumbnailKey,
    width: metadata.width || 0,
    height: metadata.height || 0,
    bytes: thumbBuffer.length,
  };
}

// Example entrypoint when run manually: `node dist/workers/thumbnailWorker.js`
if (require.main === module) {
  const key = process.argv[2] || 'example/object.jpg';
  processUpload(key)
    .then((result) => {
      console.log('Thumbnail result:', result);
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

export { processUpload };
