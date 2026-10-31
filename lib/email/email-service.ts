import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

let cachedTransporter: Transporter | null = null;

export interface SmtpConfigStatus {
  isConfigured: boolean;
  host: string;
  port: number;
  userConfigured: boolean;
  passConfigured: boolean;
  fromName: string;
  testMode: boolean;
  testRecipientConfigured: boolean;
  testRecipient?: string;
}

export function getEmailConfigStatus(): SmtpConfigStatus {
  const user = process.env.SMTP_USER?.trim() || '';
  const pass = process.env.SMTP_APP_PASSWORD?.trim() || '';
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT?.trim() || '587', 10);
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || 'LifeCraft';
  const testMode = process.env.EMAIL_TEST_MODE === 'true';
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT?.trim() || '';

  return {
    isConfigured: Boolean(user && pass),
    host,
    port,
    userConfigured: Boolean(user),
    passConfigured: Boolean(pass),
    fromName,
    testMode,
    testRecipientConfigured: Boolean(testRecipient),
    testRecipient: testMode && testRecipient ? testRecipient : undefined,
  };
}

/**
 * Creates or retrieves the singleton Nodemailer transporter configured for Gmail SMTP.
 */
export function getMailTransporter(): Transporter | null {
  const status = getEmailConfigStatus();
  if (!status.isConfigured) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_APP_PASSWORD!.trim();

  cachedTransporter = nodemailer.createTransport({
    host: status.host,
    port: status.port,
    secure: false, // Port 587 uses STARTTLS
    requireTLS: true,
    auth: {
      user,
      pass,
    },
    // Pool settings for efficiency in serverless execution
    pool: false,
    maxConnections: 3,
    maxMessages: 100,
  });

  return cachedTransporter;
}

/**
 * Verifies that the Gmail SMTP connection credentials and network handshake are healthy.
 */
export async function verifySmtpConnection(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      ok: false,
      error:
        'SMTP credentials not configured. Please set SMTP_USER and SMTP_APP_PASSWORD.',
    };
  }

  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Failed to authenticate with Gmail SMTP.';
    console.error('[LifeCraft Email] SMTP verify failed:', message);
    return { ok: false, error: message };
  }
}

export interface SendEmailParams {
  to: string; // The intended verified user email
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  redirectedToTest?: boolean;
  actualRecipient?: string;
  error?: string;
}

/**
 * Sends a personalized email through Gmail SMTP with LifeCraft branding and test-mode safety guards.
 */
export async function sendEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const transporter = getMailTransporter();
  if (!transporter) {
    return {
      ok: false,
      error:
        'Email service is not configured. Missing SMTP_USER or SMTP_APP_PASSWORD.',
    };
  }

  const status = getEmailConfigStatus();
  const fromName = status.fromName || 'LifeCraft';
  const senderEmail = process.env.SMTP_USER!.trim();
  const fromAddress = `"${fromName}" <${senderEmail}>`;

  let destination = params.to.trim();
  let subject = params.subject;
  let html = params.html;
  let text = params.text || '';
  let redirectedToTest = false;

  // Handle Testing Mode: Redirect all emails to configured test address
  if (status.testMode) {
    if (!status.testRecipientConfigured || !status.testRecipient) {
      return {
        ok: false,
        error:
          'EMAIL_TEST_MODE is enabled but EMAIL_TEST_RECIPIENT is not configured. Aborting delivery for safety.',
      };
    }

    destination = status.testRecipient;
    redirectedToTest = true;
    subject = `[TEST MODE - For: ${params.to}] ${params.subject}`;

    const testBannerHtml = `
      <div style="background-color: #FEF3C7; border: 1px solid #F59E0B; padding: 10px 16px; border-radius: 8px; margin-bottom: 20px; font-family: sans-serif; font-size: 13px; color: #92400E;">
        <strong>LifeCraft Test Mode Notice</strong><br/>
        This email was redirected to this test address (<code>${destination}</code>).<br/>
        Intended production recipient: <strong>${params.to}</strong>
      </div>
    `;
    html = `${testBannerHtml}${html}`;
    text = `[TEST MODE NOTICE - Intended recipient: ${params.to}]\n\n${text}`;
  }

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: destination,
      subject,
      html,
      text,
    });

    return {
      ok: true,
      messageId: info.messageId,
      redirectedToTest,
      actualRecipient: destination,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Unknown SMTP delivery error';
    console.error(
      `[LifeCraft Email] Failed to send email to ${destination}:`,
      msg
    );
    return {
      ok: false,
      error: msg,
      actualRecipient: destination,
      redirectedToTest,
    };
  }
}

