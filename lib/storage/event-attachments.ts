import {
  deletePrivateStorageObject,
  putGeneralStorageObject,
  readPrivateStorageObjectBytes,
} from './neon-storage';

export const MAX_EVENT_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/epub+zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export function sanitizeAttachmentFileName(rawName: string): string {
  const base = rawName.replace(/[/\\?%*:|"<>]/g, '_').trim();
  return base.slice(0, 150) || 'attachment';
}

export function buildEventStorageKey(params: {
  userId: string;
  eventId: string;
  attachmentId: string;
  fileName: string;
}): string {
  const safeUser = params.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeEvent = params.eventId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeFile = sanitizeAttachmentFileName(params.fileName);
  return `events/${safeUser}/${safeEvent}/${params.attachmentId}-${safeFile}`;
}

export async function saveEventAttachmentFile(params: {
  userId: string;
  eventId: string;
  attachmentId: string;
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
}): Promise<{ ok: boolean; storageBucket: string; storageKey: string; error?: string }> {
  if (params.bytes.byteLength > MAX_EVENT_ATTACHMENT_BYTES) {
    return {
      ok: false,
      storageBucket: '',
      storageKey: '',
      error: 'File exceeds maximum 25 MB attachment limit.',
    };
  }

  const storageKey = buildEventStorageKey(params);
  const bucket = process.env.NEON_STORAGE_BUCKET?.trim() || 'lifecraft-uploads';

  const res = await putGeneralStorageObject({
    bucket,
    storageKey,
    bytes: params.bytes,
    mimeType: params.fileType,
    maxBytes: MAX_EVENT_ATTACHMENT_BYTES,
  });

  if (!res.ok) {
    return {
      ok: false,
      storageBucket: bucket,
      storageKey,
      error: res.error || 'Failed to write attachment to storage.',
    };
  }

  return { ok: true, storageBucket: bucket, storageKey };
}

export async function deleteEventAttachmentFile(params: {
  storageBucket: string;
  storageKey: string;
}): Promise<void> {
  await deletePrivateStorageObject({
    bucket: params.storageBucket,
    storageKey: params.storageKey,
  }).catch(() => {
    // Graceful ignore
  });
}

export async function getEventAttachmentFile(params: {
  storageBucket: string;
  storageKey: string;
}) {
  return await readPrivateStorageObjectBytes({
    bucket: params.storageBucket,
    storageKey: params.storageKey,
  });
}
