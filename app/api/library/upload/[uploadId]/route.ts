import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { MAX_LIBRARY_UPLOAD_BYTES } from '@/lib/library/library-utils';
import {
  finalizeLibraryUploadForUser,
  uploadLibraryBytesForSession,
} from '@/lib/queries/library';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/library/upload/[uploadId]
 * Authenticated binary upload endpoint that validates size and magic bytes and writes to Neon Object Storage / private vault.
 */
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ uploadId: string }> }
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
        message: 'Please sign in to upload a book.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`library_upload_bytes_${user.id}`, {
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

  const contentLengthHeader = req.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_LIBRARY_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          status: 'validation_error',
          message: 'File exceeds the 50 MB maximum upload limit.',
        },
        { status: 413 }
      );
    }
  }

  const { uploadId } = await context.params;
  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'Failed to read uploaded file stream.',
      },
      { status: 400 }
    );
  }

  if (arrayBuffer.byteLength > MAX_LIBRARY_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        status: 'validation_error',
        message: 'File exceeds the 50 MB maximum upload limit.',
      },
      { status: 413 }
    );
  }

  const result = await uploadLibraryBytesForSession(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    uploadId,
    new Uint8Array(arrayBuffer)
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

/**
 * POST /api/library/upload/[uploadId]
 * Finalizes the upload session after verifying the stored object in Neon Object Storage / private vault.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ uploadId: string }> }
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
        message: 'Please sign in to finalize this book upload.',
      },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`library_upload_finalize_${user.id}`, {
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

  const { uploadId } = await context.params;
  let body: { totalPages?: number | null } = {};
  try {
    body = (await req.json()) as { totalPages?: number | null };
  } catch {
    // Optional body
  }

  const result = await finalizeLibraryUploadForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    uploadId,
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
