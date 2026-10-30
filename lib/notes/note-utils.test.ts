import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNoteExcerpt,
  buildNotesViewModel,
  computeRelatedNotes,
  filterAndSortNotes,
  parseSafeMarkdownBlocks,
  sanitizeMarkdownLinkUrl,
  tokenizeInlineMarkdown,
  validateNoteFolderInput,
  validateNoteInput,
  validateNoteTagInput,
} from './note-utils';

test('validateNoteInput validates notes and journals, preserves historical journal dates, and deduplicates tags case-insensitively', () => {
  const validNote = validateNoteInput({
    title: '  Building Better Habits  ',
    content: '1. Read for 20 minutes daily',
    entryType: 'note',
    isPinned: true,
    tagNames: ['habits', 'Personal', 'HABITS', '#productivity'],
  });
  assert.equal(validNote.valid, true);
  if (validNote.valid) {
    assert.equal(validNote.data.title, 'Building Better Habits');
    assert.equal(validNote.data.isPinned, true);
    assert.deepEqual(validNote.data.tagNames, [
      'habits',
      'Personal',
      'productivity',
    ]);
  }

  // Historical journal date preserved
  const historicalJournal = validateNoteInput(
    {
      title: 'Evening Reflection',
      content: 'Calm and focused day.',
      entryType: 'journal',
      journalDate: '2025-04-26',
      mood: 'Calm',
    },
    { defaultTodayDate: '2026-10-29' }
  );
  assert.equal(historicalJournal.valid, true);
  if (historicalJournal.valid) {
    assert.equal(historicalJournal.data.entryType, 'journal');
    assert.equal(historicalJournal.data.journalDate, '2025-04-26');
    assert.equal(historicalJournal.data.mood, 'Calm');
  }

  // Rejects invalid journal date
  const badJournal = validateNoteInput({
    title: 'Bad Date',
    entryType: 'journal',
    journalDate: '2025-02-30',
  });
  assert.equal(badJournal.valid, false);

  // Blank title rejected unless allowBlankTitleFallback is true (for autosave drafts)
  const emptyTitleStrict = validateNoteInput({ title: '   ', content: 'Hi' });
  assert.equal(emptyTitleStrict.valid, false);

  const emptyTitleAutosave = validateNoteInput(
    { title: '   ', content: 'Draft thought' },
    { allowBlankTitleFallback: true }
  );
  assert.equal(emptyTitleAutosave.valid, true);
  if (emptyTitleAutosave.valid) {
    assert.equal(emptyTitleAutosave.data.title, 'Untitled note');
  }
});

test('validateNoteFolderInput and validateNoteTagInput enforce length and non-empty rules', () => {
  assert.equal(validateNoteFolderInput({ name: '   ' }).valid, false);
  const validFolder = validateNoteFolderInput({
    name: '  Deep Work  ',
    description: 'Research notes',
    color: 'emerald',
  });
  assert.equal(validFolder.valid, true);
  if (validFolder.valid) {
    assert.equal(validFolder.data.name, 'Deep Work');
    assert.equal(validFolder.data.color, 'emerald');
  }

  assert.equal(validateNoteTagInput({ name: '###' }).valid, false);
  const validTag = validateNoteTagInput({
    name: '#productivity',
    color: 'violet',
  });
  assert.equal(validTag.valid, true);
  if (validTag.valid) {
    assert.equal(validTag.data.name, 'productivity');
  }
});

test('sanitizeMarkdownLinkUrl and tokenizeInlineMarkdown block dangerous URL schemes and parse inline tokens safely', () => {
  assert.equal(sanitizeMarkdownLinkUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeMarkdownLinkUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeMarkdownLinkUrl('vbscript:msgbox(1)'), null);
  assert.equal(
    sanitizeMarkdownLinkUrl('https://neon.tech/docs'),
    'https://neon.tech/docs'
  );

  const tokens = tokenizeInlineMarkdown(
    'Read **Atomic Habits** and [unsafe](javascript:alert(1)) or [safe](https://example.com) with `code`.'
  );
  assert.equal(
    tokens.some((t) => t.type === 'link' && t.href.includes('javascript:')),
    false
  );
  assert.equal(
    tokens.some(
      (t) =>
        t.type === 'link' &&
        t.text === 'safe' &&
        t.href === 'https://example.com/'
    ),
    true
  );
  assert.equal(
    tokens.some((t) => t.type === 'bold' && t.text === 'Atomic Habits'),
    true
  );
  assert.equal(
    tokens.some((t) => t.type === 'code' && t.text === 'code'),
    true
  );
});

test('parseSafeMarkdownBlocks parses headings, lists, checklists, blockquotes with attribution, and code blocks', () => {
  const md = [
    '# Why it matters',
    'Small changes create big results.',
    '1. Read for 20 minutes daily',
    '2. Exercise 4 times a week',
    '- [x] Drink enough water',
    '- [ ] Get 7-8 hours of sleep',
    '> "You don\'t have to be great to start, but you have to start to be great."',
    '> — Zig Ziglar',
    '```ts',
    'const x = 1;',
    '```',
  ].join('\n');

  const blocks = parseSafeMarkdownBlocks(md);
  assert.equal(blocks[0]?.type, 'heading');
  assert.equal(blocks[1]?.type, 'paragraph');
  assert.equal(blocks[2]?.type, 'ordered_list');
  assert.equal(blocks[3]?.type, 'checklist');
  assert.equal(blocks[4]?.type, 'blockquote');
  if (blocks[4]?.type === 'blockquote') {
    assert.equal(blocks[4].attribution, 'Zig Ziglar');
  }
  assert.equal(blocks[5]?.type, 'code_block');
  assert.ok(buildNoteExcerpt(md, 60).length <= 63);
});

test('buildNotesViewModel, filterAndSortNotes, and computeRelatedNotes calculate genuine metrics without predefined categories', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const emptyVm = buildNotesViewModel({
    notes: [],
    folders: [],
    tags: [],
    tagAssignments: [],
    timezone: 'Asia/Kathmandu',
    now,
  });
  // Strictly zero predefined folders or tags on empty state
  assert.equal(emptyVm.folders.length, 0);
  assert.equal(emptyVm.tags.length, 0);
  assert.equal(emptyVm.summary.totalActiveCount, 0);

  const folders = [
    {
      id: 'f1',
      userId: 'u1',
      name: 'Personal',
      description: null,
      color: 'lime',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const tags = [
    {
      id: 't1',
      userId: 'u1',
      name: 'habits',
      color: 'emerald',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 't2',
      userId: 'u1',
      name: 'goals',
      color: 'violet',
      createdAt: now,
      updatedAt: now,
    },
  ];
  const notes = [
    {
      id: 'n1',
      userId: 'u1',
      folderId: 'f1',
      title: 'Building Better Habits',
      content: 'Read for 20 minutes daily',
      entryType: 'note',
      journalDate: null,
      mood: null,
      iconStyle: 'leaf',
      isPinned: true,
      archivedAt: null,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'n2',
      userId: 'u1',
      folderId: 'f1',
      title: 'Health & Fitness Goals',
      content: 'My fitness journey and workout plan',
      entryType: 'journal',
      journalDate: '2026-10-25',
      mood: 'Focused',
      iconStyle: 'dumbbell',
      isPinned: false,
      archivedAt: null,
      trashedAt: null,
      createdAt: new Date('2026-10-25T10:00:00Z'),
      updatedAt: new Date('2026-10-25T10:00:00Z'),
    },
    {
      id: 'n3',
      userId: 'u1',
      folderId: null,
      title: 'Archived Idea',
      content: 'Old draft',
      entryType: 'note',
      journalDate: null,
      mood: null,
      iconStyle: 'leaf',
      isPinned: false,
      archivedAt: now,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
  const assignments = [
    { id: 'a1', noteId: 'n1', tagId: 't1', userId: 'u1', createdAt: now },
    { id: 'a2', noteId: 'n2', tagId: 't1', userId: 'u1', createdAt: now },
    { id: 'a3', noteId: 'n2', tagId: 't2', userId: 'u1', createdAt: now },
  ];

  const vm = buildNotesViewModel({
    notes,
    folders,
    tags,
    tagAssignments: assignments,
    timezone: 'Asia/Kathmandu',
    now,
  });

  assert.equal(vm.summary.totalActiveCount, 2);
  assert.equal(vm.summary.pinnedCount, 1);
  assert.equal(vm.summary.journalCount, 1);
  assert.equal(vm.summary.archivedCount, 1);
  assert.equal(vm.folders[0]?.noteCount, 2);

  const pinnedOnly = filterAndSortNotes({
    notes: vm.notes,
    tab: 'pinned',
    now,
  });
  assert.equal(pinnedOnly.length, 1);
  assert.equal(pinnedOnly[0]?.id, 'n1');

  const journalsOnly = filterAndSortNotes({
    notes: vm.notes,
    tab: 'journal',
    now,
  });
  assert.equal(journalsOnly.length, 1);
  assert.equal(journalsOnly[0]?.id, 'n2');

  const archivedOnly = filterAndSortNotes({
    notes: vm.notes,
    tab: 'archived',
    now,
  });
  assert.equal(archivedOnly.length, 1);
  assert.equal(archivedOnly[0]?.id, 'n3');

  const relatedToN1 = computeRelatedNotes(vm.notes[0] ?? null, vm.notes);
  assert.equal(relatedToN1.length, 1);
  assert.equal(relatedToN1[0]?.id, 'n2');
});
