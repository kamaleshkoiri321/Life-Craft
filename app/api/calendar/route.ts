import { NextRequest, NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { getCalendarViewDataForUser } from '@/lib/queries/calendar';

export const dynamic = 'force-dynamic';

function resolveRequestOrigin(req: NextRequest): string {
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl && appUrl.startsWith('http') && appUrl !== 'MY_APP_URL') {
    return appUrl.replace(/\/+$/, '');
  }
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${proto}://${forwardedHost}`;
  }
  if (host) {
    const scheme = host.startsWith('localhost') ? 'http' : proto;
    return `${scheme}://${host}`;
  }
  try {
    return new URL(req.url).origin;
  } catch {
    return 'http://localhost:3000';
  }
}

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
  const includeExternal = searchParams.get('includeExternal') !== 'false';
  const requestOrigin = resolveRequestOrigin(req);

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
      includeExternal,
      requestOrigin,
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
