'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Archive, Loader2, Trash2, X } from 'lucide-react';
import type { SerializedTaskItem } from '@/lib/tasks/validation';

interface DeleteTaskDialogProps {
  task: SerializedTaskItem | null;
  onClose: () => void;
  onConfirmDelete: (taskId: string) => Promise<{ ok: boolean; error?: string }>;
  onArchiveInstead?: (taskId: string) => Promise<{ ok: boolean; error?: string }>;
}

export default function DeleteTaskDialog({
  task,
  onClose,
  onConfirmDelete,
  onArchiveInstead,
}: DeleteTaskDialogProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!task) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [task, isProcessing, onClose]);

  if (!task) return null;

  async function handlePermanentDelete() {
    if (!task) return;
    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const result = await onConfirmDelete(task.id);
      if (!result.ok) {
        setErrorMessage(
          result.error || 'Could not delete task. Please try again.'
        );
      } else {
        onClose();
      }
    } catch {
      setErrorMessage('Unable to delete task right now. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleArchive() {
    if (!task || !onArchiveInstead) return;
    setErrorMessage(null);
    setIsProcessing(true);
    try {
      const result = await onArchiveInstead(task.id);
      if (!result.ok) {
        setErrorMessage(
          result.error || 'Could not archive task. Please try again.'
        );
      } else {
        onClose();
      }
    } catch {
      setErrorMessage('Unable to archive task right now. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-task-dialog-title"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => {
          if (!isProcessing) onClose();
        }}
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[#171622]/12 bg-[#FAF9F6] p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF3F2] text-[#B42318]">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="delete-task-dialog-title"
                className="font-display text-lg font-bold text-[#171622]"
              >
                Delete task permanently?
              </h2>
              <p className="text-xs text-[#171622]/60">
                This action cannot be undone.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            aria-label="Close delete confirmation"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="rounded-xl border border-[#171622]/10 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-[#171622] break-words">
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 text-xs text-[#171622]/65 line-clamp-2">
              {task.description}
            </p>
          )}
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[#B42318]/25 bg-[#FEF3F2] px-3.5 py-2.5 text-xs text-[#B42318]"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors"
          >
            Cancel
          </button>

          {task.status !== 'archived' && onArchiveInstead && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#5938B5]/25 bg-[#EBE8F8]/60 px-4 py-2 text-xs sm:text-sm font-semibold text-[#171622] hover:bg-[#EBE8F8] transition-colors disabled:opacity-60"
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Archive instead</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePermanentDelete}
            disabled={isProcessing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B42318] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#B42318]/90 transition-colors disabled:opacity-60"
          >
            {isProcessing ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isProcessing ? 'Deleting...' : 'Delete permanently'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
