import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { deleteEventAttachment } from '@/lib/queries/events';
import {
  checkRateLimit,
  verifySameOriginMutation,
} from '@/lib/security/api-guard';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; attachId: string }> }
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

  const rateCheck = checkRateLimit(`event_attach_del_${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { status: 'rate_limited', message: 'Too many requests. Please slow down.' },
      { status: 429 }
    );
  }

  const { id: eventId, attachId } = await context.params;
  const res = await deleteEventAttachment(
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

  return NextResponse.json(res, {
    status:
      res.status === 'ok' ? 200 : res.status === 'not_found' ? 404 : 500,
  });
}

