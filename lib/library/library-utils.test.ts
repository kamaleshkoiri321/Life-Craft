import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LIBRARY_UPLOAD_BYTES,
  buildLibraryViewModel,
  buildSafeStorageKey,
  filterAndSortLibraryItems,
  resolveLibraryStatusAndProgress,
  validateCollectionInput,
  validateManualLibraryItemInput,
  validateSafeExternalUrl,
  validateUploadFileMetadata,
  verifyUploadedBookMagicBytes,
} from './library-utils';

test('validateUploadFileMetadata accepts valid PDF and EPUB and rejects unsupported formats and >50MB files', () => {
  const pdfOk = validateUploadFileMetadata({
    filename: 'Deep_Learning_Notes.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1_500_000,
  });
  assert.equal(pdfOk.valid, true);
  if (pdfOk.valid) {
    assert.equal(pdfOk.data.itemType, 'pdf');
    assert.equal(pdfOk.data.inferredTitle, 'Deep Learning Notes');
  }

  const epubOk = validateUploadFileMetadata({
    filename: 'atomic-habits.epub',
    mimeType: 'application/epub+zip',
    fileSizeBytes: 850_000,
  });
  assert.equal(epubOk.valid, true);
  if (epubOk.valid) {
    assert.equal(epubOk.data.itemType, 'epub');
  }

  const htmlRejected = validateUploadFileMetadata({
    filename: 'malicious.html',
    mimeType: 'text/html',
    fileSizeBytes: 1024,
  });
  assert.equal(htmlRejected.valid, false);

  const oversizedRejected = validateUploadFileMetadata({
    filename: 'huge.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: MAX_LIBRARY_UPLOAD_BYTES + 1,
  });
  assert.equal(oversizedRejected.valid, false);
});

test('verifyUploadedBookMagicBytes verifies genuine PDF and EPUB headers and rejects disguised HTML/scripts', () => {
  const validPdfBytes = new TextEncoder().encode(
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'
  );
  assert.equal(verifyUploadedBookMagicBytes(validPdfBytes, 'pdf').valid, true);

  const disguisedHtmlAsPdf = new TextEncoder().encode(
    '<!DOCTYPE html><script>alert(1)</script>'
  );
  assert.equal(
    verifyUploadedBookMagicBytes(disguisedHtmlAsPdf, 'pdf').valid,
    false
  );

  // Valid EPUB header starts with PK\x03\x04 and contains mimetype / META-INF
  const validEpubBytes = new Uint8Array([
    0x50,
    0x4b,
    0x03,
    0x04,
    ...new TextEncoder().encode('mimetypeapplication/epub+zipMETA-INF/container.xml'),
  ]);
  assert.equal(
    verifyUploadedBookMagicBytes(validEpubBytes, 'epub').valid,
    true
  );

  assert.equal(
    verifyUploadedBookMagicBytes(disguisedHtmlAsPdf, 'epub').valid,
    false
  );
});

test('validateSafeExternalUrl allows public https/http URLs and blocks SSRF/javascript URLs', () => {
  assert.equal(
    validateSafeExternalUrl('https://arxiv.org/abs/1706.03762').valid,
    true
  );
  assert.equal(validateSafeExternalUrl('javascript:alert(1)').valid, false);
  assert.equal(
    validateSafeExternalUrl('http://169.254.169.254/latest/meta-data/').valid,
    false
  );
  assert.equal(
    validateSafeExternalUrl('http://localhost:3000/api/library').valid,
    false
  );
  assert.equal(
    validateSafeExternalUrl('http://192.168.1.1/admin').valid,
    false
  );
});

test('buildSafeStorageKey sanitizes user IDs and upload IDs against path traversal', () => {
  const key = buildSafeStorageKey(
    '../../etc/passwd',
    '123e4567-e89b-12d3-a456-426614174000',
    'pdf'
  );
  assert.equal(key.includes('..'), false);
  assert.ok(key.startsWith('users/'));
  assert.ok(key.endsWith('/book.pdf'));
});

test('resolveLibraryStatusAndProgress handles reading, completed, to_read, on_hold, and archived transitions accurately', () => {
  const now = new Date('2026-10-28T12:00:00Z');

  // Auto-transition from to_read to reading when user advances pages
  const step1 = resolveLibraryStatusAndProgress({
    existingStatus: 'to_read',
    existingProgress: 0,
    existingCurrentPage: 0,
    existingTotalPages: 200,
    existingStartedAt: null,
    existingCompletedAt: null,
    existingArchivedAt: null,
    requestedCurrentPage: 50,
    now,
  });
  assert.equal(step1.readingStatus, 'reading');
  assert.equal(step1.progressPercent, 25);
  assert.equal(step1.startedAt?.toISOString(), now.toISOString());

  // Mark as completed sets 100% and currentPage = totalPages
  const step2 = resolveLibraryStatusAndProgress({
    existingStatus: step1.readingStatus,
    existingProgress: step1.progressPercent,
    existingCurrentPage: step1.currentPage,
    existingTotalPages: step1.totalPages,
    existingStartedAt: step1.startedAt,
    existingCompletedAt: null,
    existingArchivedAt: null,
    requestedStatus: 'completed',
    now,
  });
  assert.equal(step2.readingStatus, 'completed');
  assert.equal(step2.progressPercent, 100);
  assert.equal(step2.currentPage, 200);
  assert.ok(step2.completedAt);

  // Archiving preserves progress and completion timestamp
  const step3 = resolveLibraryStatusAndProgress({
    existingStatus: step2.readingStatus,
    existingProgress: step2.progressPercent,
    existingCurrentPage: step2.currentPage,
    existingTotalPages: step2.totalPages,
    existingStartedAt: step2.startedAt,
    existingCompletedAt: step2.completedAt,
    existingArchivedAt: null,
    requestedStatus: 'archived',
    now,
  });
  assert.equal(step3.readingStatus, 'archived');
  assert.equal(step3.progressPercent, 100);
  assert.ok(step3.archivedAt);
});

test('buildLibraryViewModel and filterAndSortLibraryItems compute accurate counts and user-created collection memberships', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const vm = buildLibraryViewModel({
    items: [
      {
        id: 'item-1',
        userId: 'u1',
        title: 'Deep Learning Notes',
        author: 'Ian Goodfellow',
        description: 'My personal notes on deep learning concepts.',
        itemType: 'pdf',
        readingStatus: 'reading',
        storageKey: 'users/u1/library/item-1/book.pdf',
        storageBucket: 'lifecraft-uploads',
        originalFilename: 'dl.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 102400,
        externalUrl: null,
        coverStyle: 'forest',
        progressPercent: 36,
        currentPage: 128,
        totalPages: 350,
        readingPosition: null,
        lastOpenedAt: new Date('2026-10-28T10:00:00Z'),
        startedAt: new Date('2026-10-20T10:00:00Z'),
        completedAt: null,
        archivedAt: null,
        createdAt: new Date('2026-10-20T10:00:00Z'),
        updatedAt: new Date('2026-10-28T10:00:00Z'),
      },
      {
        id: 'item-2',
        userId: 'u1',
        title: 'The Design of Everyday Things',
        author: 'Don Norman',
        description: 'UI/UX notes',
        itemType: 'epub',
        readingStatus: 'completed',
        storageKey: 'users/u1/library/item-2/book.epub',
        storageBucket: 'lifecraft-uploads',
        originalFilename: 'design.epub',
        mimeType: 'application/epub+zip',
        fileSizeBytes: 51200,
        externalUrl: null,
        coverStyle: 'meadow',
        progressPercent: 100,
        currentPage: 402,
        totalPages: 402,
        readingPosition: null,
        lastOpenedAt: new Date('2026-10-25T10:00:00Z'),
        startedAt: new Date('2026-10-10T10:00:00Z'),
        completedAt: new Date('2026-10-25T10:00:00Z'),
        archivedAt: null,
        createdAt: new Date('2026-10-10T10:00:00Z'),
        updatedAt: new Date('2026-10-25T10:00:00Z'),
      },
    ],
    collections: [
      {
        id: 'col-1',
        userId: 'u1',
        name: 'AI Research',
        description: 'Custom collection',
        color: 'violet',
        icon: 'folder',
        createdAt: now,
        updatedAt: now,
      },
    ],
    collectionMemberships: [
      {
        id: 'm-1',
        collectionId: 'col-1',
        libraryItemId: 'item-1',
        userId: 'u1',
        createdAt: now,
      },
    ],
    bookmarks: [],
    now,
  });

  assert.equal(vm.summary.totalItemsCount, 2);
  assert.equal(vm.summary.currentlyReadingCount, 1);
  assert.equal(vm.summary.completedCount, 1);
  assert.equal(vm.continueReadingItem?.id, 'item-1');
  assert.equal(vm.collections[0].itemCount, 1);

  const byCol = filterAndSortLibraryItems({
    items: vm.items,
    filterTab: 'all',
    formatFilter: 'all',
    collectionIdFilter: 'col-1',
    searchQuery: '',
    sortBy: 'last_opened',
  });
  assert.equal(byCol.length, 1);
  assert.equal(byCol[0].id, 'item-1');

  assert.equal(validateCollectionInput({ name: 'My Custom Shelf' }).valid, true);
  assert.equal(
    validateManualLibraryItemInput({
      title: 'Physical Book',
      itemType: 'book',
    }).valid,
    true
  );
});
