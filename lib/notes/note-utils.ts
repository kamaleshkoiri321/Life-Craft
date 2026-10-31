import type {
  NoteFolderRow,
  NoteRow,
  NoteTagAssignmentRow,
  NoteTagRow,
} from '../db/schema';
import {
  DEFAULT_TIMEZONE,
  formatShortDate,
  getLocalDateString,
  resolveValidTimezone,
} from '../queries/timezone';

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_CONTENT_MAX_LENGTH = 100000;
export const FOLDER_NAME_MAX_LENGTH = 60;
export const FOLDER_DESCRIPTION_MAX_LENGTH = 240;
export const TAG_NAME_MAX_LENGTH = 40;
export const MOOD_MAX_LENGTH = 40;

export const NOTE_COLOR_OPTIONS = [
  'lime',
  'violet',
  'emerald',
  'amber',
  'rose',
  'sky',
  'slate',
] as const;

export type NoteColorOption = (typeof NOTE_COLOR_OPTIONS)[number];

export const NOTE_ICON_STYLES = [
  'leaf',
  'code',
  'mountain',
  'chart',
  'book',
  'dumbbell',
  'sparkles',
  'journal',
] as const;

export type NoteIconStyle = (typeof NOTE_ICON_STYLES)[number];

export const NOTE_ENTRY_TYPES = ['note', 'journal'] as const;
export type NoteEntryType = (typeof NOTE_ENTRY_TYPES)[number];

export type NotesFilterTab =
  | 'all'
  | 'recent'
  | 'pinned'
  | 'journal'
  | 'archived'
  | 'trash';

export type NotesSortOption =
  | 'updated_desc'
  | 'created_desc'
  | 'title_asc'
  | 'journal_date_desc';

export interface SerializedNoteTag {
  id: string;
  name: string;
  color: NoteColorOption;
  noteCount: number;
}

export interface SerializedNoteFolder {
  id: string;
  name: string;
  description: string | null;
  color: NoteColorOption;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedNote {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  entryType: NoteEntryType;
  journalDate: string | null;
  journalDateLabel: string | null;
  mood: string | null;
  iconStyle: NoteIconStyle;
  isPinned: boolean;
  folderId: string | null;
  folderName: string | null;
  folderColor: NoteColorOption | null;
  tags: Array<{
    id: string;
    name: string;
    color: NoteColorOption;
  }>;
  isArchived: boolean;
  isTrashed: boolean;
  archivedAt: string | null;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedAtLabel: string;
  createdAtLabel: string;
}

export interface NotesSummaryMetrics {
  totalActiveCount: number;
  pinnedCount: number;
  foldersCount: number;
  tagsCount: number;
  thisWeekCount: number;
  journalCount: number;
  archivedCount: number;
  trashedCount: number;
}

export function normalizeNoteColor(raw: unknown): NoteColorOption {
  if (
    typeof raw === 'string' &&
    (NOTE_COLOR_OPTIONS as readonly string[]).includes(raw)
  ) {
    return raw as NoteColorOption;
  }
  return 'violet';
}

export function normalizeNoteIconStyle(
  raw: unknown,
  entryType: NoteEntryType = 'note'
): NoteIconStyle {
  if (
    typeof raw === 'string' &&
    (NOTE_ICON_STYLES as readonly string[]).includes(raw)
  ) {
    return raw as NoteIconStyle;
  }
  return entryType === 'journal' ? 'journal' : 'leaf';
}

export function isValidCalendarDateString(val: unknown): val is string {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return false;
  }
  const [y, m, d] = val.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Strips Markdown formatting characters to create a clean plain-text preview excerpt.
 */
export function stripMarkdownToPlainText(markdown: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```\w*\n?/g, '').trim()
    )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '• ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildNoteExcerpt(content: string, maxLength = 120): string {
  const plain = stripMarkdownToPlainText(content);
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trimEnd()}...`;
}

/**
 * Validates URLs in Markdown links to block XSS / dangerous schemes (javascript:, data:, vbscript:).
 */
export function sanitizeMarkdownLinkUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (
      parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:'
    ) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export type InlineMarkdownToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

/**
 * Tokenizes inline markdown (bold, italic, inline code, safe links) without interpreting raw HTML.
 */
export function tokenizeInlineMarkdown(text: string): InlineMarkdownToken[] {
  if (!text) return [];
  const tokens: InlineMarkdownToken[] = [];
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        text: text.slice(lastIndex, match.index),
      });
    }

    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push({ type: 'code', text: token.slice(1, -1) });
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      tokens.push({ type: 'bold', text: token.slice(2, -2) });
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      tokens.push({ type: 'italic', text: token.slice(1, -1) });
    } else if (token.startsWith('[')) {
      const closeBracket = token.indexOf('](');
      if (closeBracket !== -1 && token.endsWith(')')) {
        const label = token.slice(1, closeBracket);
        const rawHref = token.slice(closeBracket + 2, -1);
        const safeHref = sanitizeMarkdownLinkUrl(rawHref);
        if (safeHref) {
          tokens.push({ type: 'link', text: label, href: safeHref });
        } else {
          tokens.push({ type: 'text', text: label });
        }
      } else {
        tokens.push({ type: 'text', text: token });
      }
    } else {
      tokens.push({ type: 'text', text: token });
    }

    lastIndex = pattern.lastIndex;
    if (match.index === pattern.lastIndex) {
      pattern.lastIndex++;
    }
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return tokens;
}

export type SafeMarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet_list'; items: string[] }
  | { type: 'ordered_list'; items: string[] }
  | {
      type: 'checklist';
      items: Array<{ checked: boolean; text: string; lineIndex: number }>;
    }
  | { type: 'blockquote'; lines: string[]; attribution: string | null }
  | { type: 'code_block'; language: string; code: string }
  | { type: 'divider' };

/**
 * Parses user-authored Markdown into safe structured blocks for rendering without dangerouslySetInnerHTML.
 */
export function parseSafeMarkdownBlocks(content: string): SafeMarkdownBlock[] {
  if (!content || !content.trim()) return [];
  const rawLines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: SafeMarkdownBlock[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const startIndex = i;
    const line = rawLines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < rawLines.length && !rawLines[i].trim().startsWith('```')) {
        codeLines.push(rawLines[i]);
        i += 1;
      }
      if (i < rawLines.length) i += 1; // skip closing ```
      blocks.push({
        type: 'code_block',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    // Horizontal divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      i += 1;
      continue;
    }

    // Heading (support 1-6 hashes, clamping to 1, 2, or 3)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(3, Math.max(1, headingMatch[1].length)) as
        | 1
        | 2
        | 3;
      blocks.push({
        type: 'heading',
        level,
        text: headingMatch[2].trim(),
      });
      i += 1;
      continue;
    }

    // Checklist (- [ ] or - [x])
    if (/^[-*+]\s+\[([ xX])\]\s+/.test(trimmed)) {
      const items: Array<{
        checked: boolean;
        text: string;
        lineIndex: number;
      }> = [];
      while (i < rawLines.length) {
        const currentTrimmed = rawLines[i].trim();
        const checkMatch = currentTrimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/);
        if (!checkMatch) break;
        items.push({
          checked: checkMatch[1].toLowerCase() === 'x',
          text: checkMatch[2],
          lineIndex: i,
        });
        i += 1;
      }
      if (items.length > 0) {
        blocks.push({ type: 'checklist', items });
      } else {
        i += 1;
      }
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const currentTrimmed = rawLines[i].trim();
        if (
          /^[-*+]\s+\[([ xX])\]\s+/.test(currentTrimmed) ||
          !/^[-*+]\s+/.test(currentTrimmed)
        ) {
          break;
        }
        items.push(currentTrimmed.replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      if (items.length > 0) {
        blocks.push({ type: 'bullet_list', items });
      } else {
        i += 1;
      }
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < rawLines.length) {
        const currentTrimmed = rawLines[i].trim();
        const orderedMatch = currentTrimmed.match(/^\d+\.\s+(.*)$/);
        if (!orderedMatch) break;
        items.push(orderedMatch[1]);
        i += 1;
      }
      if (items.length > 0) {
        blocks.push({ type: 'ordered_list', items });
      } else {
        i += 1;
      }
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < rawLines.length && rawLines[i].trim().startsWith('>')) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      let attribution: string | null = null;
      if (quoteLines.length > 1) {
        const lastLine = quoteLines[quoteLines.length - 1].trim();
        if (lastLine.startsWith('—') || lastLine.startsWith('--')) {
          attribution = lastLine.replace(/^(—|--)\s*/, '').trim();
          quoteLines.pop();
        }
      }
      blocks.push({
        type: 'blockquote',
        lines: quoteLines,
        attribution,
      });
      continue;
    }

    // Paragraph (any other text, including #hashtag, #### without space, or any regular lines)
    const paraLines: string[] = [];
    while (i < rawLines.length) {
      const cur = rawLines[i].trim();
      // On subsequent lines of a paragraph, stop if we hit an empty line or the start of a recognized new block
      if (paraLines.length > 0) {
        if (
          !cur ||
          cur.startsWith('```') ||
          cur.startsWith('>') ||
          /^(#{1,6})\s+(.+)$/.test(cur) ||
          /^[-*+]\s+/.test(cur) ||
          /^\d+\.\s+/.test(cur) ||
          /^(-{3,}|\*{3,}|_{3,})$/.test(cur)
        ) {
          break;
        }
      }
      paraLines.push(cur);
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: paraLines.join(' '),
      });
    }

    // Universal safety check: guarantee the outer loop always advances
    if (i <= startIndex) {
      i = startIndex + 1;
    }
  }

  return blocks;
}

export interface ValidatedNotePayload {
  title: string;
  content: string;
  entryType: NoteEntryType;
  journalDate: string | null;
  mood: string | null;
  iconStyle: NoteIconStyle;
  folderId: string | null;
  isPinned: boolean;
  tagNames: string[];
}

export function validateNoteInput(
  raw: Record<string, unknown>,
  options?: {
    allowBlankTitleFallback?: boolean;
    defaultTodayDate?: string;
  }
):
  | { valid: true; data: ValidatedNotePayload }
  | { valid: false; error: string } {
  const entryType: NoteEntryType =
    raw.entryType === 'journal' ? 'journal' : 'note';

  const defaultToday = options?.defaultTodayDate || '2026-10-29';

  let journalDate: string | null = null;
  if (raw.journalDate !== undefined && raw.journalDate !== null && raw.journalDate !== '') {
    if (!isValidCalendarDateString(raw.journalDate)) {
      return {
        valid: false,
        error: 'Journal date must be a valid YYYY-MM-DD calendar date.',
      };
    }
    journalDate = raw.journalDate;
  } else if (entryType === 'journal') {
    journalDate = defaultToday;
  }

  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  let title = rawTitle;

  if (!title) {
    if (options?.allowBlankTitleFallback) {
      title =
        entryType === 'journal'
          ? `Journal — ${journalDate || defaultToday}`
          : 'Untitled note';
    } else {
      return {
        valid: false,
        error: 'Note title is required.',
      };
    }
  }

  if (title.length > NOTE_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Title must be ${NOTE_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }

  const content = typeof raw.content === 'string' ? raw.content : '';
  if (content.length > NOTE_CONTENT_MAX_LENGTH) {
    return {
      valid: false,
      error: `Note content must be ${NOTE_CONTENT_MAX_LENGTH.toLocaleString()} characters or fewer.`,
    };
  }

  let mood: string | null = null;
  if (typeof raw.mood === 'string' && raw.mood.trim()) {
    const trimmedMood = raw.mood.trim();
    if (trimmedMood.length > MOOD_MAX_LENGTH) {
      return {
        valid: false,
        error: `Mood label must be ${MOOD_MAX_LENGTH} characters or fewer.`,
      };
    }
    mood = trimmedMood;
  }

  const folderId =
    typeof raw.folderId === 'string' && raw.folderId.trim()
      ? raw.folderId.trim()
      : null;

  const isPinned = Boolean(raw.isPinned);
  const iconStyle = normalizeNoteIconStyle(raw.iconStyle, entryType);

  const rawTags = Array.isArray(raw.tagNames)
    ? raw.tagNames
    : Array.isArray(raw.tags)
      ? raw.tags
      : [];

  const seenLower = new Set<string>();
  const tagNames: string[] = [];

  for (const item of rawTags) {
    if (typeof item !== 'string') continue;
    const cleaned = item.trim().replace(/^#+/, '').trim();
    if (!cleaned) continue;
    if (cleaned.length > TAG_NAME_MAX_LENGTH) {
      return {
        valid: false,
        error: `Tag "${cleaned.slice(0, 20)}..." exceeds ${TAG_NAME_MAX_LENGTH} characters.`,
      };
    }
    const lower = cleaned.toLowerCase();
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      tagNames.push(cleaned);
    }
  }

  return {
    valid: true,
    data: {
      title,
      content,
      entryType,
      journalDate,
      mood,
      iconStyle,
      folderId,
      isPinned,
      tagNames,
    },
  };
}

export function validateNoteFolderInput(raw: Record<string, unknown>):
  | {
      valid: true;
      data: {
        name: string;
        description: string | null;
        color: NoteColorOption;
      };
    }
  | { valid: false; error: string } {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return { valid: false, error: 'Folder name is required.' };
  }
  if (name.length > FOLDER_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Folder name must be ${FOLDER_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  let description: string | null = null;
  if (typeof raw.description === 'string' && raw.description.trim()) {
    const trimmedDesc = raw.description.trim();
    if (trimmedDesc.length > FOLDER_DESCRIPTION_MAX_LENGTH) {
      return {
        valid: false,
        error: `Folder description must be ${FOLDER_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      };
    }
    description = trimmedDesc;
  }

  const color = normalizeNoteColor(raw.color ?? 'lime');

  return {
    valid: true,
    data: { name, description, color },
  };
}

export function validateNoteTagInput(raw: Record<string, unknown>):
  | {
      valid: true;
      data: {
        name: string;
        color: NoteColorOption;
      };
    }
  | { valid: false; error: string } {
  const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
  const name = rawName.replace(/^#+/, '').trim();
  if (!name) {
    return { valid: false, error: 'Tag name is required.' };
  }
  if (name.length > TAG_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Tag name must be ${TAG_NAME_MAX_LENGTH} characters or fewer.`,
    };
  }

  const color = normalizeNoteColor(raw.color ?? 'violet');
  return {
    valid: true,
    data: { name, color },
  };
}

/**
 * Builds serialized notes, user-created folders, user-created tags, and genuine summary metrics.
 * Never fabricates predefined folders or tags.
 */
export function buildNotesViewModel(params: {
  notes: NoteRow[];
  folders: NoteFolderRow[];
  tags: NoteTagRow[];
  tagAssignments: NoteTagAssignmentRow[];
  timezone?: string;
  now?: Date;
}): {
  todayLocalDate: string;
  summary: NotesSummaryMetrics;
  notes: SerializedNote[];
  folders: SerializedNoteFolder[];
  tags: SerializedNoteTag[];
} {
  const tz = resolveValidTimezone(params.timezone || DEFAULT_TIMEZONE);
  const now = params.now ?? new Date();
  const todayLocalDate = getLocalDateString(now, tz);
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const folderMap = new Map<string, NoteFolderRow>();
  for (const f of params.folders) {
    folderMap.set(f.id, f);
  }

  const tagMap = new Map<string, NoteTagRow>();
  for (const t of params.tags) {
    tagMap.set(t.id, t);
  }

  const tagsByNoteId = new Map<
    string,
    Array<{ id: string; name: string; color: NoteColorOption }>
  >();
  const activeNoteIds = new Set<string>();

  for (const n of params.notes) {
    if (!n.archivedAt && !n.trashedAt) {
      activeNoteIds.add(n.id);
    }
  }

  const activeCountByTagId = new Map<string, number>();
  for (const assign of params.tagAssignments) {
    const tagRow = tagMap.get(assign.tagId);
    if (!tagRow) continue;
    const list = tagsByNoteId.get(assign.noteId) ?? [];
    if (!list.some((existing) => existing.id === tagRow.id)) {
      list.push({
        id: tagRow.id,
        name: tagRow.name,
        color: normalizeNoteColor(tagRow.color),
      });
      tagsByNoteId.set(assign.noteId, list);
    }
    if (activeNoteIds.has(assign.noteId)) {
      activeCountByTagId.set(
        tagRow.id,
        (activeCountByTagId.get(tagRow.id) ?? 0) + 1
      );
    }
  }

  const activeCountByFolderId = new Map<string, number>();
  let totalActiveCount = 0;
  let pinnedCount = 0;
  let thisWeekCount = 0;
  let journalCount = 0;
  let archivedCount = 0;
  let trashedCount = 0;

  const serializedNotes: SerializedNote[] = params.notes.map((n) => {
    const isTrashed = Boolean(n.trashedAt);
    const isArchived = !isTrashed && Boolean(n.archivedAt);
    const isActive = !isTrashed && !isArchived;
    const entryType: NoteEntryType =
      n.entryType === 'journal' ? 'journal' : 'note';

    if (isTrashed) {
      trashedCount += 1;
    } else if (isArchived) {
      archivedCount += 1;
    } else {
      totalActiveCount += 1;
      if (n.isPinned) pinnedCount += 1;
      if (entryType === 'journal') journalCount += 1;
      if (new Date(n.updatedAt).getTime() >= sevenDaysAgoMs) {
        thisWeekCount += 1;
      }
      if (n.folderId && folderMap.has(n.folderId)) {
        activeCountByFolderId.set(
          n.folderId,
          (activeCountByFolderId.get(n.folderId) ?? 0) + 1
        );
      }
    }

    const folderRow = n.folderId ? folderMap.get(n.folderId) : undefined;
    const assignedTags = (tagsByNoteId.get(n.id) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      id: n.id,
      title: n.title,
      content: n.content,
      excerpt: buildNoteExcerpt(n.content, 120),
      entryType,
      journalDate: n.journalDate ?? null,
      journalDateLabel: n.journalDate
        ? formatShortDate(n.journalDate, tz)
        : null,
      mood: n.mood ?? null,
      iconStyle: normalizeNoteIconStyle(n.iconStyle, entryType),
      isPinned: Boolean(n.isPinned),
      folderId: folderRow ? folderRow.id : null,
      folderName: folderRow ? folderRow.name : null,
      folderColor: folderRow ? normalizeNoteColor(folderRow.color) : null,
      tags: assignedTags,
      isArchived,
      isTrashed,
      archivedAt: n.archivedAt ? new Date(n.archivedAt).toISOString() : null,
      trashedAt: n.trashedAt ? new Date(n.trashedAt).toISOString() : null,
      createdAt: new Date(n.createdAt).toISOString(),
      updatedAt: new Date(n.updatedAt).toISOString(),
      updatedAtLabel: formatShortDate(n.updatedAt, tz) || 'Recently',
      createdAtLabel: formatShortDate(n.createdAt, tz) || 'Recently',
    };
  });

  const serializedFolders: SerializedNoteFolder[] = params.folders
    .map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description ?? null,
      color: normalizeNoteColor(f.color),
      noteCount: activeCountByFolderId.get(f.id) ?? 0,
      createdAt: new Date(f.createdAt).toISOString(),
      updatedAt: new Date(f.updatedAt).toISOString(),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const serializedTags: SerializedNoteTag[] = params.tags
    .map((t) => ({
      id: t.id,
      name: t.name,
      color: normalizeNoteColor(t.color),
      noteCount: activeCountByTagId.get(t.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.noteCount !== a.noteCount) return b.noteCount - a.noteCount;
      return a.name.localeCompare(b.name);
    });

  return {
    todayLocalDate,
    summary: {
      totalActiveCount,
      pinnedCount,
      foldersCount: serializedFolders.length,
      tagsCount: serializedTags.length,
      thisWeekCount,
      journalCount,
      archivedCount,
      trashedCount,
    },
    notes: serializedNotes,
    folders: serializedFolders,
    tags: serializedTags,
  };
}

export function filterAndSortNotes(params: {
  notes: SerializedNote[];
  tab: NotesFilterTab;
  folderId?: string | 'all' | 'unfiled' | null;
  tagId?: string | null;
  searchQuery?: string;
  sortBy?: NotesSortOption;
  now?: Date;
}): SerializedNote[] {
  const {
    notes,
    tab,
    folderId = 'all',
    tagId = null,
    searchQuery = '',
    sortBy = 'updated_desc',
  } = params;
  const nowMs = (params.now ?? new Date()).getTime();
  const recentCutoffMs = nowMs - 14 * 24 * 60 * 60 * 1000;
  const query = searchQuery.trim().toLowerCase();

  const filtered = notes.filter((note) => {
    // 1. Lifecycle / Tab filter
    if (tab === 'trash') {
      if (!note.isTrashed) return false;
    } else if (tab === 'archived') {
      if (!note.isArchived || note.isTrashed) return false;
    } else {
      // Active notes only
      if (note.isArchived || note.isTrashed) return false;
      if (tab === 'pinned' && !note.isPinned) return false;
      if (tab === 'journal' && note.entryType !== 'journal') return false;
      if (
        tab === 'recent' &&
        new Date(note.updatedAt).getTime() < recentCutoffMs
      ) {
        return false;
      }
    }

    // 2. Folder filter (applies when not in trash)
    if (tab !== 'trash' && folderId && folderId !== 'all') {
      if (folderId === 'unfiled') {
        if (note.folderId !== null) return false;
      } else if (note.folderId !== folderId) {
        return false;
      }
    }

    // 3. Tag filter
    if (tagId) {
      if (!note.tags.some((t) => t.id === tagId)) return false;
    }

    // 4. Search query across title, content, folderName, mood, and tags
    if (query) {
      const inTitle = note.title.toLowerCase().includes(query);
      const inContent = note.content.toLowerCase().includes(query);
      const inFolder = Boolean(
        note.folderName && note.folderName.toLowerCase().includes(query)
      );
      const inMood = Boolean(
        note.mood && note.mood.toLowerCase().includes(query)
      );
      const inTags = note.tags.some((t) =>
        t.name.toLowerCase().includes(query)
      );
      if (!inTitle && !inContent && !inFolder && !inMood && !inTags) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((a, b) => {
    // Keep pinned notes prioritized at the top in 'all' view unless sorting alphabetically or by journal date
    if (
      tab === 'all' &&
      sortBy === 'updated_desc' &&
      a.isPinned !== b.isPinned
    ) {
      return a.isPinned ? -1 : 1;
    }

    if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    }

    if (sortBy === 'created_desc') {
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    if (sortBy === 'journal_date_desc') {
      const dateA = a.journalDate || a.createdAt.slice(0, 10);
      const dateB = b.journalDate || b.createdAt.slice(0, 10);
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/**
 * Computes genuine related notes for a selected note based on shared tags and shared folder.
 */
export function computeRelatedNotes(
  selectedNote: SerializedNote | null,
  allNotes: SerializedNote[],
  limit = 3
): SerializedNote[] {
  if (!selectedNote) return [];
  const tagIds = new Set(selectedNote.tags.map((t) => t.id));

  const scored: Array<{ note: SerializedNote; score: number }> = [];
  for (const candidate of allNotes) {
    if (
      candidate.id === selectedNote.id ||
      candidate.isArchived ||
      candidate.isTrashed
    ) {
      continue;
    }

    let score = 0;
    for (const t of candidate.tags) {
      if (tagIds.has(t.id)) score += 2;
    }
    if (
      selectedNote.folderId &&
      candidate.folderId === selectedNote.folderId
    ) {
      score += 1;
    }

    if (score > 0) {
      scored.push({ note: candidate, score });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        new Date(b.note.updatedAt).getTime() -
        new Date(a.note.updatedAt).getTime()
      );
    })
    .slice(0, limit)
    .map((entry) => entry.note);
}
