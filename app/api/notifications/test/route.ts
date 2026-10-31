import { NextResponse } from 'next/server';
import { getResilientServerSession } from '@/lib/auth/server';
import { resolveVerifiedClerkUser } from '@/lib/email/clerk-recipient';
import {
  getEmailConfigStatus,
  sendEmail,
} from '@/lib/email/email-service';
import { buildReminderEmail } from '@/lib/email/templates/reminder-template';

export const dynamic = 'force-dynamic';

export async function POST() {
  const sessionResult = await getResilientServerSession();
  const user = sessionResult?.data?.user;

  if (!user) {
    return NextResponse.json(
      { status: 'unauthenticated', message: 'Please sign in to test email notifications.' },
      { status: 401 }
    );
  }

  const configStatus = getEmailConfigStatus();
  if (!configStatus.isConfigured) {
    return NextResponse.json(
      {
        status: 'unconfigured',
        message:
          'Gmail SMTP credentials are not configured on the server. Please set SMTP_USER and SMTP_APP_PASSWORD in .env.local.',
      },
      { status: 503 }
    );
  }

  // Resolve verified Clerk recipient
  const clerkResolution = await resolveVerifiedClerkUser(user.id);
  if (!clerkResolution.ok || !clerkResolution.email) {
    return NextResponse.json(
      {
        status: 'unverified_email',
        message: `Your Clerk primary email address is unverified or missing (${clerkResolution.reason || 'unknown'}). Please verify your email first.`,
      },
      { status: 400 }
    );
  }

  const now = new Date();
  const sampleEmail = buildReminderEmail({
    recipientName: clerkResolution.name || user.name || 'LifeCraft Explorer',
    eventTitle: 'Sample LifeCraft Notification Test',
    category: 'Meeting',
    color: '#5938B5',
    formattedDate: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(now),
    formattedTime: '10:00 AM – 11:00 AM',
    timezone: 'Your Timezone',
    meetingUrl: 'https://meet.google.com/test-lifecraft',
    meetingLabel: 'Join Test Meeting',
    description:
      'This is a sample test email verifying that your Gmail SMTP credentials and LifeCraft reminder system are functioning properly.',
    notes: 'If you see this, your Gmail SMTP connection and Clerk recipient routing are operating smoothly!',
    reminderLabel: '15 minutes before',
  });

  const sendResult = await sendEmail({
    to: clerkResolution.email,
    subject: sampleEmail.subject,
    html: sampleEmail.html,
    text: sampleEmail.text,
  });

  if (!sendResult.ok) {
    return NextResponse.json(
      {
        status: 'error',
        message: sendResult.error || 'Failed to send test email via Gmail SMTP.',
        redirectedToTest: sendResult.redirectedToTest,
        target: sendResult.actualRecipient,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    message: sendResult.redirectedToTest
      ? `Test email sent successfully to test recipient (${sendResult.actualRecipient}).`
      : `Test email sent successfully to your verified email (${clerkResolution.email}).`,
    recipient: sendResult.actualRecipient,
    redirectedToTest: sendResult.redirectedToTest,
    messageId: sendResult.messageId,
  });
}

