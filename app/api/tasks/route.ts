import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { createTaskForUser, listTasksForUser } from '@/lib/queries/tasks';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';
import {
  isValidTaskPriority,
  isValidTaskStatus,
  TASK_SCHEDULE_FILTERS,
  TASK_SORT_FIELDS,
  type TaskListFilters,
  type TaskScheduleFilter,
  type TaskSortField,
} from '@/lib/tasks/validation';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

async function getAuthenticatedSessionUser() {
  const sessionResult = await getResilientServerSession();
  const sessionUser = sessionResult?.data?.user;
  const sessionObj = sessionResult?.data?.session;

  if (!sessionUser || !sessionObj) {
    return null;
  }

  return {
    id: sessionUser.id,
    name: sessionUser.name ?? null,
    email: sessionUser.email,
    emailVerified: Boolean(sessionUser.emailVerified),
    image: sessionUser.image ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedSessionUser();
    if (!authUser) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please sign in to access your tasks.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get('search') ?? '';
    const rawStatus = searchParams.get('status') ?? 'all';
    const rawPriority = searchParams.get('priority') ?? 'all';
    const rawSchedule = searchParams.get('schedule') ?? 'all';
    const rawSortBy = searchParams.get('sortBy') ?? 'due_date';

    const filters: TaskListFilters = {
      search: rawSearch,
      status:
        rawStatus === 'all' || isValidTaskStatus(rawStatus) ? rawStatus : 'all',
      priority:
        rawPriority === 'all' || isValidTaskPriority(rawPriority)
          ? rawPriority
          : 'all',
      schedule: (TASK_SCHEDULE_FILTERS as readonly string[]).includes(
        rawSchedule
      )
        ? (rawSchedule as TaskScheduleFilter)
        : 'all',
      sortBy: (TASK_SORT_FIELDS as readonly string[]).includes(rawSortBy)
        ? (rawSortBy as TaskSortField)
        : 'due_date',
      limit: 200,
    };

    const result = await listTasksForUser(authUser, filters);
    if (result.status !== 'ok') {
      return NextResponse.json(result, {
        status: result.status === 'unconfigured' ? 503 : 500,
        headers: NO_STORE_HEADERS,
      });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to load your tasks right now.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: NextRequest) {
  const originCheck = verifySameOriginMutation(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { status: 'forbidden', message: originCheck.message },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const authUser = await getAuthenticatedSessionUser();
    if (!authUser) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please sign in to create a task.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rateCheck = checkRateLimit(`task_post_${authUser.id}`, {
      limit: 120,
      windowMs: 60_000,
    });
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          status: 'rate_limited',
          message: 'Too many requests. Please try again shortly.',
        },
        {
          status: 429,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(rateCheck.retryAfterSeconds),
          },
        }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        {
          status: 'validation_error',
          message: 'Invalid request payload.',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await createTaskForUser(authUser, body);

    if (result.status === 'validation_error') {
      return NextResponse.json(result, {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }

    if (result.status !== 'ok') {
      return NextResponse.json(result, {
        status: result.status === 'unconfigured' ? 503 : 500,
        headers: NO_STORE_HEADERS,
      });
    }

    return NextResponse.json(result, {
      status: 201,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to create task right now.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
