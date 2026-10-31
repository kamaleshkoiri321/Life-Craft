import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  deleteCalendarEvent,
  getCalendarEventById,
  updateCalendarEvent,
} from '@/lib/queries/events';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      { status: 'unauthenticated', message: 'Please sign in.' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const res = await getCalendarEventById(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    },
    id
  );

  return NextResponse.json(res, {
    status:
      res.status === 'ok' ? 200 : res.status === 'not_found' ? 404 : 500,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
      { status: 'unauthenticated', message: 'Please sign in.' },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`event_update_${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  try {
    const body = await req.json();
    const res = await updateCalendarEvent(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      },
      id,
      body
    );

    return NextResponse.json(res, {
      status:
        res.status === 'ok'
          ? 200
          : res.status === 'not_found'
            ? 404
            : res.status === 'validation_error'
              ? 400
              : 500,
    });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Invalid JSON request payload.' },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
      { status: 'unauthenticated', message: 'Please sign in.' },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`event_delete_${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  const { id } = await context.params;
  const res = await deleteCalendarEvent(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    },
    id
  );

  return NextResponse.json(res, {
    status:
      res.status === 'ok' ? 200 : res.status === 'not_found' ? 404 : 500,
  });
}

