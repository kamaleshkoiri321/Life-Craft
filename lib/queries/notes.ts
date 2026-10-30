import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, schema } from '../db';
import {
  ensureUserProfile,
  type AuthenticatedUserIdentity,
} from './dashboard';
import { isValidUuid } from './tasks';
import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveValidTimezone,
} from './timezone';
import {
  FOLDER_DESCRIPTION_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  MOOD_MAX_LENGTH,
  NOTE_COLOR_OPTIONS,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_TITLE_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  buildNotesViewModel,
  isValidCalendarDateString,
  normalizeNoteColor,
  normalizeNoteIconStyle,
  validateNoteFolderInput,
  validateNoteInput,
  validateNoteTagInput,
  type NoteColorOption,
  type NoteEntryType,
  type NotesSummaryMetrics,
  type SerializedNote,
  type SerializedNoteFolder,
  type SerializedNoteTag,
} from '../notes/note-utils';

export interface NotesWorkspaceData {
  timezone: string;
  todayLocalDate: string;
  summary: NotesSummaryMetrics;
  notes: SerializedNote[];
  folders: SerializedNoteFolder[];
  tags: SerializedNoteTag[];
}

export type NotesWorkspaceResult =
  | { status: 'ok'; data: NotesWorkspaceData }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

const TAG_PALETTE_CYCLE: NoteColorOption[] = [
  'violet',
  'emerald',
  'sky',
  'amber',
  'rose',
  'lime',
  'slate',
];

/**
 * Verifies that `folderId` exists and belongs to `userId`.
 */
async function verifyOwnedFolderId(
  userId: string,
  folderId: string | null | undefined
): Promise<{ valid: true; folderId: string | null } | { valid: false; error: string }> {
  if (!folderId) {
    return { valid: true, folderId: null };
  }
  if (!isValidUuid(folderId)) {
    return { valid: false, error: 'Selected folder was not found.' };
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.noteFolders.id })
    .from(schema.noteFolders)
    .where(
      and(
        eq(schema.noteFolders.id, folderId),
        eq(schema.noteFolders.userId, userId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    return { valid: false, error: 'Selected folder was not found.' };
  }
  return { valid: true, folderId: rows[0].id };
}

/**
 * Resolves or creates user-defined tags by name for `userId` and replaces `note_tag_assignments` for `noteId`.
 */
async function syncNoteTagsForUser(params: {
  userId: string;
  noteId: string;
  tagNames: string[];
}): Promise<void> {
  const db = getDb();
  const { userId, noteId, tagNames } = params;

  const cleanedNames: string[] = [];
  const seenLower = new Set<string>();
  for (const raw of tagNames) {
    const cleaned = raw.trim().replace(/^#+/, '').trim();
    if (!cleaned || cleaned.length > TAG_NAME_MAX_LENGTH) continue;
    const lower = cleaned.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      cleanedNames.push(cleaned);
    }
  }

  if (cleanedNames.length === 0) {
    await db
      .delete(schema.noteTagAssignments)
      .where(
        and(
          eq(schema.noteTagAssignments.noteId, noteId),
          eq(schema.noteTagAssignments.userId, userId)
        )
      );
    return;
  }

  // Fetch all existing tags for this user to match case-insensitively
  const existingUserTags = await db
    .select()
    .from(schema.noteTags)
    .where(eq(schema.noteTags.userId, userId));

  const byLowerName = new Map<string, typeof schema.noteTags.$inferSelect>();
  for (const t of existingUserTags) {
    byLowerName.set(t.name.trim().toLowerCase(), t);
  }

  const resolvedTagIds: string[] = [];
  let colorIdx = existingUserTags.length;

  for (const name of cleanedNames) {
    const lower = name.toLowerCase();
    const existing = byLowerName.get(lower);
    if (existing) {
      resolvedTagIds.push(existing.id);
    } else {
      const chosenColor =
        TAG_PALETTE_CYCLE[colorIdx % TAG_PALETTE_CYCLE.length] ?? 'violet';
      colorIdx += 1;
      const inserted = await db
        .insert(schema.noteTags)
        .values({
          userId,
          name,
          color: chosenColor,
        })
        .onConflictDoNothing()
        .returning();

      if (inserted[0]) {
        byLowerName.set(lower, inserted[0]);
        resolvedTagIds.push(inserted[0].id);
      } else {
        // Concurrent insert fallback
        const refetched = await db
          .select()
          .from(schema.noteTags)
          .where(
            and(
              eq(schema.noteTags.userId, userId),
              sql`lower(btrim(${schema.noteTags.name})) = ${lower}`
            )
          )
          .limit(1);
        if (refetched[0]) {
          byLowerName.set(lower, refetched[0]);
          resolvedTagIds.push(refetched[0].id);
        }
      }
    }
  }

  await db
    .delete(schema.noteTagAssignments)
    .where(
      and(
        eq(schema.noteTagAssignments.noteId, noteId),
        eq(schema.noteTagAssignments.userId, userId)
      )
    );

  if (resolvedTagIds.length > 0) {
    const now = new Date();
    await db
      .insert(schema.noteTagAssignments)
      .values(
        resolvedTagIds.map((tagId) => ({
          noteId,
          tagId,
          userId,
          createdAt: now,
        }))
      )
      .onConflictDoNothing();
  }
}

/**
 * Fetches all Notes, Folders, and Tags scoped strictly to `authUser.id`.
 * Never creates predefined folders or tags.
 */
export async function getNotesWorkspaceForUser(
  authUser: AuthenticatedUserIdentity
): Promise<NotesWorkspaceResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message:
        'Notes storage is not configured yet. Please check server settings.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const now = new Date();

    const [userNotes, userFolders, userTags, userAssignments] =
      await Promise.all([
        db
          .select()
          .from(schema.notes)
          .where(eq(schema.notes.userId, authUser.id))
          .orderBy(desc(schema.notes.isPinned), desc(schema.notes.updatedAt)),
        db
          .select()
          .from(schema.noteFolders)
          .where(eq(schema.noteFolders.userId, authUser.id))
          .orderBy(asc(schema.noteFolders.name)),
        db
          .select()
          .from(schema.noteTags)
          .where(eq(schema.noteTags.userId, authUser.id))
          .orderBy(asc(schema.noteTags.name)),
        db
          .select()
          .from(schema.noteTagAssignments)
          .where(eq(schema.noteTagAssignments.userId, authUser.id)),
      ]);

    const vm = buildNotesViewModel({
      notes: userNotes,
      folders: userFolders,
      tags: userTags,
      tagAssignments: userAssignments,
      timezone,
      now,
    });

    return {
      status: 'ok',
      data: {
        timezone,
        todayLocalDate: vm.todayLocalDate,
        summary: vm.summary,
        notes: vm.notes,
        folders: vm.folders,
        tags: vm.tags,
      },
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to load notes workspace:', err);
    return {
      status: 'error',
      message: 'Unable to load your notes right now. Please try again.',
    };
  }
}

export async function createNoteForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; note: SerializedNote; workspace: NotesWorkspaceData }
  | { status: 'validation_error'; message: string }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isDatabaseConfigured()) {
    return {
      status: 'unconfigured',
      message: 'Storage service is not configured.',
    };
  }

  try {
    const db = getDb();
    const { profile } = await ensureUserProfile(authUser);
    const timezone = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
    const todayLocalDate = getLocalDateString(new Date(), timezone);

    const validation = validateNoteInput(rawInput, {
      allowBlankTitleFallback: Boolean(rawInput.allowBlankTitleFallback),
      defaultTodayDate: todayLocalDate,
    });

    if (!validation.valid) {
      return {
        status: 'validation_error',
        message: validation.error,
      };
    }

    const folderCheck = await verifyOwnedFolderId(
      authUser.id,
      validation.data.folderId
    );
    if (!folderCheck.valid) {
      return {
        status: 'validation_error',
        message: folderCheck.error,
      };
    }

    const now = new Date();
    const insertedRows = await db
      .insert(schema.notes)
      .values({
        userId: authUser.id,
        folderId: folderCheck.folderId,
        title: validation.data.title,
        content: validation.data.content,
        entryType: validation.data.entryType,
        journalDate: validation.data.journalDate,
        mood: validation.data.mood,
        iconStyle: validation.data.iconStyle,
        isPinned: validation.data.isPinned,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const createdRow = insertedRows[0];
    if (!createdRow) {
      return {
        status: 'error',
        message: 'Failed to create note.',
      };
    }

    if (validation.data.tagNames.length > 0) {
      await syncNoteTagsForUser({
        userId: authUser.id,
        noteId: createdRow.id,
        tagNames: validation.data.tagNames,
      });
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return wsRes;
    }

    const serialized =
      wsRes.data.notes.find((n) => n.id === createdRow.id) ??
      wsRes.data.notes[0];

    return {
      status: 'ok',
      note: serialized!,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to create note:', err);
    return {
      status: 'error',
      message: 'Unable to save your note right now. Please try again.',
    };
  }
}

export async function updateNoteForUser(
  authUser: AuthenticatedUserIdentity,
  noteId: string,
  rawPatch: Record<string, unknown>
): Promise<
  | { status: 'ok'; note: SerializedNote; workspace: NotesWorkspaceData }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(noteId)) {
    return { status: 'not_found', message: 'Note not found.' };
  }

  try {
    const db = getDb();
    const existingRows = await db
      .select()
      .from(schema.notes)
      .where(
        and(eq(schema.notes.id, noteId), eq(schema.notes.userId, authUser.id))
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return { status: 'not_found', message: 'Note not found.' };
    }

    const now = new Date();
    const updatePayload: Partial<typeof schema.notes.$inferInsert> = {
      updatedAt: now,
    };

    // Lifecycle actions: archive, unarchive, trash, restore, toggle_pin
    const action =
      typeof rawPatch.action === 'string' ? rawPatch.action : undefined;

    if (action === 'archive') {
      updatePayload.archivedAt = now;
      updatePayload.trashedAt = null;
      updatePayload.isPinned = false;
    } else if (action === 'unarchive') {
      updatePayload.archivedAt = null;
    } else if (action === 'trash') {
      updatePayload.trashedAt = now;
      updatePayload.isPinned = false;
    } else if (action === 'restore') {
      updatePayload.trashedAt = null;
      updatePayload.archivedAt = null;
    } else if (action === 'toggle_pin') {
      updatePayload.isPinned = !existing.isPinned;
    }

    // Field updates
    if ('title' in rawPatch) {
      const rawTitle =
        typeof rawPatch.title === 'string' ? rawPatch.title.trim() : '';
      if (!rawTitle) {
        if (rawPatch.allowBlankTitleFallback) {
          updatePayload.title =
            existing.entryType === 'journal'
              ? `Journal — ${existing.journalDate || 'Entry'}`
              : 'Untitled note';
        } else {
          return {
            status: 'validation_error',
            message: 'Note title cannot be empty.',
          };
        }
      } else if (rawTitle.length > NOTE_TITLE_MAX_LENGTH) {
        return {
          status: 'validation_error',
          message: `Title must be ${NOTE_TITLE_MAX_LENGTH} characters or fewer.`,
        };
      } else {
        updatePayload.title = rawTitle;
      }
    }

    if ('content' in rawPatch) {
      if (typeof rawPatch.content !== 'string') {
        return {
          status: 'validation_error',
          message: 'Note content must be text.',
        };
      }
      if (rawPatch.content.length > NOTE_CONTENT_MAX_LENGTH) {
        return {
          status: 'validation_error',
          message: `Note content must be ${NOTE_CONTENT_MAX_LENGTH.toLocaleString()} characters or fewer.`,
        };
      }
      updatePayload.content = rawPatch.content;
    }

    if ('entryType' in rawPatch) {
      const nextType: NoteEntryType =
        rawPatch.entryType === 'journal' ? 'journal' : 'note';
      updatePayload.entryType = nextType;
      if (
        nextType === 'journal' &&
        !existing.journalDate &&
        !('journalDate' in rawPatch)
      ) {
        const { profile } = await ensureUserProfile(authUser);
        const tz = resolveValidTimezone(profile.timezone || DEFAULT_TIMEZONE);
        updatePayload.journalDate = getLocalDateString(now, tz);
      }
    }

    if ('journalDate' in rawPatch) {
      if (
        rawPatch.journalDate === null ||
        rawPatch.journalDate === ''
      ) {
        updatePayload.journalDate = null;
      } else if (isValidCalendarDateString(rawPatch.journalDate)) {
        // Strictly preserve user's selected historical or current date
        updatePayload.journalDate = rawPatch.journalDate;
      } else {
        return {
          status: 'validation_error',
          message: 'Journal date must be a valid YYYY-MM-DD calendar date.',
        };
      }
    }

    if ('mood' in rawPatch) {
      if (rawPatch.mood === null || rawPatch.mood === '') {
        updatePayload.mood = null;
      } else if (typeof rawPatch.mood === 'string') {
        const trimmedMood = rawPatch.mood.trim();
        if (trimmedMood.length > MOOD_MAX_LENGTH) {
          return {
            status: 'validation_error',
            message: `Mood label must be ${MOOD_MAX_LENGTH} characters or fewer.`,
          };
        }
        updatePayload.mood = trimmedMood || null;
      }
    }

    if ('iconStyle' in rawPatch) {
      const effectiveType: NoteEntryType =
        (updatePayload.entryType as NoteEntryType) ??
        (existing.entryType === 'journal' ? 'journal' : 'note');
      updatePayload.iconStyle = normalizeNoteIconStyle(
        rawPatch.iconStyle,
        effectiveType
      );
    }

    if ('isPinned' in rawPatch && typeof rawPatch.isPinned === 'boolean') {
      updatePayload.isPinned = rawPatch.isPinned;
    }

    if ('folderId' in rawPatch) {
      const rawFolderId =
        typeof rawPatch.folderId === 'string' && rawPatch.folderId.trim()
          ? rawPatch.folderId.trim()
          : null;
      const folderCheck = await verifyOwnedFolderId(authUser.id, rawFolderId);
      if (!folderCheck.valid) {
        return {
          status: 'validation_error',
          message: folderCheck.error,
        };
      }
      updatePayload.folderId = folderCheck.folderId;
    }

    await db
      .update(schema.notes)
      .set(updatePayload)
      .where(
        and(eq(schema.notes.id, noteId), eq(schema.notes.userId, authUser.id))
      );

    if ('tagNames' in rawPatch || 'tags' in rawPatch) {
      const rawTags = Array.isArray(rawPatch.tagNames)
        ? rawPatch.tagNames
        : Array.isArray(rawPatch.tags)
          ? rawPatch.tags
          : [];
      const stringTags = rawTags.filter(
        (t): t is string => typeof t === 'string'
      );
      await syncNoteTagsForUser({
        userId: authUser.id,
        noteId,
        tagNames: stringTags,
      });
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return {
        status: 'error',
        message: 'Note updated, but failed to reload workspace.',
      };
    }

    const updatedNote = wsRes.data.notes.find((n) => n.id === noteId);
    if (!updatedNote) {
      return { status: 'not_found', message: 'Note not found after update.' };
    }

    return {
      status: 'ok',
      note: updatedNote,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to update note:', err);
    return {
      status: 'error',
      message: 'Unable to save note changes right now. Please try again.',
    };
  }
}

export async function permanentlyDeleteNoteForUser(
  authUser: AuthenticatedUserIdentity,
  noteId: string
): Promise<
  | { status: 'ok'; workspace: NotesWorkspaceData }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(noteId)) {
    return { status: 'not_found', message: 'Note not found.' };
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(schema.notes)
      .where(
        and(eq(schema.notes.id, noteId), eq(schema.notes.userId, authUser.id))
      )
      .returning({ id: schema.notes.id });

    if (!deleted[0]) {
      return { status: 'not_found', message: 'Note not found.' };
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return {
        status: 'error',
        message: 'Note deleted, but failed to reload workspace.',
      };
    }

    return {
      status: 'ok',
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to permanently delete note:', err);
    return {
      status: 'error',
      message: 'Unable to delete note right now.',
    };
  }
}

export async function createNoteFolderForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | {
      status: 'ok';
      folder: SerializedNoteFolder;
      workspace: NotesWorkspaceData;
    }
  | { status: 'validation_error'; message: string }
  | { status: 'error'; message: string }
> {
  const validation = validateNoteFolderInput(rawInput);
  if (!validation.valid) {
    return { status: 'validation_error', message: validation.error };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    const duplicate = await db
      .select({ id: schema.noteFolders.id })
      .from(schema.noteFolders)
      .where(
        and(
          eq(schema.noteFolders.userId, authUser.id),
          sql`lower(btrim(${schema.noteFolders.name})) = ${validation.data.name.toLowerCase()}`
        )
      )
      .limit(1);

    if (duplicate[0]) {
      return {
        status: 'validation_error',
        message: `You already have a folder named "${validation.data.name}".`,
      };
    }

    const now = new Date();
    const inserted = await db
      .insert(schema.noteFolders)
      .values({
        userId: authUser.id,
        name: validation.data.name,
        description: validation.data.description,
        color: validation.data.color,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      return { status: 'error', message: 'Could not create folder.' };
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    const folder = wsRes.data.folders.find((f) => f.id === row.id) ?? {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      color: normalizeNoteColor(row.color),
      noteCount: 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };

    return {
      status: 'ok',
      folder,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to create folder:', err);
    return {
      status: 'error',
      message: 'Unable to create folder right now.',
    };
  }
}

export async function updateNoteFolderForUser(
  authUser: AuthenticatedUserIdentity,
  folderId: string,
  rawInput: Record<string, unknown>
): Promise<
  | {
      status: 'ok';
      folder: SerializedNoteFolder;
      workspace: NotesWorkspaceData;
    }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(folderId)) {
    return { status: 'not_found', message: 'Folder not found.' };
  }

  try {
    const db = getDb();
    const existingRows = await db
      .select()
      .from(schema.noteFolders)
      .where(
        and(
          eq(schema.noteFolders.id, folderId),
          eq(schema.noteFolders.userId, authUser.id)
        )
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return { status: 'not_found', message: 'Folder not found.' };
    }

    const merged = {
      name: 'name' in rawInput ? rawInput.name : existing.name,
      description:
        'description' in rawInput ? rawInput.description : existing.description,
      color: 'color' in rawInput ? rawInput.color : existing.color,
    };

    const validation = validateNoteFolderInput(merged);
    if (!validation.valid) {
      return { status: 'validation_error', message: validation.error };
    }

    const duplicate = await db
      .select({ id: schema.noteFolders.id })
      .from(schema.noteFolders)
      .where(
        and(
          eq(schema.noteFolders.userId, authUser.id),
          sql`lower(btrim(${schema.noteFolders.name})) = ${validation.data.name.toLowerCase()}`
        )
      )
      .limit(1);

    if (duplicate[0] && duplicate[0].id !== folderId) {
      return {
        status: 'validation_error',
        message: `You already have another folder named "${validation.data.name}".`,
      };
    }

    await db
      .update(schema.noteFolders)
      .set({
        name: validation.data.name,
        description: validation.data.description,
        color: validation.data.color,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.noteFolders.id, folderId),
          eq(schema.noteFolders.userId, authUser.id)
        )
      );

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    const folder = wsRes.data.folders.find((f) => f.id === folderId);
    if (!folder) {
      return { status: 'not_found', message: 'Folder not found.' };
    }

    return {
      status: 'ok',
      folder,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to update folder:', err);
    return {
      status: 'error',
      message: 'Unable to update folder right now.',
    };
  }
}

/**
 * Deletes a user-created folder while preserving all notes inside it (setting their folderId to NULL).
 */
export async function deleteNoteFolderForUser(
  authUser: AuthenticatedUserIdentity,
  folderId: string
): Promise<
  | { status: 'ok'; workspace: NotesWorkspaceData }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(folderId)) {
    return { status: 'not_found', message: 'Folder not found.' };
  }

  try {
    const db = getDb();
    const existing = await db
      .select({ id: schema.noteFolders.id })
      .from(schema.noteFolders)
      .where(
        and(
          eq(schema.noteFolders.id, folderId),
          eq(schema.noteFolders.userId, authUser.id)
        )
      )
      .limit(1);

    if (!existing[0]) {
      return { status: 'not_found', message: 'Folder not found.' };
    }

    // Explicitly unassign notes in this folder for this user before deleting the folder
    await db
      .update(schema.notes)
      .set({ folderId: null })
      .where(
        and(
          eq(schema.notes.userId, authUser.id),
          eq(schema.notes.folderId, folderId)
        )
      );

    await db
      .delete(schema.noteFolders)
      .where(
        and(
          eq(schema.noteFolders.id, folderId),
          eq(schema.noteFolders.userId, authUser.id)
        )
      );

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    return {
      status: 'ok',
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to delete folder:', err);
    return {
      status: 'error',
      message: 'Unable to delete folder right now.',
    };
  }
}

export async function createNoteTagForUser(
  authUser: AuthenticatedUserIdentity,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; tag: SerializedNoteTag; workspace: NotesWorkspaceData }
  | { status: 'validation_error'; message: string }
  | { status: 'error'; message: string }
> {
  const validation = validateNoteTagInput(rawInput);
  if (!validation.valid) {
    return { status: 'validation_error', message: validation.error };
  }

  try {
    const db = getDb();
    await ensureUserProfile(authUser);

    const duplicate = await db
      .select({ id: schema.noteTags.id })
      .from(schema.noteTags)
      .where(
        and(
          eq(schema.noteTags.userId, authUser.id),
          sql`lower(btrim(${schema.noteTags.name})) = ${validation.data.name.toLowerCase()}`
        )
      )
      .limit(1);

    if (duplicate[0]) {
      return {
        status: 'validation_error',
        message: `Tag "${validation.data.name}" already exists.`,
      };
    }

    const now = new Date();
    const inserted = await db
      .insert(schema.noteTags)
      .values({
        userId: authUser.id,
        name: validation.data.name,
        color: validation.data.color,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const row = inserted[0];
    if (!row) {
      return { status: 'error', message: 'Could not create tag.' };
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    const tag = wsRes.data.tags.find((t) => t.id === row.id) ?? {
      id: row.id,
      name: row.name,
      color: normalizeNoteColor(row.color),
      noteCount: 0,
    };

    return {
      status: 'ok',
      tag,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to create tag:', err);
    return {
      status: 'error',
      message: 'Unable to create tag right now.',
    };
  }
}

export async function updateNoteTagForUser(
  authUser: AuthenticatedUserIdentity,
  tagId: string,
  rawInput: Record<string, unknown>
): Promise<
  | { status: 'ok'; tag: SerializedNoteTag; workspace: NotesWorkspaceData }
  | { status: 'validation_error'; message: string }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(tagId)) {
    return { status: 'not_found', message: 'Tag not found.' };
  }

  try {
    const db = getDb();
    const existingRows = await db
      .select()
      .from(schema.noteTags)
      .where(
        and(
          eq(schema.noteTags.id, tagId),
          eq(schema.noteTags.userId, authUser.id)
        )
      )
      .limit(1);

    const existing = existingRows[0];
    if (!existing) {
      return { status: 'not_found', message: 'Tag not found.' };
    }

    const merged = {
      name: 'name' in rawInput ? rawInput.name : existing.name,
      color: 'color' in rawInput ? rawInput.color : existing.color,
    };

    const validation = validateNoteTagInput(merged);
    if (!validation.valid) {
      return { status: 'validation_error', message: validation.error };
    }

    const duplicate = await db
      .select({ id: schema.noteTags.id })
      .from(schema.noteTags)
      .where(
        and(
          eq(schema.noteTags.userId, authUser.id),
          sql`lower(btrim(${schema.noteTags.name})) = ${validation.data.name.toLowerCase()}`
        )
      )
      .limit(1);

    if (duplicate[0] && duplicate[0].id !== tagId) {
      return {
        status: 'validation_error',
        message: `You already have another tag named "${validation.data.name}".`,
      };
    }

    await db
      .update(schema.noteTags)
      .set({
        name: validation.data.name,
        color: validation.data.color,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.noteTags.id, tagId),
          eq(schema.noteTags.userId, authUser.id)
        )
      );

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    const tag = wsRes.data.tags.find((t) => t.id === tagId);
    if (!tag) {
      return { status: 'not_found', message: 'Tag not found.' };
    }

    return {
      status: 'ok',
      tag,
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to update tag:', err);
    return {
      status: 'error',
      message: 'Unable to update tag right now.',
    };
  }
}

/**
 * Deletes a user-defined tag, removing its note relationships without deleting any notes.
 */
export async function deleteNoteTagForUser(
  authUser: AuthenticatedUserIdentity,
  tagId: string
): Promise<
  | { status: 'ok'; workspace: NotesWorkspaceData }
  | { status: 'not_found'; message: string }
  | { status: 'error'; message: string }
> {
  if (!isValidUuid(tagId)) {
    return { status: 'not_found', message: 'Tag not found.' };
  }

  try {
    const db = getDb();
    const deleted = await db
      .delete(schema.noteTags)
      .where(
        and(
          eq(schema.noteTags.id, tagId),
          eq(schema.noteTags.userId, authUser.id)
        )
      )
      .returning({ id: schema.noteTags.id });

    if (!deleted[0]) {
      return { status: 'not_found', message: 'Tag not found.' };
    }

    const wsRes = await getNotesWorkspaceForUser(authUser);
    if (wsRes.status !== 'ok') {
      return { status: 'error', message: wsRes.message };
    }

    return {
      status: 'ok',
      workspace: wsRes.data,
    };
  } catch (err) {
    console.error('[LifeCraft Notes] Failed to delete tag:', err);
    return {
      status: 'error',
      message: 'Unable to delete tag right now.',
    };
  }
}
