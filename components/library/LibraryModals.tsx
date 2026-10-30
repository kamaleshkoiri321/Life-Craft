'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  FileText,
  Folder,
  Link2,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import {
  COLLECTION_DESCRIPTION_MAX_LENGTH,
  COLLECTION_NAME_MAX_LENGTH,
  LIBRARY_AUTHOR_MAX_LENGTH,
  LIBRARY_COLLECTION_COLORS,
  LIBRARY_COVER_STYLES,
  LIBRARY_DESCRIPTION_MAX_LENGTH,
  LIBRARY_TITLE_MAX_LENGTH,
  MAX_LIBRARY_UPLOAD_BYTES,
  formatFileSize,
  normalizeCoverStyle,
  validateUploadFileMetadata,
  type LibraryCollectionColor,
  type LibraryCoverStyle,
  type LibraryReadingStatus,
  type SerializedLibraryCollection,
  type SerializedLibraryItem,
} from '@/lib/library/library-utils';
import type { StorageConfigurationStatus } from '@/lib/storage/neon-storage';
import BookCoverArt, { getCollectionColorClasses } from './BookCoverArt';

interface UploadBookModalProps {
  isOpen: boolean;
  initialFile?: File | null;
  collections: SerializedLibraryCollection[];
  storageStatus?: StorageConfigurationStatus;
  onClose: () => void;
  onUploaded: (itemId: string) => void;
}

export function UploadBookModal({
  isOpen,
  initialFile = null,
  collections,
  storageStatus,
  onClose,
  onUploaded,
}: UploadBookModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const [title, setTitle] = useState(() => {
    if (!initialFile) return '';
    const v = validateUploadFileMetadata({
      filename: initialFile.name,
      mimeType: initialFile.type,
      fileSizeBytes: initialFile.size,
    });
    return v.valid ? v.data.inferredTitle : initialFile.name;
  });
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [coverStyle, setCoverStyle] = useState<LibraryCoverStyle>(() =>
    normalizeCoverStyle(undefined, initialFile?.name || 'Book')
  );
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    []
  );

  const [uploadStage, setUploadStage] = useState<
    'idle' | 'initializing' | 'uploading' | 'finalizing' | 'failed'
  >('idle');
  const [uploadProgressPct, setUploadProgressPct] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(() => {
    if (!initialFile) return null;
    const v = validateUploadFileMetadata({
      filename: initialFile.name,
      mimeType: initialFile.type,
      fileSizeBytes: initialFile.size,
    });
    return v.valid ? null : v.error;
  });

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && uploadStage === 'idle') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, uploadStage, onClose]);

  if (!isOpen) return null;

  const isUploading =
    uploadStage === 'initializing' ||
    uploadStage === 'uploading' ||
    uploadStage === 'finalizing';

  const handleFileSelection = (file: File | null) => {
    setErrorMessage(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validation = validateUploadFileMetadata({
      filename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
    });

    setSelectedFile(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      return;
    }

    if (!title.trim()) {
      setTitle(validation.data.inferredTitle);
    }
    setCoverStyle(normalizeCoverStyle(undefined, validation.data.inferredTitle));
  };

  const toggleCollection = (colId: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId]
    );
  };

  const handleCancelActiveUpload = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    setUploadStage('idle');
    setUploadProgressPct(0);
    setErrorMessage('Upload canceled.');
  };

  const uploadViaXhr = (
    url: string,
    file: File,
    contentType: string
  ): Promise<{ ok: boolean; status: number; errorMessage?: string }> =>
    new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const pct = Math.min(98, Math.round((evt.loaded / evt.total) * 100));
          setUploadProgressPct(pct);
        }
      };

      xhr.onload = () => {
        xhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadProgressPct(100);
          resolve({ ok: true, status: xhr.status });
        } else {
          let errMsg = 'Upload failed.';
          try {
            const parsed = JSON.parse(xhr.responseText) as {
              message?: string;
            };
            if (parsed.message) errMsg = parsed.message;
          } catch {
            // Ignore non-JSON error body
          }
          resolve({ ok: false, status: xhr.status, errorMessage: errMsg });
        }
      };

      xhr.onerror = () => {
        xhrRef.current = null;
        resolve({
          ok: false,
          status: 0,
          errorMessage: 'Network or CORS error during file transfer.',
        });
      };

      xhr.onabort = () => {
        xhrRef.current = null;
        resolve({
          ok: false,
          status: -1,
          errorMessage: 'Upload canceled.',
        });
      };

      xhr.send(file);
    });

  const handleStartUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage(null);

    if (!selectedFile) {
      setErrorMessage('Please choose a PDF or EPUB file to upload.');
      return;
    }

    const fileValidation = validateUploadFileMetadata({
      filename: selectedFile.name,
      mimeType: selectedFile.type,
      fileSizeBytes: selectedFile.size,
    });
    if (!fileValidation.valid) {
      setErrorMessage(fileValidation.error);
      return;
    }

    const trimmedTitle = title.trim() || fileValidation.data.inferredTitle;
    if (trimmedTitle.length > LIBRARY_TITLE_MAX_LENGTH) {
      setErrorMessage(
        `Title must be ${LIBRARY_TITLE_MAX_LENGTH} characters or fewer.`
      );
      return;
    }

    setUploadStage('initializing');
    setUploadProgressPct(5);

    try {
      // 1. Initialize upload session on server
      const initRes = await fetch('/api/library/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: selectedFile.name,
          mimeType: fileValidation.data.mimeType,
          fileSizeBytes: selectedFile.size,
          title: trimmedTitle,
          author: author.trim() || null,
          description: description.trim() || null,
          coverStyle,
          collectionIds: selectedCollectionIds,
        }),
      });

      const initJson = (await initRes.json()) as {
        status: string;
        uploadId?: string;
        presignedUploadUrl?: string | null;
        serverUploadUrl?: string;
        message?: string;
      };

      if (!initRes.ok || initJson.status !== 'ok' || !initJson.uploadId) {
        setUploadStage('failed');
        setErrorMessage(
          initJson.message || 'Could not initialize book upload.'
        );
        return;
      }

      // 2. Upload file bytes (try presigned S3 URL first if available, fallback to authenticated server upload route if CORS blocks)
      setUploadStage('uploading');
      setUploadProgressPct(10);

      let uploadedOk = false;
      let lastTransferError = 'File upload failed.';

      if (initJson.presignedUploadUrl) {
        const directRes = await uploadViaXhr(
          initJson.presignedUploadUrl,
          selectedFile,
          fileValidation.data.mimeType
        );
        if (directRes.status === -1) return; // Aborted by user
        if (directRes.ok) {
          uploadedOk = true;
        }
      }

      if (!uploadedOk && initJson.serverUploadUrl) {
        const proxyRes = await uploadViaXhr(
          initJson.serverUploadUrl,
          selectedFile,
          fileValidation.data.mimeType
        );
        if (proxyRes.status === -1) return; // Aborted by user
        if (proxyRes.ok) {
          uploadedOk = true;
        } else if (proxyRes.errorMessage) {
          lastTransferError = proxyRes.errorMessage;
        }
      }

      if (!uploadedOk) {
        setUploadStage('failed');
        setErrorMessage(lastTransferError);
        return;
      }

      // 3. Finalize & verify stored object on server
      setUploadStage('finalizing');
      setUploadProgressPct(99);

      const finalRes = await fetch(
        `/api/library/upload/${initJson.uploadId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      const finalJson = (await finalRes.json()) as {
        status: string;
        itemId?: string;
        message?: string;
      };

      if (!finalRes.ok || finalJson.status !== 'ok' || !finalJson.itemId) {
        setUploadStage('failed');
        setErrorMessage(
          finalJson.message || 'Could not verify and finalize uploaded book.'
        );
        return;
      }

      setUploadStage('idle');
      onUploaded(finalJson.itemId);
      onClose();
    } catch {
      setUploadStage('failed');
      setErrorMessage(
        'Network error while uploading book. You can retry the upload.'
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-book-modal-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between pb-4">
          <div>
            <h2
              id="upload-book-modal-title"
              className="text-xl font-bold tracking-tight text-[#171622]"
            >
              Upload Book
            </h2>
            <p className="mt-0.5 text-xs text-[#171622]/55">
              Supported formats: PDF and EPUB • Maximum 50 MB per file
            </p>
          </div>
          <button
            type="button"
            onClick={isUploading ? handleCancelActiveUpload : onClose}
            aria-label="Close upload modal"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Storage Bucket Status Notice */}
        {storageStatus && (
          <div className="mb-4 rounded-xl border border-[#171622]/8 bg-[#FAF9F6] px-3.5 py-2 text-[11px] text-[#171622]/65">
            {storageStatus.isNeonS3Configured ? (
              <span>
                Connected to private Neon Object Storage bucket{' '}
                <strong className="font-semibold text-[#171622]">
                  {storageStatus.bucketName}
                </strong>
                .
              </span>
            ) : (
              <span>
                Private server storage active (bucket:{' '}
                <strong className="font-semibold text-[#171622]">
                  {storageStatus.bucketName}
                </strong>
                ). Add{' '}
                <code className="rounded bg-white px-1 py-0.5 text-[10px]">
                  AWS_ACCESS_KEY_ID
                </code>
                ,{' '}
                <code className="rounded bg-white px-1 py-0.5 text-[10px]">
                  AWS_SECRET_ACCESS_KEY
                </code>
                , and{' '}
                <code className="rounded bg-white px-1 py-0.5 text-[10px]">
                  AWS_ENDPOINT_URL_S3
                </code>{' '}
                in Secrets to sync directly with Neon S3.
              </span>
            )}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-900"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
            {uploadStage === 'failed' && selectedFile && (
              <button
                type="button"
                onClick={() => void handleStartUpload()}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-red-700 shadow-2xs hover:bg-red-100"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleStartUpload} className="space-y-4">
          {/* File Dropzone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.epub,application/pdf,application/epub+zip"
              onChange={(e) =>
                handleFileSelection(e.target.files?.[0] ?? null)
              }
              className="hidden"
            />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (isUploading) return;
                const dropped = e.dataTransfer.files?.[0] ?? null;
                handleFileSelection(dropped);
              }}
              onClick={() => {
                if (!isUploading) fileInputRef.current?.click();
              }}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#6E48D6]/25 bg-[#FAF9F6] px-4 py-5 text-center transition-colors hover:border-[#6E48D6]/50 hover:bg-[#F3F1FC]/40"
            >
              <Upload className="h-6 w-6 text-[#6E48D6]" />
              {selectedFile ? (
                <div className="mt-2">
                  <p className="text-xs font-bold text-[#171622]">
                    {selectedFile.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#171622]/55">
                    {formatFileSize(selectedFile.size)} •{' '}
                    {selectedFile.name.toLowerCase().endsWith('.epub')
                      ? 'EPUB Book'
                      : 'PDF Document'}{' '}
                    • Click to change file
                  </p>
                </div>
              ) : (
                <div className="mt-2">
                  <p className="text-xs font-bold text-[#171622]">
                    Choose a PDF or EPUB file, or drag and drop here
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#171622]/50">
                    Maximum {formatFileSize(MAX_LIBRARY_UPLOAD_BYTES)} per file
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Live Upload Progress Bar */}
          {isUploading && (
            <div className="rounded-2xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[#171622]">
                <span>
                  {uploadStage === 'initializing'
                    ? 'Preparing secure upload...'
                    : uploadStage === 'finalizing'
                      ? 'Verifying file & saving metadata...'
                      : 'Uploading book...'}
                </span>
                <span>{uploadProgressPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#171622]/10">
                <div
                  className="h-full rounded-full bg-[#52B748] transition-all duration-200"
                  style={{ width: `${uploadProgressPct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelActiveUpload}
                  className="text-[11px] font-semibold text-red-600 hover:underline"
                >
                  Cancel upload
                </button>
              </div>
            </div>
          )}

          {/* Editable Title & Author */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="upload-book-title"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="upload-book-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book or document title"
                maxLength={LIBRARY_TITLE_MAX_LENGTH}
                required
                disabled={isUploading}
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="upload-book-author"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Author{' '}
                <span className="font-normal text-[#171622]/45">
                  (optional)
                </span>
              </label>
              <input
                id="upload-book-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Don Norman"
                maxLength={LIBRARY_AUTHOR_MAX_LENGTH}
                disabled={isUploading}
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="upload-book-desc"
              className="mb-1 block text-xs font-semibold text-[#171622]"
            >
              Description / Notes{' '}
              <span className="font-normal text-[#171622]/45">(optional)</span>
            </label>
            <textarea
              id="upload-book-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this book or document about?"
              maxLength={LIBRARY_DESCRIPTION_MAX_LENGTH}
              disabled={isUploading}
              className="w-full resize-none rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Cover Style Selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
              Cover Theme
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {LIBRARY_COVER_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setCoverStyle(style)}
                  disabled={isUploading}
                  className={`rounded-xl p-1 transition-all ${
                    coverStyle === style
                      ? 'ring-2 ring-[#171622] ring-offset-1'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <BookCoverArt
                    title={title || 'Book'}
                    coverStyle={style}
                    size="xs"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Assign to User Collections */}
          {collections.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
                Add to Collections{' '}
                <span className="font-normal text-[#171622]/45">
                  (optional)
                </span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {collections.map((col) => {
                  const isSelected = selectedCollectionIds.includes(col.id);
                  const { chipBg, chipText } = getCollectionColorClasses(
                    col.color
                  );
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleCollection(col.id)}
                      disabled={isUploading}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-[#171622] bg-[#171622] text-white'
                          : `border-transparent ${chipBg} ${chipText} hover:opacity-85`
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={isUploading ? handleCancelActiveUpload : onClose}
              className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622]/75 hover:bg-[#FAF9F6]"
            >
              {isUploading ? 'Cancel upload' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs hover:bg-[#171622]/90 disabled:opacity-45"
            >
              {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Upload to Library
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ManualItemModalProps {
  isOpen: boolean;
  editingItem: SerializedLibraryItem | null;
  collections: SerializedLibraryCollection[];
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<{
    ok: boolean;
    message?: string;
  }>;
}

export function ManualItemModal({
  isOpen,
  editingItem,
  collections,
  onClose,
  onSubmit,
}: ManualItemModalProps) {
  const isUploadedBook =
    editingItem?.itemType === 'pdf' || editingItem?.itemType === 'epub';

  const [itemType, setItemType] = useState<'book' | 'link'>(
    editingItem?.itemType === 'link' ? 'link' : 'book'
  );
  const [title, setTitle] = useState(editingItem?.title ?? '');
  const [author, setAuthor] = useState(editingItem?.author ?? '');
  const [description, setDescription] = useState(
    editingItem?.description ?? ''
  );
  const [externalUrl, setExternalUrl] = useState(
    editingItem?.externalUrl ?? ''
  );
  const [readingStatus, setReadingStatus] = useState<LibraryReadingStatus>(
    editingItem?.readingStatus ?? 'to_read'
  );
  const [progressPercent, setProgressPercent] = useState<number>(
    editingItem?.progressPercent ?? 0
  );
  const [currentPage, setCurrentPage] = useState<string>(
    editingItem?.currentPage !== null && editingItem?.currentPage !== undefined
      ? String(editingItem.currentPage)
      : ''
  );
  const [totalPages, setTotalPages] = useState<string>(
    editingItem?.totalPages !== null && editingItem?.totalPages !== undefined
      ? String(editingItem.totalPages)
      : ''
  );
  const [coverStyle, setCoverStyle] = useState<LibraryCoverStyle>(
    editingItem?.coverStyle ?? 'forest'
  );
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<string[]>(
    editingItem?.collectionIds ?? []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const toggleCollection = (colId: string) => {
    setSelectedCollectionIds((prev) =>
      prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Title is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        author: author.trim() || null,
        description: description.trim() || null,
        readingStatus,
        progressPercent: Math.min(100, Math.max(0, Math.round(progressPercent))),
        currentPage: currentPage.trim() ? Number(currentPage) : null,
        totalPages: totalPages.trim() ? Number(totalPages) : null,
        coverStyle,
        collectionIds: selectedCollectionIds,
      };

      if (!isUploadedBook) {
        payload.itemType = itemType;
        payload.externalUrl = externalUrl.trim() || null;
      }

      const res = await onSubmit(payload);
      if (!res.ok) {
        setErrorMessage(res.message || 'Could not save reading item.');
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-item-modal-title"
    >
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl sm:p-7">
        <div className="flex items-center justify-between pb-4">
          <h2
            id="manual-item-modal-title"
            className="text-xl font-bold tracking-tight text-[#171622]"
          >
            {editingItem ? 'Edit Library Item' : 'Add Reading Item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-900"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item Type Switcher when adding manual item */}
          {!editingItem && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setItemType('book')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                  itemType === 'book'
                    ? 'border-[#171622] bg-[#FAF9F6] text-[#171622]'
                    : 'border-[#171622]/10 bg-white text-[#171622]/65'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Manual Book Entry
              </button>
              <button
                type="button"
                onClick={() => setItemType('link')}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all ${
                  itemType === 'link'
                    ? 'border-[#171622] bg-[#FAF9F6] text-[#171622]'
                    : 'border-[#171622]/10 bg-white text-[#171622]/65'
                }`}
              >
                <Link2 className="h-4 w-4" />
                External Reading Link
              </button>
            </div>
          )}

          {/* Title & Author */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manual-item-title"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Title <span className="text-red-500">*</span>
              </label>
              <input
                id="manual-item-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Atomic Habits"
                maxLength={LIBRARY_TITLE_MAX_LENGTH}
                required
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="manual-item-author"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Author{' '}
                <span className="font-normal text-[#171622]/45">
                  (optional)
                </span>
              </label>
              <input
                id="manual-item-author"
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. James Clear"
                maxLength={LIBRARY_AUTHOR_MAX_LENGTH}
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* External URL when link or optional reference link */}
          {!isUploadedBook && (
            <div>
              <label
                htmlFor="manual-item-url"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                External URL{' '}
                {itemType === 'link' ? (
                  <span className="text-red-500">*</span>
                ) : (
                  <span className="font-normal text-[#171622]/45">
                    (optional online resource)
                  </span>
                )}
              </label>
              <input
                id="manual-item-url"
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://example.com/article"
                required={itemType === 'link'}
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label
              htmlFor="manual-item-desc"
              className="mb-1 block text-xs font-semibold text-[#171622]"
            >
              Description / Notes{' '}
              <span className="font-normal text-[#171622]/45">(optional)</span>
            </label>
            <textarea
              id="manual-item-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="My personal notes or reading summary..."
              maxLength={LIBRARY_DESCRIPTION_MAX_LENGTH}
              className="w-full resize-none rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Reading Status, Current Page & Total Pages */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor="manual-item-status"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Reading Status
              </label>
              <select
                id="manual-item-status"
                value={readingStatus}
                onChange={(e) => {
                  const st = e.target.value as LibraryReadingStatus;
                  setReadingStatus(st);
                  if (st === 'completed') setProgressPercent(100);
                  if (st === 'to_read') setProgressPercent(0);
                }}
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              >
                <option value="to_read">To read</option>
                <option value="reading">Currently reading</option>
                <option value="completed">Completed</option>
                <option value="on_hold">On hold</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="manual-item-current-page"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Current Page
              </label>
              <input
                id="manual-item-current-page"
                type="number"
                min={0}
                value={currentPage}
                onChange={(e) => setCurrentPage(e.target.value)}
                placeholder="e.g. 120"
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="manual-item-total-pages"
                className="mb-1 block text-xs font-semibold text-[#171622]"
              >
                Total Pages
              </label>
              <input
                id="manual-item-total-pages"
                type="number"
                min={1}
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                placeholder="e.g. 320"
                className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Progress Slider */}
          <div className="rounded-2xl border border-[#171622]/8 bg-[#FAF9F6] p-3.5">
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="manual-item-progress"
                className="text-xs font-semibold text-[#171622]"
              >
                Reading Progress ({progressPercent}%)
              </label>
            </div>
            <input
              id="manual-item-progress"
              type="range"
              min={0}
              max={100}
              value={progressPercent}
              onChange={(e) => setProgressPercent(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#171622]/12 accent-[#52B748]"
            />
          </div>

          {/* Cover Style */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
              Cover Theme
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {LIBRARY_COVER_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setCoverStyle(style)}
                  className={`rounded-xl p-1 transition-all ${
                    coverStyle === style
                      ? 'ring-2 ring-[#171622] ring-offset-1'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <BookCoverArt
                    title={title || 'Book'}
                    coverStyle={style}
                    size="xs"
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Assign to User Collections */}
          {collections.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
                Collections
              </label>
              <div className="flex flex-wrap gap-1.5">
                {collections.map((col) => {
                  const isSelected = selectedCollectionIds.includes(col.id);
                  const { chipBg, chipText } = getCollectionColorClasses(
                    col.color
                  );
                  return (
                    <button
                      key={col.id}
                      type="button"
                      onClick={() => toggleCollection(col.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                        isSelected
                          ? 'border-[#171622] bg-[#171622] text-white'
                          : `border-transparent ${chipBg} ${chipText} hover:opacity-85`
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                      {col.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622]/75 hover:bg-[#FAF9F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-5 py-2.5 text-xs font-semibold text-[#FAF9F6] shadow-xs hover:bg-[#171622]/90 disabled:opacity-45"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingItem ? 'Save changes' : 'Add to Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CollectionModalProps {
  isOpen: boolean;
  editingCollection: SerializedLibraryCollection | null;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description: string | null;
    color: LibraryCollectionColor;
  }) => Promise<{ ok: boolean; message?: string }>;
}

export function CollectionModal({
  isOpen,
  editingCollection,
  onClose,
  onSubmit,
}: CollectionModalProps) {
  const [name, setName] = useState(editingCollection?.name ?? '');
  const [description, setDescription] = useState(
    editingCollection?.description ?? ''
  );
  const [color, setColor] = useState<LibraryCollectionColor>(
    editingCollection?.color ?? 'violet'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Collection name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        name: trimmedName,
        description: description.trim() || null,
        color,
      });
      if (!res.ok) {
        setErrorMessage(res.message || 'Could not save collection.');
      } else {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-modal-title"
    >
      <div className="relative w-full max-w-md rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4">
          <h2
            id="collection-modal-title"
            className="text-lg font-bold tracking-tight text-[#171622]"
          >
            {editingCollection ? 'Edit Collection' : 'Create Collection'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close collection modal"
            className="flex h-8 w-8 items-center justify-center rounded-xl text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs font-medium text-red-900"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="collection-name-input"
              className="mb-1 block text-xs font-semibold text-[#171622]"
            >
              Collection Name <span className="text-red-500">*</span>
            </label>
            <input
              id="collection-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Research, Read Later, University..."
              maxLength={COLLECTION_NAME_MAX_LENGTH}
              required
              autoFocus
              className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3.5 py-2.5 text-xs font-medium text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="collection-desc-input"
              className="mb-1 block text-xs font-semibold text-[#171622]"
            >
              Description{' '}
              <span className="font-normal text-[#171622]/45">(optional)</span>
            </label>
            <input
              id="collection-desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional note about this collection..."
              maxLength={COLLECTION_DESCRIPTION_MAX_LENGTH}
              className="w-full rounded-xl border border-[#171622]/10 bg-[#FAF9F6] px-3.5 py-2 text-xs text-[#171622] focus:border-[#171622]/30 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[#171622]">
              Folder Color
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {LIBRARY_COLLECTION_COLORS.map((c) => {
                const { folderBg, folderText } = getCollectionColorClasses(c);
                const selected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Select ${c} color`}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${folderBg} ${folderText} ${
                      selected
                        ? 'ring-2 ring-[#171622] ring-offset-1'
                        : 'opacity-75 hover:opacity-100'
                    }`}
                  >
                    <Folder className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622]/75 hover:bg-[#FAF9F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-45"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingCollection ? 'Save collection' : 'Create collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteCollectionModalProps {
  collection: SerializedLibraryCollection | null;
  onClose: () => void;
  onConfirmDelete: (collectionId: string) => Promise<void>;
}

export function DeleteCollectionModal({
  collection,
  onClose,
  onConfirmDelete,
}: DeleteCollectionModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!collection) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirmDelete(collection.id);
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-collection-modal-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#171622]/10 bg-white p-6 shadow-2xl">
        <h2
          id="delete-collection-modal-title"
          className="text-lg font-bold text-[#171622]"
        >
          Delete &ldquo;{collection.name}&rdquo;?
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-[#171622]/65">
          Deleting this collection removes its collection membership
          relationships only.{' '}
          <strong className="font-semibold text-[#171622]">
            All {collection.itemCount} books and uploaded files in this
            collection will remain safely in your library.
          </strong>
        </p>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-[#171622]/12 bg-white px-4 py-2 text-xs font-semibold text-[#171622]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete collection
          </button>
        </div>
      </div>
    </div>
  );
}
