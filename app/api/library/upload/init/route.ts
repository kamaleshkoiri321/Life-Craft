import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { initiateLibraryUploadForUser } from '@/lib/queries/library';
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
        message: 'Please sign in to upload a book.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`library_upload_init_${user.id}`, {
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

  const result = await initiateLibraryUploadForUser(
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
