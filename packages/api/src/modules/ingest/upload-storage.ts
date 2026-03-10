import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { serverEnv } from '@milkpod/env/server';
import { randomUUID } from 'node:crypto';

const STORAGE_URI_SCHEME = 's3://';

type UploadStorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
};

type StorageLocation = {
  bucket: string;
  key: string;
};

type StoreUploadInput = {
  file: File;
  userId: string;
};

let s3Client: S3Client | undefined;

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseStorageConfig(): UploadStorageConfig | null {
  const env = serverEnv();
  const bucket = normalizeOptional(env.UPLOAD_STORAGE_BUCKET);
  const accessKeyId = normalizeOptional(env.UPLOAD_STORAGE_ACCESS_KEY_ID);
  const secretAccessKey = normalizeOptional(env.UPLOAD_STORAGE_SECRET_ACCESS_KEY);

  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    bucket,
    region: env.UPLOAD_STORAGE_REGION,
    endpoint: normalizeOptional(env.UPLOAD_STORAGE_ENDPOINT),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.UPLOAD_STORAGE_FORCE_PATH_STYLE === 'true',
    signedUrlTtlSeconds: env.UPLOAD_STORAGE_SIGNED_URL_TTL_SECONDS,
  };
}

function getStorageConfig(): UploadStorageConfig {
  const config = parseStorageConfig();
  if (!config) {
    throw new Error(
      'Upload storage is not configured. Set UPLOAD_STORAGE_BUCKET, UPLOAD_STORAGE_ACCESS_KEY_ID, and UPLOAD_STORAGE_SECRET_ACCESS_KEY.'
    );
  }
  return config;
}

function getS3Client(config: UploadStorageConfig): S3Client {
  if (s3Client) return s3Client;

  s3Client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  return s3Client;
}

function sanitizeFileName(name: string): string {
  const normalized = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'upload.bin';
}

function toStorageLocation(rawUrl: string): StorageLocation {
  if (!rawUrl.startsWith(STORAGE_URI_SCHEME)) {
    throw new Error(`Unsupported upload storage URL: ${rawUrl}`);
  }

  const withoutScheme = rawUrl.slice(STORAGE_URI_SCHEME.length);
  const firstSlash = withoutScheme.indexOf('/');
  if (firstSlash <= 0 || firstSlash === withoutScheme.length - 1) {
    throw new Error(`Invalid upload storage URL: ${rawUrl}`);
  }

  return {
    bucket: withoutScheme.slice(0, firstSlash),
    key: withoutScheme.slice(firstSlash + 1),
  };
}

function toStorageUrl(bucket: string, key: string): string {
  return `${STORAGE_URI_SCHEME}${bucket}/${key}`;
}

export function isUploadStorageConfigured(): boolean {
  return parseStorageConfig() !== null;
}

export async function storeUploadedMedia({
  file,
  userId,
}: StoreUploadInput): Promise<{ canonicalUrl: string; key: string }> {
  const config = getStorageConfig();
  const client = getS3Client(config);

  const safeName = sanitizeFileName(file.name);
  const key = `uploads/${userId}/${Date.now()}-${randomUUID()}-${safeName}`;
  const contentType = normalizeOptional(file.type) ?? 'application/octet-stream';
  const body = Buffer.from(await file.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return {
    canonicalUrl: toStorageUrl(config.bucket, key),
    key,
  };
}

export async function createUploadDownloadUrl(
  canonicalUrl: string,
  opts?: { expiresInSeconds?: number }
): Promise<string> {
  if (canonicalUrl.startsWith('https://') || canonicalUrl.startsWith('http://')) {
    return canonicalUrl;
  }

  const config = getStorageConfig();
  const client = getS3Client(config);
  const location = toStorageLocation(canonicalUrl);

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    }),
    {
      expiresIn: opts?.expiresInSeconds ?? config.signedUrlTtlSeconds,
    }
  );
}

export async function deleteStoredUpload(canonicalUrl: string): Promise<void> {
  if (!canonicalUrl.startsWith(STORAGE_URI_SCHEME)) {
    return;
  }

  const config = getStorageConfig();
  const client = getS3Client(config);
  const location = toStorageLocation(canonicalUrl);

  await client.send(
    new DeleteObjectCommand({
      Bucket: location.bucket,
      Key: location.key,
    })
  );
}
