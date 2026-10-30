import React from 'react';
import { auth } from '@clerk/nextjs/server';
import DashboardClientShell from '@/components/dashboard/DashboardClientShell';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  fetchDashboardDataForUser,
  type DashboardQueryResult,
} from '@/lib/queries/dashboard';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedCalendarPage() {
  await auth.protect();

  let initialResult: DashboardQueryResult | null = null;

  try {
    const sessionResult = await getResilientServerSession();
    const sessionUser = sessionResult?.data?.user;
    const sessionObj = sessionResult?.data?.session;

    if (sessionUser && sessionObj) {
      initialResult = await fetchDashboardDataForUser({
        id: sessionUser.id,
        name: sessionUser.name ?? null,
        email: sessionUser.email,
        emailVerified: Boolean(sessionUser.emailVerified),
        image: sessionUser.image ?? null,
      });
    }
  } catch {
    initialResult = null;
  }

  return (
    <DashboardClientShell
      initialResult={initialResult}
      initialSection="calendar"
    />
  );
}
