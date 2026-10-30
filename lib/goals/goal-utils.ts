import {
  DEFAULT_TIMEZONE,
  formatShortDate,
  resolveValidTimezone,
} from '../queries/timezone';
import type {
  GoalMilestoneRow,
  GoalProgressEntryRow,
  GoalRow,
} from '../db/schema';

export const GOAL_TITLE_MAX_LENGTH = 160;
export const GOAL_DESCRIPTION_MAX_LENGTH = 1000;
export const MILESTONE_TITLE_MAX_LENGTH = 160;
export const MILESTONE_DESCRIPTION_MAX_LENGTH = 500;
export const PROGRESS_NOTE_MAX_LENGTH = 300;

export const GOAL_CATEGORIES = [
  'Personal Growth',
  'Learning',
  'Health & Fitness',
  'Career',
  'Lifestyle',
  'Finance',
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export const GOAL_STATUSES = [
  'active',
  'paused',
  'completed',
  'archived',
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export type MilestoneStatus = 'pending' | 'completed';

export type GoalFilterTab = 'all' | 'active' | 'completed' | 'archived';

export type GoalSortOption =
  | 'target_date'
  | 'progress_desc'
  | 'progress_asc'
  | 'updated_desc'
  | 'title_asc';

export type GoalDeadlineState =
  | 'on_track'
  | 'due_soon'
  | 'overdue'
  | 'completed'
  | 'paused'
  | 'archived';

export function isValidLocalDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Computes whole calendar days from `fromDateKey` (`YYYY-MM-DD`) to `toDateKey` (`YYYY-MM-DD`).
 * Positive means `toDateKey` is in the future; negative means `toDateKey` is in the past.
 */
export function diffCalendarDays(
  fromDateKey: string,
  toDateKey: string
): number {
  const [fy, fm, fd] = fromDateKey.split('-').map(Number);
  const [ty, tm, td] = toDateKey.split('-').map(Number);
  const fromUtcMs = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const toUtcMs = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toUtcMs - fromUtcMs) / 86_400_000);
}

export function normalizeGoalCategory(raw: unknown): GoalCategory {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const match = GOAL_CATEGORIES.find(
      (c) => c.toLowerCase() === trimmed.toLowerCase()
    );
    if (match) return match;
  }
  return 'Personal Growth';
}

export function isValidGoalStatus(value: unknown): value is GoalStatus {
  return (
    typeof value === 'string' &&
    (GOAL_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * Deterministic completion & reopening state machine for goals.
 * Ensures `status`, `progressPercent`, and `completedAt` never contradict each other.
 */
export function resolveGoalStatusAndProgressOnMutation(params: {
  existingStatus: GoalStatus;
  existingProgress: number;
  existingCompletedAt: Date | null;
  requestedStatus?: GoalStatus;
  requestedProgress?: number;
  now?: Date;
}): {
  status: GoalStatus;
  progressPercent: number;
  completedAt: Date | null;
} {
  const now = params.now ?? new Date();
  let nextStatus: GoalStatus = params.requestedStatus ?? params.existingStatus;
  let nextProgress: number =
    params.requestedProgress !== undefined
      ? params.requestedProgress
      : params.existingProgress;
  let nextCompletedAt: Date | null = params.existingCompletedAt;

  // Rule 1: Explicit manual mark as completed -> force 100% and set completedAt
  if (params.requestedStatus === 'completed') {
    nextStatus = 'completed';
    nextProgress = 100;
    nextCompletedAt = params.existingCompletedAt ?? now;
    return {
      status: nextStatus,
      progressPercent: nextProgress,
      completedAt: nextCompletedAt,
    };
  }

  // Rule 2: Explicit reopen from completed to active or paused
  if (
    params.existingStatus === 'completed' &&
    (params.requestedStatus === 'active' || params.requestedStatus === 'paused')
  ) {
    nextStatus = params.requestedStatus;
    nextCompletedAt = null;
    if (params.requestedProgress === undefined && nextProgress === 100) {
      // If user reopens a 100% completed goal without specifying a new progress,
      // step back to 90% or keep explicit requestedProgress so it remains active
      nextProgress = 90;
    }
    return {
      status: nextStatus,
      progressPercent: nextProgress,
      completedAt: nextCompletedAt,
    };
  }

  // Rule 3: Progress updated to 100% on an active or paused goal -> auto-complete
  if (
    params.requestedProgress === 100 &&
    nextStatus !== 'archived'
  ) {
    nextStatus = 'completed';
    nextProgress = 100;
    nextCompletedAt = params.existingCompletedAt ?? now;
    return {
      status: nextStatus,
      progressPercent: nextProgress,
      completedAt: nextCompletedAt,
    };
  }

  // Rule 4: Progress lowered below 100% on a completed goal (without requesting completed/archived) -> reopen to active
  if (
    params.existingStatus === 'completed' &&
    params.requestedProgress !== undefined &&
    params.requestedProgress < 100 &&
    params.requestedStatus === undefined
  ) {
    nextStatus = 'active';
    nextProgress = params.requestedProgress;
    nextCompletedAt = null;
    return {
      status: nextStatus,
      progressPercent: nextProgress,
      completedAt: nextCompletedAt,
    };
  }

  // Rule 5: Archiving preserves progress and completion timestamp
  if (nextStatus === 'archived') {
    return {
      status: 'archived',
      progressPercent: nextProgress,
      completedAt: nextCompletedAt,
    };
  }

  // Active or paused with <100%
  if (nextStatus === 'active' || nextStatus === 'paused') {
    nextCompletedAt = null;
  }

  return {
    status: nextStatus,
    progressPercent: nextProgress,
    completedAt: nextCompletedAt,
  };
}

export interface ValidatedInitialMilestoneInput {
  title: string;
  targetDate: string | null;
}

export interface ValidatedGoalCreateInput {
  title: string;
  description: string | null;
  category: GoalCategory;
  status: GoalStatus;
  targetDate: string | null;
  progressPercent: number;
  completedAt: Date | null;
  initialMilestones: ValidatedInitialMilestoneInput[];
}

export function validateGoalCreateInput(
  raw: Record<string, unknown>,
  now: Date = new Date()
):
  | { valid: true; data: ValidatedGoalCreateInput }
  | { valid: false; error: string; fieldErrors?: Record<string, string> } {
  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!rawTitle) {
    return {
      valid: false,
      error: 'Goal title is required.',
      fieldErrors: { title: 'Goal title is required.' },
    };
  }
  if (rawTitle.length > GOAL_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Goal title must be ${GOAL_TITLE_MAX_LENGTH} characters or fewer.`,
      fieldErrors: {
        title: `Goal title must be ${GOAL_TITLE_MAX_LENGTH} characters or fewer.`,
      },
    };
  }

  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== 'string') {
      return { valid: false, error: 'Description must be text.' };
    }
    const trimmedDesc = raw.description.trim();
    if (trimmedDesc.length > GOAL_DESCRIPTION_MAX_LENGTH) {
      return {
        valid: false,
        error: `Description must be ${GOAL_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
        fieldErrors: {
          description: `Description must be ${GOAL_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
        },
      };
    }
    description = trimmedDesc.length > 0 ? trimmedDesc : null;
  }

  const category = normalizeGoalCategory(raw.category);

  let targetDate: string | null = null;
  if (
    raw.targetDate !== undefined &&
    raw.targetDate !== null &&
    raw.targetDate !== ''
  ) {
    if (!isValidLocalDateString(raw.targetDate)) {
      return {
        valid: false,
        error: 'Target date must be a valid YYYY-MM-DD calendar date.',
        fieldErrors: {
          targetDate: 'Target date must be a valid YYYY-MM-DD calendar date.',
        },
      };
    }
    targetDate = raw.targetDate;
  }

  let requestedStatus: GoalStatus = 'active';
  if (raw.status !== undefined && raw.status !== null && raw.status !== '') {
    if (!isValidGoalStatus(raw.status)) {
      return {
        valid: false,
        error: "Status must be 'active', 'paused', 'completed', or 'archived'.",
      };
    }
    requestedStatus = raw.status;
  }

  let requestedProgress = 0;
  if (raw.progressPercent !== undefined && raw.progressPercent !== null) {
    const num =
      typeof raw.progressPercent === 'number'
        ? raw.progressPercent
        : Number(raw.progressPercent);
    if (!Number.isInteger(num) || num < 0 || num > 100) {
      return {
        valid: false,
        error: 'Progress must be an integer percentage from 0 to 100.',
        fieldErrors: {
          progressPercent:
            'Progress must be an integer percentage from 0 to 100.',
        },
      };
    }
    requestedProgress = num;
  }

  const resolved = resolveGoalStatusAndProgressOnMutation({
    existingStatus: 'active',
    existingProgress: 0,
    existingCompletedAt: null,
    requestedStatus,
    requestedProgress,
    now,
  });

  const initialMilestones: ValidatedInitialMilestoneInput[] = [];
  if (Array.isArray(raw.initialMilestones)) {
    for (const item of raw.initialMilestones) {
      if (item && typeof item === 'object') {
        const mObj = item as Record<string, unknown>;
        const mTitle =
          typeof mObj.title === 'string' ? mObj.title.trim() : '';
        if (mTitle && mTitle.length <= MILESTONE_TITLE_MAX_LENGTH) {
          const mDate =
            mObj.targetDate && isValidLocalDateString(mObj.targetDate)
              ? mObj.targetDate
              : null;
          initialMilestones.push({ title: mTitle, targetDate: mDate });
        }
      }
    }
  }

  return {
    valid: true,
    data: {
      title: rawTitle,
      description,
      category,
      status: resolved.status,
      targetDate,
      progressPercent: resolved.progressPercent,
      completedAt: resolved.completedAt,
      initialMilestones,
    },
  };
}

export interface ValidatedGoalUpdateInput {
  title?: string;
  description?: string | null;
  category?: GoalCategory;
  status?: GoalStatus;
  targetDate?: string | null;
  progressPercent?: number;
  progressNote?: string | null;
}

export function validateGoalUpdateInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedGoalUpdateInput }
  | { valid: false; error: string; fieldErrors?: Record<string, string> } {
  const data: ValidatedGoalUpdateInput = {};

  if ('title' in raw) {
    const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!rawTitle) {
      return {
        valid: false,
        error: 'Goal title cannot be empty.',
        fieldErrors: { title: 'Goal title cannot be empty.' },
      };
    }
    if (rawTitle.length > GOAL_TITLE_MAX_LENGTH) {
      return {
        valid: false,
        error: `Goal title must be ${GOAL_TITLE_MAX_LENGTH} characters or fewer.`,
        fieldErrors: {
          title: `Goal title must be ${GOAL_TITLE_MAX_LENGTH} characters or fewer.`,
        },
      };
    }
    data.title = rawTitle;
  }

  if ('description' in raw) {
    if (raw.description === null || raw.description === '') {
      data.description = null;
    } else if (typeof raw.description === 'string') {
      const trimmed = raw.description.trim();
      if (trimmed.length > GOAL_DESCRIPTION_MAX_LENGTH) {
        return {
          valid: false,
          error: `Description must be ${GOAL_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          fieldErrors: {
            description: `Description must be ${GOAL_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
          },
        };
      }
      data.description = trimmed.length > 0 ? trimmed : null;
    } else {
      return { valid: false, error: 'Description must be text.' };
    }
  }

  if ('category' in raw && raw.category !== undefined) {
    data.category = normalizeGoalCategory(raw.category);
  }

  if ('targetDate' in raw) {
    if (raw.targetDate === null || raw.targetDate === '') {
      data.targetDate = null;
    } else if (isValidLocalDateString(raw.targetDate)) {
      data.targetDate = raw.targetDate;
    } else {
      return {
        valid: false,
        error: 'Target date must be a valid YYYY-MM-DD calendar date.',
        fieldErrors: {
          targetDate: 'Target date must be a valid YYYY-MM-DD calendar date.',
        },
      };
    }
  }

  if ('status' in raw && raw.status !== undefined) {
    if (!isValidGoalStatus(raw.status)) {
      return {
        valid: false,
        error: "Status must be 'active', 'paused', 'completed', or 'archived'.",
      };
    }
    data.status = raw.status;
  }

  if ('progressPercent' in raw && raw.progressPercent !== undefined) {
    const num =
      typeof raw.progressPercent === 'number'
        ? raw.progressPercent
        : Number(raw.progressPercent);
    if (!Number.isInteger(num) || num < 0 || num > 100) {
      return {
        valid: false,
        error: 'Progress must be an integer percentage from 0 to 100.',
        fieldErrors: {
          progressPercent:
            'Progress must be an integer percentage from 0 to 100.',
        },
      };
    }
    data.progressPercent = num;
  }

  if ('progressNote' in raw) {
    if (raw.progressNote === null || raw.progressNote === '') {
      data.progressNote = null;
    } else if (typeof raw.progressNote === 'string') {
      const trimmedNote = raw.progressNote.trim();
      if (trimmedNote.length > PROGRESS_NOTE_MAX_LENGTH) {
        return {
          valid: false,
          error: `Progress note must be ${PROGRESS_NOTE_MAX_LENGTH} characters or fewer.`,
        };
      }
      data.progressNote = trimmedNote.length > 0 ? trimmedNote : null;
    }
  }

  if (Object.keys(data).length === 0) {
    return { valid: false, error: 'No valid goal fields provided to update.' };
  }

  return { valid: true, data };
}

export interface ValidatedMilestoneCreateInput {
  title: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
}

export function validateMilestoneCreateInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedMilestoneCreateInput }
  | { valid: false; error: string } {
  const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!rawTitle) {
    return { valid: false, error: 'Milestone title is required.' };
  }
  if (rawTitle.length > MILESTONE_TITLE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Milestone title must be ${MILESTONE_TITLE_MAX_LENGTH} characters or fewer.`,
    };
  }

  let description: string | null = null;
  if (raw.description !== undefined && raw.description !== null) {
    if (typeof raw.description !== 'string') {
      return { valid: false, error: 'Milestone description must be text.' };
    }
    const trimmed = raw.description.trim();
    if (trimmed.length > MILESTONE_DESCRIPTION_MAX_LENGTH) {
      return {
        valid: false,
        error: `Milestone description must be ${MILESTONE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      };
    }
    description = trimmed.length > 0 ? trimmed : null;
  }

  let targetDate: string | null = null;
  if (
    raw.targetDate !== undefined &&
    raw.targetDate !== null &&
    raw.targetDate !== ''
  ) {
    if (!isValidLocalDateString(raw.targetDate)) {
      return {
        valid: false,
        error: 'Milestone target date must be a valid YYYY-MM-DD date.',
      };
    }
    targetDate = raw.targetDate;
  }

  const status: MilestoneStatus =
    raw.status === 'completed' ? 'completed' : 'pending';

  return {
    valid: true,
    data: {
      title: rawTitle,
      description,
      targetDate,
      status,
    },
  };
}

export interface ValidatedMilestoneUpdateInput {
  title?: string;
  description?: string | null;
  targetDate?: string | null;
  status?: MilestoneStatus;
  sortOrder?: number;
}

export function validateMilestoneUpdateInput(
  raw: Record<string, unknown>
):
  | { valid: true; data: ValidatedMilestoneUpdateInput }
  | { valid: false; error: string } {
  const data: ValidatedMilestoneUpdateInput = {};

  if ('title' in raw) {
    const rawTitle = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!rawTitle) {
      return { valid: false, error: 'Milestone title cannot be empty.' };
    }
    if (rawTitle.length > MILESTONE_TITLE_MAX_LENGTH) {
      return {
        valid: false,
        error: `Milestone title must be ${MILESTONE_TITLE_MAX_LENGTH} characters or fewer.`,
      };
    }
    data.title = rawTitle;
  }

  if ('description' in raw) {
    if (raw.description === null || raw.description === '') {
      data.description = null;
    } else if (typeof raw.description === 'string') {
      const trimmed = raw.description.trim();
      if (trimmed.length > MILESTONE_DESCRIPTION_MAX_LENGTH) {
        return {
          valid: false,
          error: `Milestone description must be ${MILESTONE_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
        };
      }
      data.description = trimmed.length > 0 ? trimmed : null;
    } else {
      return { valid: false, error: 'Milestone description must be text.' };
    }
  }

  if ('targetDate' in raw) {
    if (raw.targetDate === null || raw.targetDate === '') {
      data.targetDate = null;
    } else if (isValidLocalDateString(raw.targetDate)) {
      data.targetDate = raw.targetDate;
    } else {
      return {
        valid: false,
        error: 'Milestone target date must be a valid YYYY-MM-DD date.',
      };
    }
  }

  if ('status' in raw && raw.status !== undefined) {
    if (raw.status !== 'pending' && raw.status !== 'completed') {
      return {
        valid: false,
        error: "Milestone status must be 'pending' or 'completed'.",
      };
    }
    data.status = raw.status;
  }

  if ('sortOrder' in raw && raw.sortOrder !== undefined) {
    const num =
      typeof raw.sortOrder === 'number'
        ? raw.sortOrder
        : Number(raw.sortOrder);
    if (!Number.isInteger(num) || num < 0) {
      return {
        valid: false,
        error: 'Milestone sort order must be a non-negative integer.',
      };
    }
    data.sortOrder = num;
  }

  if (Object.keys(data).length === 0) {
    return {
      valid: false,
      error: 'No valid milestone fields provided to update.',
    };
  }

  return { valid: true, data };
}

export function classifyGoalDeadline(params: {
  status: GoalStatus;
  targetDate: string | null;
  todayLocalDate: string;
}): {
  deadlineState: GoalDeadlineState;
  badgeLabel: string;
  relativeDeadlineLabel: string | null;
  daysUntilTarget: number | null;
} {
  const { status, targetDate, todayLocalDate } = params;

  // Completed and archived goals are NEVER marked overdue or due soon
  if (status === 'completed') {
    return {
      deadlineState: 'completed',
      badgeLabel: 'Completed',
      relativeDeadlineLabel: 'Completed',
      daysUntilTarget: null,
    };
  }

  if (status === 'archived') {
    return {
      deadlineState: 'archived',
      badgeLabel: 'Archived',
      relativeDeadlineLabel: null,
      daysUntilTarget: null,
    };
  }

  if (status === 'paused') {
    const days = targetDate
      ? diffCalendarDays(todayLocalDate, targetDate)
      : null;
    return {
      deadlineState: 'paused',
      badgeLabel: 'Paused',
      relativeDeadlineLabel: 'Paused',
      daysUntilTarget: days,
    };
  }

  if (!targetDate) {
    return {
      deadlineState: 'on_track',
      badgeLabel: 'On track',
      relativeDeadlineLabel: null,
      daysUntilTarget: null,
    };
  }

  const daysUntilTarget = diffCalendarDays(todayLocalDate, targetDate);

  if (daysUntilTarget < 0) {
    const overdueDays = Math.abs(daysUntilTarget);
    return {
      deadlineState: 'overdue',
      badgeLabel: 'Overdue',
      relativeDeadlineLabel:
        overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`,
      daysUntilTarget,
    };
  }

  if (daysUntilTarget === 0) {
    return {
      deadlineState: 'due_soon',
      badgeLabel: 'Due today',
      relativeDeadlineLabel: 'Due today',
      daysUntilTarget: 0,
    };
  }

  if (daysUntilTarget <= 7) {
    return {
      deadlineState: 'due_soon',
      badgeLabel: 'Due soon',
      relativeDeadlineLabel:
        daysUntilTarget === 1 ? 'In 1 day' : `In ${daysUntilTarget} days`,
      daysUntilTarget,
    };
  }

  return {
    deadlineState: 'on_track',
    badgeLabel: 'On track',
    relativeDeadlineLabel: `In ${daysUntilTarget} days`,
    daysUntilTarget,
  };
}

export interface SerializedGoalMilestone {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  targetDateLabel: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
  sortOrder: number;
  updatedAtLabel: string;
}

export interface SerializedGoalProgressEntry {
  id: string;
  goalId: string;
  progressPercent: number;
  note: string | null;
  createdAt: string;
  createdAtLabel: string;
}

export interface SerializedGoalItem {
  id: string;
  title: string;
  description: string | null;
  category: GoalCategory;
  status: GoalStatus;
  targetDate: string | null;
  targetDateLabel: string | null;
  progressPercent: number;
  completedAt: string | null;
  completedAtLabel: string | null;
  deadlineState: GoalDeadlineState;
  badgeLabel: string;
  relativeDeadlineLabel: string | null;
  daysUntilTarget: number | null;
  milestones: SerializedGoalMilestone[];
  completedMilestonesCount: number;
  totalMilestonesCount: number;
  progressHistory: SerializedGoalProgressEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface GoalsSummaryMetrics {
  totalNonArchivedCount: number;
  activeGoalsCount: number;
  pausedGoalsCount: number;
  onTrackActiveCount: number;
  completedGoalsCount: number;
  archivedGoalsCount: number;
  approachingDeadlinesCount: number; // active goals due within 0..7 days or overdue
  dueNext7DaysCount: number; // active goals due within 0..7 days
  overdueGoalsCount: number; // active goals past target_date
  overallActiveProgressPercent: number; // arithmetic mean across active goals (0 when empty)
}

export interface UpcomingGoalDeadlineItem {
  goalId: string;
  title: string;
  category: GoalCategory;
  targetDate: string;
  targetDateLabel: string;
  relativeDeadlineLabel: string;
  deadlineState: GoalDeadlineState;
  progressPercent: number;
}

export interface RecentMilestoneFeedItem {
  id: string;
  goalId: string;
  goalTitle: string;
  title: string;
  status: MilestoneStatus;
  dateLabel: string;
}

export interface GoalCategoryBreakdownItem {
  category: GoalCategory;
  count: number;
  averageProgressPercent: number;
}

export function buildGoalsViewModel(params: {
  goals: GoalRow[];
  milestones: GoalMilestoneRow[];
  progressEntries: GoalProgressEntryRow[];
  todayLocalDate: string;
  timezone?: string;
}): {
  todayLocalDate: string;
  timezone: string;
  summary: GoalsSummaryMetrics;
  goals: SerializedGoalItem[];
  upcomingDeadlines: UpcomingGoalDeadlineItem[];
  recentMilestones: RecentMilestoneFeedItem[];
  categoryBreakdown: GoalCategoryBreakdownItem[];
} {
  const tz = resolveValidTimezone(params.timezone || DEFAULT_TIMEZONE);
  const todayLocalDate = params.todayLocalDate;

  // Group milestones by goalId sorted by sortOrder ASC, createdAt ASC
  const milestonesByGoal = new Map<string, GoalMilestoneRow[]>();
  for (const m of params.milestones) {
    const list = milestonesByGoal.get(m.goalId) ?? [];
    list.push(m);
    milestonesByGoal.set(m.goalId, list);
  }
  for (const [gId, list] of milestonesByGoal.entries()) {
    list.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
    milestonesByGoal.set(gId, list);
  }

  // Group progress entries by goalId sorted chronologically (newest first for display, oldest first for chart)
  const historyByGoal = new Map<string, GoalProgressEntryRow[]>();
  for (const entry of params.progressEntries) {
    const list = historyByGoal.get(entry.goalId) ?? [];
    list.push(entry);
    historyByGoal.set(entry.goalId, list);
  }
  for (const [gId, list] of historyByGoal.entries()) {
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    historyByGoal.set(gId, list);
  }

  const serializedGoals: SerializedGoalItem[] = params.goals.map((g) => {
    const status: GoalStatus = isValidGoalStatus(g.status)
      ? g.status
      : 'active';
    const category = normalizeGoalCategory(
      (g as { category?: string }).category
    );
    const progressPercent = Math.min(100, Math.max(0, g.progressPercent));
    const deadlineMeta = classifyGoalDeadline({
      status,
      targetDate: g.targetDate ?? null,
      todayLocalDate,
    });

    const rawMilestones = milestonesByGoal.get(g.id) ?? [];
    const serializedMilestones: SerializedGoalMilestone[] = rawMilestones.map(
      (m) => {
        const mStatus: MilestoneStatus =
          m.status === 'completed' ? 'completed' : 'pending';
        const shortUpdated = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          month: 'short',
          day: 'numeric',
        }).format(new Date(m.updatedAt || m.createdAt));

        return {
          id: m.id,
          goalId: m.goalId,
          title: m.title,
          description: m.description ?? null,
          targetDate: m.targetDate ?? null,
          targetDateLabel: formatShortDate(m.targetDate, tz),
          status: mStatus,
          completedAt: m.completedAt
            ? new Date(m.completedAt).toISOString()
            : null,
          sortOrder: m.sortOrder,
          updatedAtLabel: m.targetDate
            ? new Intl.DateTimeFormat('en-US', {
                timeZone: 'UTC',
                month: 'short',
                day: 'numeric',
              }).format(
                new Date(
                  Date.UTC(
                    Number(m.targetDate.split('-')[0]),
                    Number(m.targetDate.split('-')[1]) - 1,
                    Number(m.targetDate.split('-')[2]),
                    12,
                    0,
                    0
                  )
                )
              )
            : shortUpdated,
        };
      }
    );

    const completedMilestonesCount = serializedMilestones.filter(
      (m) => m.status === 'completed'
    ).length;

    const rawHistory = historyByGoal.get(g.id) ?? [];
    const progressHistory: SerializedGoalProgressEntry[] = rawHistory.map(
      (entry) => ({
        id: entry.id,
        goalId: entry.goalId,
        progressPercent: Math.min(100, Math.max(0, entry.progressPercent)),
        note: entry.note ?? null,
        createdAt: new Date(entry.createdAt).toISOString(),
        createdAtLabel: new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(entry.createdAt)),
      })
    );

    return {
      id: g.id,
      title: g.title,
      description: g.description ?? null,
      category,
      status,
      targetDate: g.targetDate ?? null,
      targetDateLabel: formatShortDate(g.targetDate, tz),
      progressPercent,
      completedAt: g.completedAt ? new Date(g.completedAt).toISOString() : null,
      completedAtLabel: formatShortDate(g.completedAt, tz),
      deadlineState: deadlineMeta.deadlineState,
      badgeLabel: deadlineMeta.badgeLabel,
      relativeDeadlineLabel: deadlineMeta.relativeDeadlineLabel,
      daysUntilTarget: deadlineMeta.daysUntilTarget,
      milestones: serializedMilestones,
      completedMilestonesCount,
      totalMilestonesCount: serializedMilestones.length,
      progressHistory,
      createdAt: new Date(g.createdAt).toISOString(),
      updatedAt: new Date(g.updatedAt).toISOString(),
    };
  });

  // Summary calculations
  const activeGoals = serializedGoals.filter((g) => g.status === 'active');
  const pausedGoals = serializedGoals.filter((g) => g.status === 'paused');
  const completedGoals = serializedGoals.filter(
    (g) => g.status === 'completed'
  );
  const archivedGoals = serializedGoals.filter((g) => g.status === 'archived');
  const nonArchivedGoals = serializedGoals.filter(
    (g) => g.status !== 'archived'
  );

  const onTrackActiveCount = activeGoals.filter(
    (g) => g.deadlineState === 'on_track'
  ).length;
  const dueNext7DaysCount = activeGoals.filter(
    (g) => g.deadlineState === 'due_soon'
  ).length;
  const overdueGoalsCount = activeGoals.filter(
    (g) => g.deadlineState === 'overdue'
  ).length;
  const approachingDeadlinesCount = dueNext7DaysCount + overdueGoalsCount;

  // Arithmetic mean of progress_percent over active goals (0 when empty, never NaN)
  const overallActiveProgressPercent =
    activeGoals.length > 0
      ? Math.round(
          activeGoals.reduce((sum, g) => sum + g.progressPercent, 0) /
            activeGoals.length
        )
      : 0;

  // Upcoming deadlines (active goals with a target date, sorted by nearest targetDate ASC)
  const upcomingDeadlines: UpcomingGoalDeadlineItem[] = activeGoals
    .filter((g) => g.targetDate !== null && g.targetDateLabel !== null)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!))
    .slice(0, 5)
    .map((g) => ({
      goalId: g.id,
      title: g.title,
      category: g.category,
      targetDate: g.targetDate!,
      targetDateLabel: g.targetDateLabel!,
      relativeDeadlineLabel: g.relativeDeadlineLabel ?? g.badgeLabel,
      deadlineState: g.deadlineState,
      progressPercent: g.progressPercent,
    }));

  // Recent milestones across non-archived goals
  const allMilestoneItems: Array<
    RecentMilestoneFeedItem & { sortTimestampMs: number }
  > = [];
  for (const g of nonArchivedGoals) {
    for (const m of g.milestones) {
      allMilestoneItems.push({
        id: m.id,
        goalId: g.id,
        goalTitle: g.title,
        title: m.title,
        status: m.status,
        dateLabel: m.updatedAtLabel,
        sortTimestampMs: m.completedAt
          ? new Date(m.completedAt).getTime()
          : new Date(g.updatedAt).getTime() - m.sortOrder * 1000,
      });
    }
  }
  allMilestoneItems.sort((a, b) => b.sortTimestampMs - a.sortTimestampMs);
  const recentMilestones: RecentMilestoneFeedItem[] = allMilestoneItems
    .slice(0, 6)
    .map(({ sortTimestampMs: _unused, ...item }) => item);

  // Category breakdown across non-archived goals
  const categoryBreakdown: GoalCategoryBreakdownItem[] = GOAL_CATEGORIES.map(
    (category) => {
      const matching = nonArchivedGoals.filter((g) => g.category === category);
      const avg =
        matching.length > 0
          ? Math.round(
              matching.reduce((acc, g) => acc + g.progressPercent, 0) /
                matching.length
            )
          : 0;
      return {
        category,
        count: matching.length,
        averageProgressPercent: avg,
      };
    }
  );

  return {
    todayLocalDate,
    timezone: tz,
    summary: {
      totalNonArchivedCount: nonArchivedGoals.length,
      activeGoalsCount: activeGoals.length,
      pausedGoalsCount: pausedGoals.length,
      onTrackActiveCount,
      completedGoalsCount: completedGoals.length,
      archivedGoalsCount: archivedGoals.length,
      approachingDeadlinesCount,
      dueNext7DaysCount,
      overdueGoalsCount,
      overallActiveProgressPercent,
    },
    goals: serializedGoals,
    upcomingDeadlines,
    recentMilestones,
    categoryBreakdown,
  };
}

export type GoalsViewModel = ReturnType<typeof buildGoalsViewModel>;

export function filterAndSortGoals(params: {
  goals: SerializedGoalItem[];
  filterTab: GoalFilterTab;
  categoryFilter?: GoalCategory | 'all';
  searchQuery: string;
  sortBy: GoalSortOption;
}): SerializedGoalItem[] {
  const {
    goals,
    filterTab,
    categoryFilter = 'all',
    searchQuery,
    sortBy,
  } = params;

  let filtered = goals.filter((g) => {
    if (filterTab === 'active') {
      return g.status === 'active' || g.status === 'paused';
    }
    if (filterTab === 'completed') {
      return g.status === 'completed';
    }
    if (filterTab === 'archived') {
      return g.status === 'archived';
    }
    // 'all' shows all non-archived goals
    return g.status !== 'archived';
  });

  if (categoryFilter !== 'all') {
    filtered = filtered.filter((g) => g.category === categoryFilter);
  }

  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        g.category.toLowerCase().includes(q) ||
        g.milestones.some((m) => m.title.toLowerCase().includes(q))
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'progress_desc') {
      if (b.progressPercent !== a.progressPercent) {
        return b.progressPercent - a.progressPercent;
      }
    } else if (sortBy === 'progress_asc') {
      if (a.progressPercent !== b.progressPercent) {
        return a.progressPercent - b.progressPercent;
      }
    } else if (sortBy === 'title_asc') {
      return a.title.localeCompare(b.title);
    } else if (sortBy === 'updated_desc') {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    } else {
      // 'target_date' default: active/due first, then nearest targetDate ASC, then updatedAt DESC
      const aDone = a.status === 'completed' ? 1 : 0;
      const bDone = b.status === 'completed' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;

      if (a.targetDate && b.targetDate) {
        const cmp = a.targetDate.localeCompare(b.targetDate);
        if (cmp !== 0) return cmp;
      } else if (a.targetDate) {
        return -1;
      } else if (b.targetDate) {
        return 1;
      }
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return sorted;
}
