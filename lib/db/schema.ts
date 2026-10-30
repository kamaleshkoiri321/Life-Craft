import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * LifeCraft Phase 3 — Application Database Schema (public schema)
 *
 * Authentication records live in the Neon-managed `neon_auth` schema and are never
 * modified by application migrations. Every application record is scoped to the
 * authenticated user's `user_id` and linked with cascading foreign keys.
 */

export const userProfiles = pgTable('user_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  timezone: text('timezone').notNull().default('Asia/Kathmandu'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    theme: text('theme').notNull().default('light'),
    weekStartsOn: integer('week_starts_on').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'user_preferences_theme_check',
      sql`${table.theme} IN ('light', 'dark', 'system')`
    ),
    check(
      'user_preferences_week_starts_on_check',
      sql`${table.weekStartsOn} >= 0 AND ${table.weekStartsOn} <= 6`
    ),
  ]
);

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').notNull().default('todo'),
    priority: text('priority').notNull().default('medium'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }),
    isAllDay: boolean('is_all_day').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('tasks_user_id_idx').on(table.userId),
    index('tasks_user_due_at_idx').on(table.userId, table.dueAt),
    index('tasks_user_status_idx').on(table.userId, table.status),
    index('tasks_user_scheduled_start_idx').on(
      table.userId,
      table.scheduledStartAt
    ),
    index('tasks_user_scheduled_end_idx').on(
      table.userId,
      table.scheduledEndAt
    ),
    check(
      'tasks_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'tasks_status_check',
      sql`${table.status} IN ('todo', 'in_progress', 'completed', 'archived')`
    ),
    check(
      'tasks_priority_check',
      sql`${table.priority} IN ('low', 'medium', 'high')`
    ),
    check(
      'tasks_scheduled_range_check',
      sql`(${table.scheduledStartAt} IS NULL AND ${table.scheduledEndAt} IS NULL) OR (${table.scheduledStartAt} IS NOT NULL AND ${table.scheduledEndAt} IS NOT NULL AND ${table.scheduledEndAt} > ${table.scheduledStartAt})`
    ),
  ]
);

export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    googleAccountId: text('google_account_id').notNull(),
    googleEmail: text('google_email').notNull(),
    calendarId: text('calendar_id').notNull().default('primary'),
    grantedScopes: text('granted_scopes').notNull(),
    encryptedRefreshToken: text('encrypted_refresh_token'),
    encryptedAccessToken: text('encrypted_access_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    status: text('status').notNull().default('connected'),
    lastError: text('last_error'),
    connectedAt: timestamp('connected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_connections_user_id_unique').on(table.userId),
    check(
      'google_calendar_connections_status_check',
      sql`${table.status} IN ('connected', 'expired', 'revoked', 'error')`
    ),
  ]
);

export const googleCalendarEventMappings = pgTable(
  'google_calendar_event_mappings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull().default('primary'),
    googleEventId: text('google_event_id').notNull(),
    googleHtmlLink: text('google_html_link'),
    exportedAt: timestamp('exported_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('google_calendar_event_mappings_user_task_unique').on(
      table.userId,
      table.taskId
    ),
    uniqueIndex('google_calendar_event_mappings_user_event_unique').on(
      table.userId,
      table.googleCalendarId,
      table.googleEventId
    ),
    index('google_calendar_event_mappings_user_id_idx').on(table.userId),
  ]
);

export const habits = pgTable(
  'habits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    targetPerWeek: integer('target_per_week').notNull().default(5),
    scheduledDays: integer('scheduled_days').array(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('habits_user_id_idx').on(table.userId),
    index('habits_user_active_idx').on(table.userId, table.isActive),
    uniqueIndex('habits_id_user_id_unique').on(table.id, table.userId),
    check(
      'habits_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'habits_target_per_week_check',
      sql`${table.targetPerWeek} >= 1 AND ${table.targetPerWeek} <= 7`
    ),
  ]
);

export const habitLogs = pgTable(
  'habit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    habitId: uuid('habit_id')
      .notNull()
      .references(() => habits.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    completedOn: date('completed_on', { mode: 'string' }).notNull(),
    status: text('status').notNull().default('completed'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('habit_logs_habit_completed_on_unique').on(
      table.habitId,
      table.completedOn
    ),
    index('habit_logs_user_completed_on_idx').on(
      table.userId,
      table.completedOn
    ),
    index('habit_logs_habit_completed_on_idx').on(
      table.habitId,
      table.completedOn
    ),
    check(
      'habit_logs_status_check',
      sql`${table.status} IN ('completed', 'skipped')`
    ),
  ]
);

export const goals = pgTable(
  'goals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull().default('Personal Growth'),
    status: text('status').notNull().default('active'),
    targetDate: date('target_date', { mode: 'string' }),
    progressPercent: integer('progress_percent').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('goals_user_id_idx').on(table.userId),
    index('goals_user_status_idx').on(table.userId, table.status),
    index('goals_user_target_date_idx').on(table.userId, table.targetDate),
    uniqueIndex('goals_id_user_id_unique').on(table.id, table.userId),
    check(
      'goals_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'goals_category_non_empty_check',
      sql`char_length(btrim(${table.category})) > 0`
    ),
    check(
      'goals_status_check',
      sql`${table.status} IN ('active', 'paused', 'completed', 'archived')`
    ),
    check(
      'goals_progress_percent_check',
      sql`${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100`
    ),
  ]
);

export const goalMilestones = pgTable(
  'goal_milestones',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    targetDate: date('target_date', { mode: 'string' }),
    status: text('status').notNull().default('pending'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('goal_milestones_goal_id_sort_idx').on(table.goalId, table.sortOrder),
    index('goal_milestones_user_id_idx').on(table.userId),
    check(
      'goal_milestones_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'goal_milestones_status_check',
      sql`${table.status} IN ('pending', 'completed')`
    ),
  ]
);

export const goalProgressEntries = pgTable(
  'goal_progress_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    goalId: uuid('goal_id')
      .notNull()
      .references(() => goals.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    progressPercent: integer('progress_percent').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('goal_progress_entries_goal_created_idx').on(
      table.goalId,
      table.createdAt
    ),
    index('goal_progress_entries_user_id_idx').on(table.userId),
    check(
      'goal_progress_entries_progress_percent_check',
      sql`${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100`
    ),
  ]
);

export const noteFolders = pgTable(
  'note_folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('lime'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('note_folders_id_user_id_unique').on(table.id, table.userId),
    index('note_folders_user_id_idx').on(table.userId),
    check(
      'note_folders_name_non_empty_check',
      sql`char_length(btrim(${table.name})) > 0`
    ),
    check(
      'note_folders_color_check',
      sql`${table.color} IN ('lime', 'violet', 'emerald', 'amber', 'rose', 'sky', 'slate')`
    ),
  ]
);

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    folderId: uuid('folder_id').references(() => noteFolders.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    entryType: text('entry_type').notNull().default('note'),
    journalDate: date('journal_date', { mode: 'string' }),
    mood: text('mood'),
    iconStyle: text('icon_style').notNull().default('leaf'),
    isPinned: boolean('is_pinned').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    trashedAt: timestamp('trashed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('notes_id_user_id_unique').on(table.id, table.userId),
    index('notes_user_id_idx').on(table.userId),
    index('notes_user_updated_at_idx').on(table.userId, table.updatedAt),
    index('notes_user_folder_idx').on(table.userId, table.folderId),
    index('notes_user_entry_type_idx').on(
      table.userId,
      table.entryType,
      table.journalDate
    ),
    index('notes_user_pinned_idx').on(table.userId, table.isPinned),
    index('notes_user_archived_trashed_idx').on(
      table.userId,
      table.archivedAt,
      table.trashedAt
    ),
    check(
      'notes_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'notes_entry_type_check',
      sql`${table.entryType} IN ('note', 'journal')`
    ),
  ]
);

export const noteTags = pgTable(
  'note_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('violet'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('note_tags_id_user_id_unique').on(table.id, table.userId),
    index('note_tags_user_id_idx').on(table.userId),
    check(
      'note_tags_name_non_empty_check',
      sql`char_length(btrim(${table.name})) > 0`
    ),
    check(
      'note_tags_color_check',
      sql`${table.color} IN ('lime', 'violet', 'emerald', 'amber', 'rose', 'sky', 'slate')`
    ),
  ]
);

export const noteTagAssignments = pgTable(
  'note_tag_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => noteTags.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('note_tag_assignments_unique').on(table.noteId, table.tagId),
    index('note_tag_assignments_user_id_idx').on(table.userId),
    index('note_tag_assignments_note_id_idx').on(table.noteId),
    index('note_tag_assignments_tag_id_idx').on(table.tagId),
  ]
);

export const libraryItems = pgTable(
  'library_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author'),
    description: text('description'),
    itemType: text('item_type').notNull(),
    readingStatus: text('reading_status').notNull().default('to_read'),
    storageKey: text('storage_key'),
    storageBucket: text('storage_bucket'),
    originalFilename: text('original_filename'),
    mimeType: text('mime_type'),
    fileSizeBytes: integer('file_size_bytes'),
    externalUrl: text('external_url'),
    coverStyle: text('cover_style').notNull().default('forest'),
    progressPercent: integer('progress_percent').notNull().default(0),
    currentPage: integer('current_page'),
    totalPages: integer('total_pages'),
    readingPosition: text('reading_position'),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('library_items_id_user_id_unique').on(table.id, table.userId),
    index('library_items_user_id_idx').on(table.userId),
    index('library_items_user_status_idx').on(
      table.userId,
      table.readingStatus
    ),
    index('library_items_user_type_idx').on(table.userId, table.itemType),
    index('library_items_user_last_opened_idx').on(
      table.userId,
      table.lastOpenedAt
    ),
    check(
      'library_items_title_non_empty_check',
      sql`char_length(btrim(${table.title})) > 0`
    ),
    check(
      'library_items_item_type_check',
      sql`${table.itemType} IN ('pdf', 'epub', 'book', 'link')`
    ),
    check(
      'library_items_reading_status_check',
      sql`${table.readingStatus} IN ('to_read', 'reading', 'completed', 'on_hold', 'archived')`
    ),
    check(
      'library_items_progress_percent_check',
      sql`${table.progressPercent} >= 0 AND ${table.progressPercent} <= 100`
    ),
    check(
      'library_items_file_size_check',
      sql`${table.fileSizeBytes} IS NULL OR (${table.fileSizeBytes} > 0 AND ${table.fileSizeBytes} <= 52428800)`
    ),
  ]
);

export const libraryCollections = pgTable(
  'library_collections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('violet'),
    icon: text('icon').notNull().default('folder'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('library_collections_id_user_id_unique').on(
      table.id,
      table.userId
    ),
    index('library_collections_user_id_idx').on(table.userId),
    check(
      'library_collections_name_non_empty_check',
      sql`char_length(btrim(${table.name})) > 0`
    ),
  ]
);

export const libraryCollectionItems = pgTable(
  'library_collection_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => libraryCollections.id, { onDelete: 'cascade' }),
    libraryItemId: uuid('library_item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('library_collection_items_unique').on(
      table.collectionId,
      table.libraryItemId
    ),
    index('library_collection_items_user_id_idx').on(table.userId),
    index('library_collection_items_item_id_idx').on(table.libraryItemId),
  ]
);

export const libraryBookmarks = pgTable(
  'library_bookmarks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    libraryItemId: uuid('library_item_id')
      .notNull()
      .references(() => libraryItems.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    position: text('position').notNull(),
    pageNumber: integer('page_number'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('library_bookmarks_item_created_idx').on(
      table.libraryItemId,
      table.createdAt
    ),
    index('library_bookmarks_user_id_idx').on(table.userId),
    check(
      'library_bookmarks_label_non_empty_check',
      sql`char_length(btrim(${table.label})) > 0`
    ),
    check(
      'library_bookmarks_position_non_empty_check',
      sql`char_length(btrim(${table.position})) > 0`
    ),
  ]
);

export const libraryUploadSessions = pgTable(
  'library_upload_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    storageBucket: text('storage_bucket').notNull(),
    originalFilename: text('original_filename').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    itemType: text('item_type').notNull(),
    title: text('title').notNull(),
    author: text('author'),
    description: text('description'),
    coverStyle: text('cover_style').notNull().default('forest'),
    collectionIds: text('collection_ids').array().notNull(),
    status: text('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('library_upload_sessions_storage_key_unique').on(
      table.storageKey
    ),
    index('library_upload_sessions_user_id_idx').on(table.userId),
  ]
);

export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => userProfiles.userId, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, {
      onDelete: 'set null',
    }),
    sessionType: text('session_type').notNull(),
    presetId: text('preset_id').notNull().default('pomodoro'),
    status: text('status').notNull().default('running'),
    plannedDurationSeconds: integer('planned_duration_seconds')
      .notNull()
      .default(1500),
    actualDurationSeconds: integer('actual_duration_seconds')
      .notNull()
      .default(0),
    lapsJson: text('laps_json'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastResumedAt: timestamp('last_resumed_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('focus_sessions_id_user_id_unique').on(table.id, table.userId),
    index('focus_sessions_user_started_idx').on(table.userId, table.startedAt),
    index('focus_sessions_user_status_idx').on(table.userId, table.status),
    index('focus_sessions_user_completed_idx').on(
      table.userId,
      table.sessionType,
      table.status,
      table.completedAt
    ),
    index('focus_sessions_user_task_idx').on(table.userId, table.taskId),
    check(
      'focus_sessions_session_type_check',
      sql`${table.sessionType} IN ('focus', 'short_break', 'long_break', 'stopwatch')`
    ),
    check(
      'focus_sessions_preset_id_check',
      sql`${table.presetId} IN ('pomodoro', 'deep_focus', 'extended_focus', 'custom', 'stopwatch')`
    ),
    check(
      'focus_sessions_status_check',
      sql`${table.status} IN ('running', 'paused', 'completed', 'interrupted')`
    ),
    check(
      'focus_sessions_planned_duration_check',
      sql`(${table.sessionType} = 'stopwatch' AND ${table.plannedDurationSeconds} = 0) OR (${table.sessionType} IN ('focus', 'short_break', 'long_break') AND ${table.plannedDurationSeconds} >= 60 AND ${table.plannedDurationSeconds} <= 43200)`
    ),
    check(
      'focus_sessions_actual_duration_check',
      sql`${table.actualDurationSeconds} >= 0 AND ${table.actualDurationSeconds} <= 86400`
    ),
  ]
);

export type UserProfileRow = typeof userProfiles.$inferSelect;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type GoogleCalendarConnectionRow =
  typeof googleCalendarConnections.$inferSelect;
export type GoogleCalendarEventMappingRow =
  typeof googleCalendarEventMappings.$inferSelect;
export type HabitRow = typeof habits.$inferSelect;
export type HabitLogRow = typeof habitLogs.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type GoalMilestoneRow = typeof goalMilestones.$inferSelect;
export type GoalProgressEntryRow = typeof goalProgressEntries.$inferSelect;
export type NoteFolderRow = typeof noteFolders.$inferSelect;
export type NoteRow = typeof notes.$inferSelect;
export type NoteTagRow = typeof noteTags.$inferSelect;
export type NoteTagAssignmentRow = typeof noteTagAssignments.$inferSelect;
export type LibraryItemRow = typeof libraryItems.$inferSelect;
export type LibraryCollectionRow = typeof libraryCollections.$inferSelect;
export type LibraryCollectionItemRow =
  typeof libraryCollectionItems.$inferSelect;
export type LibraryBookmarkRow = typeof libraryBookmarks.$inferSelect;
export type LibraryUploadSessionRow = typeof libraryUploadSessions.$inferSelect;
export type FocusSessionRow = typeof focusSessions.$inferSelect;
