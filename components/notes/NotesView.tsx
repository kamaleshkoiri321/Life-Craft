'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  BookOpen,
  Calendar,
  Edit3,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  List,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  computeRelatedNotes,
  filterAndSortNotes,
  type NoteEntryType,
  type NotesFilterTab,
  type NotesSortOption,
  type SerializedNote,
  type SerializedNoteFolder,
} from '@/lib/notes/note-utils';
import type {
  NotesWorkspaceData,
  NotesWorkspaceResult,
} from '@/lib/queries/notes';
import NoteDetailEditorPane from './NoteDetailEditorPane';
import NoteIconBadge, { NOTE_COLOR_STYLES } from './NoteIconBadge';
import {
  CreateNoteModal,
  DeleteFolderConfirmModal,
  DeleteNoteConfirmModal,
  FolderFormModal,
  ManageTagsModal,
  MoveNoteToFolderModal,
} from './NotesModals';

interface NotesViewProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  initialSelectedNoteId?: string | null;
  onDataMutated?: () => void;
}

export default function NotesView({
  searchQuery,
  onSearchChange,
  initialSelectedNoteId = null,
  onDataMutated,
}: NotesViewProps) {
  const [workspace, setWorkspace] = useState<NotesWorkspaceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters & navigation state
  const [activeTab, setActiveTab] = useState<NotesFilterTab>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<
    string | 'all' | 'unfiled'
  >('all');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<NotesSortOption>('updated_desc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Selected note & mobile pane state
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    initialSelectedNoteId
  );
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState<boolean>(
    Boolean(initialSelectedNoteId)
  );
  const [isEditingNote, setIsEditingNote] = useState(false);

  // Modals state
  const [isCreateNoteOpen, setIsCreateNoteOpen] = useState(false);
  const [createNoteDefaultType, setCreateNoteDefaultType] =
    useState<NoteEntryType>('note');
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] =
    useState<SerializedNoteFolder | null>(null);
  const [deletingFolder, setDeletingFolder] =
    useState<SerializedNoteFolder | null>(null);
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false);
  const [movingNote, setMovingNote] = useState<SerializedNote | null>(null);
  const [deletingNoteState, setDeletingNoteState] = useState<{
    note: SerializedNote;
    permanent: boolean;
  } | null>(null);

  const loadWorkspace = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    setErrorMsg(null);
    try {
      const res = await fetch('/api/notes', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const json = (await res.json()) as NotesWorkspaceResult;
      if (!res.ok || json.status !== 'ok') {
        setErrorMsg(
          json.status !== 'ok'
            ? json.message
            : 'Unable to load your notes workspace.'
        );
        return;
      }
      setWorkspace(json.data);
    } catch {
      setErrorMsg('Network error while loading your notes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/notes', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (res) => {
        if (cancelled) return;
        const json = (await res.json()) as NotesWorkspaceResult;
        if (cancelled) return;
        if (!res.ok || json.status !== 'ok') {
          setErrorMsg(
            json.status !== 'ok'
              ? json.message
              : 'Unable to load your notes workspace.'
          );
          return;
        }
        setWorkspace(json.data);
        setErrorMsg(null);
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMsg('Network error while loading your notes.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNotes = useMemo(() => {
    if (!workspace) return [];
    return filterAndSortNotes({
      notes: workspace.notes,
      tab: activeTab,
      folderId: selectedFolderId,
      tagId: selectedTagId,
      searchQuery,
      sortBy,
    });
  }, [
    workspace,
    activeTab,
    selectedFolderId,
    selectedTagId,
    searchQuery,
    sortBy,
  ]);

  // Resolve effective selected note (either explicit selection or first visible note on desktop)
  const effectiveSelectedNote = useMemo(() => {
    if (!workspace) return null;
    if (selectedNoteId) {
      const found = workspace.notes.find((n) => n.id === selectedNoteId);
      if (found) return found;
    }
    return filteredNotes[0] ?? null;
  }, [workspace, selectedNoteId, filteredNotes]);

  const relatedNotes = useMemo(() => {
    if (!workspace || !effectiveSelectedNote) return [];
    return computeRelatedNotes(effectiveSelectedNote, workspace.notes, 3);
  }, [workspace, effectiveSelectedNote]);

  const handleWorkspaceUpdated = useCallback(
    (nextWorkspace: NotesWorkspaceData, focusNote?: SerializedNote) => {
      setWorkspace(nextWorkspace);
      if (focusNote) {
        setSelectedNoteId(focusNote.id);
      }
      onDataMutated?.();
    },
    [onDataMutated]
  );

  const handleQuickTogglePin = async (
    e: React.MouseEvent,
    note: SerializedNote
  ) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'toggle_pin' }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
      };
      if (res.ok && json.status === 'ok' && json.workspace) {
        handleWorkspaceUpdated(json.workspace);
      }
    } catch {
      // Ignore transient error
    }
  };

  if (isLoading && !workspace) {
    return (
      <section
        aria-label="Loading Notes & Knowledge"
        className="rounded-2xl border border-[#171622]/10 bg-white p-12 text-center space-y-3"
      >
        <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EAF7E1] text-[#2B611D]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </div>
        <h2 className="font-display text-base font-bold text-[#171622]">
          Loading your Notes &amp; Knowledge…
        </h2>
        <p className="text-xs text-[#171622]/60">
          Fetching your private notes, journals, folders, and tags.
        </p>
      </section>
    );
  }

  if (errorMsg && !workspace) {
    return (
      <section
        role="alert"
        className="rounded-2xl border border-[#B42318]/20 bg-white p-8 text-center space-y-4"
      >
        <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FDECEC] text-[#B42318]">
          <AlertCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h2 className="font-display text-base font-bold text-[#171622]">
            Unable to Load Notes
          </h2>
          <p className="text-xs text-[#171622]/70">{errorMsg}</p>
        </div>
        <button
          type="button"
          onClick={() => void loadWorkspace()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6]"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      </section>
    );
  }

  if (!workspace) return null;

  const { summary, folders, tags, todayLocalDate } = workspace;
  const unfiledCount = workspace.notes.filter(
    (n) => !n.isArchived && !n.isTrashed && !n.folderId
  ).length;

  return (
    <div className="space-y-6">
      {/* Page Header (matching Sample Design) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#171622]">
            Notes &amp; Knowledge
          </h1>
          <p className="text-xs sm:text-sm text-[#171622]/65">
            Capture ideas, organize your thoughts, and build your knowledge.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setCreateNoteDefaultType('note');
              setIsCreateNoteOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>New note</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateNoteDefaultType('journal');
              setIsCreateNoteOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/12 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#FAF9F6] transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <BookOpen className="h-4 w-4 text-[#5938B5]" aria-hidden="true" />
            <span>New journal</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingFolder(null);
              setIsFolderModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/12 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#FAF9F6] transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
          >
            <FolderPlus className="h-4 w-4 text-[#171622]/75" aria-hidden="true" />
            <span>New folder</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards (matching Sample Design) */}
      <section
        aria-label="Notes summary statistics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4"
      >
        {/* Card 1: Total Notes */}
        <button
          type="button"
          onClick={() => {
            setActiveTab('all');
            setSelectedFolderId('all');
            setSelectedTagId(null);
          }}
          className="flex items-start gap-3.5 rounded-2xl border border-[#65B339]/20 bg-[#EEF9E1] p-4 sm:p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#DDF3C4] text-[#2B611D]">
            <FileText className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#2B611D]">Total Notes</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-[#171622] tabular-nums">
              {summary.totalActiveCount}
            </p>
            <p className="mt-0.5 text-[11px] text-[#171622]/60 truncate">
              All your notes
            </p>
          </div>
        </button>

        {/* Card 2: Categories / Tags & Folders */}
        <button
          type="button"
          onClick={() => setIsManageTagsOpen(true)}
          className="flex items-start gap-3.5 rounded-2xl border border-[#7C5CE6]/18 bg-[#F1EEFC] p-4 sm:p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E2DCFA] text-[#4C2FA3]">
            <Tag className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#4C2FA3]">Categories</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-[#171622] tabular-nums">
              {summary.tagsCount + summary.foldersCount}
            </p>
            <p className="mt-0.5 text-[11px] text-[#171622]/60 truncate">
              {summary.foldersCount}{' '}
              {summary.foldersCount === 1 ? 'folder' : 'folders'} ·{' '}
              {summary.tagsCount} {summary.tagsCount === 1 ? 'tag' : 'tags'}
            </p>
          </div>
        </button>

        {/* Card 3: Pinned */}
        <button
          type="button"
          onClick={() => setActiveTab('pinned')}
          className="flex items-start gap-3.5 rounded-2xl border border-[#E0822B]/20 bg-[#FDF2E7] p-4 sm:p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FAE2CA] text-[#9A5311]">
            <Star className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#9A5311]">Pinned</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-[#171622] tabular-nums">
              {summary.pinnedCount}
            </p>
            <p className="mt-0.5 text-[11px] text-[#171622]/60 truncate">
              Important notes
            </p>
          </div>
        </button>

        {/* Card 4: This Week & Journals */}
        <button
          type="button"
          onClick={() => setActiveTab('journal')}
          className="flex items-start gap-3.5 rounded-2xl border border-[#3688C4]/20 bg-[#EBF5FC] p-4 sm:p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#171622]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D6EAF8] text-[#1C5D8C]">
            <Calendar className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#1C5D8C]">This Week</p>
            <p className="mt-0.5 font-display text-2xl font-extrabold text-[#171622] tabular-nums">
              {summary.thisWeekCount}
            </p>
            <p className="mt-0.5 text-[11px] text-[#171622]/60 truncate">
              {summary.journalCount}{' '}
              {summary.journalCount === 1 ? 'journal entry' : 'journal entries'}
            </p>
          </div>
        </button>
      </section>

      {/* Main 3-Column Workspace (Desktop) / Responsive List-to-Detail (Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Column 1: Folders & Tags Sidebar (3 cols on lg) */}
        <aside
          aria-label="Folders and tags navigation"
          className={`lg:col-span-3 rounded-2xl border border-[#171622]/10 bg-white p-4 space-y-6 ${
            isMobileDetailOpen ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Folders Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-bold text-[#171622]">
                Folders
              </h2>
              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setIsFolderModalOpen(true);
                }}
                aria-label="Create folder"
                className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-[#171622]/12 bg-[#FAF9F6] text-[#171622]/75 hover:bg-[#C8F27C] hover:text-[#171622] transition-colors"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Note folders" className="space-y-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId('all');
                  if (activeTab === 'archived' || activeTab === 'trash') {
                    setActiveTab('all');
                  }
                }}
                className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  selectedFolderId === 'all' &&
                  activeTab !== 'archived' &&
                  activeTab !== 'trash'
                    ? 'bg-[#DCF5B4] font-semibold text-[#171622]'
                    : 'text-[#171622]/75 hover:bg-[#FAF9F6] hover:text-[#171622]'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FolderOpen
                    className="h-4 w-4 shrink-0 text-[#2B611D]"
                    aria-hidden="true"
                  />
                  <span className="truncate">All Notes</span>
                </span>
                <span className="text-[11px] font-semibold text-[#171622]/60 tabular-nums">
                  {summary.totalActiveCount}
                </span>
              </button>

              {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                const colorStyle =
                  NOTE_COLOR_STYLES[folder.color] ?? NOTE_COLOR_STYLES.lime;
                return (
                  <div
                    key={folder.id}
                    className={`group flex items-center justify-between gap-1 rounded-xl px-2.5 py-1.5 text-xs transition-colors ${
                      isSelected
                        ? 'bg-[#DCF5B4] font-semibold text-[#171622]'
                        : 'text-[#171622]/75 hover:bg-[#FAF9F6] hover:text-[#171622]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFolderId(folder.id);
                        if (activeTab === 'archived' || activeTab === 'trash') {
                          setActiveTab('all');
                        }
                      }}
                      className="flex-1 flex items-center gap-2.5 min-w-0 text-left py-0.5"
                    >
                      <Folder
                        className={`h-4 w-4 shrink-0 ${colorStyle.folderTextClass}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{folder.name}</span>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolder(folder);
                          setIsFolderModalOpen(true);
                        }}
                        aria-label={`Edit folder '${folder.name}'`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-1 text-[#171622]/55 hover:text-[#171622]"
                      >
                        <Edit3 className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingFolder(folder)}
                        aria-label={`Delete folder '${folder.name}'`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-1 text-[#B42318]/70 hover:text-[#B42318]"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </button>
                      <span className="min-w-[16px] text-right text-[11px] font-medium text-[#171622]/55 tabular-nums">
                        {folder.noteCount}
                      </span>
                    </div>
                  </div>
                );
              })}

              {folders.length > 0 && unfiledCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('unfiled')}
                  className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                    selectedFolderId === 'unfiled'
                      ? 'bg-[#DCF5B4] font-semibold text-[#171622]'
                      : 'text-[#171622]/65 hover:bg-[#FAF9F6] hover:text-[#171622]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Folder className="h-4 w-4 shrink-0 text-[#171622]/40" />
                    <span className="truncate">Unfiled</span>
                  </span>
                  <span className="text-[11px] text-[#171622]/50 tabular-nums">
                    {unfiledCount}
                  </span>
                </button>
              )}
            </nav>

            {folders.length === 0 && (
              <div className="rounded-xl border border-dashed border-[#171622]/15 bg-[#FAF9F6]/70 p-3 text-center space-y-2">
                <p className="text-xs font-semibold text-[#171622]">
                  Create your first folder
                </p>
                <p className="text-[11px] text-[#171622]/60 leading-relaxed">
                  Organize your notes your way — e.g. Research, Journal, or
                  Project Ideas.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolder(null);
                    setIsFolderModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-white border border-[#171622]/15 px-2.5 py-1 text-xs font-semibold text-[#171622] hover:bg-[#C8F27C]/40"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  <span>Create folder</span>
                </button>
              </div>
            )}
          </div>

          <hr className="border-t border-[#171622]/8" />

          {/* Tags Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-bold text-[#171622]">
                Tags
              </h2>
              <button
                type="button"
                onClick={() => setIsManageTagsOpen(true)}
                className="text-xs font-semibold text-[#5938B5] hover:text-[#171622]"
              >
                Manage
              </button>
            </div>

            {tags.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#171622]/15 bg-[#FAF9F6]/70 p-3 space-y-1.5">
                <p className="text-xs font-medium text-[#171622]/75">
                  No tags yet
                </p>
                <p className="text-[11px] text-[#171622]/55 leading-relaxed">
                  Add custom tags when creating a note or click Manage to create
                  tags.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tags.map((tag) => {
                  const isSelected = selectedTagId === tag.id;
                  const style =
                    NOTE_COLOR_STYLES[tag.color] ?? NOTE_COLOR_STYLES.violet;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setSelectedTagId(isSelected ? null : tag.id)
                      }
                      className={`w-full flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#FAF9F6] ring-1 ring-[#171622]/25'
                          : 'hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center rounded-lg px-2.5 py-0.5 text-xs font-medium ${style.chipClass}`}
                      >
                        {tag.name}
                      </span>
                      <span className="text-xs text-[#171622]/55 tabular-nums pr-1">
                        {tag.noteCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Column 2: Filter Bar, Search/Sort & Note Cards List (4 cols on lg) */}
        <section
          aria-label="Notes list"
          className={`lg:col-span-4 space-y-3.5 ${
            isMobileDetailOpen ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Filter Tabs + Sort + View Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Note category filters"
              className="flex flex-wrap items-center gap-1"
            >
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'recent', label: 'Recent' },
                  { id: 'pinned', label: 'Pinned' },
                  { id: 'journal', label: 'Journal' },
                  { id: 'archived', label: 'Archived' },
                  { id: 'trash', label: 'Trash' },
                ] as Array<{ id: NotesFilterTab; label: string }>
              ).map((tabItem) => {
                const active = activeTab === tabItem.id;
                return (
                  <button
                    key={tabItem.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tabItem.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? 'bg-[#C8F27C] text-[#171622] border border-[#65B339]/40'
                        : 'bg-white border border-[#171622]/10 text-[#171622]/70 hover:text-[#171622]'
                    }`}
                  >
                    {tabItem.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <select
                aria-label="Sort notes by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as NotesSortOption)}
                className="rounded-xl border border-[#171622]/12 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171622]"
              >
                <option value="updated_desc">Last updated</option>
                <option value="created_desc">Date created</option>
                <option value="title_asc">Title A–Z</option>
                <option value="journal_date_desc">Journal date</option>
              </select>

              <div className="inline-flex rounded-xl border border-[#171622]/12 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Card view"
                  aria-pressed={viewMode === 'grid'}
                  className={`rounded-lg p-1.5 ${
                    viewMode === 'grid'
                      ? 'bg-[#FAF9F6] text-[#171622]'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                  className={`rounded-lg p-1.5 ${
                    viewMode === 'list'
                      ? 'bg-[#FAF9F6] text-[#171622]'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          {/* Active Folder / Tag / Search Filter Banner */}
          {(selectedFolderId !== 'all' ||
            selectedTagId !== null ||
            searchQuery.trim() !== '') && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-white px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 text-[#171622]/75">
                <span>Filtered by:</span>
                {selectedFolderId !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#EAF7E1] px-2 py-0.5 font-semibold text-[#2B611D]">
                    {selectedFolderId === 'unfiled'
                      ? 'Unfiled'
                      : folders.find((f) => f.id === selectedFolderId)?.name ||
                        'Folder'}
                  </span>
                )}
                {selectedTagId && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#EBE8F8] px-2 py-0.5 font-semibold text-[#4C2FA3]">
                    #{tags.find((t) => t.id === selectedTagId)?.name || 'tag'}
                  </span>
                )}
                {searchQuery.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF9F6] border border-[#171622]/10 px-2 py-0.5 font-medium text-[#171622]">
                    &ldquo;{searchQuery.trim()}&rdquo;
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFolderId('all');
                  setSelectedTagId(null);
                  onSearchChange('');
                }}
                className="text-xs font-semibold text-[#5938B5] hover:text-[#171622]"
              >
                Clear
              </button>
            </div>
          )}

          {/* Notes List / Empty States */}
          {filteredNotes.length === 0 ? (
            <div className="rounded-2xl border border-[#171622]/10 bg-white p-8 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF7E1] text-[#2B611D]">
                {searchQuery.trim() ? (
                  <Search className="h-5 w-5" aria-hidden="true" />
                ) : activeTab === 'journal' ? (
                  <BookOpen className="h-5 w-5" aria-hidden="true" />
                ) : activeTab === 'archived' ? (
                  <Archive className="h-5 w-5" aria-hidden="true" />
                ) : activeTab === 'trash' ? (
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <FileText className="h-5 w-5" aria-hidden="true" />
                )}
              </div>

              <div className="space-y-1 max-w-xs mx-auto">
                <h3 className="font-display text-base font-bold text-[#171622]">
                  {searchQuery.trim()
                    ? 'No matching notes found'
                    : activeTab === 'pinned'
                      ? 'No pinned notes yet'
                      : activeTab === 'journal'
                        ? 'Your journal is waiting'
                        : activeTab === 'archived'
                          ? 'No archived notes'
                          : activeTab === 'trash'
                            ? 'Trash is empty'
                            : selectedFolderId !== 'all'
                              ? 'This folder has no notes yet'
                              : 'Make space for your thoughts.'}
                </h3>
                <p className="text-xs text-[#171622]/65 leading-relaxed">
                  {searchQuery.trim()
                    ? `No notes or journals matched "${searchQuery.trim()}". Try clearing your search filter.`
                    : activeTab === 'journal'
                      ? 'Reflect on your day and track dated journal entries across time.'
                      : activeTab === 'pinned'
                        ? 'Pin important notes or references so they stay right at the top.'
                        : 'Capture ideas, reflect on your day, and build a collection of knowledge that’s yours.'}
                </p>
              </div>

              {activeTab !== 'archived' && activeTab !== 'trash' && (
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateNoteDefaultType(
                        activeTab === 'journal' ? 'journal' : 'note'
                      );
                      setIsCreateNoteOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {activeTab === 'journal'
                        ? 'Write journal entry'
                        : 'New note'}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3'
                  : 'space-y-2.5'
              }
            >
              {filteredNotes.map((note) => {
                const isSelected = effectiveSelectedNote?.id === note.id;
                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      setSelectedNoteId(note.id);
                      setIsMobileDetailOpen(true);
                      setIsEditingNote(false);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedNoteId(note.id);
                        setIsMobileDetailOpen(true);
                        setIsEditingNote(false);
                      }
                    }}
                    className={`group rounded-2xl border p-4 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#65B339] bg-[#FAFDF6] ring-1 ring-[#65B339]/40 shadow-2xs'
                        : 'border-[#171622]/10 bg-white hover:border-[#171622]/25'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <NoteIconBadge iconStyle={note.iconStyle} size="md" />

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-sm font-bold text-[#171622] truncate">
                            {note.title}
                          </h3>

                          {!note.isTrashed && (
                            <button
                              type="button"
                              onClick={(e) => void handleQuickTogglePin(e, note)}
                              aria-label={
                                note.isPinned
                                  ? `Unpin '${note.title}'`
                                  : `Pin '${note.title}'`
                              }
                              className={`shrink-0 rounded-lg p-1 transition-colors ${
                                note.isPinned
                                  ? 'text-[#2B611D]'
                                  : 'text-[#171622]/35 hover:text-[#171622]'
                              }`}
                            >
                              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>

                        <p className="text-xs text-[#171622]/65 line-clamp-2 leading-relaxed">
                          {note.excerpt || 'No content preview'}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {note.entryType === 'journal' && (
                              <span className="inline-flex items-center rounded-md bg-[#E8F3FC] px-2 py-0.5 text-[11px] font-medium text-[#1D5F91]">
                                Journal
                              </span>
                            )}
                            {note.tags.slice(0, 3).map((tag) => {
                              const style =
                                NOTE_COLOR_STYLES[tag.color] ??
                                NOTE_COLOR_STYLES.violet;
                              return (
                                <span
                                  key={tag.id}
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${style.chipClass}`}
                                >
                                  {tag.name}
                                </span>
                              );
                            })}
                            {note.folderName && note.tags.length === 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#FAF9F6] px-2 py-0.5 text-[11px] text-[#171622]/65">
                                <Folder
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                />
                                <span>{note.folderName}</span>
                              </span>
                            )}
                          </div>

                          <span className="text-[11px] text-[#171622]/50 tabular-nums shrink-0 ml-auto">
                            {note.entryType === 'journal' &&
                            note.journalDateLabel
                              ? note.journalDateLabel
                              : note.updatedAtLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Column 3: Selected Note Detail / Markdown Editor Pane (5 cols on lg) */}
        <section
          aria-label="Selected note detail and editor"
          className={`lg:col-span-5 ${
            isMobileDetailOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          {effectiveSelectedNote ? (
            <NoteDetailEditorPane
              key={effectiveSelectedNote.id}
              note={effectiveSelectedNote}
              relatedNotes={relatedNotes}
              folders={folders}
              existingTags={tags}
              todayLocalDate={todayLocalDate}
              isEditing={isEditingNote}
              onSetEditing={setIsEditingNote}
              onSelectNote={(id) => {
                setSelectedNoteId(id);
                setIsEditingNote(false);
                setIsMobileDetailOpen(true);
              }}
              onBackToListMobile={() => setIsMobileDetailOpen(false)}
              onWorkspaceUpdated={handleWorkspaceUpdated}
              onRequestMoveFolder={(note) => setMovingNote(note)}
              onRequestDeleteNote={(note, permanent) =>
                setDeletingNoteState({ note, permanent })
              }
            />
          ) : (
            <div className="rounded-2xl border border-[#171622]/10 bg-white p-10 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EBE8F8] text-[#5938B5]">
                <FileText className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <h2 className="font-display text-base font-bold text-[#171622]">
                  Select or create a note
                </h2>
                <p className="text-xs text-[#171622]/65 leading-relaxed">
                  Choose any note from your list to read, edit with live
                  autosave, or explore related notes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateNoteDefaultType('note');
                  setIsCreateNoteOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6]"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>New note</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Modals */}
      <CreateNoteModal
        key={`create-note-${isCreateNoteOpen}-${createNoteDefaultType}-${selectedFolderId}`}
        isOpen={isCreateNoteOpen}
        defaultEntryType={createNoteDefaultType}
        defaultFolderId={
          selectedFolderId !== 'all' && selectedFolderId !== 'unfiled'
            ? selectedFolderId
            : null
        }
        todayLocalDate={todayLocalDate}
        folders={folders}
        existingTags={tags}
        onClose={() => setIsCreateNoteOpen(false)}
        onCreated={(nextWs, createdNote) => {
          handleWorkspaceUpdated(nextWs, createdNote);
          setIsMobileDetailOpen(true);
          setIsEditingNote(false);
        }}
      />

      <FolderFormModal
        key={`folder-modal-${isFolderModalOpen}-${editingFolder?.id ?? 'new'}`}
        isOpen={isFolderModalOpen}
        editingFolder={editingFolder}
        onClose={() => {
          setIsFolderModalOpen(false);
          setEditingFolder(null);
        }}
        onSaved={(nextWs, savedFolder) => {
          handleWorkspaceUpdated(nextWs);
          setSelectedFolderId(savedFolder.id);
        }}
      />

      <DeleteFolderConfirmModal
        folder={deletingFolder}
        onClose={() => setDeletingFolder(null)}
        onDeleted={(nextWs, deletedFolderId) => {
          if (selectedFolderId === deletedFolderId) {
            setSelectedFolderId('all');
          }
          handleWorkspaceUpdated(nextWs);
        }}
      />

      <ManageTagsModal
        isOpen={isManageTagsOpen}
        tags={tags}
        onClose={() => setIsManageTagsOpen(false)}
        onWorkspaceUpdated={(nextWs) => handleWorkspaceUpdated(nextWs)}
      />

      <MoveNoteToFolderModal
        key={`move-note-${movingNote?.id ?? 'none'}`}
        note={movingNote}
        folders={folders}
        onClose={() => setMovingNote(null)}
        onMoved={(nextWs, updatedNote) =>
          handleWorkspaceUpdated(nextWs, updatedNote)
        }
        onOpenCreateFolder={() => {
          setEditingFolder(null);
          setIsFolderModalOpen(true);
        }}
      />

      <DeleteNoteConfirmModal
        note={deletingNoteState?.note ?? null}
        permanent={deletingNoteState?.permanent ?? false}
        onClose={() => setDeletingNoteState(null)}
        onCompleted={(nextWs, deletedId) => {
          if (selectedNoteId === deletedId) {
            setSelectedNoteId(null);
            setIsMobileDetailOpen(false);
          }
          handleWorkspaceUpdated(nextWs);
        }}
      />
    </div>
  );
}
