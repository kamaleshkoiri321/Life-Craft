import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  createCalendarEvent,
  listCalendarEventsForUser,
} from '@/lib/queries/events';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      { status: 'unauthenticated', message: 'Please sign in to view events.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  const category = searchParams.get('category') || undefined;
  const search = searchParams.get('search') || undefined;
  const timezone = searchParams.get('timezone') || undefined;

  const startUtc = startStr ? new Date(startStr) : undefined;
  const endUtc = endStr ? new Date(endStr) : undefined;

  const res = await listCalendarEventsForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    },
    {
      startUtc,
      endUtc,
      category,
      search,
      timezone,
    }
  );

  return NextResponse.json(res, {
    status: res.status === 'ok' ? 200 : res.status === 'unconfigured' ? 503 : 500,
  });
}

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
      { status: 'unauthenticated', message: 'Please sign in to create events.' },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`event_create_${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const res = await createCalendarEvent(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      },
      body
    );

    return NextResponse.json(res, {
      status:
        res.status === 'ok'
          ? 201
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

