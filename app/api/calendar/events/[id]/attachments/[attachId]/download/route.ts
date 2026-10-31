import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { getEventAttachmentDownloadData } from '@/lib/queries/events';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string; attachId: string }> }
) {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      { status: 'unauthenticated', message: 'Please sign in to access attachments.' },
      { status: 401 }
    );
  }

  const { id: eventId, attachId } = await context.params;

  const data = await getEventAttachmentDownloadData(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
    },
    eventId,
    attachId
  );

  if (!data) {
    return NextResponse.json(
      { status: 'not_found', message: 'Attachment not found.' },
      { status: 404 }
    );
  }

  // Determine disposition based on type
  const isInline =
    data.fileType.startsWith('image/') || data.fileType === 'application/pdf';
  const disposition = isInline
    ? `inline; filename="${encodeURIComponent(data.fileName)}"`
    : `attachment; filename="${encodeURIComponent(data.fileName)}"`;

  return new NextResponse(Buffer.from(data.bytes), {
    status: 200,
    headers: {
      'Content-Type': data.fileType,
      'Content-Disposition': disposition,
      'Content-Length': String(data.fileSize),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    },
  });
}
