import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { createGoalForUser, getGoalsForUser } from '@/lib/queries/goals';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      {
        status: 'unauthenticated',
        message: 'Please sign in to view your goals.',
      },
      { status: 401 }
    );
  }

  const result = await getGoalsForUser({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    image: user.image ?? null,
  });

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'unconfigured'
        ? 503
        : 500;

  return NextResponse.json(result, { status: statusCode });
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
      {
        status: 'unauthenticated',
        message: 'Please sign in to create a goal.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`goal_post_${user.id}`, {
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
          'Retry-After': String(rateCheck.retryAfterSeconds),
        },
      }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Invalid JSON request payload.',
      },
      { status: 400 }
    );
  }

  const result = await createGoalForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    body
  );

  const statusCode =
    result.status === 'ok'
      ? 201
      : result.status === 'validation_error'
        ? 400
        : result.status === 'unconfigured'
          ? 503
          : 500;

  return NextResponse.json(result, { status: statusCode });
}
