'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Trash2,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BOOKMARK_LABEL_MAX_LENGTH,
  type LibraryReadingStatus,
  type SerializedLibraryBookmark,
  type SerializedLibraryItem,
} from '@/lib/library/library-utils';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface BookReaderModalProps {
  item: SerializedLibraryItem;
  onClose: () => void;
  onItemMutated: () => void;
  onRequestDelete?: (item: SerializedLibraryItem) => void;
}

interface ParsedEpubChapter {
  index: number;
  id: string;
  href: string;
  title: string;
  sanitizedHtml: string;
}

type ReaderTheme = 'paper' | 'white' | 'sepia' | 'night';

const THEME_CLASSES: Record<
  ReaderTheme,
  { bg: string; text: string; cardBg: string; border: string; label: string }
> = {
  paper: {
    bg: 'bg-[#FAF9F6]',
    text: 'text-[#171622]',
    cardBg: 'bg-white',
    border: 'border-[#171622]/10',
    label: 'Paper',
  },
  white: {
    bg: 'bg-white',
    text: 'text-[#171622]',
    cardBg: 'bg-white',
    border: 'border-[#171622]/10',
    label: 'White',
  },
  sepia: {
    bg: 'bg-[#F5EFE2]',
    text: 'text-[#2C241B]',
    cardBg: 'bg-[#FBF7EE]',
    border: 'border-[#2C241B]/12',
    label: 'Sepia',
  },
  night: {
    bg: 'bg-[#171622]',
    text: 'text-[#FAF9F6]',
    cardBg: 'bg-[#211F30]',
    border: 'border-white/12',
    label: 'Night',
  },
};

function resolveRelativeEpubPath(baseDir: string, relativeHref: string): string {
  const cleanHref = relativeHref.split('#')[0].split('?')[0];
  if (!baseDir) return cleanHref.replace(/^\/+/, '');
  const parts = `${baseDir}/${cleanHref}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  return resolved.join('/');
}

function sanitizeEpubChapterHtml(
  rawHtml: string,
  chapterDir: string,
  blobUrlMap: Map<string, string>
): { title: string; sanitizedHtml: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');

  const rawTitle =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1, h2, h3')?.textContent?.trim() ||
    '';

  // Remove dangerous elements
  const forbiddenSelectors = [
    'script',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'style',
    'link',
    'meta',
    'base',
  ];
  doc.querySelectorAll(forbiddenSelectors.join(',')).forEach((el) => el.remove());

  // Strip event handlers & unsafe URLs, and resolve embedded image references
  const allElements = doc.body ? Array.from(doc.body.querySelectorAll('*')) : [];
  for (const el of allElements) {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const nameLower = attr.name.toLowerCase();
      if (nameLower.startsWith('on') || nameLower === 'style') {
        el.removeAttribute(attr.name);
        continue;
      }
      if (nameLower === 'src' || nameLower === 'href' || nameLower === 'xlink:href') {
        const val = attr.value.trim();
        if (/^(javascript|vbscript|data:text\/html):/i.test(val)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (
          (el.tagName.toLowerCase() === 'img' ||
            el.tagName.toLowerCase() === 'image') &&
          !val.startsWith('http://') &&
          !val.startsWith('https://') &&
          !val.startsWith('data:image/')
        ) {
          const resolvedKey = resolveRelativeEpubPath(chapterDir, val);
          const mappedBlob =
            blobUrlMap.get(resolvedKey) ||
            blobUrlMap.get(decodeURIComponent(resolvedKey));
          if (mappedBlob) {
            el.setAttribute(attr.name, mappedBlob);
          } else {
            el.removeAttribute(attr.name);
          }
        } else if (el.tagName.toLowerCase() === 'a') {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener noreferrer');
          } else {
            el.removeAttribute('href');
          }
        }
      }
    }
  }

  return {
    title: rawTitle,
    sanitizedHtml: doc.body?.innerHTML?.trim() || '<p>Empty section.</p>',
  };
}

export default function BookReaderModal({
  item,
  onClose,
  onItemMutated,
  onRequestDelete,
}: BookReaderModalProps) {
  const isPdf = item.itemType === 'pdf';
  const isEpub = item.itemType === 'epub';

  const [isLoadingFile, setIsLoadingFile] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Keep latest callbacks and initial item snapshot in refs so background progress updates
  // never re-trigger the binary file download effect.
  const onItemMutatedRef = useRef(onItemMutated);
  useEffect(() => {
    onItemMutatedRef.current = onItemMutated;
  }, [onItemMutated]);

  const initialItemRef = useRef(item);
  useEffect(() => {
    initialItemRef.current = item;
  }, [item]);

  // Reading state
  const [readingStatus, setReadingStatus] = useState<LibraryReadingStatus>(
    item.readingStatus === 'to_read' ? 'reading' : item.readingStatus
  );
  const [currentPage, setCurrentPage] = useState<number>(
    Math.max(1, item.currentPage ?? 1)
  );
  const [pageInput, setPageInput] = useState<string>(
    String(Math.max(1, item.currentPage ?? 1))
  );
  const [totalPages, setTotalPages] = useState<number>(
    Math.max(1, item.totalPages ?? 1)
  );
  const [progressPercent, setProgressPercent] = useState<number>(
    item.progressPercent ?? 0
  );

  // PDF specific state
  const [zoomScale, setZoomScale] = useState<number>(1.15);
  const [useNativePdfFallback, setUseNativePdfFallback] = useState(false);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [isRenderingPdfPage, setIsRenderingPdfPage] = useState(false);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // EPUB specific state
  const [epubChapters, setEpubChapters] = useState<ParsedEpubChapter[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(() => {
    if (!item.readingPosition) return 0;
    try {
      const pos = JSON.parse(item.readingPosition) as {
        chapterIndex?: unknown;
      };
      if (typeof pos.chapterIndex === 'number' && pos.chapterIndex >= 0) {
        return pos.chapterIndex;
      }
    } catch {
      // Ignore malformed JSON
    }
    return 0;
  });
  const [fontSizePx, setFontSizePx] = useState<number>(17);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>('paper');
  const epubContainerRef = useRef<HTMLDivElement | null>(null);

  // UI side panels
  const [activeSidePanel, setActiveSidePanel] = useState<
    'none' | 'toc' | 'bookmarks'
  >('none');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<SerializedLibraryBookmark[]>(
    item.bookmarks ?? []
  );
  const [newBookmarkLabel, setNewBookmarkLabel] = useState('');
  const [isSavingBookmark, setIsSavingBookmark] = useState(false);
  const [isSavingProgress, setIsSavingProgress] = useState(false);
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist reading progress helper (stable across parent re-renders)
  const persistReadingState = useCallback(
    async (payload: {
      readingStatus?: LibraryReadingStatus;
      currentPage?: number;
      totalPages?: number;
      progressPercent?: number;
      readingPosition?: Record<string, unknown>;
    }) => {
      setIsSavingProgress(true);
      try {
        const res = await fetch(`/api/library/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            ...payload,
            touchLastOpened: true,
          }),
        });
        if (res.ok) {
          setLastSavedNotice('Progress saved');
          onItemMutatedRef.current();
        }
      } catch {
        // Ignore transient network save errors
      } finally {
        setIsSavingProgress(false);
      }
    },
    [item.id]
  );

  const scheduleProgressSave = useCallback(
    (payload: {
      readingStatus?: LibraryReadingStatus;
      currentPage?: number;
      totalPages?: number;
      progressPercent?: number;
      readingPosition?: Record<string, unknown>;
    }) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        void persistReadingState(payload);
      }, 650);
    },
    [persistReadingState]
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Load PDF or EPUB file from authenticated server route
  useEffect(() => {
    let cancelled = false;
    const createdBlobUrls: string[] = [];

    async function loadBookBinary() {
      setIsLoadingFile(true);
      setLoadError(null);

      try {
        const response = await fetch(`/api/library/${item.id}/file`, {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          let errMsg =
            response.status === 401
              ? 'Your session has expired. Please sign in again to read this book.'
              : response.status === 410
                ? 'This book file is missing from private storage. Try re-uploading the book.'
                : 'Unable to load this book file right now.';
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson.error) errMsg = errJson.error;
          } catch {
            // Keep default message
          }
          if (!cancelled) {
            setLoadError(errMsg);
            setIsLoadingFile(false);
          }
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        if (isPdf) {
          // Create fallback object URL for native viewer if needed
          const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
          const objectUrl = URL.createObjectURL(pdfBlob);
          createdBlobUrls.push(objectUrl);
          setPdfObjectUrl(objectUrl);

          const snap = initialItemRef.current;

          try {
            const pdfjs = await import('pdfjs-dist');
            if (typeof window !== 'undefined' && pdfjs.GlobalWorkerOptions) {
              pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
            }

            const loadingTask = pdfjs.getDocument({
              data: new Uint8Array(arrayBuffer),
            });

            const pdfDoc = await Promise.race([
              loadingTask.promise,
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('PDF worker initialization timed out')),
                  5000
                )
              ),
            ]);
            if (cancelled) return;

            pdfDocRef.current = pdfDoc;
            const detectedTotal = Math.max(1, pdfDoc.numPages || 1);
            const initialPage = Math.min(
              detectedTotal,
              Math.max(1, snap.currentPage ?? 1)
            );
            const computedPct = Math.min(
              100,
              Math.round((initialPage / detectedTotal) * 100)
            );

            setTotalPages(detectedTotal);
            setCurrentPage(initialPage);
            setPageInput(String(initialPage));
            setProgressPercent(computedPct);

            // Only persist on initial open if status was to_read or totalPages wasn't recorded yet
            if (
              snap.readingStatus === 'to_read' ||
              snap.totalPages !== detectedTotal
            ) {
              void persistReadingState({
                readingStatus:
                  snap.readingStatus === 'to_read'
                    ? 'reading'
                    : snap.readingStatus,
                currentPage: initialPage,
                totalPages: detectedTotal,
                progressPercent: computedPct,
                readingPosition: {
                  page: initialPage,
                  totalPages: detectedTotal,
                  zoom: 1.15,
                },
              });
            }
          } catch {
            // Fallback to native browser PDF viewer if pdfjs worker fails or times out
            if (!cancelled) {
              setUseNativePdfFallback(true);
            }
          }
        } else if (isEpub) {
          const snap = initialItemRef.current;
          const JSZipModule = await import('jszip');
          const JSZip = JSZipModule.default || JSZipModule;
          const zip = await JSZip.loadAsync(arrayBuffer);
          if (cancelled) return;

          const containerFile = zip.file('META-INF/container.xml');
          if (!containerFile) {
            throw new Error(
              'Invalid EPUB archive: missing META-INF/container.xml.'
            );
          }

          const containerXml = await containerFile.async('string');
          const parser = new DOMParser();
          const containerDoc = parser.parseFromString(
            containerXml,
            'application/xml'
          );
          const rootfileEl = containerDoc.querySelector('rootfile');
          const opfPath =
            rootfileEl?.getAttribute('full-path')?.trim() || 'content.opf';

          const opfFile = zip.file(opfPath);
          if (!opfFile) {
            throw new Error(`Invalid EPUB archive: missing ${opfPath}.`);
          }

          const opfDir = opfPath.includes('/')
            ? opfPath.slice(0, opfPath.lastIndexOf('/'))
            : '';

          const opfXml = await opfFile.async('string');
          const opfDoc = parser.parseFromString(opfXml, 'application/xml');

          // Extract image assets into Blob URLs for chapters
          const blobUrlMap = new Map<string, string>();
          const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item'));

          for (const mItem of manifestItems) {
            const mediaType = mItem.getAttribute('media-type') || '';
            const href = mItem.getAttribute('href') || '';
            if (mediaType.startsWith('image/') && href) {
              const fullPath = resolveRelativeEpubPath(opfDir, href);
              const imgEntry =
                zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
              if (imgEntry) {
                const imgBlob = await imgEntry.async('blob');
                const typedBlob = new Blob([imgBlob], { type: mediaType });
                const url = URL.createObjectURL(typedBlob);
                createdBlobUrls.push(url);
                blobUrlMap.set(fullPath, url);
              }
            }
          }

          // Map manifest IDs -> hrefs
          const manifestById = new Map<
            string,
            { href: string; mediaType: string }
          >();
          for (const mItem of manifestItems) {
            const id = mItem.getAttribute('id') || '';
            const href = mItem.getAttribute('href') || '';
            const mediaType = mItem.getAttribute('media-type') || '';
            if (id && href) {
              manifestById.set(id, { href, mediaType });
            }
          }

          const spineItemRefs = Array.from(
            opfDoc.querySelectorAll('spine > itemref')
          );

          const chapters: ParsedEpubChapter[] = [];
          for (let idx = 0; idx < spineItemRefs.length; idx++) {
            const idref = spineItemRefs[idx].getAttribute('idref') || '';
            const manifestEntry = manifestById.get(idref);
            if (!manifestEntry) continue;

            const fullChapterPath = resolveRelativeEpubPath(
              opfDir,
              manifestEntry.href
            );
            const chapterEntry =
              zip.file(fullChapterPath) ||
              zip.file(decodeURIComponent(fullChapterPath));
            if (!chapterEntry) continue;

            const rawChapterHtml = await chapterEntry.async('string');
            const chapterDir = fullChapterPath.includes('/')
              ? fullChapterPath.slice(0, fullChapterPath.lastIndexOf('/'))
              : '';

            const { title, sanitizedHtml } = sanitizeEpubChapterHtml(
              rawChapterHtml,
              chapterDir,
              blobUrlMap
            );

            chapters.push({
              index: chapters.length,
              id: idref || `chapter-${chapters.length + 1}`,
              href: fullChapterPath,
              title: title || `Section ${chapters.length + 1}`,
              sanitizedHtml,
            });
          }

          if (chapters.length === 0) {
            throw new Error(
              'No readable XHTML chapters were found in this EPUB file.'
            );
          }

          if (cancelled) return;

          let parsedPosChapterIdx: number | null = null;
          if (snap.readingPosition) {
            try {
              const parsed = JSON.parse(snap.readingPosition) as {
                chapterIndex?: unknown;
              };
              if (typeof parsed.chapterIndex === 'number') {
                parsedPosChapterIdx = parsed.chapterIndex;
              }
            } catch {
              // Ignore
            }
          }

          const savedIdx =
            parsedPosChapterIdx !== null
              ? Math.min(
                  chapters.length - 1,
                  Math.max(0, parsedPosChapterIdx)
                )
              : Math.min(
                  chapters.length - 1,
                  Math.max(0, (snap.currentPage ?? 1) - 1)
                );

          const computedPct = Math.min(
            100,
            Math.round(((savedIdx + 1) / chapters.length) * 100)
          );

          setEpubChapters(chapters);
          setCurrentChapterIndex(savedIdx);
          setTotalPages(chapters.length);
          setCurrentPage(savedIdx + 1);
          setPageInput(String(savedIdx + 1));
          setProgressPercent(computedPct);

          if (
            snap.readingStatus === 'to_read' ||
            snap.totalPages !== chapters.length
          ) {
            void persistReadingState({
              readingStatus:
                snap.readingStatus === 'to_read' ? 'reading' : snap.readingStatus,
              currentPage: savedIdx + 1,
              totalPages: chapters.length,
              progressPercent: computedPct,
              readingPosition: {
                chapterIndex: savedIdx,
                totalChapters: chapters.length,
                chapterHref: chapters[savedIdx]?.href ?? null,
              },
            });
          }
        }

        if (!cancelled) {
          setIsLoadingFile(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Could not render this book file in the browser.'
          );
          setIsLoadingFile(false);
        }
      }
    }

    void loadBookBinary();

    return () => {
      cancelled = true;
      for (const u of createdBlobUrls) {
        URL.revokeObjectURL(u);
      }
    };
  }, [isEpub, isPdf, item.id, persistReadingState, reloadNonce]);

  // Render active PDF page onto canvas whenever currentPage or zoomScale changes
  useEffect(() => {
    if (!isPdf || isLoadingFile || useNativePdfFallback) return;
    const pdfDoc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdfDoc || !canvas) return;

    let cancelled = false;
    let renderTask: {
      promise: Promise<unknown>;
      cancel?: () => void;
    } | null = null;

    async function renderPage() {
      const activeDoc = pdfDocRef.current;
      const activeCanvas = canvasRef.current;
      if (!activeDoc || !activeCanvas) return;

      setIsRenderingPdfPage(true);
      try {
        const pageNumber = Math.min(
          activeDoc.numPages || 1,
          Math.max(1, currentPage)
        );
        const page = await activeDoc.getPage(pageNumber);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: zoomScale });
        const context = activeCanvas.getContext('2d');
        if (!context) return;

        const outputScale =
          typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        activeCanvas.width = Math.floor(viewport.width * outputScale);
        activeCanvas.height = Math.floor(viewport.height * outputScale);
        activeCanvas.style.width = `${Math.floor(viewport.width)}px`;
        activeCanvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform =
          outputScale !== 1
            ? [outputScale, 0, 0, outputScale, 0, 0]
            : undefined;

        renderTask = page.render({
          canvas: activeCanvas,
          canvasContext: context,
          transform,
          viewport,
        });
        await renderTask.promise;
      } catch {
        // Ignore cancelled page render
      } finally {
        if (!cancelled) {
          setIsRenderingPdfPage(false);
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try {
          renderTask.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [currentPage, isLoadingFile, isPdf, useNativePdfFallback, zoomScale]);

  const goToPdfPage = useCallback(
    (targetPage: number) => {
      const clamped = Math.min(totalPages, Math.max(1, targetPage));
      const pct = Math.min(100, Math.round((clamped / totalPages) * 100));
      const nextStatus: LibraryReadingStatus =
        pct >= 100 ? 'completed' : readingStatus === 'to_read' ? 'reading' : readingStatus;

      setCurrentPage(clamped);
      setPageInput(String(clamped));
      setProgressPercent(pct);
      setReadingStatus(nextStatus);

      scheduleProgressSave({
        readingStatus: nextStatus,
        currentPage: clamped,
        totalPages,
        progressPercent: pct,
        readingPosition: {
          page: clamped,
          totalPages,
          zoom: zoomScale,
        },
      });
    },
    [readingStatus, scheduleProgressSave, totalPages, zoomScale]
  );

  const goToEpubChapter = useCallback(
    (targetIdx: number) => {
      if (epubChapters.length === 0) return;
      const clamped = Math.min(
        epubChapters.length - 1,
        Math.max(0, targetIdx)
      );
      const pct = Math.min(
        100,
        Math.round(((clamped + 1) / epubChapters.length) * 100)
      );
      const nextStatus: LibraryReadingStatus =
        pct >= 100 ? 'completed' : readingStatus === 'to_read' ? 'reading' : readingStatus;

      setCurrentChapterIndex(clamped);
      setCurrentPage(clamped + 1);
      setPageInput(String(clamped + 1));
      setProgressPercent(pct);
      setReadingStatus(nextStatus);

      if (epubContainerRef.current) {
        epubContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }

      scheduleProgressSave({
        readingStatus: nextStatus,
        currentPage: clamped + 1,
        totalPages: epubChapters.length,
        progressPercent: pct,
        readingPosition: {
          chapterIndex: clamped,
          totalChapters: epubChapters.length,
          chapterHref: epubChapters[clamped]?.href ?? null,
        },
      });
    },
    [epubChapters, readingStatus, scheduleProgressSave]
  );

  // Keyboard shortcuts (Escape, ArrowLeft, ArrowRight)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (isPdf) {
          goToPdfPage(currentPage + 1);
        } else if (isEpub) {
          goToEpubChapter(currentChapterIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (isPdf) {
          goToPdfPage(currentPage - 1);
        } else if (isEpub) {
          goToEpubChapter(currentChapterIndex - 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentChapterIndex,
    currentPage,
    goToEpubChapter,
    goToPdfPage,
    isEpub,
    isPdf,
    onClose,
  ]);

  const handleStatusChange = async (nextStatus: LibraryReadingStatus) => {
    const nextPct =
      nextStatus === 'completed'
        ? 100
        : nextStatus === 'to_read'
          ? 0
          : progressPercent;
    setReadingStatus(nextStatus);
    setProgressPercent(nextPct);
    await persistReadingState({
      readingStatus: nextStatus,
      currentPage: nextStatus === 'completed' ? totalPages : currentPage,
      totalPages,
      progressPercent: nextPct,
    });
  };

  const handleCreateBookmark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingBookmark) return;

    const defaultLabel = isPdf
      ? `Page ${currentPage}`
      : epubChapters[currentChapterIndex]?.title ||
        `Section ${currentChapterIndex + 1}`;

    const label = newBookmarkLabel.trim() || defaultLabel;
    setIsSavingBookmark(true);

    try {
      const res = await fetch(`/api/library/${item.id}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          label,
          pageNumber: isPdf ? currentPage : currentChapterIndex + 1,
          position: isPdf
            ? { page: currentPage }
            : {
                chapterIndex: currentChapterIndex,
                chapterTitle:
                  epubChapters[currentChapterIndex]?.title ?? defaultLabel,
              },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          bookmark?: SerializedLibraryBookmark;
        };
        if (data.bookmark) {
          setBookmarks((prev) => [data.bookmark!, ...prev]);
          setNewBookmarkLabel('');
          onItemMutatedRef.current();
        }
      }
    } finally {
      setIsSavingBookmark(false);
    }
  };

  const handleDeleteBookmark = async (bookmarkId: string) => {
    const res = await fetch(
      `/api/library/${item.id}/bookmarks/${bookmarkId}`,
      {
        method: 'DELETE',
        credentials: 'include',
      }
    );
    if (res.ok) {
      setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
      onItemMutatedRef.current();
    }
  };

  const themeConfig = THEME_CLASSES[readerTheme];
  const currentEpubChapter = epubChapters[currentChapterIndex] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/70 p-0 sm:p-3 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Reading ${item.title}`}
    >
      <div
        className={`flex flex-col overflow-hidden border border-[#171622]/12 bg-[#FAF9F6] shadow-2xl transition-all ${
          isFullscreen
            ? 'h-screen w-screen rounded-none'
            : 'h-screen w-screen sm:h-[94vh] sm:w-full sm:max-w-6xl sm:rounded-3xl'
        }`}
      >
        {/* Top Reader Toolbar */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#171622]/10 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                isPdf
                  ? 'bg-red-50 text-red-700'
                  : 'bg-[#E9F8E5] text-[#286123]'
              }`}
            >
              <BookOpen className="h-3 w-3" />
              {item.itemType.toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-[#171622] sm:text-base">
                {item.title}
              </h2>
              <p className="truncate text-[11px] text-[#171622]/55">
                {item.author ? `${item.author} • ` : ''}
                {isPdf
                  ? `Page ${currentPage} of ${totalPages}`
                  : `Section ${currentChapterIndex + 1} of ${Math.max(1, epubChapters.length)}`}{' '}
                ({progressPercent}%)
                {isSavingProgress
                  ? ' • Saving...'
                  : lastSavedNotice
                    ? ` • ${lastSavedNotice}`
                    : ''}
              </p>
            </div>
          </div>

          {/* Center Controls: Page / Chapter Navigation & Zoom / Typography */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Prev / Next Navigation */}
            <div className="inline-flex items-center rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-1">
              <button
                type="button"
                onClick={() =>
                  isPdf
                    ? goToPdfPage(currentPage - 1)
                    : goToEpubChapter(currentChapterIndex - 1)
                }
                disabled={
                  isLoadingFile ||
                  (isPdf ? currentPage <= 1 : currentChapterIndex <= 0)
                }
                aria-label={isPdf ? 'Previous page' : 'Previous chapter'}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622] hover:bg-white disabled:opacity-35"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = Number(pageInput);
                  if (Number.isFinite(parsed)) {
                    if (isPdf) {
                      goToPdfPage(parsed);
                    } else {
                      goToEpubChapter(parsed - 1);
                    }
                  }
                }}
                className="flex items-center gap-1 px-2 text-xs font-semibold text-[#171622]"
              >
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  aria-label="Current page or section number"
                  className="w-12 rounded-md border border-[#171622]/15 bg-white px-1.5 py-0.5 text-center text-xs font-semibold text-[#171622]"
                />
                <span className="text-[#171622]/50">/ {totalPages}</span>
              </form>

              <button
                type="button"
                onClick={() =>
                  isPdf
                    ? goToPdfPage(currentPage + 1)
                    : goToEpubChapter(currentChapterIndex + 1)
                }
                disabled={
                  isLoadingFile ||
                  (isPdf
                    ? currentPage >= totalPages
                    : currentChapterIndex >= epubChapters.length - 1)
                }
                aria-label={isPdf ? 'Next page' : 'Next chapter'}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622] hover:bg-white disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* PDF Zoom Controls & View Mode Switcher */}
            {isPdf && !useNativePdfFallback && (
              <div className="hidden sm:inline-flex items-center rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-1">
                <button
                  type="button"
                  onClick={() =>
                    setZoomScale((z) => Math.max(0.75, Number((z - 0.15).toFixed(2))))
                  }
                  aria-label="Zoom out"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622] hover:bg-white"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 text-[11px] font-semibold text-[#171622]">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setZoomScale((z) => Math.min(1.75, Number((z + 0.15).toFixed(2))))
                  }
                  aria-label="Zoom in"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[#171622] hover:bg-white"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {isPdf && pdfObjectUrl && (
              <button
                type="button"
                onClick={() => setUseNativePdfFallback((v) => !v)}
                className="hidden md:inline-flex items-center gap-1.5 rounded-xl border border-[#171622]/10 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#5938B5]" />
                <span>{useNativePdfFallback ? 'Page View' : 'Full PDF View'}</span>
              </button>
            )}

            {/* EPUB Font & Theme Controls */}
            {isEpub && (
              <div className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-1">
                <button
                  type="button"
                  onClick={() => setFontSizePx((s) => Math.max(14, s - 2))}
                  aria-label="Decrease font size"
                  className="flex h-7 px-2 items-center justify-center rounded-lg text-xs font-semibold text-[#171622] hover:bg-white"
                >
                  A-
                </button>
                <span className="px-1 text-[11px] font-medium text-[#171622]/65">
                  <Type className="inline h-3 w-3 mr-0.5" />
                  {fontSizePx}px
                </span>
                <button
                  type="button"
                  onClick={() => setFontSizePx((s) => Math.min(24, s + 2))}
                  aria-label="Increase font size"
                  className="flex h-7 px-2 items-center justify-center rounded-lg text-xs font-semibold text-[#171622] hover:bg-white"
                >
                  A+
                </button>
                <div className="mx-1 h-4 w-px bg-[#171622]/10" />
                {(['paper', 'white', 'sepia', 'night'] as ReaderTheme[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setReaderTheme(t)}
                      className={`rounded-lg px-2 py-1 text-[10px] font-semibold transition-all ${
                        readerTheme === t
                          ? 'bg-[#171622] text-white'
                          : 'text-[#171622]/70 hover:bg-white'
                      }`}
                    >
                      {THEME_CLASSES[t].label}
                    </button>
                  )
                )}
              </div>
            )}

            {/* Table of contents button for EPUB */}
            {isEpub && epubChapters.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setActiveSidePanel((p) => (p === 'toc' ? 'none' : 'toc'))
                }
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeSidePanel === 'toc'
                    ? 'border-[#171622] bg-[#171622] text-white'
                    : 'border-[#171622]/10 bg-white text-[#171622] hover:bg-[#FAF9F6]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Chapters</span>
              </button>
            )}

            {/* Bookmarks drawer button */}
            <button
              type="button"
              onClick={() =>
                setActiveSidePanel((p) =>
                  p === 'bookmarks' ? 'none' : 'bookmarks'
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                activeSidePanel === 'bookmarks'
                  ? 'border-[#171622] bg-[#171622] text-white'
                  : 'border-[#171622]/10 bg-white text-[#171622] hover:bg-[#FAF9F6]'
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span>Bookmarks ({bookmarks.length})</span>
            </button>

            {/* Reading Status Quick Switcher */}
            <select
              aria-label="Reading status"
              value={readingStatus}
              onChange={(e) =>
                void handleStatusChange(e.target.value as LibraryReadingStatus)
              }
              className="rounded-xl border border-[#171622]/12 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#171622] focus:outline-none"
            >
              <option value="reading">Reading</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On hold</option>
              <option value="to_read">To read</option>
            </select>

            {onRequestDelete && (
              <button
                type="button"
                onClick={() => onRequestDelete(item)}
                aria-label={`Delete ${item.title}`}
                title="Delete this book"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullscreen((f) => !f)}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#171622]/10 bg-white text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622]"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close reader"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-[#171622]/10 bg-white text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Progress Bar Strip */}
        <div className="h-1 w-full bg-[#171622]/8">
          <div
            className="h-full bg-[#52B748] transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>

        {/* Main Reader Body + Optional Side Panel */}
        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {/* Primary Reading Viewport */}
          <div
            ref={epubContainerRef}
            className={`flex-1 overflow-y-auto p-4 sm:p-8 ${
              isEpub ? themeConfig.bg : 'bg-[#F0EFEA]'
            }`}
          >
            {isLoadingFile ? (
              <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-xs">
                  <Loader2 className="h-6 w-6 animate-spin text-[#5938B5]" />
                </div>
                <p className="text-sm font-bold text-[#171622]">
                  Opening &ldquo;{item.title}&rdquo;...
                </p>
                <p className="mt-1 text-xs text-[#171622]/55">
                  Streaming your private {item.itemType.toUpperCase()} book and
                  restoring your last reading position.
                </p>
                <div className="mt-5 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-[#171622]/12 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
                  >
                    Cancel
                  </button>
                  {onRequestDelete && (
                    <button
                      type="button"
                      onClick={() => onRequestDelete(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete book
                    </button>
                  )}
                </div>
              </div>
            ) : loadError ? (
              <div className="mx-auto my-12 max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-xs">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold text-[#171622]">
                  Could Not Open Book
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-[#171622]/65">
                  {loadError}
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setReloadNonce((n) => n + 1)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-white hover:bg-[#171622]/90"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  {onRequestDelete && (
                    <button
                      type="button"
                      onClick={() => onRequestDelete(item)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete book
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622]"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : isPdf ? (
              useNativePdfFallback && pdfObjectUrl ? (
                <div className="mx-auto flex h-full min-h-[600px] max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#171622]/12 bg-white shadow-md">
                  <iframe
                    src={`${pdfObjectUrl}#page=${currentPage}`}
                    title={item.title}
                    className="h-full min-h-[600px] w-full flex-1 border-0"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative overflow-auto rounded-2xl border border-[#171622]/12 bg-white p-2 sm:p-4 shadow-lg">
                    {isRenderingPdfPage && (
                      <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-[#171622]/80 px-2.5 py-1 text-[10px] font-semibold text-white">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Rendering page...
                      </div>
                    )}
                    <canvas
                      ref={canvasRef}
                      className="mx-auto block max-w-full"
                    />
                  </div>

                  {/* Bottom Page Bar */}
                  <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#171622]/10 bg-white px-4 py-2 shadow-xs">
                    <button
                      type="button"
                      onClick={() => goToPdfPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-[#171622]/75">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => goToPdfPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6] disabled:opacity-40"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            ) : isEpub && currentEpubChapter ? (
              <article
                className={`mx-auto max-w-3xl rounded-3xl border p-6 sm:p-10 shadow-xs transition-colors ${themeConfig.cardBg} ${themeConfig.text} ${themeConfig.border}`}
                style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.75 }}
              >
                <div className="mb-6 flex items-center justify-between border-b border-current/10 pb-3 text-xs opacity-65">
                  <span className="font-semibold">
                    {currentEpubChapter.title}
                  </span>
                  <span>
                    Section {currentChapterIndex + 1} of {epubChapters.length}
                  </span>
                </div>

                <div
                  className="prose max-w-none space-y-4 leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2.5 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-4 [&_img]:mx-auto [&_img]:max-h-[480px] [&_img]:rounded-xl"
                  dangerouslySetInnerHTML={{
                    __html: currentEpubChapter.sanitizedHtml,
                  }}
                />

                <div className="mt-10 flex items-center justify-between border-t border-current/10 pt-5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => goToEpubChapter(currentChapterIndex - 1)}
                    disabled={currentChapterIndex <= 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-current/15 px-3.5 py-2 hover:opacity-80 disabled:opacity-35"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous section
                  </button>

                  {currentChapterIndex < epubChapters.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => goToEpubChapter(currentChapterIndex + 1)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-white hover:bg-[#171622]/90"
                    >
                      Next section
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange('completed')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#C8F27C] px-4 py-2 text-[#171622] font-bold hover:bg-[#bfe972]"
                    >
                      <Check className="h-4 w-4" />
                      Mark book completed
                    </button>
                  )}
                </div>
              </article>
            ) : null}
          </div>

          {/* Side Drawer: EPUB Chapters or Bookmarks */}
          {activeSidePanel !== 'none' && (
            <aside className="w-72 sm:w-80 shrink-0 overflow-y-auto border-l border-[#171622]/10 bg-white p-4">
              {activeSidePanel === 'toc' ? (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#171622]/60">
                      Chapters ({epubChapters.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSidePanel('none')}
                      className="rounded-lg p-1 text-[#171622]/45 hover:text-[#171622]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {epubChapters.map((ch) => {
                      const active = ch.index === currentChapterIndex;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => goToEpubChapter(ch.index)}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                            active
                              ? 'bg-[#C8F27C]/60 font-bold text-[#171622]'
                              : 'text-[#171622]/75 hover:bg-[#FAF9F6]'
                          }`}
                        >
                          <span className="truncate">{ch.title}</span>
                          <span className="ml-2 shrink-0 text-[10px] text-[#171622]/45">
                            #{ch.index + 1}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#171622]/60">
                      Bookmarks ({bookmarks.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveSidePanel('none')}
                      className="rounded-lg p-1 text-[#171622]/45 hover:text-[#171622]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateBookmark} className="mb-4 space-y-2">
                    <input
                      type="text"
                      value={newBookmarkLabel}
                      onChange={(e) => setNewBookmarkLabel(e.target.value)}
                      placeholder={
                        isPdf
                          ? `Note for page ${currentPage}...`
                          : `Note for section ${currentChapterIndex + 1}...`
                      }
                      maxLength={BOOKMARK_LABEL_MAX_LENGTH}
                      className="w-full rounded-xl border border-[#171622]/12 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSavingBookmark}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#171622] px-3 py-2 text-xs font-semibold text-white hover:bg-[#171622]/90 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Bookmark{' '}
                      {isPdf
                        ? `Page ${currentPage}`
                        : `Section ${currentChapterIndex + 1}`}
                    </button>
                  </form>

                  {bookmarks.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[#171622]/12 p-4 text-center text-xs text-[#171622]/55">
                      No bookmarks yet. Save important pages or sections to jump
                      back anytime.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {bookmarks.map((bm) => (
                        <div
                          key={bm.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#171622]/8 bg-[#FAF9F6] px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              const target = bm.pageNumber ?? 1;
                              if (isPdf) {
                                goToPdfPage(target);
                              } else {
                                goToEpubChapter(Math.max(0, target - 1));
                              }
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-xs font-semibold text-[#171622]">
                              {bm.label}
                            </p>
                            <p className="text-[10px] text-[#171622]/50">
                              {isPdf
                                ? `Page ${bm.pageNumber ?? 1}`
                                : `Section ${bm.pageNumber ?? 1}`}
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteBookmark(bm.id)}
                            aria-label={`Delete bookmark ${bm.label}`}
                            className="rounded-lg p-1 text-[#171622]/40 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
