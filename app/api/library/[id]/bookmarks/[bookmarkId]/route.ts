import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { deleteBookmarkForUser } from '@/lib/queries/library';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; bookmarkId: string }> }
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
        message: 'Please sign in to delete this bookmark.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`library_bookmark_del_${user.id}`, {
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

  const { id, bookmarkId } = await context.params;
  const result = await deleteBookmarkForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    id,
    bookmarkId
  );

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'not_found'
        ? 404
        : 500;

  return NextResponse.json(result, { status: statusCode });
}
