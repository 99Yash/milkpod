import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
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

export type PresignedPutInput = {
  fileName: string;
  contentType: string;
  fileSize: number;
  userId: string;
};

const ACCEPTED_UPLOAD_MIME_PREFIXES = ['audio/', 'video/'] as const;

/** 2 GB — must stay in sync with MAX_UPLOAD_SIZE / MAX_FILE_SIZE callers. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Shared validation for both upload flows (multipart + presigned PUT).
 * Returns an error message, or null when the file is acceptable.
 */
export function validateUploadFile(input: {
  fileName: string;
  contentType: string;
  fileSize: number;
}): string | null {
  if (
    !ACCEPTED_UPLOAD_MIME_PREFIXES.some((p) => input.contentType.startsWith(p))
  ) {
    return 'Unsupported file type. Please upload an audio or video file.';
  }
  if (input.fileSize > MAX_UPLOAD_BYTES) {
    return `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`;
  }
  return null;
}

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

function buildStorageKey(userId: string, fileName: string): string {
  const safeName = sanitizeFileName(fileName);
  return `uploads/${userId}/${Date.now()}-${randomUUID()}-${safeName}`;
}

/**
 * Whether a storage key belongs to the given user. Guards the
 * presigned-PUT complete flow against key swapping across users.
 */
export function isKeyOwnedByUser(key: string, userId: string): boolean {
  return key.startsWith(`uploads/${userId}/`);
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

  const key = buildStorageKey(userId, file.name);
  const contentType = normalizeOptional(file.type) ?? 'application/octet-stream';
  // Pass the Blob through instead of buffering: Workers isolates have ~128 MB
  // memory, so a full Buffer.from() breaks on large media. The SDK streams it
  // with the explicit ContentLength in both Node and edge runtimes.
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: file,
      ContentType: contentType,
      ContentLength: file.size,
    })
  );

  return {
    canonicalUrl: toStorageUrl(config.bucket, key),
    key,
  };
}

/**
 * Direct-to-storage upload flow (R2/Workers path, issue #31).
 * The browser PUTs the file straight to this URL so multi-GB media never
 * passes through a Worker (request body limits) or server memory. Works
 * against any S3-compatible endpoint, including R2 — only the endpoint +
 * credentials in env change. The caller then POSTs `/upload-complete`
 * with the returned key to create the asset and start the pipeline.
 */
export async function createUploadPresignedPutUrl(
  input: PresignedPutInput,
  opts?: { expiresInSeconds?: number }
): Promise<{ uploadUrl: string; canonicalUrl: string; key: string }> {
  const validationError = validateUploadFile({
    fileName: input.fileName,
    contentType: input.contentType,
    fileSize: input.fileSize,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const config = getStorageConfig();
  const client = getS3Client(config);
  const key = buildStorageKey(input.userId, input.fileName);

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.fileSize,
    }),
    {
      expiresIn: opts?.expiresInSeconds ?? config.signedUrlTtlSeconds,
    }
  );

  return {
    uploadUrl,
    canonicalUrl: toStorageUrl(config.bucket, key),
    key,
  };
}

/**
 * Canonical `s3://bucket/key` URL for a raw key in the configured bucket.
 * Keeps bucket authority server-side — the complete flow never trusts a
 * client-supplied storage URL.
 */
export function toCanonicalUploadUrl(key: string): string {
  const config = getStorageConfig();
  return toStorageUrl(config.bucket, key);
}

/**
 * Verify a directly-uploaded object exists and report its real
 * size/content-type. Returns null when missing or unreadable so the
 * complete flow can reject phantom keys.
 */
export async function headStoredUpload(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  const config = getStorageConfig();
  const client = getS3Client(config);
  try {
    const out = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key })
    );
    return {
      size: out.ContentLength ?? 0,
      contentType: out.ContentType ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
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
