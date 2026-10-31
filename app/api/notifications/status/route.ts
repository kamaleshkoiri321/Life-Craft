import { NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import {
  getEmailConfigStatus,
  verifySmtpConnection,
} from '@/lib/email/email-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;

  if (!user) {
    return NextResponse.json(
      { status: 'unauthenticated', message: 'Please sign in.' },
      { status: 401 }
    );
  }

  const configStatus = getEmailConfigStatus();
  let connectionHealthy = false;
  let connectionError: string | undefined;

  if (configStatus.isConfigured) {
    const check = await verifySmtpConnection();
    connectionHealthy = check.ok;
    connectionError = check.error;
  }

  return NextResponse.json({
    status: 'ok',
    isConfigured: configStatus.isConfigured,
    connectionHealthy,
    connectionError,
    fromName: configStatus.fromName,
    testMode: configStatus.testMode,
    testRecipientConfigured: configStatus.testRecipientConfigured,
    testRecipient: configStatus.testRecipient,
  });
}

