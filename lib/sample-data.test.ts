import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_SAMPLE_TASKS,
  INITIAL_SAMPLE_HABITS,
  SAMPLE_WEEKLY_PROGRESS,
  SAMPLE_UPCOMING_GOALS,
  CORE_FEATURES,
  HOW_IT_WORKS_STEPS,
  calculateTaskSummary,
  filterSampleTasks,
  calculateWeeklyCompletionRate,
} from './sample-data';

test('calculateTaskSummary computes accurate completion counts and percentages', () => {
  const summary = calculateTaskSummary(INITIAL_SAMPLE_TASKS);
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.completionPercentage, 40);

  const emptySummary = calculateTaskSummary([]);
  assert.equal(emptySummary.totalCount, 0);
  assert.equal(emptySummary.completedCount, 0);
  assert.equal(emptySummary.completionPercentage, 0);
});

test('filterSampleTasks filters by category or returns all tasks', () => {
  const allTasks = filterSampleTasks(INITIAL_SAMPLE_TASKS, 'All');
  assert.equal(allTasks.length, 5);

  const careerTasks = filterSampleTasks(INITIAL_SAMPLE_TASKS, 'Career');
  assert.equal(careerTasks.length, 2);
  assert.ok(careerTasks.every((t) => t.category === 'Career'));
});

test('calculateWeeklyCompletionRate aggregates weekly progress accurately', () => {
  const stats = calculateWeeklyCompletionRate(SAMPLE_WEEKLY_PROGRESS);
  assert.equal(stats.completedTotal, 22);
  assert.equal(stats.plannedTotal, 32);
  assert.equal(stats.ratePercent, 69);
  assert.equal(stats.totalFocusHours, '8.8');
});

test('Phase 1 required content structures and unique local images match specification', () => {
  assert.equal(CORE_FEATURES.length, 4);
  assert.equal(CORE_FEATURES[0].title, 'Plan your day');
  assert.equal(CORE_FEATURES[1].title, 'Build better habits');
  assert.equal(CORE_FEATURES[2].title, 'Track your goals');
  assert.equal(
    CORE_FEATURES[3].title,
    'Keep your thoughts and resources together'
  );

  const featureImages = new Set(CORE_FEATURES.map((f) => f.imageSrc));
  assert.equal(featureImages.size, 4);
  assert.ok(
    CORE_FEATURES.every(
      (f) => f.imageSrc.startsWith('/images/') && f.imageAlt.length > 10
    )
  );

  assert.equal(HOW_IT_WORKS_STEPS.length, 3);
  assert.equal(HOW_IT_WORKS_STEPS[0].title, 'Organize what matters.');
  assert.equal(
    HOW_IT_WORKS_STEPS[1].title,
    'Build routines that fit your life.'
  );
  assert.equal(
    HOW_IT_WORKS_STEPS[2].title,
    'Reflect on your progress and improve.'
  );

  const stepImages = new Set(HOW_IT_WORKS_STEPS.map((s) => s.imageSrc));
  assert.equal(stepImages.size, 3);
  assert.ok(
    HOW_IT_WORKS_STEPS.every(
      (s) => s.imageSrc.startsWith('/images/') && s.imageAlt.length > 10
    )
  );

  assert.ok(INITIAL_SAMPLE_HABITS.length >= 3);
  assert.ok(SAMPLE_UPCOMING_GOALS.length >= 3);
});
