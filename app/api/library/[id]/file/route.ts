import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { getAuthorizedBookStreamForUser } from '@/lib/queries/library';

export const dynamic = 'force-dynamic';

/**
 * GET /api/library/[id]/file
 * Strictly authenticated, owner-scoped private file endpoint.
 * Never trusts client-supplied storage keys; derives key from user-owned PostgreSQL row.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      {
        status: 'unauthenticated',
        message: 'Please sign in to access this private book.',
      },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const { searchParams } = new URL(req.url);
  const disposition =
    searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const mode = searchParams.get('mode');

  const result = await getAuthorizedBookStreamForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    id,
    disposition
  );

  if (result.status === 'not_found') {
    return NextResponse.json(result, { status: 404 });
  }

  if (result.status === 'missing_file') {
    return NextResponse.json(result, { status: 410 });
  }

  // If caller explicitly asks for a short-lived signed URL metadata response
  if (mode === 'signed_url') {
    return NextResponse.json({
      status: 'ok',
      signedUrl:
        result.presignedUrl ||
        `/api/library/${id}/file${disposition === 'attachment' ? '?download=1' : ''}`,
      expiresInSeconds: 900,
    });
  }

  const safeFilename = result.originalFilename.replace(
    /[^a-zA-Z0-9._ -]/g,
    '_'
  );

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Content-Length': String(result.bytes.byteLength),
      'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        result.mimeType === 'application/pdf'
          ? "default-src 'self' blob: data:; object-src 'self' blob:; style-src 'self' 'unsafe-inline';"
          : "default-src 'none'; sandbox",
    },
  });
}
