import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalsViewModel,
  classifyGoalDeadline,
  filterAndSortGoals,
  resolveGoalStatusAndProgressOnMutation,
  validateGoalCreateInput,
  validateGoalUpdateInput,
  validateMilestoneCreateInput,
  validateMilestoneUpdateInput,
} from './goal-utils';
import type {
  GoalMilestoneRow,
  GoalProgressEntryRow,
  GoalRow,
} from '../db/schema';

test('validateGoalCreateInput enforces required title, valid progress 0..100, and auto-completes 100% goals', () => {
  const missingTitle = validateGoalCreateInput({ title: '   ' });
  assert.equal(missingTitle.valid, false);

  const invalidProgress = validateGoalCreateInput({
    title: 'Read 12 books',
    progressPercent: 120,
  });
  assert.equal(invalidProgress.valid, false);

  const validActive = validateGoalCreateInput({
    title: 'Learn Next.js and build a project',
    description: 'Deepen my knowledge of Next.js and build a full-stack project.',
    category: 'Personal Growth',
    targetDate: '2026-12-31',
    progressPercent: 60,
  });
  assert.equal(validActive.valid, true);
  if (validActive.valid) {
    assert.equal(validActive.data.title, 'Learn Next.js and build a project');
    assert.equal(validActive.data.category, 'Personal Growth');
    assert.equal(validActive.data.status, 'active');
    assert.equal(validActive.data.progressPercent, 60);
    assert.equal(validActive.data.completedAt, null);
  }

  const autoComplete = validateGoalCreateInput({
    title: 'Save for a new laptop',
    category: 'Finance',
    progressPercent: 100,
  });
  assert.equal(autoComplete.valid, true);
  if (autoComplete.valid) {
    assert.equal(autoComplete.data.status, 'completed');
    assert.equal(autoComplete.data.progressPercent, 100);
    assert.ok(autoComplete.data.completedAt instanceof Date);
  }
});

test('resolveGoalStatusAndProgressOnMutation handles completion, reopening, and archiving consistently', () => {
  const now = new Date('2026-10-28T12:00:00Z');

  // Reaching 100% marks active goal completed
  const reached100 = resolveGoalStatusAndProgressOnMutation({
    existingStatus: 'active',
    existingProgress: 50,
    existingCompletedAt: null,
    requestedProgress: 100,
    now,
  });
  assert.equal(reached100.status, 'completed');
  assert.equal(reached100.progressPercent, 100);
  assert.deepEqual(reached100.completedAt, now);

  // Lowering progress below 100% on a completed goal reopens it to active and clears completedAt
  const lowered = resolveGoalStatusAndProgressOnMutation({
    existingStatus: 'completed',
    existingProgress: 100,
    existingCompletedAt: now,
    requestedProgress: 75,
    now,
  });
  assert.equal(lowered.status, 'active');
  assert.equal(lowered.progressPercent, 75);
  assert.equal(lowered.completedAt, null);

  // Explicitly reopening a completed goal clears completedAt
  const reopened = resolveGoalStatusAndProgressOnMutation({
    existingStatus: 'completed',
    existingProgress: 100,
    existingCompletedAt: now,
    requestedStatus: 'active',
    now,
  });
  assert.equal(reopened.status, 'active');
  assert.equal(reopened.completedAt, null);
  assert.equal(reopened.progressPercent, 90);
});

test('classifyGoalDeadline distinguishes overdue, due_soon, on_track, and never marks completed/archived goals overdue', () => {
  const today = '2026-10-28';

  const overdueActive = classifyGoalDeadline({
    status: 'active',
    targetDate: '2026-10-20',
    todayLocalDate: today,
  });
  assert.equal(overdueActive.deadlineState, 'overdue');
  assert.equal(overdueActive.badgeLabel, 'Overdue');
  assert.equal(overdueActive.relativeDeadlineLabel, '8 days overdue');

  const dueSoonActive = classifyGoalDeadline({
    status: 'active',
    targetDate: '2026-11-02',
    todayLocalDate: today,
  });
  assert.equal(dueSoonActive.deadlineState, 'due_soon');
  assert.equal(dueSoonActive.badgeLabel, 'Due soon');
  assert.equal(dueSoonActive.relativeDeadlineLabel, 'In 5 days');

  const onTrackActive = classifyGoalDeadline({
    status: 'active',
    targetDate: '2026-12-31',
    todayLocalDate: today,
  });
  assert.equal(onTrackActive.deadlineState, 'on_track');
  assert.equal(onTrackActive.badgeLabel, 'On track');

  // Completed goal with past targetDate must NEVER be marked overdue
  const completedPastDate = classifyGoalDeadline({
    status: 'completed',
    targetDate: '2026-09-15',
    todayLocalDate: today,
  });
  assert.equal(completedPastDate.deadlineState, 'completed');
  assert.equal(completedPastDate.badgeLabel, 'Completed');

  // Archived goal with past targetDate must NEVER be marked overdue
  const archivedPastDate = classifyGoalDeadline({
    status: 'archived',
    targetDate: '2026-09-15',
    todayLocalDate: today,
  });
  assert.equal(archivedPastDate.deadlineState, 'archived');
  assert.equal(archivedPastDate.badgeLabel, 'Archived');
});

test('buildGoalsViewModel computes accurate summary cards, arithmetic mean progress without NaN, and milestone counts', () => {
  const today = '2026-10-28';
  const now = new Date('2026-10-28T10:00:00Z');

  // Empty state must return 0% overall progress (never NaN)
  const emptyVm = buildGoalsViewModel({
    goals: [],
    milestones: [],
    progressEntries: [],
    todayLocalDate: today,
  });
  assert.equal(emptyVm.summary.activeGoalsCount, 0);
  assert.equal(emptyVm.summary.overallActiveProgressPercent, 0);
  assert.equal(Number.isNaN(emptyVm.summary.overallActiveProgressPercent), false);

  const sampleGoals: GoalRow[] = [
    {
      id: 'g-1',
      userId: 'u-1',
      title: 'Learn Next.js and build a project',
      description: 'Deepen my knowledge',
      category: 'Personal Growth',
      status: 'active',
      targetDate: '2026-12-31',
      progressPercent: 60,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-2',
      userId: 'u-1',
      title: 'Get in better shape',
      description: 'Exercise regularly',
      category: 'Health & Fitness',
      status: 'active',
      targetDate: '2026-11-02', // 5 days from 2026-10-28 -> due_soon
      progressPercent: 50,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-3',
      userId: 'u-1',
      title: 'Save for a new laptop',
      description: 'Savings plan',
      category: 'Finance',
      status: 'completed',
      targetDate: '2026-09-15',
      progressPercent: 100,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const sampleMilestones: GoalMilestoneRow[] = [
    {
      id: 'm-1',
      goalId: 'g-1',
      userId: 'u-1',
      title: 'Set up Next.js project',
      description: null,
      targetDate: '2026-10-20',
      status: 'completed',
      completedAt: now,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'm-2',
      goalId: 'g-1',
      userId: 'u-1',
      title: 'Complete authentication',
      description: null,
      targetDate: '2026-10-25',
      status: 'pending',
      completedAt: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const sampleEntries: GoalProgressEntryRow[] = [
    {
      id: 'p-1',
      goalId: 'g-1',
      userId: 'u-1',
      progressPercent: 60,
      note: 'Completed routing and auth',
      createdAt: now,
    },
  ];

  const vm = buildGoalsViewModel({
    goals: sampleGoals,
    milestones: sampleMilestones,
    progressEntries: sampleEntries,
    todayLocalDate: today,
  });

  assert.equal(vm.summary.activeGoalsCount, 2);
  assert.equal(vm.summary.completedGoalsCount, 1);
  assert.equal(vm.summary.approachingDeadlinesCount, 1);
  assert.equal(vm.summary.overallActiveProgressPercent, 55); // (60 + 50) / 2 = 55%

  const g1 = vm.goals.find((g) => g.id === 'g-1')!;
  assert.equal(g1.completedMilestonesCount, 1);
  assert.equal(g1.totalMilestonesCount, 2);
  assert.equal(g1.progressHistory.length, 1);

  const activeFiltered = filterAndSortGoals({
    goals: vm.goals,
    filterTab: 'active',
    searchQuery: '',
    sortBy: 'target_date',
  });
  assert.equal(activeFiltered.length, 2);
  assert.equal(activeFiltered[0].id, 'g-2'); // Nov 2 comes before Dec 31
});

test('validateGoalUpdateInput and validateMilestoneCreateInput/UpdateInput validate fields properly', () => {
  const badUpdate = validateGoalUpdateInput({});
  assert.equal(badUpdate.valid, false);

  const okUpdate = validateGoalUpdateInput({
    progressPercent: 85,
    progressNote: 'Finished milestone 3',
  });
  assert.equal(okUpdate.valid, true);

  const okMilestone = validateMilestoneCreateInput({
    title: 'Deploy to production',
    targetDate: '2026-11-15',
  });
  assert.equal(okMilestone.valid, true);

  const badMilestoneUpdate = validateMilestoneUpdateInput({
    status: 'invalid_status',
  });
  assert.equal(badMilestoneUpdate.valid, false);
});
