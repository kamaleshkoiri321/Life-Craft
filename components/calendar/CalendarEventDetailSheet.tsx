'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import {
  detectMeetingPlatform,
  formatReminderLabel,
  type SerializedCalendarEvent,
  type SerializedEventAttachment,
} from '@/lib/calendar/event-validation';

interface CalendarEventDetailSheetProps {
  event: SerializedCalendarEvent | null;
  onClose: () => void;
  onEditEvent: (event: SerializedCalendarEvent) => void;
  onDeleteEvent: (event: SerializedCalendarEvent, scope: 'this' | 'series') => Promise<{ ok: boolean; error?: string }>;
  onEventUpdated?: (updatedEvent: SerializedCalendarEvent) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Lightweight safe markdown renderer for event descriptions.
 * Converts bold, italics, bullets, and URLs/markdown links into clickable elements.
 */
function renderMarkdownContent(text: string): React.ReactNode {
  if (!text) return null;

  const lines = text.split('\n');

  return (
    <div className="space-y-1.5 text-xs text-[#171622]/85 leading-relaxed">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={lineIdx} className="h-2" />;
        }

        // Bullet list check
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2">
              <span className="text-[#5938B5] mt-1 text-base leading-none">•</span>
              <div>{renderFormattedInlineText(trimmed.slice(2))}</div>
            </div>
          );
        }

        // Numbered list check
        const numMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
        if (numMatch) {
          return (
            <div key={lineIdx} className="flex items-start gap-2 pl-2">
              <span className="font-bold text-[#5938B5] text-xs">{numMatch[1]}.</span>
              <div>{renderFormattedInlineText(numMatch[2])}</div>
            </div>
          );
        }

        return <p key={lineIdx}>{renderFormattedInlineText(line)}</p>;
      })}
    </div>
  );
}

function renderFormattedInlineText(text: string): React.ReactNode {
  // Regex to match markdown links [label](url), standalone URLs, bold **text**, and italic *text*
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s)]+|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];

    if (token.startsWith('[') && match[2] && match[3]) {
      // Markdown link
      parts.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#2563EB] underline hover:text-[#1D4ED8]"
        >
          {match[2]}
        </a>
      );
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      // Raw URL
      parts.push(
        <a
          key={match.index}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#2563EB] underline hover:text-[#1D4ED8] break-all"
        >
          {token}
        </a>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      // Bold
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      // Italic
      parts.push(<em key={match.index}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

export default function CalendarEventDetailSheet({
  event,
  onClose,
  onEditEvent,
  onDeleteEvent,
  onEventUpdated,
}: CalendarEventDetailSheetProps) {
  const sheetId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmScope, setDeleteConfirmScope] = useState<'prompt' | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  if (!event) return null;

  const meetingPlatform = detectMeetingPlatform(event.meetingUrl);

  const handleCopyLink = async () => {
    if (!event.meetingUrl) return;
    try {
      await navigator.clipboard.writeText(event.meetingUrl.trim());
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleUploadAdditionalFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    setErrorNotice(null);

    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) {
          setErrorNotice(`File "${file.name}" exceeds 25MB limit.`);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`/api/calendar/events/${event.id}/attachments`, {
          method: 'POST',
          body: formData,
        });
        const json = await res.json();
        if (res.ok && json.attachment) {
          const updatedEvent: SerializedCalendarEvent = {
            ...event,
            attachments: [...(event.attachments ?? []), json.attachment],
          };
          onEventUpdated?.(updatedEvent);
        } else {
          setErrorNotice(json.error || `Failed to upload ${file.name}`);
        }
      }
    } catch {
      setErrorNotice('Network error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachId: string) => {
    try {
      const res = await fetch(
        `/api/calendar/events/${event.id}/attachments/${attachId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        const updatedEvent: SerializedCalendarEvent = {
          ...event,
          attachments: (event.attachments ?? []).filter((a) => a.id !== attachId),
        };
        onEventUpdated?.(updatedEvent);
      } else {
        setErrorNotice('Could not delete attachment.');
      }
    } catch {
      setErrorNotice('Network error deleting attachment.');
    }
  };

  const handleConfirmDelete = async (scope: 'this' | 'series') => {
    setIsDeleting(true);
    setErrorNotice(null);
    const res = await onDeleteEvent(event, scope);
    if (!res.ok) {
      setErrorNotice(res.error || 'Failed to delete event.');
      setIsDeleting(false);
      setDeleteConfirmScope(null);
    } else {
      setIsDeleting(false);
      setDeleteConfirmScope(null);
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${sheetId}-title`}
      className="fixed inset-0 z-50 flex justify-end bg-[#171622]/30 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg h-full flex flex-col bg-[#FAF9F6] border-l border-[#171622]/10 shadow-2xl overflow-hidden text-[#171622]">
        {/* Accent Bar */}
        <div
          className="h-2 w-full transition-colors"
          style={{ backgroundColor: event.color || '#5938B5' }}
        />

        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#171622]/10 px-6 py-4 bg-white/70">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-2xs"
              style={{ backgroundColor: event.color || '#5938B5' }}
            >
              {event.category || 'Event'}
            </span>
            {event.isRecurring && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#171622]/5 px-2 py-0.5 text-[10px] font-semibold text-[#171622]/70">
                <Repeat className="h-3 w-3" />
                <span>{event.recurrenceLabel || 'Recurring'}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEditEvent(event)}
              className="rounded-lg p-2 text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
              title="Edit event"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (event.isRecurring) {
                  setDeleteConfirmScope('prompt');
                } else {
                  handleConfirmDelete('this');
                }
              }}
              disabled={isDeleting}
              className="rounded-lg p-2 text-red-600/70 hover:bg-red-50 hover:text-red-700 transition-colors"
              title="Delete event"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
              title="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {errorNotice && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorNotice}</span>
            </div>
          )}

          {/* Delete recurring confirmation banner */}
          {deleteConfirmScope === 'prompt' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                <Trash2 className="h-4 w-4 text-red-600" />
                <span>Delete Recurring Event</span>
              </div>
              <p className="text-xs text-red-800">
                This event is part of a recurring series. How would you like to delete it?
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleConfirmDelete('this')}
                  disabled={isDeleting}
                  className="rounded-lg bg-white border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100/50 text-left"
                >
                  Delete this event only
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDelete('series')}
                  disabled={isDeleting}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 text-left"
                >
                  Delete all events in this series
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmScope(null)}
                  className="text-xs text-[#171622]/60 hover:underline pt-1 text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <h1 id={`${sheetId}-title`} className="text-xl font-bold text-[#171622] leading-snug">
              {event.title}
            </h1>
          </div>

          {/* Date & Time Badge */}
          <div className="rounded-xl border border-[#171622]/10 bg-white p-3.5 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-[#171622]">
              <Calendar className="h-4 w-4 text-[#5938B5]" />
              <span>{event.startDate === event.endDate ? event.startDate : `${event.startDate} – ${event.endDate}`}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#171622]/70 pl-6">
              <Clock className="h-3.5 w-3.5 text-[#171622]/40" />
              <span>{event.displayTimeLabel}</span>
              {event.durationMinutes > 0 && !event.isAllDay && (
                <span className="text-[11px] text-[#171622]/50 font-normal">
                  ({Math.floor(event.durationMinutes / 60) > 0 ? `${Math.floor(event.durationMinutes / 60)}h ` : ''}
                  {event.durationMinutes % 60 > 0 ? `${event.durationMinutes % 60}m` : ''})
                </span>
              )}
            </div>
          </div>

          {/* Meeting Link Banner (Prominent Action) */}
          {event.meetingUrl && (
            <div className="rounded-2xl border border-[#2563EB]/25 bg-[#2563EB]/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-[#2563EB]" />
                  <span className="text-xs font-bold text-[#2563EB]">
                    {meetingPlatform?.label ?? 'Online Meeting'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1 rounded-lg border border-[#2563EB]/20 bg-white px-2 py-1 text-[11px] font-semibold text-[#2563EB] hover:bg-[#2563EB]/10 transition-colors"
                >
                  {isLinkCopied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                  <span>{isLinkCopied ? 'Copied' : 'Copy Link'}</span>
                </button>
              </div>

              <div className="text-xs text-[#171622]/70 truncate font-mono bg-white/70 rounded-lg p-2 border border-[#2563EB]/15">
                {event.meetingUrl}
              </div>

              <a
                href={event.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#1D4ED8] transition-all"
              >
                <span>Join Meeting</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}

          {/* Description Section */}
          {event.description && (
            <div className="rounded-xl border border-[#171622]/10 bg-white p-4 space-y-2">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#5938B5]" />
                Description & Agenda
              </span>
              <div className="pt-1">
                {renderMarkdownContent(event.description)}
              </div>
            </div>
          )}

          {/* Notes Section */}
          {event.notes && (
            <div className="rounded-xl border border-[#171622]/10 bg-[#FEF3C7]/40 p-4 space-y-1.5">
              <span className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#D97706]" />
                Personal Notes & Preparation
              </span>
              <p className="text-xs text-[#78350F] whitespace-pre-wrap leading-relaxed">
                {event.notes}
              </p>
            </div>
          )}

          {/* Attachments Section */}
          <div className="rounded-xl border border-[#171622]/10 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-[#5938B5]" />
                Attachments ({(event.attachments ?? []).length})
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:underline"
              >
                {isUploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>Add file</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleUploadAdditionalFiles(e.target.files)}
              />
            </div>

            {(event.attachments ?? []).length > 0 ? (
              <div className="space-y-2">
                {event.attachments!.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between rounded-lg border border-[#171622]/10 bg-[#FAF9F6] p-2.5 text-xs hover:border-[#171622]/25 transition-all"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      {att.fileType.startsWith('image/') ? (
                        <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-[#5938B5]" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[#171622] truncate" title={att.fileName}>
                          {att.fileName}
                        </div>
                        <div className="text-[10px] text-[#171622]/50">
                          {formatFileSize(att.fileSize)} • {att.fileType.split('/')[1]?.toUpperCase() || 'FILE'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <a
                        href={`/api/calendar/events/${event.id}/attachments/${att.id}/download`}
                        download={att.fileName}
                        className="rounded p-1.5 text-[#171622]/60 hover:bg-[#171622]/10 hover:text-[#171622]"
                        title="Download file"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(att.id)}
                        className="rounded p-1.5 text-[#171622]/40 hover:text-red-600 hover:bg-red-50"
                        title="Remove file"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#171622]/50 italic">
                No attachments uploaded for this event.
              </p>
            )}
          </div>

          {/* Reminders List */}
          {(event.reminders ?? []).length > 0 && (
            <div className="rounded-xl border border-[#171622]/10 bg-white p-4 space-y-2">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#5938B5]" />
                Reminders
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {event.reminders!.map((rem, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAF9F6] border border-[#171622]/12 px-2.5 py-1 text-xs font-medium text-[#171622]"
                  >
                    <span>{formatReminderLabel(rem.minutesBefore)}</span>
                    <span className="text-[10px] text-[#171622]/50">
                      ({rem.channel === 'email' ? 'Email' : 'In-App'})
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Actions Footer */}
        <div className="border-t border-[#171622]/10 px-6 py-4 bg-white/70 flex items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (event.isRecurring) {
                setDeleteConfirmScope('prompt');
              } else {
                handleConfirmDelete('this');
              }
            }}
            disabled={isDeleting}
            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622]/70 hover:bg-[#FAF9F6]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => onEditEvent(event)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5938B5] px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#4a2e9b]"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit Event</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
