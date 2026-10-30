import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, schema } from '../db';
import {
  ensureUserProfile,
  type AuthenticatedUserIdentity,
} from './dashboard';
import { isValidUuid } from './tasks';
import { DEFAULT_TIMEZONE, resolveValidTimezone } from './timezone';
import {
  BOOKMARK_LABEL_MAX_LENGTH,
  LIBRARY_AUTHOR_MAX_LENGTH,
  LIBRARY_DESCRIPTION_MAX_LENGTH,
  LIBRARY_TITLE_MAX_LENGTH,
  buildLibraryViewModel,
  buildSafeStorageKey,
  isValidReadingStatus,
  normalizeCoverStyle,
  resolveLibraryStatusAndProgress,
  validateCollectionInput,
  validateManualLibraryItemInput,
  validateSafeExternalUrl,
  validateUploadFileMetadata,
  type LibraryReadingStatus,
  type LibraryRecentActivityItem,
  type LibrarySummaryMetrics,
  type SerializedLibraryCollection,
  type SerializedLibraryItem,
} from '../library/library-utils';
import {
  createShortLivedPresignedDownloadUrl,
  createShortLivedPresignedUploadUrl,
  deletePrivateStorageObject,
  getStorageConfigurationStatus,
  putPrivateStorageObject,
  readPrivateStorageObjectBytes,
  resolveVerifiedBucketName,
  verifyStoredPrivateObject,
  type StorageConfigurationStatus,
} from '../storage/neon-storage';

export interface LibraryViewData {
  timezone: string;
  storageStatus: StorageConfigurationStatus;
  summary: LibrarySummaryMetrics;
  continueReadingItem: SerializedLibraryItem | null;
  items: SerializedLibraryItem[];
  collections: SerializedLibraryCollection[];
  recentActivity: LibraryRecentActivityItem[];
}

export type LibraryQueryResult =
  | { status: 'ok'; data: LibraryViewData }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

export async function getLibraryForUser(
  authUser: AuthenticatedUserIdentity
): Promise<LibraryQueryResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Library storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const storageStatus = getStorageConfigurationStatus();

    const [userItems, userCollections, userMemberships, userBookmarks] =
      await Promise.all([
        db
          .select()
          .from(schema.libraryItems)
          .where(eq(schema.libraryItems.userId, authUser.id))
          .orderBy(desc(schema.libraryItems.updatedAt)),
        db
          .select()
          .from(schema.libraryCollections)
          .where(eq(schema.libraryCollections.userId, authUser.id))
          .orderBy(asc(schema.libraryCollections.name)),
        db
          .select()
          .from(schema.libraryCollectionItems)
          .where(eq(schema.libraryCollectionItems.userId, authUser.id)),
        db
          .select()
          .from(schema.libraryBookmarks)
          .where(eq(schema.libraryBookmarks.userId, authUser.id))
          .orderBy(desc(schema.libraryBookmarks.createdAt)),
      ]);

    const vm = buildLibraryViewModel({
      items: userItems,
      collections: userCollections,
      collectionMemberships: userMemberships,
      bookmarks: userBookmarks,
      timezone,
    });

    return {
      status: 'ok',
      data: {
        timezone,
        storageStatus,
        ...vm,
      },
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to load library:', err);
    return {
      status: 'error',
      message: 'Unable to load your library right now. Please try again.',
    };
  }
}

async function filterOwnedCollectionIds(
  userId: string,
  requestedIds: string[]
): Promise<string[]> {
  const validUuids = requestedIds.filter((id) => isValidUuid(id));
  if (validUuids.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({ id: schema.libraryCollections.id })
    .from(schema.libraryCollections)
    .where(
      and(
        eq(schema.libraryCollections.userId, userId),
        inArray(schema.libraryCollections.id, validUuids)
      )
    );

  return rows.map((r) => r.id);
}

async function syncItemCollectionMemberships(
  userId: string,
  libraryItemId: string,
  requestedCollectionIds: string[]
): Promise<void> {
  const db = getDb();
  const ownedIds = await filterOwnedCollectionIds(userId, requestedCollectionIds);

  await db
    .delete(schema.libraryCollectionItems)
    .where(
      and(
        eq(schema.libraryCollectionItems.libraryItemId, libraryItemId),
        eq(schema.libraryCollectionItems.userId, userId)
      )
    );

  if (ownedIds.length > 0) {
    const now = new Date();
    await db
      .insert(schema.libraryCollectionItems)
      .values(
        ownedIds.map((colId) => ({
          collectionId: colId,
          libraryItemId,
          userId,
          createdAt: now,
        }))
      )
      .onConflictDoNothing();
  }
}

/**
 * Step 1 of Upload Flow: Validates metadata, creates an authorized upload session,
 * and returns a short-lived presigned S3 upload URL (if configured) plus the authenticated server upload route.
 */
export async function initiateLibraryUploadForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | {
      status: 'ok';
      uploadId: string;
      presignedUploadUrl: string | null;
      serverUploadUrl: string;
      storageMode: 'neon_s3' | 'private_server_vault';
      bucketName: string;
    }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  const fileValidation = validateUploadFileMetadata({
    filename: rawInput.filename,
    mimeType: rawInput.mimeType,
    fileSizeBytes: rawInput.fileSizeBytes,
  });

  if (!fileValidation.valid) {
    return {
      status: 'validation_error',
      message: fileValidation.error,
    };
  }

  const customTitle =
    typeof rawInput.title === 'string' && rawInput.title.trim()
      ? rawInput.title.trim()
      : fileValidation.data.inferredTitle;

  if (customTitle.length > LIBRARY_TITLE_MAX_LENGTH) {
    return {
      status: 'validation_error',
      message: `Title must be ${LIBRARY_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const author =
    typeof rawInput.author === 'string' && rawInput.author.trim()
      ? rawInput.author.trim().slice(0, LIBRARY_AUTHOR_MAX_LENGTH)
      : null;

  const description =
    typeof rawInput.description === 'string' && rawInput.description.trim()
      ? rawInput.description.trim().slice(0, LIBRARY_DESCRIPTION_MAX_LENGTH)
      : null;

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    const rawCollectionIds = Array.isArray(rawInput.collectionIds)
      ? rawInput.collectionIds.filter(
          (id): id is string => typeof id === 'string'
        )
      : [];
    const ownedCollectionIds = await filterOwnedCollectionIds(
      authUser.id,
      rawCollectionIds
    );

    const uploadId = crypto.randomUUID();
    const bucketName = await resolveVerifiedBucketName();
    const storageKey = buildSafeStorageKey(
      authUser.id,
      uploadId,
      fileValidation.data.itemType
    );
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.insert(schema.libraryUploadSessions).values({
      id: uploadId,
      userId: authUser.id,
      storageKey,
      storageBucket: bucketName,
      originalFilename: fileValidation.data.originalFilename,
      mimeType: fileValidation.data.mimeType,
      fileSizeBytes: fileValidation.data.fileSizeBytes,
      itemType: fileValidation.data.itemType,
      title: customTitle,
      author,
      description,
      coverStyle: normalizeCoverStyle(rawInput.coverStyle, customTitle),
      collectionIds: ownedCollectionIds,
      status: 'pending',
      expiresAt,
    });

    const presignedUploadUrl = await createShortLivedPresignedUploadUrl({
      bucket: bucketName,
      storageKey,
      mimeType: fileValidation.data.mimeType,
      fileSizeBytes: fileValidation.data.fileSizeBytes,
    });

    const storageStatus = getStorageConfigurationStatus();

    return {
      status: 'ok',
      uploadId,
      presignedUploadUrl,
      serverUploadUrl: `/api/library/upload/${uploadId}`,
      storageMode: storageStatus.mode,
      bucketName,
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to initiate upload:', err);
    return {
      status: 'error',
      message: 'Unable to start book upload right now. Please try again.',
    };
  }
}

/**
 * Step 2 of Upload Flow (Server-Validated Binary Transfer):
 * Validates ownership of the upload session, inspects binary magic bytes, and writes to Neon Object Storage / private vault.
 */
export async function uploadLibraryBytesForSession(
  authUser: AuthenticatedUserIdentity,
  uploadId: string,
  bytes: Uint8Array
): Promise<
  | { status: 'ok'; sizeBytes: number }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(uploadId)) {
    return { status: 'not_found', message: 'Upload session not found.' };
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.libraryUploadSessions)
      .where(
        and(
          eq(schema.libraryUploadSessions.id, uploadId),
          eq(schema.libraryUploadSessions.userId, authUser.id)
        )
      )
      .limit(1);

    const sessionRow = rows[0];
    if (!sessionRow) {
      return { status: 'not_found', message: 'Upload session not found.' };
    }

    if (new Date(sessionRow.expiresAt).getTime() < Date.now()) {
      return {
        status: 'validation_error',
        message: 'Upload session has expired. Please start the upload again.',
      };
    }

    if (sessionRow.status === 'finalized') {
      return {
        status: 'validation_error',
        message: 'This upload session has already been finalized.',
      };
    }

    const expectedType = sessionRow.itemType === 'epub' ? 'epub' : 'pdf';
    const writeRes = await putPrivateStorageObject({
      bucket: sessionRow.storageBucket,
      storageKey: sessionRow.storageKey,
      bytes,
      mimeType: sessionRow.mimeType,
      expectedType,
    });

    if (!writeRes.ok) {
      await db
        .update(schema.libraryUploadSessions)
        .set({ status: 'failed' })
        .where(eq(schema.libraryUploadSessions.id, uploadId));
      return {
        status: 'validation_error',
        message: writeRes.error,
      };
    }

    await db
      .update(schema.libraryUploadSessions)
      .set({
        status: 'uploaded',
        fileSizeBytes: writeRes.sizeBytes,
      })
      .where(eq(schema.libraryUploadSessions.id, uploadId));

    return {
      status: 'ok',
      sizeBytes: writeRes.sizeBytes,
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to store upload bytes:', err);
    return {
      status: 'error',
      message: 'Failed to store uploaded book file.',
    };
  }
}

/**
 * Step 3 of Upload Flow (Finalization):
 * Verifies the stored object exists, matches the expected binary signature and size limit,
 * persists the library_items record + collection memberships in PostgreSQL, and cleans up orphans on failure.
 */
export async function finalizeLibraryUploadForUser(
  authUser: AuthenticatedUserIdentity,
  uploadId: string,
  extraMeta?: { totalPages?: number | null }
): Promise<
  | { status: 'ok'; itemId: string }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(uploadId)) {
    return { status: 'not_found', message: 'Upload session not found.' };
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.libraryUploadSessions)
      .where(
        and(
          eq(schema.libraryUploadSessions.id, uploadId),
          eq(schema.libraryUploadSessions.userId, authUser.id)
        )
      )
      .limit(1);

    const sessionRow = rows[0];
    if (!sessionRow) {
      return { status: 'not_found', message: 'Upload session not found.' };
    }

    if (sessionRow.status === 'finalized') {
      const existingItem = await db
        .select({ id: schema.libraryItems.id })
        .from(schema.libraryItems)
        .where(
          and(
            eq(schema.libraryItems.userId, authUser.id),
            eq(schema.libraryItems.storageKey, sessionRow.storageKey)
          )
        )
        .limit(1);
      if (existingItem[0]) {
        return { status: 'ok', itemId: existingItem[0].id };
      }
    }

    const expectedType = sessionRow.itemType === 'epub' ? 'epub' : 'pdf';
    const verified = await verifyStoredPrivateObject({
      bucket: sessionRow.storageBucket,
      storageKey: sessionRow.storageKey,
      expectedType,
    });

    if (!verified.ok) {
      // Clean up invalid or partial object
      await deletePrivateStorageObject({
        bucket: sessionRow.storageBucket,
        storageKey: sessionRow.storageKey,
      });
      await db
        .update(schema.libraryUploadSessions)
        .set({ status: 'failed' })
        .where(eq(schema.libraryUploadSessions.id, uploadId));

      return {
        status: 'validation_error',
        message: verified.error,
      };
    }

    const now = new Date();
    const totalPages =
      extraMeta?.totalPages &&
      Number.isInteger(extraMeta.totalPages) &&
      extraMeta.totalPages > 0
        ? extraMeta.totalPages
        : null;

    let insertedItemId: string | undefined;
    try {
      const inserted = await db
        .insert(schema.libraryItems)
        .values({
          userId: authUser.id,
          title: sessionRow.title,
          author: sessionRow.author,
          description: sessionRow.description,
          itemType: expectedType,
          readingStatus: 'to_read',
          storageKey: sessionRow.storageKey,
          storageBucket: sessionRow.storageBucket,
          originalFilename: sessionRow.originalFilename,
          mimeType: sessionRow.mimeType,
          fileSizeBytes: verified.sizeBytes,
          externalUrl: null,
          coverStyle: sessionRow.coverStyle,
          progressPercent: 0,
          currentPage: expectedType === 'pdf' ? 0 : null,
          totalPages,
          readingPosition: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.libraryItems.id });

      insertedItemId = inserted[0]?.id;
    } catch (dbErr) {
      // Clean up orphaned storage object when PostgreSQL metadata write fails
      await deletePrivateStorageObject({
        bucket: sessionRow.storageBucket,
        storageKey: sessionRow.storageKey,
      });
      throw dbErr;
    }

    if (!insertedItemId) {
      await deletePrivateStorageObject({
        bucket: sessionRow.storageBucket,
        storageKey: sessionRow.storageKey,
      });
      return {
        status: 'error',
        message: 'Failed to save library item metadata.',
      };
    }

    if (sessionRow.collectionIds && sessionRow.collectionIds.length > 0) {
      await syncItemCollectionMemberships(
        authUser.id,
        insertedItemId,
        sessionRow.collectionIds
      );
    }

    await db
      .update(schema.libraryUploadSessions)
      .set({ status: 'finalized' })
      .where(eq(schema.libraryUploadSessions.id, uploadId));

    return {
      status: 'ok',
      itemId: insertedItemId,
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to finalize upload:', err);
    return {
      status: 'error',
      message: 'Unable to finalize book upload right now. Please try again.',
    };
  }
}

export async function createManualLibraryItemForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; itemId: string }
  | {
      status: 'validation_error';
      message: string;
      fieldErrors?: Record<string, string>;
    }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  const validated = validateManualLibraryItemInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
      fieldErrors: validated.fieldErrors,
    };
  }

  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    const now = new Date();
    const resolved = resolveLibraryStatusAndProgress({
      existingStatus: 'to_read',
      existingProgress: 0,
      existingCurrentPage: null,
      existingTotalPages: validated.data.totalPages,
      existingStartedAt: null,
      existingCompletedAt: null,
      existingArchivedAt: null,
      requestedStatus: validated.data.readingStatus,
      requestedProgress: validated.data.progressPercent,
      requestedCurrentPage: validated.data.currentPage,
      requestedTotalPages: validated.data.totalPages,
      now,
    });

    const inserted = await db
      .insert(schema.libraryItems)
      .values({
        userId: authUser.id,
        title: validated.data.title,
        author: validated.data.author,
        description: validated.data.description,
        itemType: validated.data.itemType,
        readingStatus: resolved.readingStatus,
        storageKey: null,
        storageBucket: null,
        originalFilename: null,
        mimeType: null,
        fileSizeBytes: null,
        externalUrl: validated.data.externalUrl,
        coverStyle: validated.data.coverStyle,
        progressPercent: resolved.progressPercent,
        currentPage: resolved.currentPage,
        totalPages: resolved.totalPages,
        readingPosition: null,
        startedAt: resolved.startedAt,
        completedAt: resolved.completedAt,
        archivedAt: resolved.archivedAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.libraryItems.id });

    const itemId = inserted[0]?.id;
    if (!itemId) {
      return { status: 'error', message: 'Failed to create reading item.' };
    }

    if (validated.data.collectionIds.length > 0) {
      await syncItemCollectionMemberships(
        authUser.id,
        itemId,
        validated.data.collectionIds
      );
    }

    return { status: 'ok', itemId };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to create manual item:', err);
    return {
      status: 'error',
      message: 'Unable to add reading item right now. Please try again.',
    };
  }
}

export async function updateLibraryItemForUser(
  authUser: AuthenticatedUserIdentity,
  itemId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok' }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(itemId)) {
    return { status: 'not_found', message: 'Library item not found.' };
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.libraryItems)
      .where(
        and(
          eq(schema.libraryItems.id, itemId),
          eq(schema.libraryItems.userId, authUser.id)
        )
      )
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      return { status: 'not_found', message: 'Library item not found.' };
    }

    const now = new Date();
    const updateValues: Partial<typeof schema.libraryItems.$inferInsert> = {
      updatedAt: now,
    };

    if ('title' in rawInput) {
      const title =
        typeof rawInput.title === 'string' ? rawInput.title.trim() : '';
      if (!title || title.length > LIBRARY_TITLE_MAX_LENGTH) {
        return {
          status: 'validation_error',
          message: `Title is required and must be ${LIBRARY_TITLE_MAX_LENGTH} characters or fewer.`,
        };
      }
      updateValues.title = title;
    }

    if ('author' in rawInput) {
      if (rawInput.author === null || rawInput.author === '') {
        updateValues.author = null;
      } else if (typeof rawInput.author === 'string') {
        const trimmed = rawInput.author.trim();
        if (trimmed.length > LIBRARY_AUTHOR_MAX_LENGTH) {
          return {
            status: 'validation_error',
            message: `Author must be ${LIBRARY_AUTHOR_MAX_LENGTH} characters or fewer.`,
          };
        }
        updateValues.author = trimmed || null;
      }
    }

    if ('description' in rawInput) {
      if (rawInput.description === null || rawInput.description === '') {
        updateValues.description = null;
      } else if (typeof rawInput.description === 'string') {
        const trimmed = rawInput.description.trim();
        if (trimmed.length > LIBRARY_DESCRIPTION_MAX_LENGTH) {
          return {
            status: 'validation_error',
            message: `Description must be ${LIBRARY_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          };
        }
        updateValues.description = trimmed || null;
      }
    }

    if ('externalUrl' in rawInput) {
      if (rawInput.externalUrl === null || rawInput.externalUrl === '') {
        if (existing.itemType === 'link') {
          return {
            status: 'validation_error',
            message: 'External URL cannot be empty for a link item.',
          };
        }
        updateValues.externalUrl = null;
      } else {
        const urlCheck = validateSafeExternalUrl(rawInput.externalUrl);
        if (!urlCheck.valid) {
          return {
            status: 'validation_error',
            message: urlCheck.error,
          };
        }
        updateValues.externalUrl = urlCheck.url;
      }
    }

    if ('coverStyle' in rawInput && rawInput.coverStyle !== undefined) {
      updateValues.coverStyle = normalizeCoverStyle(
        rawInput.coverStyle,
        existing.title
      );
    }

    if ('readingPosition' in rawInput) {
      if (typeof rawInput.readingPosition === 'string') {
        updateValues.readingPosition = rawInput.readingPosition.slice(0, 2000);
      } else if (
        typeof rawInput.readingPosition === 'object' &&
        rawInput.readingPosition !== null
      ) {
        updateValues.readingPosition = JSON.stringify(
          rawInput.readingPosition
        ).slice(0, 2000);
      } else {
        updateValues.readingPosition = null;
      }
    }

    if (
      rawInput.markOpened === true ||
      rawInput.touchLastOpened === true
    ) {
      updateValues.lastOpenedAt = now;
    }

    let requestedStatus: LibraryReadingStatus | undefined;
    if ('readingStatus' in rawInput && rawInput.readingStatus !== undefined) {
      if (!isValidReadingStatus(rawInput.readingStatus)) {
        return {
          status: 'validation_error',
          message: 'Invalid reading status.',
        };
      }
      requestedStatus = rawInput.readingStatus;
    }

    let requestedProgress: number | undefined;
    if (
      'progressPercent' in rawInput &&
      rawInput.progressPercent !== undefined &&
      rawInput.progressPercent !== null
    ) {
      const p = Number(rawInput.progressPercent);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        return {
          status: 'validation_error',
          message: 'Progress must be between 0 and 100.',
        };
      }
      requestedProgress = Math.round(p);
    }

    let requestedCurrentPage: number | null | undefined;
    if ('currentPage' in rawInput) {
      if (rawInput.currentPage === null || rawInput.currentPage === '') {
        requestedCurrentPage = null;
      } else {
        const cp = Number(rawInput.currentPage);
        if (!Number.isInteger(cp) || cp < 0) {
          return {
            status: 'validation_error',
            message: 'Current page must be a non-negative integer.',
          };
        }
        requestedCurrentPage = cp;
      }
    }

    let requestedTotalPages: number | null | undefined;
    if ('totalPages' in rawInput) {
      if (rawInput.totalPages === null || rawInput.totalPages === '') {
        requestedTotalPages = null;
      } else {
        const tp = Number(rawInput.totalPages);
        if (!Number.isInteger(tp) || tp < 1) {
          return {
            status: 'validation_error',
            message: 'Total pages must be at least 1.',
          };
        }
        requestedTotalPages = tp;
      }
    }

    const resolved = resolveLibraryStatusAndProgress({
      existingStatus:
        (existing.readingStatus as LibraryReadingStatus) || 'to_read',
      existingProgress: existing.progressPercent,
      existingCurrentPage: existing.currentPage ?? null,
      existingTotalPages: existing.totalPages ?? null,
      existingStartedAt: existing.startedAt ?? null,
      existingCompletedAt: existing.completedAt ?? null,
      existingArchivedAt: existing.archivedAt ?? null,
      requestedStatus,
      requestedProgress,
      requestedCurrentPage,
      requestedTotalPages,
      now,
    });

    updateValues.readingStatus = resolved.readingStatus;
    updateValues.progressPercent = resolved.progressPercent;
    updateValues.currentPage = resolved.currentPage;
    updateValues.totalPages = resolved.totalPages;
    updateValues.startedAt = resolved.startedAt;
    updateValues.completedAt = resolved.completedAt;
    updateValues.archivedAt = resolved.archivedAt;

    await db
      .update(schema.libraryItems)
      .set(updateValues)
      .where(
        and(
          eq(schema.libraryItems.id, itemId),
          eq(schema.libraryItems.userId, authUser.id)
        )
      );

    if (Array.isArray(rawInput.collectionIds)) {
      const cIds = rawInput.collectionIds.filter(
        (id): id is string => typeof id === 'string'
      );
      await syncItemCollectionMemberships(authUser.id, itemId, cIds);
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to update library item:', err);
    return {
      status: 'error',
      message: 'Unable to update library item right now. Please try again.',
    };
  }
}

export async function deleteLibraryItemForUser(
  authUser: AuthenticatedUserIdentity,
  itemId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(itemId)) {
    return { status: 'not_found', message: 'Library item not found.' };
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.libraryItems)
      .where(
        and(
          eq(schema.libraryItems.id, itemId),
          eq(schema.libraryItems.userId, authUser.id)
        )
      )
      .limit(1);

    const existing = rows[0];
    if (!existing) {
      return { status: 'not_found', message: 'Library item not found.' };
    }

    // Delete stored object first if present
    if (existing.storageKey && existing.storageBucket) {
      const delStorage = await deletePrivateStorageObject({
        bucket: existing.storageBucket,
        storageKey: existing.storageKey,
      });
      if (!delStorage.ok) {
        return {
          status: 'error',
          message:
            'Could not delete the stored book file from object storage. The library item was kept so no orphaned file is left behind.',
        };
      }
    }

    await db
      .delete(schema.libraryItems)
      .where(
        and(
          eq(schema.libraryItems.id, itemId),
          eq(schema.libraryItems.userId, authUser.id)
        )
      );

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to delete library item:', err);
    return {
      status: 'error',
      message: 'Unable to delete library item right now. Please try again.',
    };
  }
}

/**
 * Authorizes private reading or download access for an uploaded book.
 * Strictly derives `storageKey` from the user-owned database record.
 */
export async function getAuthorizedBookStreamForUser(
  authUser: AuthenticatedUserIdentity,
  itemId: string,
  disposition: 'inline' | 'attachment' = 'inline'
): Promise<
  | {
      status: 'ok';
      bytes: Uint8Array;
      mimeType: string;
      originalFilename: string;
      presignedUrl: string | null;
    }
  | { status: 'not_found'; message: string }
  | { status: 'missing_file'; message: string }
> {
  if (!isValidUuid(itemId)) {
    return { status: 'not_found', message: 'Book not found.' };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.libraryItems)
    .where(
      and(
        eq(schema.libraryItems.id, itemId),
        eq(schema.libraryItems.userId, authUser.id)
      )
    )
    .limit(1);

  const item = rows[0];
  if (!item || !item.storageKey || !item.storageBucket) {
    return { status: 'not_found', message: 'Book file not found.' };
  }

  // Record last_opened_at
  const now = new Date();
  await db
    .update(schema.libraryItems)
    .set({ lastOpenedAt: now, updatedAt: now })
    .where(
      and(
        eq(schema.libraryItems.id, itemId),
        eq(schema.libraryItems.userId, authUser.id)
      )
    );

  const presignedUrl = await createShortLivedPresignedDownloadUrl({
    bucket: item.storageBucket,
    storageKey: item.storageKey,
    originalFilename: item.originalFilename,
    disposition,
  });

  const readRes = await readPrivateStorageObjectBytes({
    bucket: item.storageBucket,
    storageKey: item.storageKey,
  });

  if (!readRes.ok) {
    return {
      status: 'missing_file',
      message: readRes.error,
    };
  }

  return {
    status: 'ok',
    bytes: readRes.bytes,
    mimeType:
      item.mimeType ||
      (item.itemType === 'epub' ? 'application/epub+zip' : 'application/pdf'),
    originalFilename:
      item.originalFilename ||
      `${item.title}.${item.itemType === 'epub' ? 'epub' : 'pdf'}`,
    presignedUrl,
  };
}

/**
 * Custom Collections CRUD (100% User-Controlled)
 */
export async function createCollectionForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; collectionId: string }
  | { status: 'validation_error'; message: string }
  | { status: 'error'; message: string }
> {
  const validated = validateCollectionInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
    };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    // Check case-insensitive per-user duplicate name
    const existingDup = await db
      .select({ id: schema.libraryCollections.id })
      .from(schema.libraryCollections)
      .where(
        and(
          eq(schema.libraryCollections.userId, authUser.id),
          sql`lower(btrim(${schema.libraryCollections.name})) = lower(btrim(${validated.data.name}))`
        )
      )
      .limit(1);

    if (existingDup.length > 0) {
      return {
        status: 'validation_error',
        message: 'You already have a collection with this name.',
      };
    }

    const now = new Date();
    const inserted = await db
      .insert(schema.libraryCollections)
      .values({
        userId: authUser.id,
        name: validated.data.name,
        description: validated.data.description,
        color: validated.data.color,
        icon: validated.data.icon,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.libraryCollections.id });

    return {
      status: 'ok',
      collectionId: inserted[0]?.id ?? '',
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to create collection:', err);
    return {
      status: 'error',
      message: 'Unable to create collection right now. Please try again.',
    };
  }
}

export async function updateCollectionForUser(
  authUser: AuthenticatedUserIdentity,
  collectionId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok' }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(collectionId)) {
    return { status: 'not_found', message: 'Collection not found.' };
  }

  const validated = validateCollectionInput(rawInput);
  if (!validated.valid) {
    return {
      status: 'validation_error',
      message: validated.error,
    };
  }

  try {
    const db = getDb();
    const existingRows = await db
      .select()
      .from(schema.libraryCollections)
      .where(
        and(
          eq(schema.libraryCollections.id, collectionId),
          eq(schema.libraryCollections.userId, authUser.id)
        )
      )
      .limit(1);

    if (existingRows.length === 0) {
      return { status: 'not_found', message: 'Collection not found.' };
    }

    // Check case-insensitive duplicate name against other collections owned by user
    const dupRows = await db
      .select({ id: schema.libraryCollections.id })
      .from(schema.libraryCollections)
      .where(
        and(
          eq(schema.libraryCollections.userId, authUser.id),
          sql`${schema.libraryCollections.id} <> ${collectionId}`,
          sql`lower(btrim(${schema.libraryCollections.name})) = lower(btrim(${validated.data.name}))`
        )
      )
      .limit(1);

    if (dupRows.length > 0) {
      return {
        status: 'validation_error',
        message: 'You already have another collection with this name.',
      };
    }

    await db
      .update(schema.libraryCollections)
      .set({
        name: validated.data.name,
        description: validated.data.description,
        color: validated.data.color,
        icon: validated.data.icon,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.libraryCollections.id, collectionId),
          eq(schema.libraryCollections.userId, authUser.id)
        )
      );

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to update collection:', err);
    return {
      status: 'error',
      message: 'Unable to update collection right now. Please try again.',
    };
  }
}

export async function deleteCollectionForUser(
  authUser: AuthenticatedUserIdentity,
  collectionId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(collectionId)) {
    return { status: 'not_found', message: 'Collection not found.' };
  }

  try {
    const db = getDb();
    // Deleting the collection cascades library_collection_items rows ONLY; books and stored files remain untouched.
    const deleted = await db
      .delete(schema.libraryCollections)
      .where(
        and(
          eq(schema.libraryCollections.id, collectionId),
          eq(schema.libraryCollections.userId, authUser.id)
        )
      )
      .returning({ id: schema.libraryCollections.id });

    if (deleted.length === 0) {
      return { status: 'not_found', message: 'Collection not found.' };
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to delete collection:', err);
    return {
      status: 'error',
      message: 'Unable to delete collection right now. Please try again.',
    };
  }
}

/**
 * Bookmarks CRUD
 */
export async function createBookmarkForUser(
  authUser: AuthenticatedUserIdentity,
  itemId: string,
  rawInput: Record<string, unknown>
): Promise<
  | {
      status: 'ok';
      bookmarkId: string;
      bookmark: {
        id: string;
        libraryItemId: string;
        label: string;
        position: string;
        pageNumber: number | null;
        createdAt: string;
        createdAtLabel: string;
      };
    }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(itemId)) {
    return { status: 'not_found', message: 'Library item not found.' };
  }

  const label =
    typeof rawInput.label === 'string' ? rawInput.label.trim() : '';
  const position =
    typeof rawInput.position === 'string'
      ? rawInput.position.trim()
      : typeof rawInput.position === 'object' && rawInput.position !== null
        ? JSON.stringify(rawInput.position)
        : '';

  if (!label || label.length > BOOKMARK_LABEL_MAX_LENGTH || !position) {
    return {
      status: 'validation_error',
      message: 'Bookmark label and reading position are required.',
    };
  }

  const pageNumber =
    rawInput.pageNumber !== undefined &&
    rawInput.pageNumber !== null &&
    Number.isInteger(Number(rawInput.pageNumber))
      ? Number(rawInput.pageNumber)
      : null;

  try {
    const db = getDb();
    const itemRows = await db
      .select({ id: schema.libraryItems.id })
      .from(schema.libraryItems)
      .where(
        and(
          eq(schema.libraryItems.id, itemId),
          eq(schema.libraryItems.userId, authUser.id)
        )
      )
      .limit(1);

    if (itemRows.length === 0) {
      return { status: 'not_found', message: 'Library item not found.' };
    }

    const now = new Date();
    const inserted = await db
      .insert(schema.libraryBookmarks)
      .values({
        libraryItemId: itemId,
        userId: authUser.id,
        label,
        position,
        pageNumber,
        createdAt: now,
      })
      .returning({ id: schema.libraryBookmarks.id });

    const bookmarkId = inserted[0]?.id ?? '';
    return {
      status: 'ok',
      bookmarkId,
      bookmark: {
        id: bookmarkId,
        libraryItemId: itemId,
        label,
        position,
        pageNumber,
        createdAt: now.toISOString(),
        createdAtLabel: 'Just now',
      },
    };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to create bookmark:', err);
    return {
      status: 'error',
      message: 'Unable to save bookmark right now.',
    };
  }
}

export async function deleteBookmarkForUser(
  authUser: AuthenticatedUserIdentity,
  itemId: string,
  bookmarkId: string
): Promise<
  | { status: 'ok' }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(itemId) || !isValidUuid(bookmarkId)) {
    return { status: 'not_found', message: 'Bookmark not found.' };
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(schema.libraryBookmarks)
      .where(
        and(
          eq(schema.libraryBookmarks.id, bookmarkId),
          eq(schema.libraryBookmarks.libraryItemId, itemId),
          eq(schema.libraryBookmarks.userId, authUser.id)
        )
      )
      .returning({ id: schema.libraryBookmarks.id });

    if (deleted.length === 0) {
      return { status: 'not_found', message: 'Bookmark not found.' };
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[LifeCraft Library] Failed to delete bookmark:', err);
    return {
      status: 'error',
      message: 'Unable to delete bookmark right now.',
    };
  }
}
