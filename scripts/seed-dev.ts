import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

import { eq } from 'drizzle-orm';
import { getDb, schema } from '../lib/db';
import { getLocalDateString } from '../lib/queries/timezone';

/**
 * Explicit development-only seed utility for LifeCraft Phase 3.
 *
 * Rules:
 * - Refuses to run when NODE_ENV === 'production'.
 * - Requires an explicit `--user-id=<id>` CLI argument.
 * - Never executes automatically during user sign-in or dashboard loads.
 *
 * Usage:
 *   npm run db:seed:dev -- --user-id=<authenticated-neon-auth-user-id>
 */

async function seedDevelopmentData() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Development seeding is strictly disabled in production environments.'
    );
  }

  const userIdArg = process.argv.find((arg) => arg.startsWith('--user-id='));
  const userId = userIdArg?.split('=')[1]?.trim();

  if (!userId) {
    throw new Error(
      'Missing required argument: --user-id=<authenticated-user-id>'
    );
  }

  const db = getDb();
  const timezone = 'Asia/Kathmandu';
  const now = new Date();
  const todayLocal = getLocalDateString(now, timezone);

  // Ensure profile and preferences exist
  await db
    .insert(schema.userProfiles)
    .values({
      userId,
      displayName: 'Alex',
      timezone,
    })
    .onConflictDoNothing({ target: schema.userProfiles.userId });

  await db
    .insert(schema.userPreferences)
    .values({
      userId,
      theme: 'light',
      weekStartsOn: 1,
    })
    .onConflictDoNothing({ target: schema.userPreferences.userId });

  const existingTasks = await db
    .select({ id: schema.tasks.id })
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, userId))
    .limit(1);

  if (existingTasks.length > 0) {
    console.log(
      `[LifeCraft Dev Seed] User ${userId} already has application records. Skipping seed to preserve existing data.`
    );
    return;
  }

  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const threeHoursLater = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  await db.insert(schema.tasks).values([
    {
      userId,
      title: 'Review weekly priorities & calendar blocks',
      description: 'Align top three outcomes for the week.',
      status: 'todo',
      priority: 'high',
      dueAt: oneHourLater,
      sortOrder: 1,
    },
    {
      userId,
      title: 'Read 20 pages of deep-focus book',
      description: 'Take brief synthesis notes in LifeCraft.',
      status: 'completed',
      priority: 'medium',
      dueAt: oneHourAgo,
      completedAt: oneHourAgo,
      sortOrder: 2,
    },
    {
      userId,
      title: '30-minute outdoor walk without phone',
      description: 'Reset energy before evening study block.',
      status: 'todo',
      priority: 'low',
      dueAt: threeHoursLater,
      sortOrder: 3,
    },
  ]);

  const insertedHabits = await db
    .insert(schema.habits)
    .values([
      {
        userId,
        title: 'Read 20 pages',
        description: 'Daily non-fiction or literature reading',
        targetPerWeek: 7,
        isActive: true,
      },
      {
        userId,
        title: 'Morning movement',
        description: '20 minutes of mobility, running, or strength',
        targetPerWeek: 5,
        isActive: true,
      },
      {
        userId,
        title: 'Evening reflection journal',
        description: 'Write 3 lines before bed',
        targetPerWeek: 7,
        isActive: true,
      },
    ])
    .returning({ id: schema.habits.id });

  if (insertedHabits[0]) {
    await db
      .insert(schema.habitLogs)
      .values({
        habitId: insertedHabits[0].id,
        userId,
        completedOn: todayLocal,
        status: 'completed',
      })
      .onConflictDoNothing();
  }

  await db.insert(schema.goals).values([
    {
      userId,
      title: 'Master full-stack TypeScript & PostgreSQL architecture',
      description: 'Build and ship production-grade modules with clean tests.',
      status: 'active',
      targetDate: '2026-12-15',
      progressPercent: 70,
    },
    {
      userId,
      title: 'Complete 30 consecutive days of calm morning routine',
      description: 'Hydrate, stretch, and plan before checking messages.',
      status: 'active',
      targetDate: '2026-11-30',
      progressPercent: 45,
    },
  ]);

  await db.insert(schema.notes).values([
    {
      userId,
      title: 'Weekly reflection principles',
      content:
        'Focus on energy management, single-tasking, and keeping daily commitments realistic.',
      isPinned: true,
    },
    {
      userId,
      title: 'Reading list — Autumn quarter',
      content:
        '1. Designing Data-Intensive Applications\n2. Deep Work\n3. Four Thousand Weeks',
      isPinned: false,
    },
  ]);

  console.log(`[LifeCraft Dev Seed] Seeded sample development records for user ${userId}.`);
}

if (require.main === module) {
  seedDevelopmentData().catch((err) => {
    console.error('[LifeCraft Dev Seed] Failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
