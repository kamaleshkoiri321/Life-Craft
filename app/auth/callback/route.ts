import { NextRequest, NextResponse } from 'next/server';
import {
  OAUTH_BROADCAST_CHANNEL,
  OAUTH_STORAGE_KEY,
} from '@/lib/auth/config';
import {
  storePopupCompletion,
  type PopupBridgePayload,
} from '@/lib/auth/popup-bridge';
import { sanitizeRedirectPath } from '@/lib/auth/validation';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const isPopup = searchParams.has('neon_popup');
  const popupId = searchParams.get('popup_id')?.trim() || '';
  const verifier = searchParams.get('neon_auth_session_verifier');
  const errorParam =
    searchParams.get('error') || searchParams.get('error_description');
  const originalCallback = sanitizeRedirectPath(
    searchParams.get('neon_popup_callback') || searchParams.get('callbackURL'),
    '/app'
  );

  if (!isPopup) {
    const destination = new URL(originalCallback, request.url);
    if (verifier) {
      destination.searchParams.set('neon_auth_session_verifier', verifier);
    }
    return NextResponse.redirect(destination);
  }

  const payload: PopupBridgePayload = {
    type: 'neon-auth:oauth-complete',
    verifier: verifier || null,
    error: errorParam || null,
    originalCallback,
    timestamp: Date.now(),
  };

  if (popupId) {
    storePopupCompletion(popupId, payload);
  }

  const directAppUrl = new URL(originalCallback, request.url);
  if (verifier) {
    directAppUrl.searchParams.set('neon_auth_session_verifier', verifier);
  }

  const safePayloadJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeDirectHref = directAppUrl.pathname + directAppUrl.search;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LifeCraft — Sign-In Complete</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #FAF9F6;
        color: #171622;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 24px;
      }
      .card {
        max-width: 400px;
        width: 100%;
        background: #ffffff;
        border: 1px solid rgba(23, 22, 34, 0.12);
        border-radius: 16px;
        padding: 32px 28px;
        text-align: center;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #C8F27C;
        color: #171622;
        font-weight: 700;
        font-size: 20px;
        margin-bottom: 16px;
      }
      h1 {
        font-size: 20px;
        margin: 0 0 8px;
      }
      p {
        font-size: 14px;
        color: rgba(23, 22, 34, 0.72);
        margin: 0 0 20px;
        line-height: 1.5;
      }
      .btn {
        display: inline-block;
        background: #171622;
        color: #FAF9F6;
        text-decoration: none;
        font-size: 14px;
        font-weight: 600;
        padding: 10px 20px;
        border-radius: 12px;
      }
    </style>
  </head>
  <body>
    <div class="card" role="status" aria-live="polite">
      <div class="badge" aria-hidden="true">&#10003;</div>
      <h1>Signed in to LifeCraft</h1>
      <p>Your LifeCraft workspace is now signed in. You can close this window or continue below.</p>
      <a class="btn" href="${safeDirectHref}">Continue to LifeCraft</a>
    </div>
    <script>
      (function () {
        var payload = ${safePayloadJson};
        try {
          var bc = new BroadcastChannel(${JSON.stringify(OAUTH_BROADCAST_CHANNEL)});
          bc.postMessage(payload);
          bc.close();
        } catch (e) {}

        try {
          localStorage.setItem(${JSON.stringify(OAUTH_STORAGE_KEY)}, JSON.stringify(payload));
        } catch (e) {}

        try {
          if (window.opener && window.opener !== window) {
            window.opener.postMessage(payload, '*');
          }
        } catch (e) {}

        setTimeout(function () {
          try {
            window.close();
          } catch (e) {}
        }, 150);
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
