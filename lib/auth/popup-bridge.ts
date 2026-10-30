/**
 * Server-side ephemeral OAuth popup handoff store.
 *
 * Why this exists:
 * When the application runs inside a cross-origin iframe (such as the Google AI Studio
 * preview environment) and opens a top-level popup window for Google OAuth:
 * 1. Google's `Cross-Origin-Opener-Policy` severs `window.opener` and prevents `window.close()`.
 * 2. Modern browsers partition `BroadcastChannel` and `localStorage` by top-level site,
 *    isolating the iframe's storage partition from the popup's top-level partition.
 *
 * By passing a short-lived `popup_id` query parameter on the OAuth callback URL,
 * `/auth/callback` records the one-time `neon_auth_session_verifier` on the server
 * (with a 2-minute TTL), and the waiting iframe polls `/api/auth/popup-bridge?popup_id=...`
 * to retrieve and consume the verifier immediately.
 */

export interface PopupBridgePayload {
  type: 'neon-auth:oauth-complete';
  verifier: string | null;
  error: string | null;
  originalCallback: string;
  timestamp: number;
}

interface StoredPopupEntry {
  payload: PopupBridgePayload;
  expiresAt: number;
}

const TTL_MS = 2 * 60 * 1000; // 2 minutes

const globalForPopupBridge = globalThis as unknown as {
  __lifecraftPopupBridge?: Map<string, StoredPopupEntry>;
};

function getStore(): Map<string, StoredPopupEntry> {
  if (!globalForPopupBridge.__lifecraftPopupBridge) {
    globalForPopupBridge.__lifecraftPopupBridge = new Map();
  }
  return globalForPopupBridge.__lifecraftPopupBridge;
}

function pruneExpired(store: Map<string, StoredPopupEntry>): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function storePopupCompletion(
  popupId: string,
  payload: PopupBridgePayload
): void {
  if (!popupId || popupId.length > 128) return;
  const store = getStore();
  pruneExpired(store);
  store.set(popupId, {
    payload,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function consumePopupCompletion(
  popupId: string
): PopupBridgePayload | null {
  if (!popupId || popupId.length > 128) return null;
  const store = getStore();
  pruneExpired(store);
  const entry = store.get(popupId);
  if (!entry) return null;
  store.delete(popupId);
  return entry.payload;
}
