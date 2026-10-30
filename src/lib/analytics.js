/**
 * Privacy-Conscious, Minimalist Analytics
 *
 * Provides a strictly gated event tracker with an explicit allowlist of events
 * and coarse metadata only.
 *
 * Guarantees:
 * - No user IDs, emails, IP addresses, or device fingerprints.
 * - No session replay, keystroke logging, or query parameter capture.
 * - StrictMode and remount deduplication.
 * - Disabled by default. Activated only when VITE_ANALYTICS_ENABLED === 'true'
 *   and VITE_ANALYTICS_URL is configured.
 */

export const ALLOWED_ANALYTICS_EVENTS = Object.freeze([
  'auth:signup_success',
  'auth:signin_success',
  'study:session_start',
  'study:session_complete',
  'study:word_saved',
  'import:guest_completed',
  'learning:reset_confirmed',
]);

export const ALLOWED_METADATA_KEYS = Object.freeze([
  'courseId',
  'levelId',
  'mode',
  'cardCount',
  'choice',
  'scope',
  'recordCount',
]);

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const TOKEN_PATTERN_REGEX = /(?:bearer\s+[a-zA-Z0-9._~+/-]{10,}|(?:token|jwt|password|secret|key)[=:\s]+[^\s,"'&]+)/i;

const recentEvents = new Map();
const DEDUPE_WINDOW_MS = 1500;

/**
 * Checks whether analytics collection is enabled in the current environment.
 */
export function isAnalyticsEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env) return false;
  return env.VITE_ANALYTICS_ENABLED === 'true' && typeof env.VITE_ANALYTICS_URL === 'string' && env.VITE_ANALYTICS_URL.trim().length > 0;
}

/**
 * Validates and scrubs coarse metadata.
 * Drops any disallowed keys, non-primitive values, PII, and out-of-bound numbers.
 */
export function sanitizeMetadata(rawMetadata = {}) {
  if (!rawMetadata || typeof rawMetadata !== 'object') return {};

  const clean = {};
  for (const key of ALLOWED_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(rawMetadata, key)) {
      const val = rawMetadata[key];

      if (typeof val === 'string') {
        const trimmed = val.trim();
        // Reject strings that appear to be emails, token/credential assignments, or are excessively long (>64 chars)
        if (
          trimmed.length > 0 &&
          trimmed.length <= 64 &&
          !EMAIL_REGEX.test(trimmed) &&
          !TOKEN_PATTERN_REGEX.test(trimmed)
        ) {
          clean[key] = trimmed;
        }
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        // Only permit bounded non-negative integers
        const intVal = Math.floor(val);
        if (intVal >= 0 && intVal <= 10000) {
          clean[key] = intVal;
        }
      }
    }
  }

  return clean;
}

/**
 * Prunes expired events from the deduplication map.
 */
function pruneRecentEvents(now = Date.now()) {
  for (const [key, timestamp] of recentEvents.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentEvents.delete(key);
    }
  }
}

/**
 * Default network transport for analytics.
 */
async function defaultAnalyticsTransport(endpointUrl, payload) {
  if (typeof globalThis.fetch !== 'function') return;
  await globalThis.fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

/**
 * Tracks an in-scope analytics event.
 *
 * @param {string} eventName
 * @param {object} rawMetadata
 * @param {object} options
 */
export async function trackEvent(eventName, rawMetadata = {}, {
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}) ,
  transport,
  dedupeKey,
} = {}) {
  try {
    // 1. Check if analytics is enabled
    if (!isAnalyticsEnabled(env)) {
      return { tracked: false, reason: 'disabled' };
    }

    // 2. Validate event name against allowlist
    if (!ALLOWED_ANALYTICS_EVENTS.includes(eventName)) {
      return { tracked: false, reason: 'unallowed_event' };
    }

    const sanitizedMeta = sanitizeMetadata(rawMetadata);

    // 3. Deduplication (protect against React StrictMode and remounts)
    const now = Date.now();
    pruneRecentEvents(now);

    const key = dedupeKey || `${eventName}:${JSON.stringify(sanitizedMeta)}`;
    if (recentEvents.has(key)) {
      return { tracked: false, reason: 'deduplicated' };
    }
    recentEvents.set(key, now);

    const payload = {
      event: eventName,
      metadata: sanitizedMeta,
      timestamp: new Date(now).toISOString(),
    };

    const endpoint = env.VITE_ANALYTICS_URL;
    const send = typeof transport === 'function' ? transport : (p) => defaultAnalyticsTransport(endpoint, p);

    await send(payload);
    return { tracked: true, payload };
  } catch {
    // Analytics failure must NEVER break user actions
    return { tracked: false, reason: 'transport_error' };
  }
}
