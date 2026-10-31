'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bold,
  Calendar as CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Plus,
  Repeat,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';
import {
  detectMeetingPlatform,
  formatReminderLabel,
  normalizeTo24HourTime,
  type CalendarEventInput,
  type CalendarEventReminder,
  type CalendarEventRecurrenceRule,
  type SerializedCalendarEvent,
  type SerializedEventAttachment,
} from '@/lib/calendar/event-validation';

interface CalendarEventModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialEvent?: SerializedCalendarEvent | null;
  defaultDate?: string;
  defaultStartTime?: string;
  defaultIsAllDay?: boolean;
  timezone: string;
  onClose: () => void;
  onSaved: (savedEvent: SerializedCalendarEvent) => void;
}

const CATEGORY_PRESETS = [
  { label: 'Work', color: '#5938B5' },
  { label: 'Meeting', color: '#2563EB' },
  { label: 'Personal', color: '#16A34A' },
  { label: 'Focus', color: '#D97706' },
  { label: 'Health', color: '#DB2777' },
  { label: 'Other', color: '#4B5563' },
];

const COLOR_PALETTE = [
  '#5938B5', // Lifecraft Deep Violet
  '#2563EB', // Blue
  '#0284C7', // Sky
  '#0D9488', // Teal
  '#16A34A', // Emerald
  '#65A30D', // Lime
  '#D97706', // Amber
  '#EA580C', // Orange
  '#DC2626', // Red
  '#DB2777', // Pink
  '#7C3AED', // Purple
  '#4B5563', // Slate
];

const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 5, label: '5 min' },
  { minutes: 10, label: '10 min' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 1440, label: '1 day' },
];

const DURATION_PRESETS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CalendarEventModal({
  isOpen,
  mode,
  initialEvent,
  defaultDate = '',
  defaultStartTime = '',
  defaultIsAllDay = false,
  timezone,
  onClose,
  onSaved,
}: CalendarEventModalProps) {
  const modalId = useId();

  // Detect and respect device timezone
  const effectiveTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || timezone || 'Asia/Kathmandu';
    } catch {
      return timezone || 'Asia/Kathmandu';
    }
  }, [timezone]);

  // Basic info
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Meeting');
  const [color, setColor] = useState('#5938B5');

  // Time & Date
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');

  // Description & Notes
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(true);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [descriptionTab, setDescriptionTab] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Meeting Link
  const [meetingUrl, setMeetingUrl] = useState('');
  const [isLinkCopied, setIsLinkCopied] = useState(false);

  // Reminders
  const [reminders, setReminders] = useState<CalendarEventReminder[]>([]);
  const [customReminderNumber, setCustomReminderNumber] = useState<string>('15');
  const [customReminderUnit, setCustomReminderUnit] = useState<'minutes' | 'hours' | 'days'>('minutes');
  const [customReminderChannel, setCustomReminderChannel] = useState<'email' | 'in_app'>('email');

  // Recurrence
  const [isRecurring, setIsRecurring] = useState(false);
  const [repeatFreq, setRepeatFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'>('weekly');
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([]);
  const [repeatEndType, setRepeatEndType] = useState<'never' | 'until' | 'count'>('never');
  const [repeatUntilDate, setRepeatUntilDate] = useState('');
  const [repeatCount, setRepeatCount] = useState(10);
  const [editSeriesScope, setEditSeriesScope] = useState<'this' | 'series'>('series');

  // Attachments
  const [existingAttachments, setExistingAttachments] = useState<SerializedEventAttachment[]>([]);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialize or reset form when opened or initialEvent changes
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && initialEvent) {
      setTitle(initialEvent.title);
      setCategory(initialEvent.category || 'Meeting');
      setColor(initialEvent.color || '#5938B5');
      setIsAllDay(Boolean(initialEvent.isAllDay));
      setStartDate(initialEvent.startDate);
      setStartTime(normalizeTo24HourTime(initialEvent.startTime, '09:00'));
      setEndDate(initialEvent.endDate || initialEvent.startDate);
      setEndTime(normalizeTo24HourTime(initialEvent.endTime, '10:00'));
      setDescription(initialEvent.description || '');
      setNotes(initialEvent.notes || '');
      setMeetingUrl(initialEvent.meetingUrl || '');
      setReminders(initialEvent.reminders ?? []);
      setExistingAttachments(initialEvent.attachments ?? []);
      setStagedFiles([]);

      if (initialEvent.recurrenceRule) {
        setIsRecurring(true);
        setRepeatFreq(initialEvent.recurrenceRule.frequency);
        setRepeatInterval(initialEvent.recurrenceRule.interval ?? 1);
        setRepeatWeekdays(initialEvent.recurrenceRule.daysOfWeek ?? []);
        setRepeatEndType(initialEvent.recurrenceRule.endType ?? 'never');
        if (initialEvent.recurrenceRule.endDate) {
          setRepeatUntilDate(initialEvent.recurrenceRule.endDate);
        }
        if (initialEvent.recurrenceRule.count) {
          setRepeatCount(initialEvent.recurrenceRule.count);
        }
      } else {
        setIsRecurring(false);
        setRepeatFreq('weekly');
        setRepeatInterval(1);
        setRepeatWeekdays([]);
        setRepeatEndType('never');
      }
      setEditSeriesScope('series');
    } else {
      // Create mode
      const today = defaultDate || new Date().toISOString().slice(0, 10);
      setTitle('');
      setCategory('Meeting');
      setColor('#5938B5');
      setIsAllDay(Boolean(defaultIsAllDay));
      setStartDate(today);
      setEndDate(today);

      const initialStart = normalizeTo24HourTime(defaultStartTime, '09:00');
      setStartTime(initialStart);
      const [h, m] = initialStart.split(':').map(Number);
      const endH = (h + 1) % 24;
      setEndTime(`${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`);

      setDescription('');
      setNotes('');
      setMeetingUrl('');
      // Default to 15m reminder
      setReminders([{ minutesBefore: 15, channel: 'email', enabled: true }]);
      setExistingAttachments([]);
      setStagedFiles([]);

      setIsRecurring(false);
      setRepeatFreq('weekly');
      setRepeatInterval(1);
      // Auto select current weekday for convenience
      const currentDayOfWeek = new Date().getDay();
      setRepeatWeekdays([currentDayOfWeek]);
      setRepeatEndType('never');
    }

    setBannerError(null);
    setFieldErrors({});
    setDescriptionTab('edit');
  }, [isOpen, mode, initialEvent, defaultDate, defaultStartTime, defaultIsAllDay]);

  // Detected meeting platform info
  const meetingPlatform = useMemo(() => {
    return detectMeetingPlatform(meetingUrl);
  }, [meetingUrl]);

  // Handle Duration Presets
  const applyDurationPreset = (minutes: number) => {
    if (isAllDay) return;
    const [h, m] = startTime.split(':').map(Number);
    const totalStartMins = (h || 0) * 60 + (m || 0);
    const totalEndMins = totalStartMins + minutes;

    const endH = Math.floor(totalEndMins / 60) % 24;
    const endM = totalEndMins % 60;
    setEndTime(`${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`);
  };

  // Auto-adjust end time if start date/time moves ahead
  const handleStartTimeChange = (newStartTime: string) => {
    setStartTime(newStartTime);
    if (startDate === endDate) {
      const [sh, sm] = newStartTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startMins = (sh || 0) * 60 + (sm || 0);
      const endMins = (eh || 0) * 60 + (em || 0);

      if (endMins <= startMins) {
        const nextEndMins = (startMins + 60) % 1440;
        const newEndH = Math.floor(nextEndMins / 60);
        const newEndM = nextEndMins % 60;
        setEndTime(`${String(newEndH).padStart(2, '0')}:${String(newEndM).padStart(2, '0')}`);
      }
    }
  };

  // Lightweight Rich Text Formatting Actions
  const applyTextFormat = (type: 'bold' | 'italic' | 'bullet' | 'number' | 'link') => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selectedText = description.substring(start, end);

    let replacement = '';
    let cursorOffset = 0;

    switch (type) {
      case 'bold':
        replacement = `**${selectedText || 'bold text'}**`;
        cursorOffset = selectedText ? replacement.length : 2;
        break;
      case 'italic':
        replacement = `*${selectedText || 'italic text'}*`;
        cursorOffset = selectedText ? replacement.length : 1;
        break;
      case 'bullet':
        if (selectedText) {
          replacement = selectedText
            .split('\n')
            .map((line) => (line.startsWith('- ') ? line : `- ${line}`))
            .join('\n');
        } else {
          replacement = '\n- ';
        }
        cursorOffset = replacement.length;
        break;
      case 'number':
        if (selectedText) {
          replacement = selectedText
            .split('\n')
            .map((line, idx) => `${idx + 1}. ${line}`)
            .join('\n');
        } else {
          replacement = '\n1. ';
        }
        cursorOffset = replacement.length;
        break;
      case 'link':
        const url = prompt('Enter the URL (e.g. https://example.com):', 'https://');
        if (url) {
          replacement = `[${selectedText || 'link text'}](${url})`;
          cursorOffset = replacement.length;
        } else {
          return;
        }
        break;
    }

    const nextDesc = description.substring(0, start) + replacement + description.substring(end);
    setDescription(nextDesc);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + cursorOffset, start + cursorOffset);
    }, 10);
  };

  // Copy Meeting Link helper
  const handleCopyMeetingLink = async () => {
    if (!meetingUrl) return;
    try {
      await navigator.clipboard.writeText(meetingUrl.trim());
      setIsLinkCopied(true);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Add Reminder
  const handleAddPresetReminder = (minutes: number) => {
    if (reminders.some((r) => r.minutesBefore === minutes && r.channel === customReminderChannel)) {
      return;
    }
    setReminders((prev) => [
      ...prev,
      { minutesBefore: minutes, channel: customReminderChannel, enabled: true },
    ]);
  };

  const handleAddCustomReminder = () => {
    const rawNum = parseInt(customReminderNumber, 10);
    if (isNaN(rawNum) || rawNum < 0) return;

    let totalMinutes = rawNum;
    if (customReminderUnit === 'hours') totalMinutes = rawNum * 60;
    if (customReminderUnit === 'days') totalMinutes = rawNum * 1440;

    if (reminders.some((r) => r.minutesBefore === totalMinutes && r.channel === customReminderChannel)) {
      return;
    }

    setReminders((prev) => [
      ...prev,
      { minutesBefore: totalMinutes, channel: customReminderChannel, enabled: true },
    ]);
  };

  const handleRemoveReminder = (index: number) => {
    setReminders((prev) => prev.filter((_, i) => i !== index));
  };

  // Attachments Handling
  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newFiles = Array.from(files);

    if (mode === 'edit' && initialEvent) {
      // Upload directly to server
      setIsUploadingAttachment(true);
      setBannerError(null);
      for (const file of newFiles) {
        if (file.size > 25 * 1024 * 1024) {
          setBannerError(`File "${file.name}" exceeds the 25MB maximum limit.`);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch(`/api/calendar/events/${initialEvent.id}/attachments`, {
            method: 'POST',
            body: formData,
          });
          const json = await res.json();
          if (res.ok && json.attachment) {
            setExistingAttachments((prev) => [...prev, json.attachment]);
          } else {
            setBannerError(json.error || `Failed to upload ${file.name}`);
          }
        } catch {
          setBannerError(`Network error while uploading ${file.name}`);
        }
      }
      setIsUploadingAttachment(false);
    } else {
      // Stage for creation
      const valid = newFiles.filter((f) => {
        if (f.size > 25 * 1024 * 1024) {
          setBannerError(`File "${f.name}" exceeds the 25MB limit.`);
          return false;
        }
        return true;
      });
      setStagedFiles((prev) => [...prev, ...valid]);
    }
  };

  const handleDeleteExistingAttachment = async (attachId: string) => {
    if (!initialEvent) return;
    try {
      const res = await fetch(
        `/api/calendar/events/${initialEvent.id}/attachments/${attachId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setExistingAttachments((prev) => prev.filter((a) => a.id !== attachId));
      }
    } catch {
      setBannerError('Failed to delete attachment.');
    }
  };

  const handleRemoveStagedFile = (idx: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Weekday toggle for recurrence
  const toggleWeekday = (day: number) => {
    setRepeatWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerError(null);
    setFieldErrors({});

    if (!title.trim()) {
      setFieldErrors({ title: 'Event title is required.' });
      return;
    }
    if (!startDate) {
      setFieldErrors({ startDate: 'Start date is required.' });
      return;
    }

    // Build recurrence rule if active
    let recurrenceRule: CalendarEventRecurrenceRule | null = null;
    if (isRecurring) {
      recurrenceRule = {
        frequency: repeatFreq,
        interval: Math.max(1, repeatInterval),
        daysOfWeek: repeatFreq === 'weekly' && repeatWeekdays.length > 0 ? repeatWeekdays : undefined,
        endType: repeatEndType,
        endDate: repeatEndType === 'until' && repeatUntilDate ? repeatUntilDate : undefined,
        count: repeatEndType === 'count' && repeatCount > 0 ? repeatCount : undefined,
      };
    }

    const payload: CalendarEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      category: category.trim() || 'Meeting',
      color: color || '#5938B5',
      startDate,
      startTime: isAllDay ? undefined : startTime,
      endDate: endDate || startDate,
      endTime: isAllDay ? undefined : endTime,
      isAllDay,
      timezone: effectiveTimezone,
      meetingUrl: meetingUrl.trim() || undefined,
      recurrenceRule: recurrenceRule || undefined,
      reminders,
    };

    setIsSubmitting(true);

    try {
      const url =
        mode === 'edit' && initialEvent
          ? `/api/calendar/events/${initialEvent.id}?scope=${editSeriesScope}`
          : '/api/calendar/events';
      const method = mode === 'edit' ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.fieldErrors) {
          setFieldErrors(json.fieldErrors);
        }
        setBannerError(json.error || json.message || 'Could not save event.');
        setIsSubmitting(false);
        return;
      }

      const savedEvent = json.event as SerializedCalendarEvent;

      // If there were staged files in create mode, upload them now
      if (stagedFiles.length > 0 && savedEvent?.id) {
        for (const file of stagedFiles) {
          const formData = new FormData();
          formData.append('file', file);
          try {
            await fetch(`/api/calendar/events/${savedEvent.id}/attachments`, {
              method: 'POST',
              body: formData,
            });
          } catch {
            // Ignored, non-blocking for core event creation
          }
        }
      }

      onSaved(savedEvent);
      onClose();
    } catch {
      setBannerError('An unexpected network error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#171622]/40 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-[#171622]/10 bg-[#FAF9F6] shadow-xl overflow-hidden text-[#171622]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#171622]/10 px-5 py-4 bg-white/60">
          <div className="flex items-center gap-2.5">
            <div
              className="h-3.5 w-3.5 rounded-full shadow-2xs transition-colors"
              style={{ backgroundColor: color }}
            />
            <h2 id={`${modalId}-title`} className="text-base sm:text-lg font-bold text-[#171622]">
              {mode === 'edit' ? 'Edit Event' : 'Create New Event'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-6">
          {bannerError && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
              <span>{bannerError}</span>
            </div>
          )}

          {/* Title & Category Row */}
          <div className="space-y-3">
            <div>
              <label htmlFor={`${modalId}-title-input`} className="block text-xs font-semibold text-[#171622]/70 mb-1">
                Event Title <span className="text-red-500">*</span>
              </label>
              <input
                id={`${modalId}-title-input`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sprint Planning, Client Review, Deep Focus"
                className={`w-full rounded-xl border bg-white px-3.5 py-2 text-sm text-[#171622] placeholder:text-[#171622]/35 focus:outline-none focus:ring-2 focus:ring-[#5938B5]/20 focus:border-[#5938B5] ${
                  fieldErrors.title ? 'border-red-400 bg-red-50/20' : 'border-[#171622]/15'
                }`}
                autoFocus
              />
              {fieldErrors.title && <p className="text-[11px] text-red-600 mt-1">{fieldErrors.title}</p>}
            </div>

            {/* Category selection */}
            <div>
              <span className="block text-xs font-semibold text-[#171622]/70 mb-1.5">Category</span>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_PRESETS.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    onClick={() => {
                      setCategory(cat.label);
                      setColor(cat.color);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                      category === cat.label
                        ? 'bg-[#171622] text-[#FAF9F6] shadow-2xs font-semibold'
                        : 'bg-white border border-[#171622]/12 text-[#171622]/70 hover:bg-[#FAF9F6]'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Palette */}
            <div>
              <span className="block text-xs font-semibold text-[#171622]/70 mb-1.5">Event Color</span>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`h-6 w-6 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                      color === c ? 'ring-2 ring-offset-2 ring-[#171622] scale-110' : ''
                    }`}
                    title={c}
                  >
                    {color === c && <Check className="h-3 w-3 text-white drop-shadow-xs" />}
                  </button>
                ))}
                {/* Custom Color Input */}
                <label className="relative cursor-pointer h-6 w-6 rounded-full border border-dashed border-[#171622]/30 flex items-center justify-center text-[10px] text-[#171622]/60 hover:border-[#171622]/60">
                  +
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Choose custom color"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Date, Time & All-Day */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#5938B5]" />
                Date & Time
                <span className="text-[10px] text-[#5938B5] font-semibold bg-[#5938B5]/10 px-2 py-0.5 rounded-full ml-1">
                  Device: {effectiveTimezone}
                </span>
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#171622]/80">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="rounded border-[#171622]/30 text-[#5938B5] focus:ring-[#5938B5]/30 h-4 w-4"
                />
                All-day event
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Start */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#171622]/60">Starts</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || endDate < e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    className="flex-1 rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs text-[#171622] focus:border-[#5938B5]"
                  />
                  {!isAllDay && (
                    <input
                      type="time"
                      value={normalizeTo24HourTime(startTime, '09:00')}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-24 rounded-lg border border-[#171622]/15 bg-white px-2 py-1.5 text-xs text-[#171622] focus:border-[#5938B5]"
                    />
                  )}
                </div>
              </div>

              {/* End */}
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#171622]/60">Ends</span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs text-[#171622] focus:border-[#5938B5]"
                  />
                  {!isAllDay && (
                    <input
                      type="time"
                      value={normalizeTo24HourTime(endTime, '10:00')}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-24 rounded-lg border border-[#171622]/15 bg-white px-2 py-1.5 text-xs text-[#171622] focus:border-[#5938B5]"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Duration presets for timed events */}
            {!isAllDay && (
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-[#171622]/50 font-medium">Duration:</span>
                <div className="flex flex-wrap gap-1">
                  {DURATION_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => applyDurationPreset(p.minutes)}
                      className="rounded bg-[#FAF9F6] border border-[#171622]/10 px-2 py-0.5 text-[11px] font-medium text-[#171622]/70 hover:bg-[#171622]/5 hover:text-[#171622]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Meeting Link Section */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`${modalId}-meeting-url`} className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Video className="h-4 w-4 text-[#2563EB]" />
                Meeting Link
              </label>
              {meetingPlatform && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#2563EB]/10 px-2 py-0.5 text-[10px] font-bold text-[#2563EB]">
                  {meetingPlatform.label}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id={`${modalId}-meeting-url`}
                  type="url"
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/... or https://zoom.us/..."
                  className={`w-full rounded-lg border bg-white px-3 py-1.5 text-xs text-[#171622] placeholder:text-[#171622]/35 focus:outline-none focus:ring-1 focus:ring-[#2563EB] ${
                    meetingUrl && !meetingPlatform ? 'border-amber-400' : 'border-[#171622]/15'
                  }`}
                />
              </div>

              {meetingUrl && meetingPlatform && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyMeetingLink}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#171622]/70 hover:bg-[#FAF9F6]"
                    title="Copy meeting link"
                  >
                    {isLinkCopied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{isLinkCopied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <a
                    href={meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg bg-[#2563EB] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1D4ED8]"
                    title="Test meeting link in new tab"
                  >
                    <span>Test</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Description & Notes Section (Expandable) */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsDescriptionOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-3 bg-[#FAF9F6]/80 hover:bg-[#FAF9F6] text-left transition-colors"
            >
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-[#5938B5]" />
                Description & Notes
              </span>
              <ChevronDown
                className={`h-4 w-4 text-[#171622]/50 transition-transform ${isDescriptionOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isDescriptionOpen && (
              <div className="p-4 space-y-4 border-t border-[#171622]/10">
                {/* Description with toolbar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#171622]/70">Event Description</span>
                    <div className="flex items-center gap-1 bg-white rounded-md border border-[#171622]/10 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setDescriptionTab('edit')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          descriptionTab === 'edit'
                            ? 'bg-[#171622] text-[#FAF9F6]'
                            : 'text-[#171622]/60 hover:text-[#171622]'
                        }`}
                      >
                        Write
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescriptionTab('preview')}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          descriptionTab === 'preview'
                            ? 'bg-[#171622] text-[#FAF9F6]'
                            : 'text-[#171622]/60 hover:text-[#171622]'
                        }`}
                      >
                        Preview
                      </button>
                    </div>
                  </div>

                  {descriptionTab === 'edit' ? (
                    <div className="rounded-xl border border-[#171622]/15 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-[#5938B5]/20 focus-within:border-[#5938B5]">
                      {/* Rich Text Toolbar */}
                      <div className="flex items-center gap-1 border-b border-[#171622]/10 px-2.5 py-1.5 bg-[#FAF9F6]">
                        <button
                          type="button"
                          onClick={() => applyTextFormat('bold')}
                          className="rounded p-1 text-[#171622]/70 hover:bg-[#171622]/10 hover:text-[#171622]"
                          title="Bold (**text**)"
                        >
                          <Bold className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTextFormat('italic')}
                          className="rounded p-1 text-[#171622]/70 hover:bg-[#171622]/10 hover:text-[#171622]"
                          title="Italic (*text*)"
                        >
                          <Italic className="h-3.5 w-3.5" />
                        </button>
                        <div className="h-3 w-px bg-[#171622]/15 mx-0.5" />
                        <button
                          type="button"
                          onClick={() => applyTextFormat('bullet')}
                          className="rounded p-1 text-[#171622]/70 hover:bg-[#171622]/10 hover:text-[#171622]"
                          title="Bullet List (- item)"
                        >
                          <List className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTextFormat('number')}
                          className="rounded p-1 text-[#171622]/70 hover:bg-[#171622]/10 hover:text-[#171622]"
                          title="Numbered List (1. item)"
                        >
                          <ListOrdered className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyTextFormat('link')}
                          className="rounded p-1 text-[#171622]/70 hover:bg-[#171622]/10 hover:text-[#171622]"
                          title="Insert Hyperlink"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <textarea
                        ref={textareaRef}
                        rows={3}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Agenda, discussion topics, preparation instructions, links..."
                        className="w-full p-2.5 text-xs text-[#171622] placeholder:text-[#171622]/35 focus:outline-none resize-y"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#171622]/15 bg-white p-3 min-h-[90px] text-xs text-[#171622] space-y-1 whitespace-pre-wrap">
                      {description.trim() ? (
                        description
                      ) : (
                        <span className="italic text-[#171622]/40">No description entered yet.</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Personal Notes */}
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[#171622]/70">Private Notes & Instructions</span>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Personal reminders, follow-ups, prep notes (only visible to you)..."
                    className="w-full rounded-xl border border-[#171622]/15 bg-white p-2.5 text-xs text-[#171622] placeholder:text-[#171622]/35 focus:outline-none focus:ring-2 focus:ring-[#5938B5]/20 focus:border-[#5938B5] resize-y"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Attachments Section */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-[#5938B5]" />
                Attachments
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAttachment}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5938B5] hover:underline"
              >
                {isUploadingAttachment ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>Upload files</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {/* Existing Attachments */}
            {existingAttachments.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[#171622]/60">Uploaded Files</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {existingAttachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border border-[#171622]/12 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        {att.fileType.startsWith('image/') ? (
                          <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" />
                        ) : (
                          <FileIcon className="h-4 w-4 shrink-0 text-[#5938B5]" />
                        )}
                        <span className="truncate font-medium text-[#171622]" title={att.fileName}>
                          {att.fileName}
                        </span>
                        <span className="text-[10px] text-[#171622]/50 shrink-0">
                          {formatFileSize(att.fileSize)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteExistingAttachment(att.id)}
                        className="p-1 text-[#171622]/40 hover:text-red-600 transition-colors"
                        title="Remove attachment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staged files for new events */}
            {stagedFiles.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-[#171622]/60">Files to upload on save</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {stagedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-dashed border-[#5938B5]/40 bg-[#5938B5]/5 px-2.5 py-1.5 text-xs"
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <UploadCloud className="h-4 w-4 shrink-0 text-[#5938B5]" />
                        <span className="truncate font-medium text-[#171622]" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] text-[#171622]/50 shrink-0">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStagedFile(idx)}
                        className="p-1 text-[#171622]/40 hover:text-red-600 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {existingAttachments.length === 0 && stagedFiles.length === 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-[#171622]/20 rounded-xl p-3 text-center cursor-pointer hover:bg-white hover:border-[#5938B5]/50 transition-colors"
              >
                <Paperclip className="h-4 w-4 text-[#171622]/40 mx-auto mb-1" />
                <p className="text-[11px] text-[#171622]/60">
                  Attach PDFs, presentations, agendas, or images (up to 25MB each)
                </p>
              </div>
            )}
          </div>

          {/* Reminders Section */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-[#5938B5]" />
                Reminders
              </span>
              <div className="flex items-center gap-1 text-[11px]">
                <span className="text-[#171622]/50">Channel:</span>
                <select
                  value={customReminderChannel}
                  onChange={(e) => setCustomReminderChannel(e.target.value as 'email' | 'in_app')}
                  className="rounded border border-[#171622]/15 bg-white px-2 py-0.5 text-xs text-[#171622]"
                >
                  <option value="email">Email</option>
                  <option value="in_app">In-App</option>
                </select>
              </div>
            </div>

            {/* Presets */}
            <div>
              <span className="text-[11px] font-semibold text-[#171622]/60 block mb-1">Quick Presets</span>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => handleAddPresetReminder(preset.minutes)}
                    className="rounded-lg bg-white border border-[#171622]/12 px-2 py-1 text-[11px] text-[#171622]/70 hover:bg-[#FAF9F6] hover:text-[#171622] transition-colors"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Interval Input */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] font-semibold text-[#171622]/60 shrink-0">Custom:</span>
              <input
                type="number"
                min="0"
                value={customReminderNumber}
                onChange={(e) => setCustomReminderNumber(e.target.value)}
                className="w-16 rounded-lg border border-[#171622]/15 bg-white px-2 py-1 text-xs text-[#171622]"
                placeholder="15"
              />
              <select
                value={customReminderUnit}
                onChange={(e) => setCustomReminderUnit(e.target.value as 'minutes' | 'hours' | 'days')}
                className="rounded-lg border border-[#171622]/15 bg-white px-2 py-1 text-xs text-[#171622]"
              >
                <option value="minutes">minutes before</option>
                <option value="hours">hours before</option>
                <option value="days">days before</option>
              </select>
              <button
                type="button"
                onClick={handleAddCustomReminder}
                className="rounded-lg bg-[#171622] px-2.5 py-1 text-xs font-bold text-white hover:bg-black"
              >
                Add
              </button>
            </div>

            {/* Active Reminders List */}
            {reminders.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[#171622]/10">
                <span className="text-[11px] font-semibold text-[#171622]/60">Configured Reminders</span>
                <div className="flex flex-wrap gap-2">
                  {reminders.map((rem, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#FAF9F6] border border-[#171622]/15 px-2.5 py-1 text-xs font-medium text-[#171622]"
                    >
                      <Clock className="h-3 w-3 text-[#5938B5]" />
                      <span>{formatReminderLabel(rem.minutesBefore)}</span>
                      <span className="text-[10px] text-[#171622]/50 font-normal">
                        ({rem.channel === 'email' ? 'Email' : 'In-App'})
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveReminder(idx)}
                        className="text-[#171622]/40 hover:text-red-600 ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recurring Events Section */}
          <div className="rounded-xl border border-[#171622]/10 bg-white/70 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#171622] flex items-center gap-1.5">
                <Repeat className="h-4 w-4 text-[#5938B5]" />
                Recurrence
              </span>
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#171622]/80">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="rounded border-[#171622]/30 text-[#5938B5] focus:ring-[#5938B5]/30 h-4 w-4"
                />
                Repeat this event
              </label>
            </div>

            {isRecurring && (
              <div className="space-y-3 pt-2 border-t border-[#171622]/10">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[11px] font-semibold text-[#171622]/60 block mb-1">Frequency</span>
                    <select
                      value={repeatFreq}
                      onChange={(e) => setRepeatFreq(e.target.value as any)}
                      className="w-full rounded-lg border border-[#171622]/15 bg-white px-2.5 py-1.5 text-xs text-[#171622]"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div className="w-28">
                    <span className="text-[11px] font-semibold text-[#171622]/60 block mb-1">Interval</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[#171622]/60">Every</span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={repeatInterval}
                        onChange={(e) => setRepeatInterval(parseInt(e.target.value, 10) || 1)}
                        className="w-12 rounded-lg border border-[#171622]/15 bg-white px-2 py-1.5 text-xs text-[#171622] text-center"
                      />
                    </div>
                  </div>
                </div>

                {/* Weekday selection if weekly */}
                {repeatFreq === 'weekly' && (
                  <div>
                    <span className="text-[11px] font-semibold text-[#171622]/60 block mb-1">Repeat on</span>
                    <div className="flex gap-1.5">
                      {WEEKDAY_NAMES.map((name, idx) => {
                        const isSelected = repeatWeekdays.includes(idx);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleWeekday(idx)}
                            className={`flex-1 py-1 rounded text-xs font-semibold transition-colors ${
                              isSelected
                                ? 'bg-[#5938B5] text-white shadow-2xs'
                                : 'bg-white border border-[#171622]/12 text-[#171622]/65 hover:bg-[#FAF9F6]'
                            }`}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Recurrence End Condition */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[#171622]/60 block">Ends</span>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-xs text-[#171622] cursor-pointer">
                      <input
                        type="radio"
                        name="repeatEndType"
                        checked={repeatEndType === 'never'}
                        onChange={() => setRepeatEndType('never')}
                        className="text-[#5938B5] focus:ring-[#5938B5]/30"
                      />
                      Never ends
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#171622] cursor-pointer">
                      <input
                        type="radio"
                        name="repeatEndType"
                        checked={repeatEndType === 'until'}
                        onChange={() => setRepeatEndType('until')}
                        className="text-[#5938B5] focus:ring-[#5938B5]/30"
                      />
                      On date:
                      <input
                        type="date"
                        value={repeatUntilDate}
                        min={startDate}
                        onChange={(e) => {
                          setRepeatEndType('until');
                          setRepeatUntilDate(e.target.value);
                        }}
                        className="rounded border border-[#171622]/15 bg-white px-2 py-0.5 text-xs text-[#171622]"
                      />
                    </label>

                    <label className="flex items-center gap-2 text-xs text-[#171622] cursor-pointer">
                      <input
                        type="radio"
                        name="repeatEndType"
                        checked={repeatEndType === 'count'}
                        onChange={() => setRepeatEndType('count')}
                        className="text-[#5938B5] focus:ring-[#5938B5]/30"
                      />
                      After
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={repeatCount}
                        onChange={(e) => {
                          setRepeatEndType('count');
                          setRepeatCount(parseInt(e.target.value, 10) || 1);
                        }}
                        className="w-14 rounded border border-[#171622]/15 bg-white px-2 py-0.5 text-xs text-[#171622] text-center"
                      />
                      occurrences
                    </label>
                  </div>
                </div>

                {/* Edit Recurring Scope Choice (When in edit mode for recurring event) */}
                {mode === 'edit' && initialEvent?.recurrenceRule && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 space-y-1">
                    <span className="font-bold block">Apply changes to:</span>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="editSeriesScope"
                          value="series"
                          checked={editSeriesScope === 'series'}
                          onChange={() => setEditSeriesScope('series')}
                          className="text-amber-700"
                        />
                        All events in series
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="editSeriesScope"
                          value="this"
                          checked={editSeriesScope === 'this'}
                          onChange={() => setEditSeriesScope('this')}
                          className="text-amber-700"
                        />
                        This event only
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#171622]/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2 text-xs font-semibold text-[#171622]/70 hover:bg-[#FAF9F6] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5938B5] px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#4a2e9b] transition-all disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{mode === 'edit' ? 'Update Event' : 'Save Event'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
