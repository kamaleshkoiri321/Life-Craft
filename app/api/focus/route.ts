import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  getFocusWorkspaceForUser,
  startFocusSessionForUser,
} from '@/lib/queries/focus';
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
        message: 'Please sign in to access Focus Studio.',
      },
      { status: 401 }
    );
  }

  const result = await getFocusWorkspaceForUser({
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    image: user.image ?? null,
  });

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'db_unconfigured'
        ? 503
        : 500;

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
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
      {
        status: 'unauthenticated',
        message: 'Please sign in to start a focus session.',
      },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(`focus:post:${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Too many focus session requests. Please wait a moment.',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
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

  const result = await startFocusSessionForUser(
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
        : result.status === 'not_found'
          ? 404
          : 500;

  return NextResponse.json(result, { status: statusCode });
}
