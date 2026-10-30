import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  deleteAccountForUser,
  getSettingsForUser,
  updateSettingsForUser,
} from '@/lib/queries/settings';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

async function getAuthenticatedUser() {
  const sessionRes = await getResilientServerSession();
  const user = sessionRes?.data?.user;
  if (!user || !user.id || !user.email) {
    return null;
  }
  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    image: user.image ?? null,
  };
}

export async function GET() {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json(
      { status: 'unauthorized', message: 'Authentication required.' },
      { status: 401 }
    );
  }

  const result = await getSettingsForUser(authUser);
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

export async function PATCH(req: NextRequest) {
  const originCheck = verifySameOriginMutation(req);
  if (!originCheck.ok) {
    return NextResponse.json(
      { status: 'forbidden', message: originCheck.message },
      { status: 403 }
    );
  }

  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json(
      { status: 'unauthorized', message: 'Authentication required.' },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(`settings:patch:${authUser.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Too many settings updates. Please wait a moment and try again.',
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
      { status: 'validation_error', message: 'Invalid JSON request body.' },
      { status: 400 }
    );
  }

  const result = await updateSettingsForUser(authUser, body);
  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'validation_error'
        ? 400
        : result.status === 'db_unconfigured'
          ? 503
          : 500;

  return NextResponse.json(result, { status: statusCode });
}

export async function DELETE(req: NextRequest) {
  const originCheck = verifySameOriginMutation(req);
  if (!originCheck.ok) {
    return NextResponse.json(
      { status: 'forbidden', message: originCheck.message },
      { status: 403 }
    );
  }

  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json(
      { status: 'unauthorized', message: 'Authentication required.' },
      { status: 401 }
    );
  }

  const rl = checkRateLimit(`settings:delete:${authUser.id}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Too many account deletion attempts. Please wait a moment.',
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
        message: 'Please provide DELETE confirmation.',
      },
      { status: 400 }
    );
  }

  const result = await deleteAccountForUser(authUser, body);
  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'validation_error'
        ? 400
        : result.status === 'db_unconfigured'
          ? 503
          : 500;

  return NextResponse.json(result, { status: statusCode });
}
