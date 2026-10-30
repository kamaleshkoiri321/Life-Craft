import { NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { fetchDashboardDataForUser } from '@/lib/queries/dashboard';

export async function GET() {
  try {
    const sessionResult = await getResilientServerSession();
    const sessionUser = sessionResult?.data?.user;
    const sessionObj = sessionResult?.data?.session;

    if (!sessionUser || !sessionObj) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Please sign in to access your LifeCraft dashboard.',
        },
        {
          status: 401,
          headers: { 'Cache-Control': 'no-store, max-age=0' },
        }
      );
    }

    const result = await fetchDashboardDataForUser({
      id: sessionUser.id,
      name: sessionUser.name ?? null,
      email: sessionUser.email,
      emailVerified: Boolean(sessionUser.emailVerified),
      image: sessionUser.image ?? null,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch {
    return NextResponse.json(
      {
        error: 'InternalError',
        message: 'Unable to load dashboard data right now.',
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  }
}
