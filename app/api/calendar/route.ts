import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { getCalendarViewDataForUser } from '@/lib/queries/calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;
  const session = sessionResult?.data?.session;

  if (!user || !session) {
    return NextResponse.json(
      {
        status: 'unauthenticated',
        message: 'Please sign in to view your LifeCraft calendar.',
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const anchorDate = searchParams.get('anchorDate') ?? undefined;
  const view = searchParams.get('view') ?? undefined;

  const result = await getCalendarViewDataForUser(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerified),
      image: user.image ?? null,
    },
    {
      anchorDate,
      view,
    }
  );

  const statusCode =
    result.status === 'ok'
      ? 200
      : result.status === 'unconfigured'
        ? 503
        : 500;

  return NextResponse.json(result, { status: statusCode });
}
