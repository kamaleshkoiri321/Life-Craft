'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bold,
  BookOpen,
  Calendar,
  Check,
  CheckSquare,
  ChevronRight,
  Code,
  Edit3,
  Eye,
  FileText,
  Folder,
  Heading1,
  Heading2,
  Italic,
  Leaf,
  Link2,
  List,
  ListOrdered,
  Loader2,
  MoreVertical,
  Pin,
  Quote,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  MOOD_MAX_LENGTH,
  NOTE_ICON_STYLES,
  NOTE_TITLE_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  type NoteEntryType,
  type NoteIconStyle,
  type SerializedNote,
  type SerializedNoteFolder,
  type SerializedNoteTag,
} from '@/lib/notes/note-utils';
import type { NotesWorkspaceData } from '@/lib/queries/notes';
import { NOTE_COLOR_STYLES, NOTE_ICON_CONFIG } from './NoteIconBadge';
import SafeMarkdownRenderer from './SafeMarkdownRenderer';

export type SaveStatusState = 'saved' | 'unsaved' | 'saving' | 'error';

interface NoteDetailEditorPaneProps {
  note: SerializedNote;
  relatedNotes: SerializedNote[];
  folders: SerializedNoteFolder[];
  existingTags: SerializedNoteTag[];
  todayLocalDate: string;
  isEditing: boolean;
  onSetEditing: (editing: boolean) => void;
  onSelectNote: (noteId: string) => void;
  onBackToListMobile: () => void;
  onWorkspaceUpdated: (
    workspace: NotesWorkspaceData,
    updatedNote?: SerializedNote
  ) => void;
  onRequestMoveFolder: (note: SerializedNote) => void;
  onRequestDeleteNote: (note: SerializedNote, permanent: boolean) => void;
}

export default function NoteDetailEditorPane({
  note,
  relatedNotes,
  folders,
  existingTags,
  todayLocalDate,
  isEditing,
  onSetEditing,
  onSelectNote,
  onBackToListMobile,
  onWorkspaceUpdated,
  onRequestMoveFolder,
  onRequestDeleteNote,
}: NoteDetailEditorPaneProps) {
  const [draftTitle, setDraftTitle] = useState(note.title);
  const [draftContent, setDraftContent] = useState(note.content);
  const [draftEntryType, setDraftEntryType] = useState<NoteEntryType>(
    note.entryType
  );
  const [draftJournalDate, setDraftJournalDate] = useState<string>(
    note.journalDate || todayLocalDate
  );
  const [draftMood, setDraftMood] = useState<string>(note.mood || '');
  const [draftFolderId, setDraftFolderId] = useState<string | null>(
    note.folderId
  );
  const [draftIconStyle, setDraftIconStyle] = useState<NoteIconStyle>(
    note.iconStyle
  );
  const [draftTagNames, setDraftTagNames] = useState<string[]>(
    note.tags.map((t) => t.name)
  );
  const [tagInput, setTagInput] = useState('');
  const [editorSubTab, setEditorSubTab] = useState<'write' | 'preview'>(
    'write'
  );

  const [saveStatus, setSaveStatus] = useState<SaveStatusState>('saved');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isActionBusy, setIsActionBusy] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Concurrency-safe autosave tracking refs
  const editRevisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const inFlightSaveRef = useRef(false);
  const pendingSaveAfterInFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep latest draft snapshot in a ref so debounced/flush saves always send the newest state
  const latestDraftRef = useRef({
    noteId: note.id,
    title: draftTitle,
    content: draftContent,
    entryType: draftEntryType,
    journalDate: draftJournalDate,
    mood: draftMood,
    folderId: draftFolderId,
    iconStyle: draftIconStyle,
    tagNames: draftTagNames,
  });

  useEffect(() => {
    latestDraftRef.current = {
      noteId: note.id,
      title: draftTitle,
      content: draftContent,
      entryType: draftEntryType,
      journalDate: draftJournalDate,
      mood: draftMood,
      folderId: draftFolderId,
      iconStyle: draftIconStyle,
      tagNames: draftTagNames,
    };
  }, [
    note.id,
    draftTitle,
    draftContent,
    draftEntryType,
    draftJournalDate,
    draftMood,
    draftFolderId,
    draftIconStyle,
    draftTagNames,
  ]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Warn before browser unload if unsaved changes are pending
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved' || saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  const executePersistDraft = async (): Promise<boolean> => {
    if (editRevisionRef.current === savedRevisionRef.current) {
      return true;
    }

    if (inFlightSaveRef.current) {
      pendingSaveAfterInFlightRef.current = true;
      return false;
    }

    inFlightSaveRef.current = true;
    const targetRevision = editRevisionRef.current;
    const snapshot = latestDraftRef.current;

    setSaveStatus('saving');
    setSaveErrorMessage(null);

    try {
      const res = await fetch(`/api/notes/${snapshot.noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: snapshot.title,
          content: snapshot.content,
          entryType: snapshot.entryType,
          journalDate:
            snapshot.entryType === 'journal' ? snapshot.journalDate : null,
          mood:
            snapshot.entryType === 'journal' && snapshot.mood.trim()
              ? snapshot.mood.trim()
              : null,
          folderId: snapshot.folderId,
          iconStyle: snapshot.iconStyle,
          tagNames: snapshot.tagNames,
          allowBlankTitleFallback: true,
        }),
      });

      const json = (await res.json()) as {
        status: string;
        note?: SerializedNote;
        workspace?: NotesWorkspaceData;
        message?: string;
      };

      if (!res.ok || json.status !== 'ok' || !json.workspace || !json.note) {
        setSaveStatus('error');
        setSaveErrorMessage(json.message || 'Unable to save');
        return false;
      }

      // Only advance savedRevisionRef if no newer edits happened, or advance to targetRevision
      savedRevisionRef.current = Math.max(
        savedRevisionRef.current,
        targetRevision
      );
      onWorkspaceUpdated(json.workspace, json.note);

      if (editRevisionRef.current === savedRevisionRef.current) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('unsaved');
      }
      return true;
    } catch {
      setSaveStatus('error');
      setSaveErrorMessage('Unable to save — check connection');
      return false;
    } finally {
      inFlightSaveRef.current = false;
      if (
        pendingSaveAfterInFlightRef.current &&
        editRevisionRef.current > savedRevisionRef.current
      ) {
        pendingSaveAfterInFlightRef.current = false;
        void executePersistDraft();
      }
    }
  };

  const scheduleAutosave = () => {
    editRevisionRef.current += 1;
    setSaveStatus('unsaved');
    setSaveErrorMessage(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void executePersistDraft();
    }, 900);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleManualFlushSave = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (editRevisionRef.current === savedRevisionRef.current) {
      editRevisionRef.current += 1;
    }
    await executePersistDraft();
  };

  const handleExitEditing = async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (editRevisionRef.current > savedRevisionRef.current) {
      await executePersistDraft();
    }
    onSetEditing(false);
  };

  const handleTogglePin = async () => {
    setIsActionBusy(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'toggle_pin' }),
      });
      const json = (await res.json()) as {
        status: string;
        note?: SerializedNote;
        workspace?: NotesWorkspaceData;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        onWorkspaceUpdated(json.workspace, json.note);
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleLifecycleAction = async (
    action: 'archive' | 'unarchive' | 'restore'
  ) => {
    setIsActionBusy(true);
    setIsMenuOpen(false);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as {
        status: string;
        note?: SerializedNote;
        workspace?: NotesWorkspaceData;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        onWorkspaceUpdated(json.workspace, json.note);
      }
    } finally {
      setIsActionBusy(false);
    }
  };

  const handleToggleChecklistLine = async (lineIndex: number) => {
    const lines = draftContent.replace(/\r\n/g, '\n').split('\n');
    const target = lines[lineIndex];
    if (!target) return;
    const match = target.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
    if (!match) return;
    const nextChar = match[2].toLowerCase() === 'x' ? ' ' : 'x';
    lines[lineIndex] = `${match[1]}${nextChar}${match[3]}`;
    const updatedContent = lines.join('\n');
    setDraftContent(updatedContent);
    latestDraftRef.current.content = updatedContent;
    editRevisionRef.current += 1;
    await executePersistDraft();
  };

  const insertMarkdownSnippet = (snippet: string, wrapSelection = false) => {
    const el = textareaRef.current;
    if (!el) {
      const next = draftContent ? `${draftContent}\n${snippet}` : snippet;
      setDraftContent(next);
      scheduleAutosave();
      return;
    }

    const start = el.selectionStart ?? draftContent.length;
    const end = el.selectionEnd ?? draftContent.length;
    const selected = draftContent.slice(start, end);

    let replacement = snippet;
    if (wrapSelection && selected) {
      replacement = `${snippet}${selected}${snippet}`;
    }

    const nextContent =
      draftContent.slice(0, start) + replacement + draftContent.slice(end);
    setDraftContent(nextContent);
    scheduleAutosave();

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + replacement.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleAddTag = () => {
    const cleaned = tagInput.trim().replace(/^#+/, '').trim();
    if (!cleaned || cleaned.length > TAG_NAME_MAX_LENGTH) return;
    if (!draftTagNames.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      const next = [...draftTagNames, cleaned];
      setDraftTagNames(next);
      scheduleAutosave();
    }
    setTagInput('');
  };

  const handleRemoveTag = (name: string) => {
    const next = draftTagNames.filter(
      (t) => t.toLowerCase() !== name.toLowerCase()
    );
    setDraftTagNames(next);
    scheduleAutosave();
  };

  const renderSaveStatusBadge = () => {
    if (saveStatus === 'saving') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5938B5]"
        >
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          <span>Saving…</span>
        </span>
      );
    }
    if (saveStatus === 'error') {
      return (
        <span
          role="alert"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318]"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{saveErrorMessage || 'Unable to save'}</span>
          <button
            type="button"
            onClick={handleManualFlushSave}
            className="underline underline-offset-2 hover:text-[#171622]"
          >
            Retry
          </button>
        </span>
      );
    }
    if (saveStatus === 'unsaved') {
      return (
        <span
          role="status"
          aria-live="polite"
          className="inline-flex items-center gap-1 text-xs text-[#171622]/55"
        >
          <span>Editing…</span>
        </span>
      );
    }
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1 text-xs font-medium text-[#2B611D]"
      >
        <Check className="h-3 w-3" aria-hidden="true" />
        <span>Saved</span>
      </span>
    );
  };

  return (
    <article
      aria-label={`Selected note: ${draftTitle || note.title}`}
      className="flex flex-col justify-between rounded-2xl border border-[#171622]/10 bg-white p-5 sm:p-6 shadow-2xs h-full space-y-5"
    >
      <div className="space-y-5">
        {/* Top Header Row: Back Button, Title, Pin & Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  void handleExitEditing();
                } else {
                  onBackToListMobile();
                }
              }}
              aria-label={isEditing ? 'Done editing note' : 'Back to notes list'}
              className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#171622]/10 bg-[#FAF9F6] text-[#171622]/75 hover:bg-[#171622]/8 hover:text-[#171622] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-w-0 flex-1">
              {isEditing ? (
                <input
                  type="text"
                  maxLength={NOTE_TITLE_MAX_LENGTH}
                  value={draftTitle}
                  onChange={(e) => {
                    setDraftTitle(e.target.value);
                    scheduleAutosave();
                  }}
                  aria-label="Note title"
                  placeholder="Note title..."
                  className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3 py-1.5 font-display text-lg sm:text-xl font-bold text-[#171622] focus:border-[#171622] focus:bg-white focus:outline-none"
                />
              ) : (
                <h2 className="font-display text-lg sm:text-xl font-bold text-[#171622] leading-snug break-words">
                  {draftTitle || note.title}
                </h2>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {renderSaveStatusBadge()}

            {!note.isTrashed && (
              <button
                type="button"
                onClick={handleTogglePin}
                disabled={isActionBusy}
                aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
                aria-pressed={note.isPinned}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors ${
                  note.isPinned
                    ? 'border-[#5C9E31]/40 bg-[#EAF7E1] text-[#2B611D]'
                    : 'border-transparent text-[#171622]/55 hover:bg-[#FAF9F6] hover:text-[#171622]'
                }`}
              >
                <Pin className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setIsMenuOpen((prev) => !prev)}
                aria-label="More note actions"
                aria-expanded={isMenuOpen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622]"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>

              {isMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-30 w-48 rounded-xl border border-[#171622]/12 bg-white p-1.5 shadow-lg space-y-0.5"
                >
                  {!note.isTrashed && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onSetEditing(!isEditing);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{isEditing ? 'Exit editor' : 'Edit note'}</span>
                    </button>
                  )}

                  {!note.isTrashed && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onRequestMoveFolder(note);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                    >
                      <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Move to folder</span>
                    </button>
                  )}

                  {!note.isTrashed &&
                    (note.isArchived ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleLifecycleAction('unarchive')}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                      >
                        <ArchiveRestore
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Restore from Archive</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleLifecycleAction('archive')}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Archive note</span>
                      </button>
                    ))}

                  {note.isTrashed ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleLifecycleAction('restore')}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#2B611D] hover:bg-[#EAF7E1]/60"
                      >
                        <RotateCcw
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Restore from Trash</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMenuOpen(false);
                          onRequestDeleteNote(note, true);
                        }}
                        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#B42318] hover:bg-[#FDECEC]"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Delete permanently</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsMenuOpen(false);
                        onRequestDeleteNote(note, false);
                      }}
                      className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#B42318] hover:bg-[#FDECEC]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Move to Trash</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Metadata Bar: Tags, Date, Journal Info, Folder */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {note.tags.map((tag) => {
            const style =
              NOTE_COLOR_STYLES[tag.color] ?? NOTE_COLOR_STYLES.violet;
            return (
              <span
                key={tag.id}
                className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium ${style.chipClass}`}
              >
                {tag.name}
              </span>
            );
          })}

          {note.folderName && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF9F6] border border-[#171622]/10 px-2.5 py-0.5 text-xs font-medium text-[#171622]/75">
              <Folder className="h-3 w-3 text-[#171622]/50" aria-hidden="true" />
              <span>{note.folderName}</span>
            </span>
          )}

          {note.entryType === 'journal' && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-[#E8F3FC] px-2.5 py-0.5 text-xs font-medium text-[#1D5F91]">
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              <span>Journal</span>
              {note.mood && <span>· {note.mood}</span>}
            </span>
          )}

          <span className="inline-flex items-center gap-1 text-xs text-[#171622]/55 tabular-nums ml-auto">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {note.entryType === 'journal' && note.journalDateLabel
                ? note.journalDateLabel
                : note.updatedAtLabel}
            </span>
          </span>
        </div>

        {/* EDIT MODE vs READER MODE */}
        {isEditing ? (
          <div className="space-y-4">
            {/* Metadata Controls in Editor */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3">
              <div className="space-y-1">
                <label
                  htmlFor="editor-entry-type"
                  className="block text-[11px] font-semibold text-[#171622]/70"
                >
                  Entry type
                </label>
                <select
                  id="editor-entry-type"
                  value={draftEntryType}
                  onChange={(e) => {
                    const nextType: NoteEntryType =
                      e.target.value === 'journal' ? 'journal' : 'note';
                    setDraftEntryType(nextType);
                    scheduleAutosave();
                  }}
                  className="w-full rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171622]"
                >
                  <option value="note">Note</option>
                  <option value="journal">Daily Journal</option>
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="editor-folder-select"
                  className="block text-[11px] font-semibold text-[#171622]/70"
                >
                  Folder
                </label>
                <select
                  id="editor-folder-select"
                  value={draftFolderId ?? ''}
                  onChange={(e) => {
                    setDraftFolderId(e.target.value || null);
                    scheduleAutosave();
                  }}
                  className="w-full rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171622]"
                >
                  <option value="">No folder (Unfiled)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {draftEntryType === 'journal' && (
                <>
                  <div className="space-y-1">
                    <label
                      htmlFor="editor-journal-date"
                      className="block text-[11px] font-semibold text-[#171622]/70"
                    >
                      Journal date
                    </label>
                    <input
                      id="editor-journal-date"
                      type="date"
                      value={draftJournalDate}
                      onChange={(e) => {
                        setDraftJournalDate(e.target.value);
                        scheduleAutosave();
                      }}
                      className="w-full rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171622]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="editor-journal-mood"
                      className="block text-[11px] font-semibold text-[#171622]/70"
                    >
                      Mood / tone (optional)
                    </label>
                    <input
                      id="editor-journal-mood"
                      type="text"
                      maxLength={MOOD_MAX_LENGTH}
                      value={draftMood}
                      onChange={(e) => {
                        setDraftMood(e.target.value);
                        scheduleAutosave();
                      }}
                      placeholder="e.g. Calm, Grateful"
                      className="w-full rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs text-[#171622]"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Icon & Tags Editor Bar */}
            <div className="space-y-2 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#171622]/70">
                  Icon & Tags
                </span>
                <div className="flex items-center gap-1">
                  {NOTE_ICON_STYLES.map((styleKey) => {
                    const cfg = NOTE_ICON_CONFIG[styleKey];
                    const Icon = cfg.Icon;
                    const active = draftIconStyle === styleKey;
                    return (
                      <button
                        key={styleKey}
                        type="button"
                        onClick={() => {
                          setDraftIconStyle(styleKey);
                          scheduleAutosave();
                        }}
                        aria-label={`Select ${cfg.label} icon`}
                        className={`flex h-6.5 w-6.5 items-center justify-center rounded-lg border ${
                          active
                            ? 'border-[#171622] scale-105'
                            : 'border-transparent opacity-65 hover:opacity-100'
                        } ${cfg.bgClass} ${cfg.iconClass}`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={TAG_NAME_MAX_LENGTH}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  aria-label="Add tag to note"
                  placeholder="Add tag and press Enter..."
                  className="flex-1 rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1 text-xs text-[#171622]"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                >
                  Add
                </button>
              </div>

              {draftTagNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {draftTagNames.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#EBE8F8] px-2 py-0.5 text-xs font-medium text-[#4C2FA3]"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t)}
                        aria-label={`Remove tag '${t}'`}
                        className="text-[#4C2FA3]/70 hover:text-[#171622]"
                      >
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {existingTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  {existingTags
                    .filter(
                      (et) =>
                        !draftTagNames.some(
                          (dt) => dt.toLowerCase() === et.name.toLowerCase()
                        )
                    )
                    .slice(0, 8)
                    .map((et) => (
                      <button
                        key={et.id}
                        type="button"
                        onClick={() => {
                          setDraftTagNames((prev) => [...prev, et.name]);
                          scheduleAutosave();
                        }}
                        className="rounded-md border border-[#171622]/10 bg-white px-2 py-0.5 text-[11px] text-[#171622]/65 hover:text-[#171622]"
                      >
                        + {et.name}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Markdown Formatting Toolbar + Write/Preview Tabs */}
            <div className="rounded-xl border border-[#171622]/15 overflow-hidden bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#171622]/10 bg-[#FAF9F6] px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('# ')}
                    aria-label="Insert Heading 1"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Heading1 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('## ')}
                    aria-label="Insert Heading 2"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Heading2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('**', true)}
                    aria-label="Bold text"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Bold className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('*', true)}
                    aria-label="Italic text"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Italic className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('- ')}
                    aria-label="Bullet list"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <List className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('1. ')}
                    aria-label="Numbered list"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('- [ ] ')}
                    aria-label="Checklist item"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('> ')}
                    aria-label="Blockquote"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Quote className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSnippet('```\n\n```')}
                    aria-label="Code block"
                    className="rounded-lg p-1.5 text-[#171622]/70 hover:bg-white hover:text-[#171622]"
                  >
                    <Code className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>

                <div className="inline-flex rounded-lg bg-[#171622]/6 p-0.5">
                  <button
                    type="button"
                    onClick={() => setEditorSubTab('write')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                      editorSubTab === 'write'
                        ? 'bg-white text-[#171622] shadow-2xs'
                        : 'text-[#171622]/65 hover:text-[#171622]'
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorSubTab('preview')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                      editorSubTab === 'preview'
                        ? 'bg-white text-[#171622] shadow-2xs'
                        : 'text-[#171622]/65 hover:text-[#171622]'
                    }`}
                  >
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    <span>Preview</span>
                  </button>
                </div>
              </div>

              {editorSubTab === 'write' ? (
                <textarea
                  ref={textareaRef}
                  rows={12}
                  value={draftContent}
                  onChange={(e) => {
                    setDraftContent(e.target.value);
                    scheduleAutosave();
                  }}
                  aria-label="Note markdown content"
                  placeholder="Write your note or journal reflection in Markdown..."
                  className="w-full p-3.5 text-sm leading-relaxed text-[#171622] placeholder:text-[#171622]/40 focus:outline-none resize-y"
                />
              ) : (
                <div className="p-4 min-h-[240px]">
                  <SafeMarkdownRenderer content={draftContent} />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleManualFlushSave}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/15 bg-white px-3.5 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Save now</span>
              </button>

              <button
                type="button"
                onClick={() => void handleExitEditing()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Done editing</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Banner Header Card (matching Sample Design) */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#EBF8D8] via-[#F2FAE4] to-[#E2F4C8] border border-[#65B339]/20 px-5 py-5 flex items-center justify-between gap-4">
              <div className="space-y-1 z-10">
                <h3 className="font-display text-lg sm:text-xl font-extrabold text-[#171622]">
                  {draftTitle || note.title}
                </h3>
                {note.entryType === 'journal' && note.journalDateLabel && (
                  <p className="text-xs font-medium text-[#2B611D]">
                    Daily Journal · {note.journalDateLabel}
                    {note.mood ? ` · ${note.mood}` : ''}
                  </p>
                )}
              </div>
              <div
                aria-hidden="true"
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#C8F27C]/70 text-[#2B611D]"
              >
                {note.entryType === 'journal' ? (
                  <Sparkles className="h-6 w-6" />
                ) : (
                  <Leaf className="h-6 w-6" />
                )}
              </div>
            </div>

            {/* Formatted Markdown Content */}
            <div className="py-1">
              <SafeMarkdownRenderer
                content={draftContent}
                onToggleChecklistLine={handleToggleChecklistLine}
              />
            </div>

            {/* Related Notes Section (matching Sample Design) */}
            {relatedNotes.length > 0 && (
              <div className="pt-4 border-t border-[#171622]/8 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#171622]">
                  <Link2
                    className="h-3.5 w-3.5 text-[#5938B5]"
                    aria-hidden="true"
                  />
                  <span>Related notes</span>
                </div>

                <div className="space-y-2">
                  {relatedNotes.map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      onClick={() => onSelectNote(rel.id)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-[#171622]/8 bg-[#FAF9F6] px-3.5 py-2.5 text-left hover:border-[#5938B5]/30 hover:bg-[#F4F1FC]/50 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EBE8F8] text-[#5938B5]">
                          <FileText className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#4C2FA3] group-hover:text-[#171622] truncate">
                            {rel.title}
                          </p>
                          <p className="text-[11px] text-[#171622]/60 truncate">
                            {rel.excerpt || 'Open note'}
                          </p>
                        </div>
                      </div>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-[#171622]/40 group-hover:text-[#171622]"
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Action Bar (matching Sample Design: Edit | Pin | Move | Delete) */}
      <div className="pt-4 border-t border-[#171622]/10">
        {note.isTrashed ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleLifecycleAction('restore')}
              disabled={isActionBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3 py-2 text-xs font-semibold text-[#2B611D] hover:bg-[#EAF7E1]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Restore</span>
            </button>
            <button
              type="button"
              onClick={() => onRequestDeleteNote(note, true)}
              disabled={isActionBusy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3 py-2 text-xs font-semibold text-[#B42318] hover:bg-[#FDECEC]/80"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete forever</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-1.5">
            <button
              type="button"
              onClick={() => onSetEditing(!isEditing)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                isEditing
                  ? 'bg-[#171622] text-white'
                  : 'text-[#171622]/80 hover:bg-white hover:text-[#171622]'
              }`}
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isEditing ? 'Done' : 'Edit'}</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePin}
              disabled={isActionBusy}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors ${
                note.isPinned
                  ? 'bg-[#EAF7E1] text-[#2B611D]'
                  : 'text-[#171622]/80 hover:bg-white hover:text-[#171622]'
              }`}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{note.isPinned ? 'Pinned' : 'Pin'}</span>
            </button>

            <button
              type="button"
              onClick={() => onRequestMoveFolder(note)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#171622]/80 hover:bg-white hover:text-[#171622] transition-colors"
            >
              <Folder className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Move</span>
            </button>

            <button
              type="button"
              onClick={() => onRequestDeleteNote(note, false)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#171622]/80 hover:bg-[#FDECEC] hover:text-[#B42318] transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
