import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  permanentlyDeleteNoteForUser,
  updateNoteForUser,
} from '@/lib/queries/notes';
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
        message: 'Please sign in to update this note.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`note_patch_${user.id}`, {
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

  const result = await updateNoteForUser(
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
        message: 'Please sign in to delete this note.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`note_delete_${user.id}`, {
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

  const { id } = await context.params;
  const result = await permanentlyDeleteNoteForUser(
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
