import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { exportTaskToGoogleCalendarForUser } from '@/lib/calendar/google-calendar';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const originCheck = verifySameOriginMutation(req);
  if (!originCheck.ok) {
    return NextResponse.json(
      { status: 'forbidden', message: originCheck.message },
      { status: 403 }
    );
  }

  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      {
        status: 'unauthenticated',
        message: 'Please sign in to export tasks to Google Calendar.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`gcal_export_${user.id}`, {
    limit: 60,
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
          'Retry-After': String(rateCheck.retryAfterSeconds),
        },
      }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Invalid JSON request body.',
      },
      { status: 400 }
    );
  }

  const taskId = typeof body.taskId === 'string' ? body.taskId.trim() : '';
  if (!taskId) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Please provide a valid taskId to export.',
      },
      { status: 400 }
    );
  }

  const result = await exportTaskToGoogleCalendarForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    taskId
  );

  const statusCode =
    result.status === 'ok' || result.status === 'already_exported'
      ? 200
      : result.status === 'not_found'
        ? 404
        : result.status === 'validation_error'
          ? 400
          : result.status === 'auth_error'
            ? 401
            : 500;

  return NextResponse.json(result, { status: statusCode });
}
