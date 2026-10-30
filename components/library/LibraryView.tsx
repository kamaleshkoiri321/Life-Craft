'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  CloudUpload,
  Edit3,
  ExternalLink,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { LibraryQueryResult, LibraryViewData } from '@/lib/queries/library';
import {
  filterAndSortLibraryItems,
  formatFileSize,
  type LibraryCollectionColor,
  type LibraryFilterTab,
  type LibraryItemType,
  type LibraryReadingStatus,
  type LibrarySortOption,
  type SerializedLibraryCollection,
  type SerializedLibraryItem,
} from '@/lib/library/library-utils';
import BookCoverArt, { getCollectionColorClasses } from './BookCoverArt';
import dynamic from 'next/dynamic';
import {
  CollectionModal,
  DeleteCollectionModal,
  ManualItemModal,
  UploadBookModal,
} from './LibraryModals';

const BookReaderModal = dynamic(() => import('./BookReaderModal'), {
  ssr: false,
});

interface LibraryViewProps {
  searchQuery: string;
  onDataMutated?: () => void;
}

function StatusBadge({ status }: { status: LibraryReadingStatus }) {
  switch (status) {
    case 'reading':
      return (
        <span className="inline-flex items-center rounded-md bg-[#E6F7E3] px-2 py-0.5 text-[10px] font-semibold text-[#236B1E]">
          Reading
        </span>
      );
    case 'to_read':
      return (
        <span className="inline-flex items-center rounded-md bg-[#EFEBFD] px-2 py-0.5 text-[10px] font-semibold text-[#5438B8]">
          To read
        </span>
      );
    case 'completed':
      return (
        <span className="inline-flex items-center rounded-md bg-[#E7F1FE] px-2 py-0.5 text-[10px] font-semibold text-[#1D5BB8]">
          Completed
        </span>
      );
    case 'on_hold':
      return (
        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          On hold
        </span>
      );
    case 'archived':
      return (
        <span className="inline-flex items-center rounded-md bg-[#171622]/8 px-2 py-0.5 text-[10px] font-semibold text-[#171622]/65">
          Archived
        </span>
      );
  }
}

function FormatBadge({ itemType }: { itemType: LibraryItemType }) {
  if (itemType === 'pdf') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#C93B2B]">
        <FileText className="h-2.5 w-2.5" />
        PDF
      </span>
    );
  }
  if (itemType === 'epub') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#E8F7E5] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2A6F25]">
        <BookOpen className="h-2.5 w-2.5" />
        EPUB
      </span>
    );
  }
  if (itemType === 'link') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[#EEF4FE] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#2356A8]">
        <Link2 className="h-2.5 w-2.5" />
        LINK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-[#F3F0FC] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5839B8]">
      <BookOpen className="h-2.5 w-2.5" />
      BOOK
    </span>
  );
}

export default function LibraryView({
  searchQuery,
  onDataMutated,
}: LibraryViewProps) {
  const [libraryData, setLibraryData] = useState<LibraryViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filters & view state
  const [activeTab, setActiveTab] = useState<LibraryFilterTab>('all');
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(
    null
  );
  const [activeFormat, setActiveFormat] = useState<LibraryItemType | 'all'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<LibrarySortOption>('last_opened');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAllActivity, setShowAllActivity] = useState(false);

  // Menus & popovers
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const [openCollectionPopoverItemId, setOpenCollectionPopoverItemId] =
    useState<string | null>(null);
  const [openCollectionMenuId, setOpenCollectionMenuId] = useState<
    string | null
  >(null);

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [droppedUploadFile, setDroppedUploadFile] = useState<File | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SerializedLibraryItem | null>(
    null
  );
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] =
    useState<SerializedLibraryCollection | null>(null);
  const [deletingCollection, setDeletingCollection] =
    useState<SerializedLibraryCollection | null>(null);
  const [deletingItem, setDeletingItem] =
    useState<SerializedLibraryItem | null>(null);
  const [isDeletingItemBusy, setIsDeletingItemBusy] = useState(false);

  // Reader modal state
  const [readingItemId, setReadingItemId] = useState<string | null>(null);

  // Drag & drop state for right sidebar card
  const [isDraggingOverDropzone, setIsDraggingOverDropzone] = useState(false);
  const sidebarFileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  }, []);

  const fetchLibrary = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setIsLoading(true);
    }
    try {
      const response = await fetch('/api/library', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const result = (await response.json()) as LibraryQueryResult;
      if (result.status === 'ok') {
        setLibraryData(result.data);
        setErrorMessage(null);
      } else {
        setErrorMessage(
          result.message || 'Unable to load your library right now.'
        );
      }
    } catch {
      setErrorMessage('Network error while loading your library.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/library', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    })
      .then(async (response) => {
        if (cancelled) return;
        const result = (await response.json()) as LibraryQueryResult;
        if (cancelled) return;
        if (result.status === 'ok') {
          setLibraryData(result.data);
          setErrorMessage(null);
        } else {
          setErrorMessage(
            result.message || 'Unable to load your library right now.'
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage('Network error while loading your library.');
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

  // Close menus on outside click
  useEffect(() => {
    const handleDocClick = () => {
      setOpenItemMenuId(null);
      setOpenCollectionMenuId(null);
    };
    window.addEventListener('click', handleDocClick);
    return () => window.removeEventListener('click', handleDocClick);
  }, []);

  const items = useMemo(() => libraryData?.items ?? [], [libraryData]);
  const collections = useMemo(
    () => libraryData?.collections ?? [],
    [libraryData]
  );

  // Tab counts
  const tabCounts = useMemo(() => {
    let all = 0;
    let reading = 0;
    let toRead = 0;
    let completed = 0;
    let archived = 0;

    for (const item of items) {
      if (
        activeCollectionId &&
        !item.collectionIds.includes(activeCollectionId)
      ) {
        continue;
      }
      if (item.readingStatus === 'archived') {
        archived++;
      } else {
        all++;
        if (item.readingStatus === 'reading') reading++;
        else if (item.readingStatus === 'to_read') toRead++;
        else if (item.readingStatus === 'completed') completed++;
      }
    }

    return { all, reading, toRead, completed, archived };
  }, [activeCollectionId, items]);

  const filteredItems = useMemo(
    () =>
      filterAndSortLibraryItems({
        items,
        filterTab: activeTab,
        collectionIdFilter: activeCollectionId ?? 'all',
        formatFilter: activeFormat,
        searchQuery,
        sortBy,
      }),
    [activeCollectionId, activeFormat, activeTab, items, searchQuery, sortBy]
  );

  const activeReadingItem = useMemo(
    () => items.find((i) => i.id === readingItemId) ?? null,
    [items, readingItemId]
  );

  const activeCollectionObj = useMemo(
    () => collections.find((c) => c.id === activeCollectionId) ?? null,
    [activeCollectionId, collections]
  );

  // Open an item (reader for PDF/EPUB, external tab for link, edit modal for manual book)
  const handleOpenItem = async (item: SerializedLibraryItem) => {
    if (item.itemType === 'pdf' || item.itemType === 'epub') {
      setReadingItemId(item.id);
      return;
    }

    if (item.externalUrl) {
      window.open(item.externalUrl, '_blank', 'noopener,noreferrer');
      await fetch(`/api/library/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          touchLastOpened: true,
          readingStatus:
            item.readingStatus === 'to_read' ? 'reading' : item.readingStatus,
        }),
      });
      await fetchLibrary(false);
      return;
    }

    setEditingItem(item);
    setIsManualModalOpen(true);
  };

  // Update item status / progress / collections
  const handleQuickPatchItem = async (
    itemId: string,
    payload: Record<string, unknown>,
    successNotice?: string
  ) => {
    const res = await fetch(`/api/library/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      if (successNotice) showToast(successNotice);
      await fetchLibrary(false);
      onDataMutated?.();
    } else {
      const err = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      showToast(
        err.message || err.error || 'Could not update library item.'
      );
    }
  };

  // Create or update manual item
  const handleManualItemSubmit = async (
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; message?: string }> => {
    const isEditing = Boolean(editingItem);
    const url = isEditing
      ? `/api/library/${editingItem!.id}`
      : '/api/library';
    const method = isEditing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message || data.error || 'Could not save reading item.',
      };
    }

    showToast(isEditing ? 'Library item updated.' : 'Added to your library.');
    await fetchLibrary(false);
    onDataMutated?.();
    return { ok: true };
  };

  // Permanently delete item + stored file
  const handleConfirmDeleteItem = async () => {
    if (!deletingItem || isDeletingItemBusy) return;
    setIsDeletingItemBusy(true);
    try {
      const res = await fetch(`/api/library/${deletingItem.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        if (readingItemId === deletingItem.id) {
          setReadingItemId(null);
        }
        showToast(`Deleted "${deletingItem.title}".`);
        setDeletingItem(null);
        await fetchLibrary(false);
        onDataMutated?.();
      } else {
        const err = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
        };
        showToast(err.message || err.error || 'Failed to delete item.');
      }
    } finally {
      setIsDeletingItemBusy(false);
    }
  };

  const handleReaderItemMutated = useCallback(() => {
    void fetchLibrary(false);
  }, [fetchLibrary]);

  // Create or update custom collection
  const handleCollectionSubmit = async (payload: {
    name: string;
    description: string | null;
    color: LibraryCollectionColor;
  }): Promise<{ ok: boolean; message?: string }> => {
    const isEditing = Boolean(editingCollection);
    const url = isEditing
      ? `/api/library/collections/${editingCollection!.id}`
      : '/api/library/collections';
    const method = isEditing ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        message:
          data.message || data.error || 'Could not save collection.',
      };
    }

    showToast(
      isEditing
        ? `Updated "${payload.name}" collection.`
        : `Created "${payload.name}" collection.`
    );
    await fetchLibrary(false);
    return { ok: true };
  };

  // Delete collection (keeps books intact)
  const handleConfirmDeleteCollection = async (collectionId: string) => {
    const res = await fetch(`/api/library/collections/${collectionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (res.ok) {
      if (activeCollectionId === collectionId) {
        setActiveCollectionId(null);
      }
      showToast('Collection deleted. Your books remain in your library.');
      await fetchLibrary(false);
    } else {
      const err = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      showToast(
        err.message || err.error || 'Could not delete collection.'
      );
    }
  };

  // Toggle collection membership on a book card
  const handleToggleItemCollection = async (
    item: SerializedLibraryItem,
    collectionId: string
  ) => {
    const hasCollection = item.collectionIds.includes(collectionId);
    const nextIds = hasCollection
      ? item.collectionIds.filter((id) => id !== collectionId)
      : [...item.collectionIds, collectionId];

    await handleQuickPatchItem(item.id, { collectionIds: nextIds });
  };

  if (isLoading && !libraryData) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded-xl bg-[#171622]/8" />
            <div className="h-4 w-64 animate-pulse rounded-lg bg-[#171622]/6" />
          </div>
          <div className="flex gap-2.5">
            <div className="h-10 w-32 animate-pulse rounded-xl bg-[#171622]/8" />
            <div className="h-10 w-36 animate-pulse rounded-xl bg-[#171622]/12" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-2xl bg-white border border-[#171622]/8"
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-52 animate-pulse rounded-2xl bg-white border border-[#171622]/8"
              />
            ))}
          </div>
          <div className="lg:col-span-4 space-y-4">
            <div className="h-64 animate-pulse rounded-2xl bg-white border border-[#171622]/8" />
            <div className="h-56 animate-pulse rounded-2xl bg-white border border-[#171622]/8" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage && !libraryData) {
    return (
      <div className="rounded-3xl border border-[#171622]/12 bg-white p-8 text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-[#171622]">
          Unable to Load Your Library
        </h2>
        <p className="mx-auto max-w-md text-xs text-[#171622]/65">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={() => void fetchLibrary(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#171622]/90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const summary = libraryData?.summary ?? {
    totalItemsCount: 0,
    currentlyReadingCount: 0,
    completedCount: 0,
    toReadCount: 0,
    onHoldCount: 0,
    archivedCount: 0,
  };
  const continueItem = libraryData?.continueReadingItem ?? null;
  const recentActivity = libraryData?.recentActivity ?? [];
  const displayedActivity = showAllActivity
    ? recentActivity
    : recentActivity.slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-2xl border border-[#171622]/12 bg-[#171622] px-4 py-3 text-xs font-semibold text-[#FAF9F6] shadow-xl"
        >
          <Sparkles className="h-4 w-4 text-[#C8F27C]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#171622]">
            Your Library
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#171622]/60">
            Your reading life, organized your way.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDroppedUploadFile(null);
              setIsUploadModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#171622] shadow-2xs transition-colors hover:bg-[#FAF9F6]"
          >
            <Upload className="h-4 w-4 text-[#171622]/75" />
            <span>Upload book</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingItem(null);
              setIsManualModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs sm:text-sm font-semibold text-[#FAF9F6] shadow-xs transition-colors hover:bg-[#171622]/90"
          >
            <Plus className="h-4 w-4" />
            <span>Add reading item</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout matching reference image */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 items-start">
        {/* Left / Center Column (8 cols on xl) */}
        <div className="xl:col-span-8 space-y-5">
          {/* 4 Reading Summary Cards */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {/* Card 1: Total items */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className="group flex flex-col justify-between rounded-2xl border border-[#52B748]/15 bg-[#EFFAE6] p-4 text-left transition-all hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DDF4CE] text-[#2D7A25]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#171622]/65">
                    Total items
                  </p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-[#171622]">
                    {summary.totalItemsCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/55">
                Books, PDFs, EPUBs
              </p>
            </button>

            {/* Card 2: Currently reading */}
            <button
              type="button"
              onClick={() => setActiveTab('reading')}
              className="group flex flex-col justify-between rounded-2xl border border-[#5938B5]/12 bg-[#F2EFFC] p-4 text-left transition-all hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E3DCF8] text-[#5938B5]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#171622]/65">
                    Currently reading
                  </p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-[#171622]">
                    {summary.currentlyReadingCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/55">
                {summary.currentlyReadingCount > 0
                  ? 'Keep going!'
                  : 'Pick a book to start'}
              </p>
            </button>

            {/* Card 3: Completed */}
            <button
              type="button"
              onClick={() => setActiveTab('completed')}
              className="group flex flex-col justify-between rounded-2xl border border-[#D96B27]/12 bg-[#FDF3EC] p-4 text-left transition-all hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FBE2D0] text-[#C85A17]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#171622]/65">
                    Completed
                  </p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-[#171622]">
                    {summary.completedCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/55">
                {summary.completedCount > 0 ? 'Well done!' : 'Finish your first read'}
              </p>
            </button>

            {/* Card 4: To read */}
            <button
              type="button"
              onClick={() => setActiveTab('to_read')}
              className="group flex flex-col justify-between rounded-2xl border border-[#2563EB]/12 bg-[#EEF5FD] p-4 text-left transition-all hover:shadow-xs"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DCEBFA] text-[#1D58C8]">
                  <Bookmark className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[#171622]/65">
                    To read
                  </p>
                  <p className="mt-0.5 font-display text-2xl font-bold text-[#171622]">
                    {summary.toReadCount}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] font-medium text-[#171622]/55">
                Exciting reads ahead
              </p>
            </button>
          </div>

          {/* Continue Reading Hero Banner */}
          {continueItem && (
            <div className="relative rounded-3xl border border-[#171622]/8 bg-white p-4 sm:p-5 shadow-2xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    onClick={() => void handleOpenItem(continueItem)}
                    className="cursor-pointer transition-transform hover:scale-[1.02]"
                  >
                    <BookCoverArt
                      title={continueItem.title}
                      coverStyle={continueItem.coverStyle}
                      size="md"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-bold text-[#171622]">
                      Continue reading
                    </p>
                    <h2
                      onClick={() => void handleOpenItem(continueItem)}
                      className="cursor-pointer truncate font-display text-base sm:text-lg font-bold text-[#171622] hover:text-[#5938B5]"
                    >
                      {continueItem.title}
                    </h2>
                    <p className="line-clamp-1 text-xs text-[#171622]/60">
                      {continueItem.description ||
                        continueItem.author ||
                        `${continueItem.itemType.toUpperCase()} reading item`}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-end">
                  <div className="min-w-[165px] space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#171622]/10">
                        <div
                          className="h-full rounded-full bg-[#52B748] transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, continueItem.progressPercent)
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[#171622]">
                        {continueItem.progressPercent}%
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-[#171622]/55">
                      {continueItem.pageSummaryLabel || 'Ready to read'}
                    </p>
                    <p className="text-[11px] text-[#171622]/45">
                      {continueItem.footerMetaLabel}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleOpenItem(continueItem)}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs transition-colors hover:bg-[#171622]/90"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Resume</span>
                    </button>

                    <button
                      type="button"
                      aria-label={`Edit ${continueItem.title}`}
                      title="Edit details"
                      onClick={() => {
                        setEditingItem(continueItem);
                        setIsManualModalOpen(true);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#171622]/10 text-[#171622]/55 hover:bg-[#FAF9F6] hover:text-[#171622]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete ${continueItem.title}`}
                      title="Delete book"
                      onClick={() => setDeletingItem(continueItem)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200/80 bg-red-50/50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active Collection Banner when filtering by a user collection */}
          {activeCollectionObj && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#5938B5]/20 bg-[#F4F1FD] px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#171622]">
                <Folder className="h-4 w-4 text-[#5938B5]" />
                <span>
                  Viewing collection:{' '}
                  <strong className="font-bold">
                    {activeCollectionObj.name}
                  </strong>
                </span>
                {activeCollectionObj.description && (
                  <span className="hidden sm:inline text-[#171622]/55 font-normal">
                    — {activeCollectionObj.description}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                <X className="h-3 w-3" />
                Clear filter
              </button>
            </div>
          )}

          {/* Filter Tabs + Format Filter + Sort Dropdown + Grid/List Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Filter Pills */}
            <div
              role="tablist"
              aria-label="Filter library items by reading status"
              className="flex flex-wrap items-center gap-1.5"
            >
              {(
                [
                  { id: 'all', label: `All (${tabCounts.all})` },
                  {
                    id: 'reading',
                    label: `Currently reading (${tabCounts.reading})`,
                  },
                  { id: 'to_read', label: `To read (${tabCounts.toRead})` },
                  {
                    id: 'completed',
                    label: `Completed (${tabCounts.completed})`,
                  },
                  { id: 'archived', label: `Archived (${tabCounts.archived})` },
                ] as { id: LibraryFilterTab; label: string }[]
              ).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#C8F27C] text-[#171622] shadow-2xs'
                        : 'border border-[#171622]/10 bg-white text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Right Controls: Format, Sort & View Mode */}
            <div className="flex items-center gap-2">
              <select
                aria-label="Filter by format"
                value={activeFormat}
                onChange={(e) =>
                  setActiveFormat(e.target.value as LibraryItemType | 'all')
                }
                className="rounded-xl border border-[#171622]/10 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:outline-none"
              >
                <option value="all">All formats</option>
                <option value="pdf">PDFs</option>
                <option value="epub">EPUBs</option>
                <option value="book">Manual books</option>
                <option value="link">Links</option>
              </select>

              <select
                aria-label="Sort library items"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as LibrarySortOption)}
                className="rounded-xl border border-[#171622]/10 bg-white px-3 py-1.5 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:outline-none"
              >
                <option value="last_opened">Last opened</option>
                <option value="date_added">Date added</option>
                <option value="title_asc">Title</option>
                <option value="progress_desc">Progress</option>
              </select>

              <div className="inline-flex items-center rounded-xl border border-[#171622]/10 bg-white p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-[#FAF9F6] text-[#171622] font-bold shadow-2xs'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-[#FAF9F6] text-[#171622] font-bold shadow-2xs'
                      : 'text-[#171622]/45 hover:text-[#171622]'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Books Grid or Empty State */}
          {filteredItems.length === 0 ? (
            <div className="rounded-3xl border border-[#171622]/10 bg-white p-8 sm:p-12 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EFFAE6] text-[#2D7A25]">
                <BookOpen className="h-6 w-6" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h2 className="font-display text-lg font-bold text-[#171622]">
                  {items.length === 0
                    ? 'Your private library is ready'
                    : 'No reading items match these filters'}
                </h2>
                <p className="text-xs sm:text-sm text-[#171622]/60 leading-relaxed">
                  {items.length === 0
                    ? 'Upload a PDF or EPUB book to read directly in your browser with automatic progress saving, or add a reading item to track.'
                    : 'Try switching tabs, clearing your search query, or selecting All Books.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                {items.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDroppedUploadFile(null);
                        setIsUploadModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#171622]/90"
                    >
                      <Upload className="h-4 w-4" />
                      Upload PDF or EPUB
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setIsManualModalOpen(true);
                      }}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                    >
                      <Plus className="h-4 w-4" />
                      Add reading item
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('all');
                      setActiveCollectionId(null);
                      setActiveFormat('all');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'
                  : 'space-y-3'
              }
            >
              {filteredItems.map((item) => {
                const isMenuOpen = openItemMenuId === item.id;
                const isCollectionPopoverOpen =
                  openCollectionPopoverItemId === item.id;

                return (
                  <article
                    key={item.id}
                    className="group relative flex flex-col justify-between rounded-2xl border border-[#171622]/8 bg-white p-3.5 shadow-2xs transition-all hover:border-[#171622]/15 hover:shadow-sm"
                  >
                    {/* Top Section: Cover + Metadata */}
                    <div className="flex items-start gap-3.5">
                      <div
                        onClick={() => void handleOpenItem(item)}
                        className="cursor-pointer transition-transform group-hover:scale-[1.02]"
                      >
                        <BookCoverArt
                          title={item.title}
                          coverStyle={item.coverStyle}
                          size="md"
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-1">
                          <h3
                            onClick={() => void handleOpenItem(item)}
                            className="cursor-pointer line-clamp-2 text-sm font-bold leading-snug text-[#171622] hover:text-[#5938B5]"
                          >
                            {item.title}
                          </h3>

                          {/* Actions Menu Button */}
                          <div
                            className="relative shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              aria-label={`Actions for ${item.title}`}
                              onClick={() =>
                                setOpenItemMenuId((curr) =>
                                  curr === item.id ? null : item.id
                                )
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622]/45 hover:bg-[#FAF9F6] hover:text-[#171622]"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-8 z-30 w-48 rounded-2xl border border-[#171622]/10 bg-white p-1.5 shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    void handleOpenItem(item);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                                >
                                  {item.itemType === 'pdf' ||
                                  item.itemType === 'epub' ? (
                                    <>
                                      <BookOpen className="h-3.5 w-3.5 text-[#5938B5]" />
                                      Open in Reader
                                    </>
                                  ) : item.externalUrl ? (
                                    <>
                                      <ExternalLink className="h-3.5 w-3.5 text-[#5938B5]" />
                                      Open external link
                                    </>
                                  ) : (
                                    <>
                                      <Edit3 className="h-3.5 w-3.5 text-[#5938B5]" />
                                      Update progress
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    setEditingItem(item);
                                    setIsManualModalOpen(true);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                >
                                  <Edit3 className="h-3.5 w-3.5 text-[#171622]/60" />
                                  Edit details
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    setOpenCollectionPopoverItemId((curr) =>
                                      curr === item.id ? null : item.id
                                    );
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                >
                                  <Folder className="h-3.5 w-3.5 text-[#171622]/60" />
                                  Assign collections
                                </button>

                                <div className="my-1 h-px bg-[#171622]/8" />

                                {item.readingStatus !== 'reading' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenItemMenuId(null);
                                      void handleQuickPatchItem(
                                        item.id,
                                        { readingStatus: 'reading' },
                                        'Marked as currently reading.'
                                      );
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <Play className="h-3.5 w-3.5 text-[#2D7A25]" />
                                    Mark as reading
                                  </button>
                                )}

                                {item.readingStatus !== 'completed' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenItemMenuId(null);
                                      void handleQuickPatchItem(
                                        item.id,
                                        {
                                          readingStatus: 'completed',
                                          progressPercent: 100,
                                        },
                                        'Marked as completed!'
                                      );
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-[#1D5BB8]" />
                                    Mark as completed
                                  </button>
                                )}

                                {item.readingStatus !== 'to_read' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenItemMenuId(null);
                                      void handleQuickPatchItem(
                                        item.id,
                                        {
                                          readingStatus: 'to_read',
                                          progressPercent: 0,
                                        },
                                        'Moved to To read.'
                                      );
                                    }}
                                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                  >
                                    <Bookmark className="h-3.5 w-3.5 text-[#5938B5]" />
                                    Move to To read
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    const nextStatus =
                                      item.readingStatus === 'archived'
                                        ? 'to_read'
                                        : 'archived';
                                    void handleQuickPatchItem(
                                      item.id,
                                      { readingStatus: nextStatus },
                                      nextStatus === 'archived'
                                        ? 'Item archived.'
                                        : 'Restored from archive.'
                                    );
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                                >
                                  <Archive className="h-3.5 w-3.5 text-[#171622]/60" />
                                  {item.readingStatus === 'archived'
                                    ? 'Unarchive'
                                    : 'Archive'}
                                </button>

                                <div className="my-1 h-px bg-[#171622]/8" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenItemMenuId(null);
                                    setDeletingItem(item);
                                  }}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Delete permanently
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <p className="line-clamp-1 text-[11px] text-[#171622]/55">
                          {item.description ||
                            item.author ||
                            (item.fileSizeBytes
                              ? formatFileSize(item.fileSizeBytes)
                              : 'Personal reading item')}
                        </p>

                        {/* Badges Row: Format + Status */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <FormatBadge itemType={item.itemType} />
                          <StatusBadge status={item.readingStatus} />
                        </div>

                        {/* Progress Bar + Percentage */}
                        <div className="pt-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#171622]/8">
                              <div
                                className="h-full rounded-full bg-[#52B748] transition-all"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(0, item.progressPercent)
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-[#171622]">
                              {item.progressPercent}%
                            </span>
                          </div>
                          <p className="text-[10px] font-medium text-[#171622]/55">
                            {item.pageSummaryLabel || 'Page 0'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Section: User Collections Chips + Timestamp */}
                    <div className="mt-3 border-t border-[#171622]/6 pt-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.collections.map((col) => (
                          <button
                            key={col.id}
                            type="button"
                            onClick={() => setActiveCollectionId(col.id)}
                            className="inline-flex items-center rounded-md bg-[#F2F1F5] px-2 py-0.5 text-[10px] font-semibold text-[#171622]/75 hover:bg-[#E5E3EC] hover:text-[#171622]"
                          >
                            {col.name}
                          </button>
                        ))}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenCollectionPopoverItemId((curr) =>
                              curr === item.id ? null : item.id
                            );
                          }}
                          title="Assign to collections"
                          className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-[#171622]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#171622]/50 hover:border-[#171622]/30 hover:text-[#171622]"
                        >
                          <Plus className="h-2.5 w-2.5" />
                          <span>
                            {item.collections.length === 0 ? 'Collection' : ''}
                          </span>
                        </button>
                      </div>

                      {/* Inline Collection Assignment Popover */}
                      {isCollectionPopoverOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-2.5 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#171622]/60">
                              Assign Collections
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCollectionPopoverItemId(null)
                              }
                              className="text-[#171622]/45 hover:text-[#171622]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>

                          {collections.length === 0 ? (
                            <div className="text-[11px] text-[#171622]/65">
                              No collections yet.{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenCollectionPopoverItemId(null);
                                  setEditingCollection(null);
                                  setIsCollectionModalOpen(true);
                                }}
                                className="font-semibold text-[#5938B5] underline"
                              >
                                Create one
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {collections.map((col) => {
                                const assigned = item.collectionIds.includes(
                                  col.id
                                );
                                return (
                                  <button
                                    key={col.id}
                                    type="button"
                                    onClick={() =>
                                      void handleToggleItemCollection(
                                        item,
                                        col.id
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition-all ${
                                      assigned
                                        ? 'bg-[#171622] text-white'
                                        : 'bg-white text-[#171622]/75 border border-[#171622]/10'
                                    }`}
                                  >
                                    {assigned && (
                                      <Check className="h-2.5 w-2.5" />
                                    )}
                                    {col.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 text-[10px] text-[#171622]/45">
                        <span className="truncate">{item.footerMetaLabel}</span>
                        <div className="flex shrink-0 items-center gap-2">
                          {(item.itemType === 'pdf' ||
                            item.itemType === 'epub') && (
                            <button
                              type="button"
                              onClick={() => void handleOpenItem(item)}
                              className="font-semibold text-[#5938B5] hover:underline"
                            >
                              Read →
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingItem(item);
                            }}
                            aria-label={`Delete ${item.title}`}
                            title="Delete book"
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-red-600/80 transition-colors hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar Column (4 cols on xl) */}
        <aside className="xl:col-span-4 space-y-5">
          {/* Card 1: Your Collections (User-Created) */}
          <section
            aria-labelledby="your-collections-heading"
            className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-[#171622]" />
                <h2
                  id="your-collections-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  Your Collections
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingCollection(null);
                  setIsCollectionModalOpen(true);
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create collection</span>
              </button>
            </div>

            <div className="space-y-2">
              {/* All Books built-in filter entry */}
              <button
                type="button"
                onClick={() => setActiveCollectionId(null)}
                className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left transition-all ${
                  activeCollectionId === null
                    ? 'border-[#171622]/15 bg-[#FAF9F6] font-bold text-[#171622]'
                    : 'border-[#171622]/6 bg-white text-[#171622]/80 hover:bg-[#FAF9F6]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#171622]/8 text-[#171622]">
                    <Folder className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate text-xs font-semibold">
                    All Books
                  </span>
                </div>
                <span className="text-xs font-semibold text-[#171622]/55">
                  {summary.totalItemsCount}
                </span>
              </button>

              {/* User-Created Collections */}
              {collections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#171622]/12 bg-[#FAF9F6]/70 p-4 text-center space-y-2">
                  <FolderPlus className="mx-auto h-5 w-5 text-[#5938B5]" />
                  <p className="text-xs font-semibold text-[#171622]">
                    Create your first collection
                  </p>
                  <p className="text-[11px] leading-relaxed text-[#171622]/55">
                    Organize books your way — e.g. AI Research, Books to Read,
                    Personal Growth, University, or Design.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCollection(null);
                      setIsCollectionModalOpen(true);
                    }}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#171622]/90"
                  >
                    <Plus className="h-3 w-3" />
                    New collection
                  </button>
                </div>
              ) : (
                collections.map((col) => {
                  const isSelected = activeCollectionId === col.id;
                  const { folderBg, folderText } = getCollectionColorClasses(
                    col.color
                  );
                  const isMenuOpen = openCollectionMenuId === col.id;

                  return (
                    <div
                      key={col.id}
                      className={`group relative flex items-center justify-between rounded-2xl border px-3.5 py-2.5 transition-all ${
                        isSelected
                          ? 'border-[#5938B5]/30 bg-[#F4F1FD]'
                          : 'border-[#171622]/6 bg-white hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setActiveCollectionId((curr) =>
                            curr === col.id ? null : col.id
                          )
                        }
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${folderBg} ${folderText}`}
                        >
                          <Folder className="h-3.5 w-3.5" />
                        </div>
                        <span className="truncate text-xs font-semibold text-[#171622]">
                          {col.name}
                        </span>
                      </button>

                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-semibold text-[#171622]/55">
                          {col.itemCount}
                        </span>
                        <button
                          type="button"
                          aria-label={`Manage ${col.name} collection`}
                          onClick={() =>
                            setOpenCollectionMenuId((curr) =>
                              curr === col.id ? null : col.id
                            )
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-lg text-[#171622]/40 hover:bg-white hover:text-[#171622]"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-2 top-10 z-30 w-44 rounded-2xl border border-[#171622]/10 bg-white p-1.5 shadow-xl">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCollectionMenuId(null);
                                setEditingCollection(col);
                                setIsCollectionModalOpen(true);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#171622] hover:bg-[#FAF9F6]"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[#171622]/60" />
                              Rename / color
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCollectionMenuId(null);
                                setDeletingCollection(col);
                              }}
                              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete collection
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Card 2: Recent Activity */}
          <section
            aria-labelledby="recent-activity-heading"
            className="rounded-3xl border border-[#171622]/8 bg-white p-5 shadow-2xs space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-[#171622]" />
                <h2
                  id="recent-activity-heading"
                  className="font-display text-sm font-bold text-[#171622]"
                >
                  Recent Activity
                </h2>
              </div>
              {recentActivity.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllActivity((v) => !v)}
                  className="text-xs font-semibold text-[#5938B5] hover:text-[#171622]"
                >
                  {showAllActivity ? 'Show less' : 'View all →'}
                </button>
              )}
            </div>

            {displayedActivity.length === 0 ? (
              <p className="rounded-2xl bg-[#FAF9F6] p-4 text-center text-xs text-[#171622]/55">
                Your recent reading activity will appear here as you upload and
                read books.
              </p>
            ) : (
              <div className="space-y-3">
                {displayedActivity.map((act) => {
                  const fullItem = items.find((i) => i.id === act.itemId);
                  return (
                    <div
                      key={act.itemId}
                      className="flex items-center justify-between gap-3"
                    >
                      <div
                        onClick={() => {
                          if (fullItem) void handleOpenItem(fullItem);
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                      >
                        <BookCoverArt
                          title={act.title}
                          coverStyle={act.coverStyle}
                          size="xs"
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="truncate text-xs font-bold text-[#171622] hover:text-[#5938B5]">
                            {act.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <FormatBadge itemType={act.itemType} />
                            <span className="truncate text-[10px] text-[#171622]/55">
                              {act.activityLabel}
                            </span>
                          </div>
                        </div>
                      </div>

                      {fullItem && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label={`Delete ${act.title}`}
                            title="Delete book"
                            onClick={() => setDeletingItem(fullItem)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622]/35 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Card 3: Upload a book or document Drag-and-Drop Card */}
          <section
            aria-label="Upload a book or document"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOverDropzone(true);
            }}
            onDragLeave={() => setIsDraggingOverDropzone(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOverDropzone(false);
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setDroppedUploadFile(file);
                setIsUploadModalOpen(true);
              }
            }}
            className={`rounded-3xl border-2 border-dashed p-6 text-center transition-all ${
              isDraggingOverDropzone
                ? 'border-[#5938B5] bg-[#F3F0FC]'
                : 'border-[#5938B5]/25 bg-white hover:border-[#5938B5]/45'
            }`}
          >
            <input
              ref={sidebarFileInputRef}
              type="file"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setDroppedUploadFile(file);
                  setIsUploadModalOpen(true);
                }
                e.target.value = '';
              }}
            />
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F2EFFC] text-[#5938B5]">
              <CloudUpload className="h-5 w-5" />
            </div>
            <h3 className="font-display text-sm font-bold text-[#171622]">
              Upload a book or document
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[#171622]/60">
              Drag and drop a PDF or EPUB file here, or choose from your device.
            </p>
            <button
              type="button"
              onClick={() => sidebarFileInputRef.current?.click()}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs transition-colors hover:bg-[#171622]/90"
            >
              Choose PDF or EPUB
            </button>
            <p className="mt-2.5 text-[11px] text-[#171622]/45">
              Maximum 50 MB per file
            </p>
          </section>
        </aside>
      </div>

      {/* Upload Book Modal (keyed so state resets cleanly when opened) */}
      {isUploadModalOpen && (
        <UploadBookModal
          key={`upload-modal-${droppedUploadFile?.name ?? 'empty'}`}
          isOpen={isUploadModalOpen}
          initialFile={droppedUploadFile}
          collections={collections}
          storageStatus={libraryData?.storageStatus}
          onClose={() => {
            setIsUploadModalOpen(false);
            setDroppedUploadFile(null);
          }}
          onUploaded={(newItemId) => {
            setIsUploadModalOpen(false);
            setDroppedUploadFile(null);
            showToast('Book uploaded to your private library!');
            void fetchLibrary(false).then(() => {
              setReadingItemId(newItemId);
            });
            onDataMutated?.();
          }}
        />
      )}

      {/* Manual Item / Edit Item Modal */}
      {isManualModalOpen && (
        <ManualItemModal
          key={`manual-modal-${editingItem?.id ?? 'new'}`}
          isOpen={isManualModalOpen}
          editingItem={editingItem}
          collections={collections}
          onClose={() => {
            setIsManualModalOpen(false);
            setEditingItem(null);
          }}
          onSubmit={handleManualItemSubmit}
        />
      )}

      {/* Create / Edit Collection Modal */}
      {isCollectionModalOpen && (
        <CollectionModal
          key={`collection-modal-${editingCollection?.id ?? 'new'}`}
          isOpen={isCollectionModalOpen}
          editingCollection={editingCollection}
          onClose={() => {
            setIsCollectionModalOpen(false);
            setEditingCollection(null);
          }}
          onSubmit={handleCollectionSubmit}
        />
      )}

      {/* Delete Collection Confirmation Modal */}
      <DeleteCollectionModal
        collection={deletingCollection}
        onClose={() => setDeletingCollection(null)}
        onConfirmDelete={handleConfirmDeleteCollection}
      />

      {/* Delete Library Item Confirmation Modal */}
      {deletingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-book-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl">
            <h2
              id="delete-book-modal-title"
              className="text-lg font-bold text-[#171622]"
            >
              Delete &ldquo;{deletingItem.title}&rdquo;?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-[#171622]/65">
              This will permanently remove this item, its reading progress,
              bookmarks, and its private uploaded file. This action cannot be
              undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={isDeletingItemBusy}
                className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteItem()}
                disabled={isDeletingItemBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {isDeletingItemBusy && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Browser PDF & EPUB Reader Modal */}
      {activeReadingItem && (
        <BookReaderModal
          key={`reader-${activeReadingItem.id}`}
          item={activeReadingItem}
          onClose={() => setReadingItemId(null)}
          onItemMutated={handleReaderItemMutated}
          onRequestDelete={(book) => {
            setReadingItemId(null);
            setDeletingItem(book);
          }}
        />
      )}
    </div>
  );
}
