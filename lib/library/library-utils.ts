import {
  DEFAULT_TIMEZONE,
  formatShortDate,
  resolveValidTimezone,
} from '../queries/timezone';
import type {
  LibraryBookmarkRow,
  LibraryCollectionItemRow,
  LibraryCollectionRow,
  LibraryItemRow,
} from '../db/schema';

export const MAX_LIBRARY_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB (52,428,800 bytes)
export const LIBRARY_TITLE_MAX_LENGTH = 200;
export const LIBRARY_AUTHOR_MAX_LENGTH = 140;
export const LIBRARY_DESCRIPTION_MAX_LENGTH = 1000;
export const COLLECTION_NAME_MAX_LENGTH = 80;
export const COLLECTION_DESCRIPTION_MAX_LENGTH = 300;
export const BOOKMARK_LABEL_MAX_LENGTH = 120;

export const LIBRARY_ITEM_TYPES = ['pdf', 'epub', 'book', 'link'] as const;
export type LibraryItemType = (typeof LIBRARY_ITEM_TYPES)[number];

export const LIBRARY_READING_STATUSES = [
  'to_read',
  'reading',
  'completed',
  'on_hold',
  'archived',
] as const;
export type LibraryReadingStatus = (typeof LIBRARY_READING_STATUSES)[number];

export const LIBRARY_COVER_STYLES = [
  'forest',
  'sunset',
  'ocean',
  'lavender',
  'midnight',
  'meadow',
] as const;
export type LibraryCoverStyle = (typeof LIBRARY_COVER_STYLES)[number];

export const LIBRARY_COLLECTION_COLORS = [
  'violet',
  'rose',
  'emerald',
  'sky',
  'amber',
  'indigo',
  'slate',
] as const;
export type LibraryCollectionColor = (typeof LIBRARY_COLLECTION_COLORS)[number];

export type LibraryFilterTab =
  | 'all'
  | 'reading'
  | 'to_read'
  | 'completed'
  | 'on_hold'
  | 'archived';

export type LibrarySortOption =
  | 'last_opened'
  | 'date_added'
  | 'title_asc'
  | 'progress_desc';

export function normalizeCoverStyle(
  raw: unknown,
  fallbackSeed = ''
): LibraryCoverStyle {
  if (
    typeof raw === 'string' &&
    (LIBRARY_COVER_STYLES as readonly string[]).includes(raw)
  ) {
    return raw as LibraryCoverStyle;
  }
  if (fallbackSeed) {
    let hash = 0;
    for (let i = 0; i < fallbackSeed.length; i += 1) {
      hash = (hash * 31 + fallbackSeed.charCodeAt(i)) >>> 0;
    }
    return LIBRARY_COVER_STYLES[hash % LIBRARY_COVER_STYLES.length];
  }
  return 'forest';
}

export function normalizeCollectionColor(raw: unknown): LibraryCollectionColor {
  if (
    typeof raw === 'string' &&
    (LIBRARY_COLLECTION_COLORS as readonly string[]).includes(raw)
  ) {
    return raw as LibraryCollectionColor;
  }
  return 'violet';
}

export function isValidReadingStatus(
  value: unknown
): value is LibraryReadingStatus {
  return (
    typeof value === 'string' &&
    (LIBRARY_READING_STATUSES as readonly string[]).includes(value)
  );
}

export function isValidLibraryItemType(
  value: unknown
): value is LibraryItemType {
  return (
    typeof value === 'string' &&
    (LIBRARY_ITEM_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Validates file extension, MIME type, and file size before accepting an upload.
 */
export function validateUploadFileMetadata(params: {
  filename: unknown;
  mimeType: unknown;
  fileSizeBytes: unknown;
}):
  | {
      valid: true;
      data: {
        originalFilename: string;
        itemType: 'pdf' | 'epub';
        mimeType: 'application/pdf' | 'application/epub+zip';
        fileSizeBytes: number;
        inferredTitle: string;
      };
    }
  | { valid: false; error: string } {
  const rawName =
    typeof params.filename === 'string' ? params.filename.trim() : '';
  if (!rawName) {
    return { valid: false, error: 'A valid filename is required.' };
  }

  // Strip any directory components from browser filename
  const cleanName = rawName.split(/[/\\]/).pop()?.trim() || '';
  if (!cleanName || cleanName.length > 255) {
    return { valid: false, error: 'Invalid filename.' };
  }

  const lower = cleanName.toLowerCase();
  const isPdfExt = lower.endsWith('.pdf');
  const isEpubExt = lower.endsWith('.epub');

  if (!isPdfExt && !isEpubExt) {
    return {
      valid: false,
      error: 'Only PDF (.pdf) and EPUB (.epub) files are supported.',
    };
  }

  const rawMime =
    typeof params.mimeType === 'string'
      ? params.mimeType.trim().toLowerCase()
      : '';

  if (isPdfExt) {
    if (
      rawMime &&
      rawMime !== 'application/pdf' &&
      rawMime !== 'application/x-pdf' &&
      rawMime !== 'application/octet-stream'
    ) {
      return {
        valid: false,
        error: 'Uploaded .pdf file has an incompatible MIME type.',
      };
    }
  }

  if (isEpubExt) {
    if (
      rawMime &&
      rawMime !== 'application/epub+zip' &&
      rawMime !== 'application/epub' &&
      rawMime !== 'application/zip' &&
      rawMime !== 'application/x-zip-compressed' &&
      rawMime !== 'application/octet-stream'
    ) {
      return {
        valid: false,
        error: 'Uploaded .epub file has an incompatible MIME type.',
      };
    }
  }

  const sizeNum =
    typeof params.fileSizeBytes === 'number'
      ? params.fileSizeBytes
      : Number(params.fileSizeBytes);

  if (!Number.isInteger(sizeNum) || sizeNum <= 0) {
    return {
      valid: false,
      error: 'File cannot be empty.',
    };
  }

  if (sizeNum > MAX_LIBRARY_UPLOAD_BYTES) {
    return {
      valid: false,
      error: 'File exceeds the 50 MB maximum upload limit.',
    };
  }

  const withoutExt = cleanName.replace(/\.(pdf|epub)$/i, '');
  const inferredTitle =
    withoutExt
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, LIBRARY_TITLE_MAX_LENGTH) || 'Untitled Book';

  return {
    valid: true,
    data: {
      originalFilename: cleanName,
      itemType: isPdfExt ? 'pdf' : 'epub',
      mimeType: isPdfExt ? 'application/pdf' : 'application/epub+zip',
      fileSizeBytes: sizeNum,
      inferredTitle,
    },
  };
}

/**
 * Inspects actual binary magic bytes of an uploaded buffer to ensure a renamed HTML/script/executable
 * cannot be disguised as a PDF or EPUB.
 */
export function verifyUploadedBookMagicBytes(
  bytes: Uint8Array,
  expectedType: 'pdf' | 'epub'
): { valid: true } | { valid: false; error: string } {
  if (!bytes || bytes.byteLength < 8) {
    return {
      valid: false,
      error: 'Uploaded file is empty or corrupted.',
    };
  }

  if (expectedType === 'pdf') {
    // %PDF- header (0x25 0x50 0x44 0x46 0x2D) within first 1024 bytes
    const headLen = Math.min(bytes.byteLength, 1024);
    let foundPdfHeader = false;
    for (let i = 0; i <= headLen - 5; i += 1) {
      if (
        bytes[i] === 0x25 &&
        bytes[i + 1] === 0x50 &&
        bytes[i + 2] === 0x44 &&
        bytes[i + 3] === 0x46 &&
        bytes[i + 4] === 0x2d
      ) {
        foundPdfHeader = true;
        break;
      }
    }
    if (!foundPdfHeader) {
      return {
        valid: false,
        error:
          'Invalid PDF file: binary header does not match a genuine PDF document.',
      };
    }
    return { valid: true };
  }

  // EPUB is a ZIP archive starting with PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    bytes[2] !== 0x03 ||
    bytes[3] !== 0x04
  ) {
    return {
      valid: false,
      error:
        'Invalid EPUB file: binary header does not match a valid EPUB archive.',
    };
  }

  // Check that the archive contains standard EPUB structure markers ('mimetype', 'epub', or 'META-INF')
  const asciiPreview = new TextDecoder('latin1').decode(
    bytes.subarray(0, Math.min(bytes.byteLength, 65536))
  );
  if (
    !asciiPreview.includes('mimetype') &&
    !asciiPreview.includes('META-INF') &&
    !asciiPreview.includes('.opf')
  ) {
    return {
      valid: false,
      error:
        'Invalid EPUB file: archive does not contain an EPUB package structure.',
    };
  }

  return { valid: true };
}

/**
 * Generates a safe, deterministic server-controlled storage key scoped to the user and upload session.
 * Never trusts user-provided paths.
 */
export function buildSafeStorageKey(
  userId: string,
  uploadId: string,
  itemType: 'pdf' | 'epub'
): string {
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const safeUpload = uploadId.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const ext = itemType === 'pdf' ? 'pdf' : 'epub';
  return `users/${safeUser}/library/${safeUpload}/book.${ext}`;
}

/**
 * Validates external reading links against XSS/protocol injection and SSRF private-network targets.
 */
export function validateSafeExternalUrl(
  rawUrl: unknown
): { valid: true; url: string } | { valid: false; error: string } {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: false, error: 'External URL is required for link items.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return {
      valid: false,
      error: 'Please enter a valid URL starting with https:// or http://.',
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      valid: false,
      error: 'Only http:// and https:// reading links are allowed.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '169.254.169.254' ||
    host.endsWith('.internal') ||
    host.endsWith('.local') ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)
  ) {
    return {
      valid: false,
      error: 'External reading links must point to a public web address.',
    };
  }

  return { valid: true, url: parsed.toString() };
}

/**
 * Consistent reading status & progress state machine.
 */
export function resolveLibraryStatusAndProgress(params: {
  existingStatus: LibraryReadingStatus;
  existingProgress: number;
  existingCurrentPage: number | null;
  existingTotalPages: number | null;
  existingStartedAt: Date | null;
  existingCompletedAt: Date | null;
  existingArchivedAt: Date | null;
  requestedStatus?: LibraryReadingStatus;
  requestedProgress?: number;
  requestedCurrentPage?: number | null;
  requestedTotalPages?: number | null;
  now?: Date;
}): {
  readingStatus: LibraryReadingStatus;
  progressPercent: number;
  currentPage: number | null;
  totalPages: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
} {
  const now = params.now ?? new Date();
  let nextTotalPages =
    params.requestedTotalPages !== undefined
      ? params.requestedTotalPages
      : params.existingTotalPages;
  if (nextTotalPages !== null && nextTotalPages < 1) {
    nextTotalPages = null;
  }

  let nextCurrentPage =
    params.requestedCurrentPage !== undefined
      ? params.requestedCurrentPage
      : params.existingCurrentPage;
  if (nextCurrentPage !== null && nextCurrentPage < 0) {
    nextCurrentPage = 0;
  }
  if (
    nextCurrentPage !== null &&
    nextTotalPages !== null &&
    nextCurrentPage > nextTotalPages
  ) {
    nextCurrentPage = nextTotalPages;
  }

  let nextProgress =
    params.requestedProgress !== undefined
      ? Math.min(100, Math.max(0, Math.round(params.requestedProgress)))
      : params.existingProgress;

  // If currentPage and totalPages are provided and progress wasn't explicitly overridden, derive accurate percentage
  if (
    params.requestedCurrentPage !== undefined &&
    params.requestedProgress === undefined &&
    nextCurrentPage !== null &&
    nextTotalPages !== null &&
    nextTotalPages > 0
  ) {
    nextProgress = Math.min(
      100,
      Math.max(0, Math.round((nextCurrentPage / nextTotalPages) * 100))
    );
  }

  let nextStatus: LibraryReadingStatus =
    params.requestedStatus ?? params.existingStatus;
  let nextStartedAt = params.existingStartedAt;
  let nextCompletedAt = params.existingCompletedAt;
  let nextArchivedAt = params.existingArchivedAt;

  // Explicit status transitions
  if (params.requestedStatus === 'completed') {
    nextStatus = 'completed';
    nextProgress = 100;
    if (nextTotalPages !== null) {
      nextCurrentPage = nextTotalPages;
    }
    nextStartedAt = nextStartedAt ?? now;
    nextCompletedAt = nextCompletedAt ?? now;
    nextArchivedAt = null;
  } else if (params.requestedStatus === 'to_read') {
    nextStatus = 'to_read';
    nextProgress = 0;
    if (nextCurrentPage !== null) {
      nextCurrentPage = 0;
    }
    nextStartedAt = null;
    nextCompletedAt = null;
    nextArchivedAt = null;
  } else if (params.requestedStatus === 'reading') {
    nextStatus = 'reading';
    nextStartedAt = nextStartedAt ?? now;
    nextCompletedAt = null;
    nextArchivedAt = null;
    if (params.existingStatus === 'completed' && nextProgress === 100) {
      nextProgress =
        nextCurrentPage && nextTotalPages && nextCurrentPage < nextTotalPages
          ? Math.round((nextCurrentPage / nextTotalPages) * 100)
          : 95;
    }
  } else if (params.requestedStatus === 'on_hold') {
    nextStatus = 'on_hold';
    nextCompletedAt = null;
    nextArchivedAt = null;
  } else if (params.requestedStatus === 'archived') {
    nextStatus = 'archived';
    nextArchivedAt = nextArchivedAt ?? now;
  } else {
    // Implicit transition when user reads past page 1 or increases progress on a 'to_read' item
    if (
      nextStatus === 'to_read' &&
      (nextProgress > 0 || (nextCurrentPage !== null && nextCurrentPage > 1))
    ) {
      nextStatus = 'reading';
      nextStartedAt = nextStartedAt ?? now;
    }
  }

  return {
    readingStatus: nextStatus,
    progressPercent: nextProgress,
    currentPage: nextCurrentPage,
    totalPages: nextTotalPages,
    startedAt: nextStartedAt,
    completedAt: nextCompletedAt,
    archivedAt: nextArchivedAt,
  };
}

export interface ValidatedManualLibraryItemInput {
  title: string;
  author: string | null;
  description: string | null;
  itemType: 'book' | 'link';
  externalUrl: string | null;
  readingStatus: LibraryReadingStatus;
  progressPercent: number;
  currentPage: number | null;
  totalPages: number | null;
  coverStyle: LibraryCoverStyle;
  collectionIds: string[];
}

export function validateManualLibraryItemInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedManualLibraryItemInput }
  | { valid: false; error: string; fieldErrors?: Record<string, string> } {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    return {
      valid: false,
      error: 'Title is required.',
      fieldErrors: { title: 'Title is required.' },
    };
  }
  if (title.length > LIBRARY_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Title must be ${LIBRARY_TITLE_MAX_LENGTH} characters or fewer.`,
      fieldErrors: {
        title: `Title must be ${LIBRARY_TITLE_MAX_LENGTH} characters or fewer.`,
      },
    };
  }

  let author: string | null = null;
  if (raw.author !== undefined && raw.author !== null && raw.author !== '') {
    if (typeof raw.author !== 'string') {
      return { valid: false, error: 'Author must be text.' };
    }
    const trimmed = raw.author.trim();
    if (trimmed.length > LIBRARY_AUTHOR_MAX_LENGTH) {
      return {
        valid: false,
        error: `Author must be ${LIBRARY_AUTHOR_MAX_LENGTH} characters or fewer.`,
      };
    }
    author = trimmed || null;
  }

  let description: string | null = null;
  if (
    raw.description !== undefined &&
    raw.description !== null &&
    raw.description !== ''
  ) {
    if (typeof raw.description !== 'string') {
      return { valid: false, error: 'Description must be text.' };
    }
    const trimmed = raw.description.trim();
    if (trimmed.length > LIBRARY_DESCRIPTION_MAX_LENGTH) {
      return {
        valid: false,
        error: `Description must be ${LIBRARY_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      };
    }
    description = trimmed || null;
  }

  const rawType = raw.itemType === 'link' ? 'link' : 'book';
  let externalUrl: string | null = null;
  if (
    raw.externalUrl !== undefined &&
    raw.externalUrl !== null &&
    String(raw.externalUrl).trim() !== ''
  ) {
    const validatedUrl = validateSafeExternalUrl(raw.externalUrl);
    if (!validatedUrl.valid) {
      return {
        valid: false,
        error: validatedUrl.error,
        fieldErrors: { externalUrl: validatedUrl.error },
      };
    }
    externalUrl = validatedUrl.url;
  } else if (rawType === 'link') {
    return {
      valid: false,
      error: 'External URL is required when adding a reading link.',
      fieldErrors: {
        externalUrl: 'External URL is required when adding a reading link.',
      },
    };
  }

  const itemType: 'book' | 'link' = externalUrl && raw.itemType === 'link' ? 'link' : 'book';

  const readingStatus: LibraryReadingStatus = isValidReadingStatus(
    raw.readingStatus
  )
    ? raw.readingStatus
    : 'to_read';

  let totalPages: number | null = null;
  if (
    raw.totalPages !== undefined &&
    raw.totalPages !== null &&
    raw.totalPages !== ''
  ) {
    const n = Number(raw.totalPages);
    if (!Number.isInteger(n) || n < 1 || n > 50000) {
      return {
        valid: false,
        error: 'Total pages must be a positive whole number.',
      };
    }
    totalPages = n;
  }

  let currentPage: number | null = null;
  if (
    raw.currentPage !== undefined &&
    raw.currentPage !== null &&
    raw.currentPage !== ''
  ) {
    const n = Number(raw.currentPage);
    if (!Number.isInteger(n) || n < 0 || (totalPages && n > totalPages)) {
      return {
        valid: false,
        error: 'Current page must be between 0 and total pages.',
      };
    }
    currentPage = n;
  }

  let progressPercent = 0;
  if (raw.progressPercent !== undefined && raw.progressPercent !== null) {
    const n = Number(raw.progressPercent);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      return {
        valid: false,
        error: 'Progress must be an integer between 0 and 100.',
      };
    }
    progressPercent = n;
  }

  const collectionIds: string[] = Array.isArray(raw.collectionIds)
    ? raw.collectionIds.filter((id): id is string => typeof id === 'string')
    : [];

  return {
    valid: true,
    data: {
      title,
      author,
      description,
      itemType,
      externalUrl,
      readingStatus,
      progressPercent,
      currentPage,
      totalPages,
      coverStyle: normalizeCoverStyle(raw.coverStyle, title),
      collectionIds,
    },
  };
}

export function validateCollectionInput(
  raw: Record<string, unknown>
):
  | {
      valid: true;
      data: {
        name: string;
        description: string | null;
        color: LibraryCollectionColor;
        icon: string;
      };
    }
  | { valid: false; error: string } {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return { valid: false, error: 'Collection name is required.' };
  }
  if (name.length > COLLECTION_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Collection name must be ${COLLECTION_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  let description: string | null = null;
  if (
    raw.description !== undefined &&
    raw.description !== null &&
    raw.description !== ''
  ) {
    if (typeof raw.description !== 'string') {
      return { valid: false, error: 'Collection description must be text.' };
    }
    const trimmed = raw.description.trim();
    if (trimmed.length > COLLECTION_DESCRIPTION_MAX_LENGTH) {
      return {
        valid: false,
        error: `Collection description must be ${COLLECTION_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      };
    }
    description = trimmed || null;
  }

  const color = normalizeCollectionColor(raw.color);
  const icon =
    typeof raw.icon === 'string' && raw.icon.trim()
      ? raw.icon.trim().slice(0, 32)
      : 'folder';

  return {
    valid: true,
    data: {
      name,
      description,
      color,
      icon,
    },
  };
}

export function formatRelativeTimeAgo(
  dateInput: Date | string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!dateInput) return null;
  const dt = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(dt.getTime())) return null;

  const diffSec = Math.max(0, Math.floor((now.getTime() - dt.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return diffHr === 1 ? '1 hour ago' : `${diffHr} hours ago`;
  }
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
}

export function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface SerializedLibraryCollection {
  id: string;
  name: string;
  description: string | null;
  color: LibraryCollectionColor;
  icon: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedLibraryBookmark {
  id: string;
  libraryItemId: string;
  label: string;
  position: string;
  pageNumber: number | null;
  createdAt: string;
  createdAtLabel: string;
}

export interface SerializedLibraryItem {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  itemType: LibraryItemType;
  readingStatus: LibraryReadingStatus;
  hasStoredFile: boolean;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  fileSizeLabel: string | null;
  externalUrl: string | null;
  coverStyle: LibraryCoverStyle;
  progressPercent: number;
  currentPage: number | null;
  totalPages: number | null;
  pageSummaryLabel: string | null;
  readingPosition: string | null;
  lastOpenedAt: string | null;
  lastOpenedRelativeLabel: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completedAtLabel: string | null;
  archivedAt: string | null;
  createdAt: string;
  addedAtLabel: string;
  updatedAt: string;
  footerMetaLabel: string;
  collections: Array<{
    id: string;
    name: string;
    color: LibraryCollectionColor;
  }>;
  collectionIds: string[];
  bookmarks: SerializedLibraryBookmark[];
}

export interface LibrarySummaryMetrics {
  /**
   * Non-archived items in the user's library.
   * Archived items are excluded from Total, Currently reading, Completed, and To read counts,
   * and are counted separately in `archivedCount`.
   */
  totalItemsCount: number;
  currentlyReadingCount: number;
  completedCount: number;
  toReadCount: number;
  onHoldCount: number;
  archivedCount: number;
}

export interface LibraryRecentActivityItem {
  itemId: string;
  title: string;
  itemType: LibraryItemType;
  coverStyle: LibraryCoverStyle;
  activityLabel: string;
  timestampMs: number;
}

export function buildLibraryViewModel(params: {
  items: LibraryItemRow[];
  collections: LibraryCollectionRow[];
  collectionMemberships: LibraryCollectionItemRow[];
  bookmarks: LibraryBookmarkRow[];
  timezone?: string;
  now?: Date;
}): {
  summary: LibrarySummaryMetrics;
  continueReadingItem: SerializedLibraryItem | null;
  items: SerializedLibraryItem[];
  collections: SerializedLibraryCollection[];
  recentActivity: LibraryRecentActivityItem[];
} {
  const now = params.now ?? new Date();
  const tz = resolveValidTimezone(params.timezone || DEFAULT_TIMEZONE);

  const collectionMap = new Map<string, LibraryCollectionRow>();
  for (const col of params.collections) {
    collectionMap.set(col.id, col);
  }

  // Group collection IDs by libraryItemId
  const collectionsByItem = new Map<string, string[]>();
  for (const m of params.collectionMemberships) {
    if (!collectionMap.has(m.collectionId)) continue;
    const list = collectionsByItem.get(m.libraryItemId) ?? [];
    if (!list.includes(m.collectionId)) {
      list.push(m.collectionId);
      collectionsByItem.set(m.libraryItemId, list);
    }
  }

  // Group bookmarks by libraryItemId
  const bookmarksByItem = new Map<string, SerializedLibraryBookmark[]>();
  for (const bm of params.bookmarks) {
    const list = bookmarksByItem.get(bm.libraryItemId) ?? [];
    list.push({
      id: bm.id,
      libraryItemId: bm.libraryItemId,
      label: bm.label,
      position: bm.position,
      pageNumber: bm.pageNumber ?? null,
      createdAt: new Date(bm.createdAt).toISOString(),
      createdAtLabel: formatShortDate(bm.createdAt, tz) || 'Saved',
    });
    bookmarksByItem.set(bm.libraryItemId, list);
  }

  const serializedItems: SerializedLibraryItem[] = params.items.map((item) => {
    const itemType: LibraryItemType = isValidLibraryItemType(item.itemType)
      ? item.itemType
      : 'book';
    const readingStatus: LibraryReadingStatus = isValidReadingStatus(
      item.readingStatus
    )
      ? item.readingStatus
      : 'to_read';
    const progressPercent = Math.min(100, Math.max(0, item.progressPercent));
    const currentPage = item.currentPage ?? null;
    const totalPages = item.totalPages ?? null;

    let pageSummaryLabel: string | null = null;
    if (totalPages && totalPages > 0) {
      const displayPage =
        readingStatus === 'completed' ? totalPages : currentPage ?? 0;
      pageSummaryLabel = `Page ${displayPage} of ${totalPages}`;
    } else if (currentPage && currentPage > 0) {
      pageSummaryLabel = `Page ${currentPage}`;
    } else if (itemType === 'epub' && item.readingPosition) {
      try {
        const parsedPos = JSON.parse(item.readingPosition) as {
          chapterIndex?: number;
          totalChapters?: number;
        };
        if (
          typeof parsedPos.chapterIndex === 'number' &&
          typeof parsedPos.totalChapters === 'number' &&
          parsedPos.totalChapters > 0
        ) {
          pageSummaryLabel = `Chapter ${parsedPos.chapterIndex + 1} of ${
            parsedPos.totalChapters
          }`;
        }
      } catch {
        // Ignore malformed position JSON
      }
    }

    const lastOpenedRelativeLabel = formatRelativeTimeAgo(
      item.lastOpenedAt,
      now
    );
    const addedAtLabel = formatShortDate(item.createdAt, tz) || 'Recently';
    const completedAtLabel = formatShortDate(item.completedAt, tz);

    let footerMetaLabel = `Added: ${addedAtLabel}`;
    if (readingStatus === 'completed' && completedAtLabel) {
      footerMetaLabel = `Completed: ${completedAtLabel}`;
    } else if (lastOpenedRelativeLabel) {
      footerMetaLabel = `Last opened: ${lastOpenedRelativeLabel.toLowerCase()}`;
    }

    const itemColIds = collectionsByItem.get(item.id) ?? [];
    const assignedCollections = itemColIds
      .map((cId) => collectionMap.get(cId))
      .filter((c): c is LibraryCollectionRow => Boolean(c))
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: normalizeCollectionColor(c.color),
      }));

    return {
      id: item.id,
      title: item.title,
      author: item.author ?? null,
      description: item.description ?? null,
      itemType,
      readingStatus,
      hasStoredFile: Boolean(item.storageKey),
      originalFilename: item.originalFilename ?? null,
      mimeType: item.mimeType ?? null,
      fileSizeBytes: item.fileSizeBytes ?? null,
      fileSizeLabel: formatFileSize(item.fileSizeBytes),
      externalUrl: item.externalUrl ?? null,
      coverStyle: normalizeCoverStyle(item.coverStyle, item.title),
      progressPercent,
      currentPage,
      totalPages,
      pageSummaryLabel,
      readingPosition: item.readingPosition ?? null,
      lastOpenedAt: item.lastOpenedAt
        ? new Date(item.lastOpenedAt).toISOString()
        : null,
      lastOpenedRelativeLabel,
      startedAt: item.startedAt ? new Date(item.startedAt).toISOString() : null,
      completedAt: item.completedAt
        ? new Date(item.completedAt).toISOString()
        : null,
      completedAtLabel,
      archivedAt: item.archivedAt
        ? new Date(item.archivedAt).toISOString()
        : null,
      createdAt: new Date(item.createdAt).toISOString(),
      addedAtLabel,
      updatedAt: new Date(item.updatedAt).toISOString(),
      footerMetaLabel,
      collections: assignedCollections,
      collectionIds: assignedCollections.map((c) => c.id),
      bookmarks: bookmarksByItem.get(item.id) ?? [],
    };
  });

  // Non-archived items drive the 4 primary reading summary cards
  const nonArchivedItems = serializedItems.filter(
    (i) => i.readingStatus !== 'archived'
  );
  const archivedItems = serializedItems.filter(
    (i) => i.readingStatus === 'archived'
  );
  const readingItems = nonArchivedItems.filter(
    (i) => i.readingStatus === 'reading'
  );
  const completedItems = nonArchivedItems.filter(
    (i) => i.readingStatus === 'completed'
  );
  const toReadItems = nonArchivedItems.filter(
    (i) => i.readingStatus === 'to_read' || i.readingStatus === 'on_hold'
  );
  const onHoldItems = nonArchivedItems.filter(
    (i) => i.readingStatus === 'on_hold'
  );

  // Continue reading banner: most recently opened or updated item currently in 'reading' status
  const sortedReading = [...readingItems].sort((a, b) => {
    const aTime = a.lastOpenedAt
      ? new Date(a.lastOpenedAt).getTime()
      : new Date(a.updatedAt).getTime();
    const bTime = b.lastOpenedAt
      ? new Date(b.lastOpenedAt).getTime()
      : new Date(b.updatedAt).getTime();
    return bTime - aTime;
  });
  const continueReadingItem = sortedReading[0] ?? null;

  // Collection counts (non-archived items belonging to each collection)
  const nonArchivedIdSet = new Set(nonArchivedItems.map((i) => i.id));
  const serializedCollections: SerializedLibraryCollection[] =
    params.collections.map((col) => {
      const count = params.collectionMemberships.filter(
        (m) =>
          m.collectionId === col.id && nonArchivedIdSet.has(m.libraryItemId)
      ).length;
      return {
        id: col.id,
        name: col.name,
        description: col.description ?? null,
        color: normalizeCollectionColor(col.color),
        icon: col.icon || 'folder',
        itemCount: count,
        createdAt: new Date(col.createdAt).toISOString(),
        updatedAt: new Date(col.updatedAt).toISOString(),
      };
    });

  // Recent activity feed
  const activityFeed: LibraryRecentActivityItem[] = nonArchivedItems
    .map((item) => {
      if (item.readingStatus === 'completed' && item.completedAt) {
        const rel = formatRelativeTimeAgo(item.completedAt, now) ?? 'recently';
        return {
          itemId: item.id,
          title: item.title,
          itemType: item.itemType,
          coverStyle: item.coverStyle,
          activityLabel: `Marked as completed · ${rel.toLowerCase()}`,
          timestampMs: new Date(item.completedAt).getTime(),
        };
      }
      if (item.lastOpenedAt) {
        const rel = formatRelativeTimeAgo(item.lastOpenedAt, now) ?? 'recently';
        return {
          itemId: item.id,
          title: item.title,
          itemType: item.itemType,
          coverStyle: item.coverStyle,
          activityLabel: `Opened ${rel.toLowerCase()}`,
          timestampMs: new Date(item.lastOpenedAt).getTime(),
        };
      }
      const rel = formatRelativeTimeAgo(item.createdAt, now) ?? 'recently';
      return {
        itemId: item.id,
        title: item.title,
        itemType: item.itemType,
        coverStyle: item.coverStyle,
        activityLabel: `Added to library · ${rel.toLowerCase()}`,
        timestampMs: new Date(item.createdAt).getTime(),
      };
    })
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, 5);

  return {
    summary: {
      totalItemsCount: nonArchivedItems.length,
      currentlyReadingCount: readingItems.length,
      completedCount: completedItems.length,
      toReadCount: toReadItems.length,
      onHoldCount: onHoldItems.length,
      archivedCount: archivedItems.length,
    },
    continueReadingItem,
    items: serializedItems,
    collections: serializedCollections,
    recentActivity: activityFeed,
  };
}

export function filterAndSortLibraryItems(params: {
  items: SerializedLibraryItem[];
  filterTab: LibraryFilterTab;
  formatFilter: LibraryItemType | 'all';
  collectionIdFilter: string | 'all';
  searchQuery: string;
  sortBy: LibrarySortOption;
}): SerializedLibraryItem[] {
  const {
    items,
    filterTab,
    formatFilter,
    collectionIdFilter,
    searchQuery,
    sortBy,
  } = params;

  let filtered = items.filter((item) => {
    if (filterTab === 'archived') {
      return item.readingStatus === 'archived';
    }
    if (item.readingStatus === 'archived') {
      return false;
    }
    if (filterTab === 'reading') {
      return item.readingStatus === 'reading';
    }
    if (filterTab === 'completed') {
      return item.readingStatus === 'completed';
    }
    if (filterTab === 'to_read') {
      return (
        item.readingStatus === 'to_read' || item.readingStatus === 'on_hold'
      );
    }
    if (filterTab === 'on_hold') {
      return item.readingStatus === 'on_hold';
    }
    return true;
  });

  if (formatFilter !== 'all') {
    filtered = filtered.filter((item) => item.itemType === formatFilter);
  }

  if (collectionIdFilter !== 'all') {
    filtered = filtered.filter((item) =>
      item.collectionIds.includes(collectionIdFilter)
    );
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.author && item.author.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.collections.some((c) => c.name.toLowerCase().includes(q))
    );
  }

  return [...filtered].sort((a, b) => {
    if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    }
    if (sortBy === 'progress_desc') {
      if (b.progressPercent !== a.progressPercent) {
        return b.progressPercent - a.progressPercent;
      }
    }
    if (sortBy === 'date_added') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // Default 'last_opened': items with lastOpenedAt DESC, then updatedAt DESC
    const aOpen = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : 0;
    const bOpen = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}
