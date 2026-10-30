import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { disconnectGoogleCalendarForUser } from '@/lib/calendar/google-calendar';
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
        message: 'Please sign in to manage your Google Calendar connection.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`gcal_disconnect_${user.id}`, {
    limit: 30,
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

  const result = await disconnectGoogleCalendarForUser({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    image: user.image ?? null,
  });

  return NextResponse.json(result, {
    status: result.status === 'ok' ? 200 : 500,
  });
}
