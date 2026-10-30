import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { deleteTaskForUser, updateTaskForUser } from '@/lib/queries/tasks';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
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
          message: 'Please sign in to update this task.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rateCheck = checkRateLimit(`task_patch_${authUser.id}`, {
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

    const { taskId } = await context.params;

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

    const result = await updateTaskForUser(authUser, taskId, body);

    if (result.status === 'validation_error') {
      return NextResponse.json(result, {
        status: 400,
        headers: NO_STORE_HEADERS,
      });
    }

    if (result.status === 'not_found') {
      return NextResponse.json(result, {
        status: 404,
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
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to update task right now.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
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
          message: 'Please sign in to delete this task.',
        },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rateCheck = checkRateLimit(`task_delete_${authUser.id}`, {
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

    const { taskId } = await context.params;
    const result = await deleteTaskForUser(authUser, taskId);

    if (result.status === 'not_found') {
      return NextResponse.json(result, {
        status: 404,
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
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return NextResponse.json(
      {
        status: 'error',
        message: 'Unable to delete task right now.',
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
