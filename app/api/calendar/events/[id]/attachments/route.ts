import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { addEventAttachment } from '@/lib/queries/events';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_EVENT_ATTACHMENT_BYTES,
  sanitizeAttachmentFileName,
} from '@/lib/storage/event-attachments';

export const dynamic = 'force-dynamic';

export async function POST(
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
      { status: 'unauthenticated', message: 'Please sign in.' },
      { status: 401 }
    );
  }

  const rateCheck = checkRateLimit(`event_attach_${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many upload requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  const { id: eventId } = await context.params;

  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      // Also check single file field 'file'
      const singleFile = formData.get('file') as File | null;
      if (singleFile) {
        files.push(singleFile);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { status: 'validation_error', message: 'No file was provided for upload.' },
        { status: 400 }
      );
    }

    const uploadedAttachments = [];

    for (const file of files) {
      if (file.size > MAX_EVENT_ATTACHMENT_BYTES) {
        return NextResponse.json(
          {
            status: 'validation_error',
            message: `File "${file.name}" exceeds 25 MB limit.`,
          },
          { status: 400 }
        );
      }

      const mime = file.type || 'application/octet-stream';
      const cleanName = sanitizeAttachmentFileName(file.name);
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      const res = await addEventAttachment(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: user.emailVerified,
          image: user.image,
        },
        eventId,
        {
          fileName: cleanName,
          fileType: mime,
          bytes,
        }
      );

      if (res.status !== 'ok' || !res.attachment) {
        return NextResponse.json(
          {
            status: res.status,
            message: res.message || `Failed to attach "${cleanName}".`,
          },
          { status: res.status === 'not_found' ? 404 : 400 }
        );
      }

      uploadedAttachments.push(res.attachment);
    }

    return NextResponse.json(
      { status: 'ok', attachments: uploadedAttachments },
      { status: 201 }
    );
  } catch (err) {
    console.error('[LifeCraft Attachments] Form parse error:', err);
    return NextResponse.json(
      { status: 'error', message: 'Could not process file upload.' },
      { status: 500 }
    );
  }
}

