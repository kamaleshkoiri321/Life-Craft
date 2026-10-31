/**
 * Escapes HTML characters to prevent HTML injection in emails.
 */
function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReminderEmailTemplateProps {
  recipientName: string;
  eventTitle: string;
  category: string;
  color: string;
  formattedDate: string;
  formattedTime: string;
  timezone: string;
  durationLabel?: string;
  meetingUrl?: string | null;
  meetingLabel?: string | null;
  description?: string | null;
  notes?: string | null;
  reminderLabel: string;
  appUrl?: string;
  eventId?: string;
}

export function buildReminderEmail(props: ReminderEmailTemplateProps): {
  subject: string;
  html: string;
  text: string;
} {
  const safeTitle = escapeHtml(props.eventTitle);
  const safeName = escapeHtml(props.recipientName || 'there');
  const safeCategory = escapeHtml(props.category || 'Event');
  const safeColor = props.color || '#5938B5';
  const safeDate = escapeHtml(props.formattedDate);
  const safeTime = escapeHtml(props.formattedTime);
  const safeTz = escapeHtml(props.timezone);
  const safeDescription = escapeHtml(props.description);
  const safeNotes = escapeHtml(props.notes);
  const safeMeetingLabel = escapeHtml(props.meetingLabel || 'Join Meeting');

  const appBase =
    props.appUrl?.replace(/\/$/, '') ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://lifecraft-hero.vercel.app';
  const viewEventUrl = props.eventId
    ? `${appBase}/app/calendar?eventId=${props.eventId}`
    : `${appBase}/app/calendar`;

  // Subject line e.g. "Reminder: Sprint Planning starts in 30 minutes"
  const subject = `Reminder: ${props.eventTitle} starts ${props.reminderLabel.toLowerCase()}`;

  // Plain-text alternative
  const textLines = [
    `Hello ${props.recipientName || 'there'},`,
    '',
    `This is a friendly reminder from LifeCraft about your upcoming ${props.category.toLowerCase()}:`,
    '',
    `Event: ${props.eventTitle}`,
    `Date: ${props.formattedDate}`,
    `Time: ${props.formattedTime} (${props.timezone})`,
  ];

  if (props.description) {
    textLines.push('', `Description:\n${props.description}`);
  }
  if (props.notes) {
    textLines.push('', `Notes:\n${props.notes}`);
  }
  if (props.meetingUrl) {
    textLines.push('', `Meeting Link: ${props.meetingUrl}`);
  }
  textLines.push(
    '',
    `View in LifeCraft: ${viewEventUrl}`,
    '',
    `Please be ready before the scheduled start time.`,
    '',
    `— LifeCraft Calendar Team`
  );

  const text = textLines.join('\n');

  // Responsive HTML template with LifeCraft craft aesthetic
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #FAF9F6;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #171622;
      line-height: 1.5;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #FAF9F6;
      padding: 30px 15px;
    }
    .container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #EFECE6;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(23, 22, 34, 0.04);
    }
    .accent-bar {
      height: 6px;
      background-color: ${safeColor};
      width: 100%;
    }
    .content {
      padding: 28px 32px 32px 32px;
    }
    .brand-header {
      display: flex;
      align-items: center;
      margin-bottom: 24px;
    }
    .brand-logo {
      font-size: 16px;
      font-weight: 800;
      color: #5938B5;
      letter-spacing: -0.3px;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      background-color: ${safeColor}18;
      color: ${safeColor};
      margin-bottom: 12px;
    }
    .event-title {
      font-size: 20px;
      font-weight: 800;
      color: #171622;
      margin: 0 0 16px 0;
      line-height: 1.3;
    }
    .details-box {
      background-color: #FAF9F6;
      border: 1px solid #EFECE6;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .detail-row {
      margin-bottom: 8px;
      font-size: 13px;
    }
    .detail-row:last-child {
      margin-bottom: 0;
    }
    .detail-label {
      font-weight: 600;
      color: #71717A;
      display: inline-block;
      width: 80px;
    }
    .detail-value {
      font-weight: 600;
      color: #171622;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #71717A;
      margin: 18px 0 6px 0;
    }
    .section-body {
      font-size: 13px;
      color: #27272A;
      background-color: #FAF9F6;
      border: 1px solid #EFECE6;
      border-radius: 8px;
      padding: 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .btn-container {
      margin-top: 24px;
      text-align: center;
    }
    .btn-primary {
      display: inline-block;
      background-color: #2563EB;
      color: #ffffff !important;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
    }
    .btn-secondary {
      display: inline-block;
      background-color: #5938B5;
      color: #ffffff !important;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      margin-left: 8px;
      box-shadow: 0 2px 6px rgba(89, 56, 181, 0.25);
    }
    .footer {
      border-top: 1px solid #EFECE6;
      padding: 20px 32px;
      background-color: #FAFAFA;
      text-align: center;
      font-size: 11px;
      color: #8C8B99;
    }
    .footer a {
      color: #5938B5;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="container" role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td class="accent-bar"></td>
      </tr>
      <tr>
        <td class="content">
          <div class="brand-header">
            <span class="brand-logo">LifeCraft</span>
          </div>

          <p style="font-size: 14px; color: #52525B; margin: 0 0 16px 0;">
            Hello <strong>${safeName}</strong>,
          </p>

          <span class="badge">${safeCategory}</span>

          <h1 class="event-title">${safeTitle}</h1>

          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${safeDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Time:</span>
              <span class="detail-value">${safeTime} <span style="font-size: 11px; color: #71717A;">(${safeTz})</span></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Reminder:</span>
              <span class="detail-value" style="color: #5938B5;">${escapeHtml(props.reminderLabel)}</span>
            </div>
          </div>

          ${
            props.description
              ? `
            <div class="section-title">Description & Agenda</div>
            <div class="section-body">${safeDescription}</div>
          `
              : ''
          }

          ${
            props.notes
              ? `
            <div class="section-title">Preparation Notes</div>
            <div class="section-body" style="background-color: #FEF3C7; border-color: #FDE68A; color: #78350F;">${safeNotes}</div>
          `
              : ''
          }

          <div class="btn-container">
            ${
              props.meetingUrl
                ? `
              <a href="${escapeHtml(props.meetingUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary">
                ${safeMeetingLabel}
              </a>
            `
                : ''
            }
            <a href="${escapeHtml(viewEventUrl)}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
              View Event in LifeCraft
            </a>
          </div>
        </td>
      </tr>
      <tr>
        <td class="footer">
          This notification was automatically sent by LifeCraft based on your calendar reminder preferences.<br/>
          To manage your reminder settings, visit your <a href="${escapeHtml(appBase)}/app/settings">Account Settings</a>.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `.trim();

  return { subject, html, text };
}

