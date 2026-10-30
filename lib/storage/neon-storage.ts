import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  MAX_LIBRARY_UPLOAD_BYTES,
  verifyUploadedBookMagicBytes,
} from '../library/library-utils';

const DEFAULT_BUCKET_NAME = 'lifecraft-uploads';
const PRIVATE_VAULT_ROOT = path.join(
  process.cwd(),
  '.aistudio',
  'private-library-vault'
);

let cachedS3Client: S3Client | null = null;
let cachedResolvedBucket: string | null = null;
let dotenvLoaded = false;

function ensureStorageEnvLoaded(): void {
  if (
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
    process.env.AWS_ENDPOINT_URL_S3?.trim()
  ) {
    return;
  }

  if (!dotenvLoaded) {
    dotenvLoaded = true;
    try {
      dotenv.config({ path: path.join(process.cwd(), '.env.local'), quiet: true });
      dotenv.config({ quiet: true });
    } catch {
      // Ignore dotenv errors
    }
  }

  if (
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim() &&
    process.env.AWS_ENDPOINT_URL_S3?.trim()
  ) {
    return;
  }

  try {
    const serverCredsPath = path.join(
      process.cwd(),
      '.aistudio',
      'server-credentials.json'
    );
    if (fsSync.existsSync(serverCredsPath)) {
      const parsed = JSON.parse(
        fsSync.readFileSync(serverCredsPath, 'utf8')
      ) as {
        neonStorage?: {
          endpointUrl?: string;
          accessKeyId?: string;
          secretAccessKey?: string;
          region?: string;
          bucketName?: string;
        };
      };
      const storage = parsed.neonStorage;
      if (storage?.endpointUrl && !process.env.AWS_ENDPOINT_URL_S3?.trim()) {
        process.env.AWS_ENDPOINT_URL_S3 = storage.endpointUrl.trim();
      }
      if (storage?.accessKeyId && !process.env.AWS_ACCESS_KEY_ID?.trim()) {
        process.env.AWS_ACCESS_KEY_ID = storage.accessKeyId.trim();
      }
      if (
        storage?.secretAccessKey &&
        !process.env.AWS_SECRET_ACCESS_KEY?.trim()
      ) {
        process.env.AWS_SECRET_ACCESS_KEY = storage.secretAccessKey.trim();
      }
      if (storage?.region && !process.env.AWS_REGION?.trim()) {
        process.env.AWS_REGION = storage.region.trim();
      }
      if (storage?.bucketName && !process.env.NEON_STORAGE_BUCKET?.trim()) {
        process.env.NEON_STORAGE_BUCKET = storage.bucketName.trim();
      }
    }
  } catch {
    // Ignore file read errors
  }
}

export interface StorageConfigurationStatus {
  mode: 'neon_s3' | 'private_server_vault';
  isNeonS3Configured: boolean;
  bucketName: string;
  region: string;
  missingEnvVars: string[];
}

export function getStorageConfigurationStatus(): StorageConfigurationStatus {
  ensureStorageEnvLoaded();

  const requiredVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT_URL_S3',
  ] as const;

  const missingEnvVars = requiredVars.filter((key) => {
    const val = process.env[key];
    return !val || !val.trim() || val.startsWith('your-');
  });

  const configuredBucket =
    process.env.NEON_STORAGE_BUCKET?.trim() ||
    process.env.AWS_S3_BUCKET?.trim() ||
    cachedResolvedBucket ||
    DEFAULT_BUCKET_NAME;

  const region = process.env.AWS_REGION?.trim() || 'us-east-2';
  const isNeonS3Configured = missingEnvVars.length === 0;

  return {
    mode: isNeonS3Configured ? 'neon_s3' : 'private_server_vault',
    isNeonS3Configured,
    bucketName: configuredBucket,
    region,
    missingEnvVars,
  };
}

function getS3Client(): S3Client | null {
  const status = getStorageConfigurationStatus();
  if (!status.isNeonS3Configured) {
    return null;
  }

  if (!cachedS3Client) {
    cachedS3Client = new S3Client({
      region: status.region,
      endpoint: process.env.AWS_ENDPOINT_URL_S3!.trim(),
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!.trim(),
      },
    });
  }

  return cachedS3Client;
}

/**
 * Resolves the verified Neon Object Storage bucket name ('lifecraft-uploads' or 'uploads' if existing).
 */
export async function resolveVerifiedBucketName(): Promise<string> {
  ensureStorageEnvLoaded();

  if (process.env.NEON_STORAGE_BUCKET?.trim()) {
    return process.env.NEON_STORAGE_BUCKET.trim();
  }
  if (process.env.AWS_S3_BUCKET?.trim()) {
    return process.env.AWS_S3_BUCKET.trim();
  }
  if (cachedResolvedBucket) {
    return cachedResolvedBucket;
  }

  const s3 = getS3Client();
  if (!s3) {
    return DEFAULT_BUCKET_NAME;
  }

  try {
    const listRes = await s3.send(new ListBucketsCommand({}));
    const names = (listRes.Buckets ?? [])
      .map((b) => b.Name)
      .filter((n): n is string => Boolean(n));

    if (names.includes('lifecraft-uploads')) {
      cachedResolvedBucket = 'lifecraft-uploads';
      return cachedResolvedBucket;
    }
    if (names.includes('uploads')) {
      cachedResolvedBucket = 'uploads';
      return cachedResolvedBucket;
    }
    if (names.length > 0) {
      cachedResolvedBucket = names[0];
      return cachedResolvedBucket;
    }
  } catch {
    // Bucket-scoped credentials may not allow ListBuckets; default to lifecraft-uploads
  }

  cachedResolvedBucket = DEFAULT_BUCKET_NAME;
  return cachedResolvedBucket;
}

function resolvePrivateVaultFilePath(
  bucket: string,
  storageKey: string
): string {
  const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
  const normalizedKey = path.posix
    .normalize(storageKey)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '');
  const fullPath = path.resolve(PRIVATE_VAULT_ROOT, safeBucket, normalizedKey);
  const allowedPrefix = path.resolve(PRIVATE_VAULT_ROOT, safeBucket);
  if (!fullPath.startsWith(allowedPrefix + path.sep)) {
    throw new Error('Invalid storage key path.');
  }
  return fullPath;
}

/**
 * Generates a short-lived (10-minute) presigned upload URL when Neon S3 is configured.
 * Returns null if using the authenticated server upload endpoint.
 */
export async function createShortLivedPresignedUploadUrl(params: {
  bucket: string;
  storageKey: string;
  mimeType: string;
  fileSizeBytes: number;
}): Promise<string | null> {
  const s3 = getS3Client();
  if (!s3) {
    return null;
  }

  try {
    const cmd = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.storageKey,
      ContentType: params.mimeType,
    });
    return await getSignedUrl(s3, cmd, { expiresIn: 600 });
  } catch {
    return null;
  }
}

/**
 * Generates a short-lived (15-minute) presigned download URL for private reading/downloading
 * when Neon S3 is configured. Never logs the signed URL.
 */
export async function createShortLivedPresignedDownloadUrl(params: {
  bucket: string;
  storageKey: string;
  originalFilename?: string | null;
  disposition?: 'inline' | 'attachment';
}): Promise<string | null> {
  const s3 = getS3Client();
  if (!s3) {
    return null;
  }

  try {
    const safeFilename = (params.originalFilename || 'book').replace(
      /[^a-zA-Z0-9._ -]/g,
      '_'
    );
    const disposition = params.disposition ?? 'inline';
    const cmd = new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.storageKey,
      ResponseContentDisposition: `${disposition}; filename="${safeFilename}"`,
    });
    return await getSignedUrl(s3, cmd, { expiresIn: 900 });
  } catch {
    return null;
  }
}

/**
 * Writes validated binary book bytes to the private storage bucket (Neon S3 or private server vault).
 */
export async function putPrivateStorageObject(params: {
  bucket: string;
  storageKey: string;
  bytes: Uint8Array;
  mimeType: string;
  expectedType: 'pdf' | 'epub';
}): Promise<{ ok: true; sizeBytes: number } | { ok: false; error: string }> {
  if (params.bytes.byteLength <= 0) {
    return { ok: false, error: 'Uploaded file is empty.' };
  }
  if (params.bytes.byteLength > MAX_LIBRARY_UPLOAD_BYTES) {
    return {
      ok: false,
      error: 'Uploaded file exceeds the 50 MB maximum limit.',
    };
  }

  const magicCheck = verifyUploadedBookMagicBytes(
    params.bytes,
    params.expectedType
  );
  if (!magicCheck.valid) {
    return { ok: false, error: magicCheck.error };
  }

  const s3 = getS3Client();
  if (s3) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: params.bucket,
          Key: params.storageKey,
          Body: params.bytes,
          ContentType: params.mimeType,
          ContentLength: params.bytes.byteLength,
        })
      );
      return { ok: true, sizeBytes: params.bytes.byteLength };
    } catch (err) {
      console.error(
        '[LifeCraft Storage] S3 PutObject failed for bucket:',
        params.bucket,
        err instanceof Error ? err.message : 'Unknown error'
      );
      return {
        ok: false,
        error:
          'Could not store file in Neon Object Storage. Verify bucket name and S3 write permissions.',
      };
    }
  }

  // Private server vault storage when S3 env vars are not yet configured
  try {
    const targetPath = resolvePrivateVaultFilePath(
      params.bucket,
      params.storageKey
    );
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, params.bytes);
    return { ok: true, sizeBytes: params.bytes.byteLength };
  } catch {
    return {
      ok: false,
      error: 'Failed to store uploaded file in private server storage.',
    };
  }
}

/**
 * Verifies that an uploaded object exists in storage, is within the 50 MB limit,
 * and matches the expected PDF or EPUB binary signature before finalizing PostgreSQL metadata.
 */
export async function verifyStoredPrivateObject(params: {
  bucket: string;
  storageKey: string;
  expectedType: 'pdf' | 'epub';
}): Promise<
  | { ok: true; sizeBytes: number }
  | { ok: false; error: string; notFound?: boolean }
> {
  const s3 = getS3Client();
  if (s3) {
    try {
      const head = await s3.send(
        new HeadObjectCommand({
          Bucket: params.bucket,
          Key: params.storageKey,
        })
      );
      const sizeBytes = head.ContentLength ?? 0;
      if (sizeBytes <= 0 || sizeBytes > MAX_LIBRARY_UPLOAD_BYTES) {
        return {
          ok: false,
          error:
            sizeBytes <= 0
              ? 'Stored object is empty.'
              : 'Stored object exceeds the 50 MB size limit.',
        };
      }

      // Fetch first 64 KB to verify PDF/EPUB magic bytes
      const rangeEnd = Math.min(sizeBytes - 1, 65535);
      const getRes = await s3.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.storageKey,
          Range: `bytes=0-${rangeEnd}`,
        })
      );
      if (getRes.Body) {
        const headBytes = await getRes.Body.transformToByteArray();
        const magicCheck = verifyUploadedBookMagicBytes(
          headBytes,
          params.expectedType
        );
        if (!magicCheck.valid) {
          return { ok: false, error: magicCheck.error };
        }
      }

      return { ok: true, sizeBytes };
    } catch {
      return {
        ok: false,
        notFound: true,
        error: 'Uploaded file was not found in Neon Object Storage.',
      };
    }
  }

  try {
    const targetPath = resolvePrivateVaultFilePath(
      params.bucket,
      params.storageKey
    );
    const stat = await fs.stat(targetPath);
    if (stat.size <= 0 || stat.size > MAX_LIBRARY_UPLOAD_BYTES) {
      return {
        ok: false,
        error: 'Stored file size is invalid or exceeds 50 MB.',
      };
    }
    const handle = await fs.open(targetPath, 'r');
    try {
      const readLen = Math.min(stat.size, 65536);
      const buf = new Uint8Array(readLen);
      await handle.read(buf, 0, readLen, 0);
      const magicCheck = verifyUploadedBookMagicBytes(buf, params.expectedType);
      if (!magicCheck.valid) {
        return { ok: false, error: magicCheck.error };
      }
    } finally {
      await handle.close();
    }
    return { ok: true, sizeBytes: stat.size };
  } catch {
    return {
      ok: false,
      notFound: true,
      error: 'Uploaded file was not found in storage.',
    };
  }
}

/**
 * Reads a private stored book's bytes for authenticated owner streaming.
 */
export async function readPrivateStorageObjectBytes(params: {
  bucket: string;
  storageKey: string;
}): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; error: string; notFound?: boolean }
> {
  const s3 = getS3Client();
  if (s3) {
    try {
      const res = await s3.send(
        new GetObjectCommand({
          Bucket: params.bucket,
          Key: params.storageKey,
        })
      );
      if (!res.Body) {
        return {
          ok: false,
          notFound: true,
          error: 'Stored book file could not be found.',
        };
      }
      const bytes = await res.Body.transformToByteArray();
      return { ok: true, bytes };
    } catch {
      return {
        ok: false,
        notFound: true,
        error: 'Stored book file is missing or unavailable in object storage.',
      };
    }
  }

  try {
    const targetPath = resolvePrivateVaultFilePath(
      params.bucket,
      params.storageKey
    );
    const buf = await fs.readFile(targetPath);
    return { ok: true, bytes: new Uint8Array(buf) };
  } catch {
    return {
      ok: false,
      notFound: true,
      error: 'Stored book file was not found.',
    };
  }
}

/**
 * Deletes a private stored book object when a user confirms permanent deletion or when cleaning up an orphan.
 */
export async function deletePrivateStorageObject(params: {
  bucket: string;
  storageKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const s3 = getS3Client();
  if (s3) {
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: params.bucket,
          Key: params.storageKey,
        })
      );
      return { ok: true };
    } catch (err) {
      console.error(
        '[LifeCraft Storage] Failed to delete object from bucket:',
        params.bucket,
        err instanceof Error ? err.message : 'Unknown error'
      );
      return {
        ok: false,
        error: 'Failed to delete file from Neon Object Storage.',
      };
    }
  }

  try {
    const targetPath = resolvePrivateVaultFilePath(
      params.bucket,
      params.storageKey
    );
    await fs.rm(targetPath, { force: true });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: 'Failed to delete stored file.',
    };
  }
}
