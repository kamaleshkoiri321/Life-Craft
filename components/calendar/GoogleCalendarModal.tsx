'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2Off,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  GoogleCalendarConfigStatus,
  GoogleCalendarConnectionSummary,
} from '@/lib/calendar/google-calendar';

const GCAL_BROADCAST_CHANNEL = 'lifecraft_gcal_oauth_channel';
const GCAL_STORAGE_KEY = 'lifecraft_gcal_oauth_payload';

interface GoogleCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GoogleCalendarConfigStatus;
  connection: GoogleCalendarConnectionSummary;
  onDisconnected: () => Promise<void>;
  onConnected: (message: string) => Promise<void>;
}

interface GcalOAuthBridgeMessage {
  type?: string;
  status?: 'connected' | 'error' | 'cancelled';
  message?: string;
  code?: string;
  state?: string;
  timestamp?: number;
}

export default function GoogleCalendarModal({
  isOpen,
  onClose,
  config,
  connection,
  onDisconnected,
  onConnected,
}: GoogleCalendarModalProps) {
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleBridgePayload = useCallback(
    async (payload: GcalOAuthBridgeMessage | null | undefined) => {
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'LIFECRAFT_GCAL_OAUTH_COMPLETE') {
        setIsConnecting(false);
        if (payload.status === 'connected') {
          setActionError(null);
          await onConnected(
            payload.message || 'Google Calendar connected to LifeCraft.'
          );
          onClose();
        } else if (payload.status === 'cancelled') {
          setActionError('Google Calendar authorization was cancelled.');
        } else {
          setActionError(
            payload.message ||
              'Could not complete Google Calendar connection. Please try again.'
          );
        }
        return;
      }

      if (
        payload.type === 'LIFECRAFT_GCAL_OAUTH_EXCHANGE' &&
        payload.code &&
        payload.state
      ) {
        try {
          const res = await fetch('/api/calendar/google/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              code: payload.code,
              state: payload.state,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            status?: string;
            message?: string;
          };
          setIsConnecting(false);
          if (res.ok && data.status === 'connected') {
            setActionError(null);
            await onConnected(
              data.message || 'Google Calendar connected to LifeCraft.'
            );
            onClose();
          } else {
            setActionError(
              data.message ||
                'Could not exchange Google Calendar authorization code.'
            );
          }
        } catch {
          setIsConnecting(false);
          setActionError(
            'Network error while finalizing Google Calendar authorization.'
          );
        }
      }
    },
    [onClose, onConnected]
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      void handleBridgePayload(event.data as GcalOAuthBridgeMessage);
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== GCAL_STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as GcalOAuthBridgeMessage;
        void handleBridgePayload(parsed);
      } catch {
        // Ignore malformed storage payload
      }
    };

    window.addEventListener('message', handleWindowMessage);
    window.addEventListener('storage', handleStorageEvent);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(GCAL_BROADCAST_CHANNEL);
      bc.onmessage = (event) => {
        void handleBridgePayload(event.data as GcalOAuthBridgeMessage);
      };
    } catch {
      bc = null;
    }

    return () => {
      window.removeEventListener('message', handleWindowMessage);
      window.removeEventListener('storage', handleStorageEvent);
      if (bc) {
        bc.close();
      }
    };
  }, [isOpen, handleBridgePayload]);

  if (!isOpen) return null;

  const effectiveRedirectUri = (() => {
    if (
      config.redirectUri &&
      config.redirectUri.includes('/api/calendar/google/callback')
    ) {
      return config.redirectUri;
    }
    const origin =
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin.replace(/\/+$/, '')
        : 'https://lifecraft-hero.vercel.app';
    return `${origin}/api/calendar/google/callback`;
  })();

  const handleCopyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(effectiveRedirectUri);
      setCopiedRedirect(true);
      setTimeout(() => setCopiedRedirect(false), 2000);
    } catch {
      // Ignore clipboard failures in restricted contexts
    }
  };

  // Full-page OAuth redirect flow
  const handleConnectClick = async () => {
    setActionError(null);
    setIsConnecting(true);

    try {
      const browserOrigin =
        typeof window !== 'undefined' ? window.location.origin : '';
      const connectEndpoint = `/api/calendar/google/connect?format=json${
        browserOrigin ? `&origin=${encodeURIComponent(browserOrigin)}` : ''
      }`;

      const res = await fetch(connectEndpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        authorizeUrl?: string;
        message?: string;
      };

      if (!res.ok || data.status !== 'ok' || !data.authorizeUrl) {
        setIsConnecting(false);
        setActionError(
          data.message ||
            'Could not initiate Google Calendar OAuth. Verify server credentials.'
        );
        return;
      }

      // Secure full-page redirect to Google's authorization endpoint
      // Eliminates Cross-Origin-Opener-Policy (COOP) blocks and popup failures
      window.location.href = data.authorizeUrl;
    } catch {
      setIsConnecting(false);
      setActionError(
        'Network error while starting Google Calendar OAuth. Please try again.'
      );
    }
  };

  const handleDisconnectClick = async () => {
    setActionError(null);
    setIsDisconnecting(true);
    try {
      const res = await fetch('/api/calendar/google/disconnect', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== 'ok') {
        setActionError(
          data.message || 'Could not disconnect Google Calendar right now.'
        );
        return;
      }
      await onDisconnected();
      onClose();
    } catch {
      setActionError('Network error while disconnecting Google Calendar.');
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171622]/45 p-4 backdrop-blur-[2px] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-calendar-modal-title"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => {
          if (!isDisconnecting && !isConnecting) onClose();
        }}
      />

      <div className="relative z-10 my-auto w-full max-w-xl rounded-2xl border border-[#171622]/12 bg-white p-6 sm:p-7 shadow-2xl space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EBE8F8] text-[#171622]">
              <Calendar className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="google-calendar-modal-title"
                className="font-display text-lg sm:text-xl font-bold text-[#171622]"
              >
                Google Calendar Integration
              </h2>
              <p className="text-xs text-[#171622]/65">
                View external Google Calendar events alongside LifeCraft tasks
                and export scheduled blocks.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Google Calendar settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#171622]/60 hover:bg-[#171622]/5 hover:text-[#171622] transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {actionError && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-[#B42318]/25 bg-[#FEF3F2] px-3.5 py-2.5 text-xs sm:text-sm text-[#B42318]"
          >
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>{actionError}</span>
          </div>
        )}

        {/* Current Connection State */}
        <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#171622]/70">
              Connection status
            </span>
            {connection.status === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F6B1E]">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>Connected ({connection.googleEmail})</span>
              </span>
            ) : connection.status === 'expired' ||
              connection.status === 'revoked' ||
              connection.status === 'error' ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#B42318]">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                <span>
                  {connection.status === 'expired'
                    ? 'Authorization expired'
                    : connection.status === 'revoked'
                      ? 'Access revoked'
                      : 'Connection error'}
                </span>
              </span>
            ) : (
              <span className="text-xs font-semibold text-[#171622]/60">
                Not connected
              </span>
            )}
          </div>

          {connection.googleEmail && (
            <div className="text-xs text-[#171622]/75 space-y-1">
              <p>
                Google account:{' '}
                <strong className="font-semibold text-[#171622]">
                  {connection.googleEmail}
                </strong>
              </p>
              {connection.connectedAt && (
                <p className="text-[11px] text-[#171622]/55">
                  Connected on{' '}
                  {new Date(connection.connectedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>
          )}

          {connection.lastError && (
            <p className="text-xs text-[#B42318] bg-[#FEF3F2] border border-[#B42318]/20 rounded-lg px-3 py-2">
              {connection.lastError}
            </p>
          )}
        </div>

        {/* Exact OAuth Redirect URI Reference (Always visible so user can verify Google Cloud Console) */}
        <div className="rounded-xl border border-[#171622]/12 bg-white p-4 space-y-2.5">
          <p className="text-xs font-semibold text-[#171622]">
            Authorized Redirect URI for Google Cloud Console:
          </p>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[#171622]/12 bg-[#FAF9F6] px-3 py-2">
            <code className="text-[11px] font-mono text-[#171622] break-all">
              {effectiveRedirectUri}
            </code>
            <button
              type="button"
              onClick={handleCopyRedirectUri}
              aria-label="Copy Google Calendar OAuth redirect URI"
              className="inline-flex items-center gap-1 rounded-md border border-[#171622]/12 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#171622] hover:bg-[#171622]/5 shrink-0"
            >
              {copiedRedirect ? (
                <>
                  <Check className="h-3 w-3 text-[#2F6B1E]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="text-[11px] text-[#171622]/65 leading-relaxed">
            Ensure this exact callback URL is listed under{' '}
            <strong className="font-semibold text-[#171622]">
              Authorized redirect URIs
            </strong>{' '}
            in your Google Cloud Console Web OAuth 2.0 Client, and that the{' '}
            <strong className="font-semibold text-[#171622]">
              Google Calendar API
            </strong>{' '}
            is enabled.
          </p>
        </div>

        {/* Configuration & Setup Guide when server secrets are missing */}
        {!config.isConfigured ? (
          <div className="rounded-xl border border-[#171622]/12 bg-white p-4 space-y-3.5">
            <div className="flex items-start gap-2.5">
              <KeyRound
                className="mt-0.5 h-4 w-4 shrink-0 text-[#5938B5]"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <h3 className="text-xs sm:text-sm font-bold text-[#171622]">
                  Server OAuth Configuration Required for Google Calendar
                </h3>
                <p className="text-xs text-[#171622]/70 leading-relaxed">
                  Your internal LifeCraft calendar is fully active. To enable
                  live Google Calendar OAuth synchronization and encrypted
                  per-user token storage, add these server secrets in Google AI
                  Studio Secrets:
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              {config.missingEnvVars.map((envVar) => (
                <div
                  key={envVar}
                  className="flex items-center justify-between rounded-lg bg-[#FAF9F6] px-3 py-1.5 text-xs font-mono text-[#171622]"
                >
                  <span>{envVar}</span>
                  <span className="text-[11px] font-sans font-semibold text-[#B42318]">
                    Missing
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#171622]/10 bg-[#FAF9F6]/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#171622]">
              <ShieldCheck
                className="h-4 w-4 text-[#2F6B1E]"
                aria-hidden="true"
              />
              <span>Privacy & Minimum Scope Guarantee</span>
            </div>
            <p className="text-xs text-[#171622]/70 leading-relaxed">
              LifeCraft requests only{' '}
              <code className="font-mono text-[11px]">calendar.events</code> to
              display your primary calendar schedule and export tasks when you
              explicitly choose to. Refresh tokens are encrypted at rest with
              AES-256-GCM.
            </p>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {connection.googleEmail ? (
            <button
              type="button"
              onClick={handleDisconnectClick}
              disabled={isDisconnecting}
              className="inline-flex items-center gap-2 rounded-xl border border-[#B42318]/25 bg-[#FEF3F2] px-4 py-2.5 text-xs font-semibold text-[#B42318] hover:bg-[#FEE4E2] transition-colors disabled:opacity-60"
            >
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2Off className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isDisconnecting
                  ? 'Disconnecting...'
                  : 'Disconnect Google Calendar'}
              </span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setIsConnecting(false);
                onClose();
              }}
              className="rounded-xl border border-[#171622]/15 bg-white px-4 py-2.5 text-xs font-semibold text-[#171622] hover:bg-[#171622]/5 transition-colors"
            >
              Close
            </button>

            {config.isConfigured && (
              <button
                type="button"
                onClick={handleConnectClick}
                disabled={isConnecting}
                className="inline-flex items-center gap-2 rounded-xl bg-[#171622] px-4 py-2.5 text-xs font-semibold text-[#FAF9F6] hover:bg-[#171622]/90 transition-colors disabled:opacity-60"
              >
                {isConnecting ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isConnecting
                    ? 'Connecting to Google...'
                    : connection.status === 'connected'
                      ? 'Reconnect Google Calendar'
                      : 'Connect Google Calendar'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
