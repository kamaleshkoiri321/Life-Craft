'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  Edit3,
  FileText,
  Folder,
  FolderPlus,
  Loader2,
  Pin,
  Plus,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import {
  FOLDER_DESCRIPTION_MAX_LENGTH,
  FOLDER_NAME_MAX_LENGTH,
  MOOD_MAX_LENGTH,
  NOTE_COLOR_OPTIONS,
  NOTE_ICON_STYLES,
  NOTE_TITLE_MAX_LENGTH,
  TAG_NAME_MAX_LENGTH,
  type NoteColorOption,
  type NoteEntryType,
  type NoteIconStyle,
  type SerializedNote,
  type SerializedNoteFolder,
  type SerializedNoteTag,
} from '@/lib/notes/note-utils';
import type { NotesWorkspaceData } from '@/lib/queries/notes';
import NoteIconBadge, {
  NOTE_COLOR_STYLES,
  NOTE_ICON_CONFIG,
} from './NoteIconBadge';

const OPTIONAL_MOOD_SUGGESTIONS = [
  'Calm',
  'Focused',
  'Grateful',
  'Energized',
  'Reflective',
  'Creative',
];

function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);
}

export function FolderFormModal({
  isOpen,
  editingFolder,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  editingFolder: SerializedNoteFolder | null;
  onClose: () => void;
  onSaved: (
    workspace: NotesWorkspaceData,
    folder: SerializedNoteFolder
  ) => void;
}) {
  const [name, setName] = useState(editingFolder?.name ?? '');
  const [description, setDescription] = useState(
    editingFolder?.description ?? ''
  );
  const [color, setColor] = useState<NoteColorOption>(
    editingFolder?.color ?? 'lime'
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setErrorMsg('Folder name is required.');
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = editingFolder
        ? `/api/notes/folders/${editingFolder.id}`
        : '/api/notes/folders';
      const method = editingFolder ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          color,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        folder?: SerializedNoteFolder;
        workspace?: NotesWorkspaceData;
        message?: string;
      };

      if (!res.ok || json.status !== 'ok' || !json.workspace || !json.folder) {
        setErrorMsg(json.message || 'Unable to save folder.');
        return;
      }

      onSaved(json.workspace, json.folder);
      onClose();
    } catch {
      setErrorMsg('Network error while saving folder.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF7E1] text-[#2B611D]">
              <FolderPlus className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <h2
              id="folder-modal-title"
              className="font-display text-lg font-bold text-[#171622]"
            >
              {editingFolder ? 'Edit Folder' : 'Create New Folder'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close folder dialog"
            className="rounded-lg p-1.5 text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B42318]"
            >
              {errorMsg}
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="folder-name-input"
              className="block text-xs font-semibold text-[#171622]"
            >
              Folder name <span className="text-[#B42318]">*</span>
            </label>
            <input
              id="folder-name-input"
              type="text"
              maxLength={FOLDER_NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Research, Journal, Project Ideas"
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2.5 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end text-[11px] text-[#171622]/45 tabular-nums">
              {name.length}/{FOLDER_NAME_MAX_LENGTH}
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="folder-desc-input"
              className="block text-xs font-semibold text-[#171622]"
            >
              Description (optional)
            </label>
            <textarea
              id="folder-desc-input"
              rows={2}
              maxLength={FOLDER_DESCRIPTION_MAX_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of notes belong in this folder?"
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2 text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none resize-none"
            />
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-[#171622]">
              Folder accent color
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {NOTE_COLOR_OPTIONS.map((c) => {
                const style = NOTE_COLOR_STYLES[c];
                const isSelected = color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Select ${style.label} color`}
                    aria-pressed={isSelected}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-[#171622] bg-[#FAF9F6] font-semibold text-[#171622] shadow-2xs'
                        : 'border-[#171622]/10 bg-white text-[#171622]/70 hover:border-[#171622]/30'
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${style.dotClass}`}
                      aria-hidden="true"
                    />
                    <span>{style.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-60"
            >
              {isSaving && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              <span>{editingFolder ? 'Save changes' : 'Create folder'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteFolderConfirmModal({
  folder,
  onClose,
  onDeleted,
}: {
  folder: SerializedNoteFolder | null;
  onClose: () => void;
  onDeleted: (workspace: NotesWorkspaceData, deletedFolderId: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(Boolean(folder), onClose);

  if (!folder) return null;

  const handleConfirm = async () => {
    setErrorMsg(null);
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/notes/folders/${folder.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace) {
        setErrorMsg(json.message || 'Could not delete folder.');
        return;
      }
      onDeleted(json.workspace, folder.id);
      onClose();
    } catch {
      setErrorMsg('Network error while deleting folder.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-folder-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF0DF] text-[#9A5311]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2
              id="delete-folder-title"
              className="font-display text-base font-bold text-[#171622]"
            >
              Delete folder &ldquo;{folder.name}&rdquo;?
            </h2>
            <p className="text-xs text-[#171622]/70 leading-relaxed">
              Deleting this folder only removes its organizational relationship.{' '}
              <strong className="font-semibold text-[#171622]">
                None of your notes will be deleted
              </strong>{' '}
              — all {folder.noteCount}{' '}
              {folder.noteCount === 1 ? 'note' : 'notes'} will remain safely in{' '}
              <strong className="font-semibold text-[#171622]">All Notes</strong>.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2 text-xs text-[#B42318]"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B42318]/90 disabled:opacity-60"
          >
            {isDeleting && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>Delete folder (keep notes)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManageTagsModal({
  isOpen,
  tags,
  onClose,
  onWorkspaceUpdated,
}: {
  isOpen: boolean;
  tags: SerializedNoteTag[];
  onClose: () => void;
  onWorkspaceUpdated: (workspace: NotesWorkspaceData) => void;
}) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<NoteColorOption>('violet');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState<NoteColorOption>('violet');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const trimmed = newTagName.trim().replace(/^#+/, '').trim();
    if (!trimmed) {
      setErrorMsg('Enter a tag name.');
      return;
    }

    setBusyId('create');
    try {
      const res = await fetch('/api/notes/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed, color: newTagColor }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace) {
        setErrorMsg(json.message || 'Unable to create tag.');
        return;
      }
      setNewTagName('');
      onWorkspaceUpdated(json.workspace);
    } catch {
      setErrorMsg('Network error while creating tag.');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = async (tagId: string) => {
    setErrorMsg(null);
    const trimmed = editingName.trim().replace(/^#+/, '').trim();
    if (!trimmed) {
      setErrorMsg('Tag name cannot be empty.');
      return;
    }

    setBusyId(tagId);
    try {
      const res = await fetch(`/api/notes/tags/${tagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed, color: editingColor }),
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace) {
        setErrorMsg(json.message || 'Unable to update tag.');
        return;
      }
      setEditingTagId(null);
      onWorkspaceUpdated(json.workspace);
    } catch {
      setErrorMsg('Network error while updating tag.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    setErrorMsg(null);
    setBusyId(tagId);
    try {
      const res = await fetch(`/api/notes/tags/${tagId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace) {
        setErrorMsg(json.message || 'Unable to delete tag.');
        return;
      }
      onWorkspaceUpdated(json.workspace);
    } catch {
      setErrorMsg('Network error while deleting tag.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-tags-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-5 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EBE8F8] text-[#5938B5]">
              <Tag className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="manage-tags-title"
                className="font-display text-lg font-bold text-[#171622]"
              >
                Manage Your Tags
              </h2>
              <p className="text-xs text-[#171622]/60">
                Create, rename, recolor, or remove your custom tags. Removing a
                tag preserves all notes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close manage tags dialog"
            className="rounded-lg p-1.5 text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2 text-xs text-[#B42318]"
          >
            {errorMsg}
          </div>
        )}

        <form
          onSubmit={handleCreateTag}
          className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              maxLength={TAG_NAME_MAX_LENGTH}
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="New tag name (e.g. productivity, research)..."
              aria-label="New tag name"
              className="flex-1 rounded-xl border border-[#171622]/15 bg-white px-3 py-2 text-xs sm:text-sm text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busyId === 'create'}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-60 shrink-0"
            >
              {busyId === 'create' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Create tag</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {NOTE_COLOR_OPTIONS.map((c) => {
              const style = NOTE_COLOR_STYLES[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewTagColor(c)}
                  aria-label={`New tag color ${style.label}`}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium border ${
                    newTagColor === c
                      ? 'border-[#171622] bg-white font-semibold text-[#171622]'
                      : 'border-transparent text-[#171622]/65 hover:bg-white/60'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${style.dotClass}`}
                    aria-hidden="true"
                  />
                  <span>{style.label}</span>
                </button>
              );
            })}
          </div>
        </form>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {tags.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#171622]/15 p-6 text-center space-y-1">
              <p className="text-xs font-semibold text-[#171622]">
                No custom tags created yet
              </p>
              <p className="text-xs text-[#171622]/60">
                Type a tag name above or directly inside any note editor to
                create your first tag.
              </p>
            </div>
          ) : (
            tags.map((tag) => {
              const isEditing = editingTagId === tag.id;
              const style =
                NOTE_COLOR_STYLES[tag.color] ?? NOTE_COLOR_STYLES.violet;
              return (
                <div
                  key={tag.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#171622]/10 bg-white px-3.5 py-2.5"
                >
                  {isEditing ? (
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          maxLength={TAG_NAME_MAX_LENGTH}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          aria-label={`Edit tag name for ${tag.name}`}
                          className="flex-1 rounded-lg border border-[#171622]/20 px-2.5 py-1 text-xs text-[#171622]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(tag.id)}
                          disabled={busyId === tag.id}
                          className="rounded-lg bg-[#171622] px-2.5 py-1 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTagId(null)}
                          className="rounded-lg border border-[#171622]/15 px-2 py-1 text-xs text-[#171622]"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {NOTE_COLOR_OPTIONS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditingColor(c)}
                            aria-label={`Set color ${c}`}
                            className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                              editingColor === c
                                ? 'border-[#171622] scale-110'
                                : 'border-transparent'
                            }`}
                          >
                            <span
                              className={`h-3.5 w-3.5 rounded-full ${NOTE_COLOR_STYLES[c].dotClass}`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${style.chipClass}`}
                        >
                          {tag.name}
                        </span>
                        <span className="text-xs text-[#171622]/50 tabular-nums">
                          {tag.noteCount}{' '}
                          {tag.noteCount === 1 ? 'note' : 'notes'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTagId(tag.id);
                            setEditingName(tag.name);
                            setEditingColor(tag.color);
                          }}
                          aria-label={`Rename tag '${tag.name}'`}
                          className="rounded-lg p-1.5 text-[#171622]/60 hover:bg-[#FAF9F6] hover:text-[#171622]"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag.id)}
                          disabled={busyId === tag.id}
                          aria-label={`Delete tag '${tag.name}'`}
                          className="rounded-lg p-1.5 text-[#B42318]/75 hover:bg-[#FDECEC] hover:text-[#B42318]"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function MoveNoteToFolderModal({
  note,
  folders,
  onClose,
  onMoved,
  onOpenCreateFolder,
}: {
  note: SerializedNote | null;
  folders: SerializedNoteFolder[];
  onClose: () => void;
  onMoved: (workspace: NotesWorkspaceData, updatedNote: SerializedNote) => void;
  onOpenCreateFolder: () => void;
}) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    note?.folderId ?? null
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(Boolean(note), onClose);

  if (!note) return null;

  const handleSave = async () => {
    setErrorMsg(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ folderId: selectedFolderId }),
      });
      const json = (await res.json()) as {
        status: string;
        note?: SerializedNote;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace || !json.note) {
        setErrorMsg(json.message || 'Unable to move note.');
        return;
      }
      onMoved(json.workspace, json.note);
      onClose();
    } catch {
      setErrorMsg('Network error while moving note.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-note-folder-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF7E1] text-[#2B611D]">
              <Folder className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="move-note-folder-title"
                className="font-display text-base font-bold text-[#171622]"
              >
                Move Note to Folder
              </h2>
              <p className="text-xs text-[#171622]/60 truncate max-w-[260px]">
                {note.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close move note dialog"
            className="rounded-lg p-1.5 text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2 text-xs text-[#B42318]"
          >
            {errorMsg}
          </div>
        )}

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
              selectedFolderId === null
                ? 'border-[#171622] bg-[#FAF9F6] font-semibold text-[#171622]'
                : 'border-[#171622]/10 bg-white text-[#171622]/75 hover:bg-[#FAF9F6]'
            }`}
          >
            <span>No folder (Unfiled)</span>
            {selectedFolderId === null && (
              <Check className="h-4 w-4 text-[#2B611D]" aria-hidden="true" />
            )}
          </button>

          {folders.map((f) => {
            const isSelected = selectedFolderId === f.id;
            const style =
              NOTE_COLOR_STYLES[f.color] ?? NOTE_COLOR_STYLES.lime;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFolderId(f.id)}
                className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-medium transition-colors ${
                  isSelected
                    ? 'border-[#171622] bg-[#FAF9F6] font-semibold text-[#171622]'
                    : 'border-[#171622]/10 bg-white text-[#171622]/75 hover:bg-[#FAF9F6]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${style.dotClass}`}
                    aria-hidden="true"
                  />
                  <span className="truncate">{f.name}</span>
                </span>
                {isSelected && (
                  <Check className="h-4 w-4 text-[#2B611D]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenCreateFolder();
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:text-[#171622]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>New folder</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-4 py-2 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-60"
            >
              {isSaving && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              <span>Move note</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeleteNoteConfirmModal({
  note,
  permanent,
  onClose,
  onCompleted,
}: {
  note: SerializedNote | null;
  permanent: boolean;
  onClose: () => void;
  onCompleted: (workspace: NotesWorkspaceData, deletedId: string) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(Boolean(note), onClose);

  if (!note) return null;

  const handleConfirm = async () => {
    setErrorMsg(null);
    setIsBusy(true);
    try {
      const res = permanent
        ? await fetch(`/api/notes/${note.id}`, {
            method: 'DELETE',
            credentials: 'include',
          })
        : await fetch(`/api/notes/${note.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'trash' }),
          });

      const json = (await res.json()) as {
        status: string;
        workspace?: NotesWorkspaceData;
        message?: string;
      };
      if (!res.ok || json.status !== 'ok' || !json.workspace) {
        setErrorMsg(json.message || 'Action failed.');
        return;
      }
      onCompleted(json.workspace, note.id);
      onClose();
    } catch {
      setErrorMsg('Network error while deleting note.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-note-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#B42318]">
            <Trash2 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2
              id="delete-note-modal-title"
              className="font-display text-base font-bold text-[#171622]"
            >
              {permanent
                ? `Permanently delete "${note.title}"?`
                : `Move "${note.title}" to Trash?`}
            </h2>
            <p className="text-xs text-[#171622]/70 leading-relaxed">
              {permanent
                ? 'This note or journal entry will be permanently removed from PostgreSQL. Your folders and tags will be preserved.'
                : 'You can restore this note anytime from the Trash tab, or delete it permanently later.'}
            </p>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2 text-xs text-[#B42318]"
          >
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isBusy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B42318] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B42318]/90 disabled:opacity-60"
          >
            {isBusy && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>
              {permanent ? 'Delete permanently' : 'Move to Trash'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function CreateNoteModal({
  isOpen,
  defaultEntryType = 'note',
  defaultFolderId = null,
  todayLocalDate,
  folders,
  existingTags,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  defaultEntryType?: NoteEntryType;
  defaultFolderId?: string | null;
  todayLocalDate: string;
  folders: SerializedNoteFolder[];
  existingTags: SerializedNoteTag[];
  onClose: () => void;
  onCreated: (workspace: NotesWorkspaceData, createdNote: SerializedNote) => void;
}) {
  const [entryType, setEntryType] = useState<NoteEntryType>(defaultEntryType);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [journalDate, setJournalDate] = useState(todayLocalDate);
  const [mood, setMood] = useState('');
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId);
  const [iconStyle, setIconStyle] = useState<NoteIconStyle>(
    defaultEntryType === 'journal' ? 'journal' : 'leaf'
  );
  const [isPinned, setIsPinned] = useState(false);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEscapeClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleAddTagFromInput = () => {
    const cleaned = tagInput.trim().replace(/^#+/, '').trim();
    if (!cleaned) return;
    if (cleaned.length > TAG_NAME_MAX_LENGTH) {
      setErrorMsg(`Tag must be ${TAG_NAME_MAX_LENGTH} characters or fewer.`);
      return;
    }
    if (!tagNames.some((t) => t.toLowerCase() === cleaned.toLowerCase())) {
      setTagNames((prev) => [...prev, cleaned]);
    }
    setTagInput('');
  };

  const handleToggleTag = (name: string) => {
    setTagNames((prev) => {
      const exists = prev.some((t) => t.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.filter((t) => t.toLowerCase() !== name.toLowerCase());
      }
      return [...prev, name];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const pendingTag = tagInput.trim().replace(/^#+/, '').trim();
    const finalTags = [...tagNames];
    if (
      pendingTag &&
      !finalTags.some((t) => t.toLowerCase() === pendingTag.toLowerCase())
    ) {
      finalTags.push(pendingTag);
    }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg(
        entryType === 'journal'
          ? 'Please enter a title for your journal entry.'
          : 'Please enter a note title.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: trimmedTitle,
          content,
          entryType,
          journalDate: entryType === 'journal' ? journalDate : null,
          mood: entryType === 'journal' && mood.trim() ? mood.trim() : null,
          iconStyle,
          folderId,
          isPinned,
          tagNames: finalTags,
        }),
      });
      const json = (await res.json()) as {
        status: string;
        note?: SerializedNote;
        workspace?: NotesWorkspaceData;
        message?: string;
      };

      if (!res.ok || json.status !== 'ok' || !json.workspace || !json.note) {
        setErrorMsg(json.message || 'Unable to create note.');
        return;
      }

      onCreated(json.workspace, json.note);
      onClose();
    } catch {
      setErrorMsg('Network error while saving note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-note-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[#171622]/12 bg-white p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <NoteIconBadge iconStyle={iconStyle} size="md" />
            <div>
              <h2
                id="create-note-modal-title"
                className="font-display text-lg font-bold text-[#171622]"
              >
                {entryType === 'journal' ? 'New Journal Entry' : 'New Note'}
              </h2>
              <p className="text-xs text-[#171622]/60">
                Supports Markdown headings, lists, checklists, quotes, and code.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new note dialog"
            className="rounded-lg p-1.5 text-[#171622]/50 hover:bg-[#FAF9F6] hover:text-[#171622]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#B42318]/20 bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B42318]"
            >
              {errorMsg}
            </div>
          )}

          {/* Entry Type Switcher (Note vs Daily Journal) & Pin */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-[#171622]/12 bg-[#FAF9F6] p-1">
              <button
                type="button"
                onClick={() => {
                  setEntryType('note');
                  if (iconStyle === 'journal') setIconStyle('leaf');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  entryType === 'note'
                    ? 'bg-white text-[#171622] shadow-2xs'
                    : 'text-[#171622]/65 hover:text-[#171622]'
                }`}
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Note</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryType('journal');
                  setIconStyle('journal');
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  entryType === 'journal'
                    ? 'bg-white text-[#171622] shadow-2xs'
                    : 'text-[#171622]/65 hover:text-[#171622]'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Daily Journal</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsPinned((prev) => !prev)}
              aria-pressed={isPinned}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isPinned
                  ? 'border-[#5C9E31] bg-[#EAF7E1] text-[#2B611D]'
                  : 'border-[#171622]/12 bg-white text-[#171622]/70 hover:bg-[#FAF9F6]'
              }`}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{isPinned ? 'Pinned' : 'Pin note'}</span>
            </button>
          </div>

          {/* Journal Date & Optional Mood (when entryType === 'journal') */}
          {entryType === 'journal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-3.5">
              <div className="space-y-1">
                <label
                  htmlFor="new-journal-date"
                  className="block text-xs font-semibold text-[#171622]"
                >
                  Journal entry date
                </label>
                <div className="relative">
                  <Calendar
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#171622]/50"
                    aria-hidden="true"
                  />
                  <input
                    id="new-journal-date"
                    type="date"
                    value={journalDate}
                    onChange={(e) => setJournalDate(e.target.value)}
                    className="w-full rounded-xl border border-[#171622]/15 bg-white pl-9 pr-3 py-2 text-xs font-medium text-[#171622]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-journal-mood"
                  className="block text-xs font-semibold text-[#171622]"
                >
                  Reflection tone / mood (optional)
                </label>
                <input
                  id="new-journal-mood"
                  type="text"
                  maxLength={MOOD_MAX_LENGTH}
                  value={mood}
                  onChange={(e) => setMood(e.target.value)}
                  placeholder="e.g. Calm, Focused, Grateful"
                  className="w-full rounded-xl border border-[#171622]/15 bg-white px-3 py-2 text-xs text-[#171622] placeholder:text-[#171622]/40"
                />
                <div className="flex flex-wrap gap-1 pt-1">
                  {OPTIONAL_MOOD_SUGGESTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMood(mood === m ? '' : m)}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        mood === m
                          ? 'bg-[#EBE8F8] text-[#4C2FA3] font-semibold'
                          : 'bg-white text-[#171622]/60 hover:text-[#171622]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="new-note-title"
              className="block text-xs font-semibold text-[#171622]"
            >
              Title <span className="text-[#B42318]">*</span>
            </label>
            <input
              id="new-note-title"
              type="text"
              maxLength={NOTE_TITLE_MAX_LENGTH}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                entryType === 'journal'
                  ? 'e.g. Evening Reflection & Wins'
                  : 'e.g. Building Better Habits'
              }
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3.5 py-2.5 text-sm font-medium text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none"
              autoFocus
            />
          </div>

          {/* Folder & Icon Style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="new-note-folder"
                className="block text-xs font-semibold text-[#171622]"
              >
                Folder (optional)
              </label>
              <select
                id="new-note-folder"
                value={folderId ?? ''}
                onChange={(e) => setFolderId(e.target.value || null)}
                className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3 py-2.5 text-xs sm:text-sm text-[#171622] focus:border-[#171622] focus:bg-white focus:outline-none"
              >
                <option value="">No folder (Unfiled)</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#171622]">
                Card icon
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {NOTE_ICON_STYLES.map((styleKey) => {
                  const cfg = NOTE_ICON_CONFIG[styleKey];
                  const Icon = cfg.Icon;
                  const active = iconStyle === styleKey;
                  return (
                    <button
                      key={styleKey}
                      type="button"
                      onClick={() => setIconStyle(styleKey)}
                      aria-label={`Icon ${cfg.label}`}
                      aria-pressed={active}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                        active
                          ? 'border-[#171622] ring-2 ring-[#171622]/15 scale-105'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      } ${cfg.bgClass} ${cfg.iconClass}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Custom Tags */}
          <div className="space-y-1.5">
            <label
              htmlFor="new-note-tag-input"
              className="block text-xs font-semibold text-[#171622]"
            >
              Tags (optional — type your own)
            </label>
            <div className="flex gap-2">
              <input
                id="new-note-tag-input"
                type="text"
                maxLength={TAG_NAME_MAX_LENGTH}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddTagFromInput();
                  }
                }}
                placeholder="Type a tag (e.g. habits, research) and press Enter"
                className="flex-1 rounded-xl border border-[#171622]/15 bg-[#FAF9F6] px-3 py-2 text-xs text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddTagFromInput}
                className="rounded-xl border border-[#171622]/15 bg-white px-3 py-2 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
              >
                Add tag
              </button>
            </div>

            {tagNames.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tagNames.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#EBE8F8] px-2.5 py-1 text-xs font-medium text-[#4C2FA3]"
                  >
                    <span>{t}</span>
                    <button
                      type="button"
                      onClick={() => handleToggleTag(t)}
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
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-[#171622]/50">
                  Your tags:
                </span>
                {existingTags.map((t) => {
                  const selected = tagNames.some(
                    (name) => name.toLowerCase() === t.name.toLowerCase()
                  );
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleToggleTag(t.name)}
                      className={`rounded-lg px-2 py-0.5 text-[11px] font-medium border transition-colors ${
                        selected
                          ? 'border-[#171622] bg-[#171622] text-white'
                          : 'border-[#171622]/10 bg-[#FAF9F6] text-[#171622]/70 hover:text-[#171622]'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Markdown Content */}
          <div className="space-y-1.5">
            <label
              htmlFor="new-note-content"
              className="block text-xs font-semibold text-[#171622]"
            >
              Content (Markdown supported)
            </label>
            <textarea
              id="new-note-content"
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Write your thoughts in Markdown...\n\n1. Read for 20 minutes daily\n2. Exercise 4 times a week\n\n# Why it matters\n> "You don't have to be great to start, but you have to start to be great."\n> — Zig Ziglar`}
              className="w-full rounded-xl border border-[#171622]/15 bg-[#FAF9F6] p-3.5 text-sm leading-relaxed text-[#171622] placeholder:text-[#171622]/40 focus:border-[#171622] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622] hover:bg-[#FAF9F6]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#171622] px-5 py-2.5 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 disabled:opacity-60"
            >
              {isSubmitting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              <span>
                {entryType === 'journal' ? 'Save journal entry' : 'Create note'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
