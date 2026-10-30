import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  deleteFocusSessionForUser,
  updateFocusSessionForUser,
} from '@/lib/queries/focus';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

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
      {
        status: 'unauthenticated',
        message: 'Please sign in to update this focus session.',
      },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(`focus:patch:${user.id}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Too many focus session updates. Please wait a moment.',
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfterSeconds) },
      }
    );
  }

  const { id } = await context.params;
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

  const result = await updateFocusSessionForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    id,
    body
  );

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'validation_error'
        ? 400
        : result.status === 'not_found'
          ? 404
          : 500;

  return NextResponse.json(result, { status: statusCode });
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
      {
        status: 'unauthenticated',
        message: 'Please sign in to delete this focus session.',
      },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const result = await deleteFocusSessionForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    id
  );

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'not_found'
        ? 404
        : 500;

  return NextResponse.json(result, { status: statusCode });
}
