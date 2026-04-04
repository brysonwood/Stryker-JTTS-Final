import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const workspaceEnvPath = path.resolve(__dirname, '..', '..', '.env');
const localEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(workspaceEnvPath)) {
  dotenv.config({ path: workspaceEnvPath });
} else if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}

function resolveDatabaseHost() {
  const configuredHost = process.env.DATABASE_HOST || 'localhost';
  const isDockerHostAlias = configuredHost === 'postgres';
  const runningInContainer = fs.existsSync('/.dockerenv');

  if (isDockerHostAlias && !runningInContainer) {
    return 'localhost';
  }

  return configuredHost;
}

if (!process.env.DATABASE_URL) {
  const host = resolveDatabaseHost();
  const port = process.env.DATABASE_PORT || '5432';
  const database = process.env.DATABASE_NAME || 'stryker_jtts';
  const user = encodeURIComponent(process.env.DATABASE_USER || 'stryk_user');
  const password = encodeURIComponent(process.env.DATABASE_PASSWORD || 'stryk_pass');
  process.env.DATABASE_URL = `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

if (!process.env.S3_PUBLIC_ENDPOINT && process.env.S3_ENDPOINT) {
  process.env.S3_PUBLIC_ENDPOINT = process.env.S3_ENDPOINT.replace('://minio:', '://localhost:');
}
