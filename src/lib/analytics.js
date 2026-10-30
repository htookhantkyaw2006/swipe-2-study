/**
 * Privacy-Conscious, Minimalist Analytics
 *
 * Provides a strictly gated event tracker with an explicit allowlist of events,
 * coarse enums, approved course/level identifiers, and bounded numeric metadata only.
 *
 * Telemetry Payload Boundaries:
 * - Strictly bounded coarse metadata and approved enums only.
 * - No user IDs, account emails, free-text inputs, character strings, or device fingerprints in event payloads.
 * - (Note: Network-layer IP addresses are transmitted by underlying HTTP socket connections to receiving endpoints;
 *    application payloads carry zero user identity).
 * - React StrictMode and remount deduplication.
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

export const APPROVED_COURSE_IDS = Object.freeze([
  'zh',
  'ja',
  'zh-hsk1',
  'ja-n5',
]);

export const APPROVED_LEVEL_IDS = Object.freeze([
  '1',
  'hsk1',
  'HSK1',
  '5',
  'n5',
  'N5',
]);

export const EVENT_METADATA_RULES = Object.freeze({
  'auth:signup_success': {
    mode: ['email_confirmation', 'direct'],
  },
  'auth:signin_success': {
    mode: ['password', 'oauth_callback'],
  },
  'study:session_start': {
    courseId: APPROVED_COURSE_IDS,
    levelId: APPROVED_LEVEL_IDS,
    cardCount: { type: 'number', min: 0, max: 1000 },
  },
  'study:session_complete': {
    courseId: APPROVED_COURSE_IDS,
    levelId: APPROVED_LEVEL_IDS,
    cardCount: { type: 'number', min: 0, max: 1000 },
  },
  'study:word_saved': {
    courseId: APPROVED_COURSE_IDS,
  },
  'import:guest_completed': {
    choice: ['merge', 'replace', 'discard'],
    recordCount: { type: 'number', min: 0, max: 10000 },
  },
  'learning:reset_confirmed': {
    scope: ['all', 'course', 'level'],
  },
});

const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const TOKEN_PATTERN_REGEX = /(?:bearer\s+[a-zA-Z0-9._~+/-]{10,}|(?:token|jwt|password|secret|key)[=:\s]+[^\s,"'&]+)/i;
const BARE_JWT_REGEX = /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+/;

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
 * Strictly enforces coarse enums, approved course/level identifiers, and bounded numeric metadata.
 * Drops arbitrary learner text, UUIDs, emails, credentials, and out-of-bounds numbers.
 */
export function sanitizeMetadata(rawMetadataOrEvent, maybeMetadata) {
  let eventName = null;
  let rawMetadata = {};

  if (typeof rawMetadataOrEvent === 'string') {
    eventName = rawMetadataOrEvent;
    rawMetadata = maybeMetadata && typeof maybeMetadata === 'object' ? maybeMetadata : {};
  } else if (rawMetadataOrEvent && typeof rawMetadataOrEvent === 'object') {
    rawMetadata = rawMetadataOrEvent;
    if (typeof maybeMetadata === 'string') {
      eventName = maybeMetadata;
    }
  }

  const clean = {};
  const rules = eventName && EVENT_METADATA_RULES[eventName] ? EVENT_METADATA_RULES[eventName] : null;

  for (const [key, val] of Object.entries(rawMetadata)) {
    if (!ALLOWED_METADATA_KEYS.includes(key)) continue;

    if (rules && key in rules) {
      const rule = rules[key];

      if (Array.isArray(rule)) {
        if (typeof val === 'string' && rule.includes(val.trim())) {
          clean[key] = val.trim();
        }
      } else if (rule && rule.type === 'number') {
        if (typeof val === 'number' && Number.isFinite(val)) {
          const intVal = Math.floor(val);
          if (intVal >= rule.min && intVal <= rule.max) {
            clean[key] = intVal;
          }
        }
      }
    } else if (!rules) {
      // Fallback for standalone / generic key validation:
      // Strictly reject UUIDs, emails, tokens, and arbitrary unapproved text
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (
          trimmed.length > 0 &&
          trimmed.length <= 64 &&
          !UUID_REGEX.test(trimmed) &&
          !EMAIL_REGEX.test(trimmed) &&
          !TOKEN_PATTERN_REGEX.test(trimmed) &&
          !BARE_JWT_REGEX.test(trimmed)
        ) {
          if (key === 'courseId' && !APPROVED_COURSE_IDS.includes(trimmed)) continue;
          if (key === 'levelId' && !APPROVED_LEVEL_IDS.includes(trimmed)) continue;
          if (key === 'mode' && !['email_confirmation', 'direct', 'password', 'oauth_callback'].includes(trimmed)) continue;
          if (key === 'choice' && !['merge', 'replace', 'discard'].includes(trimmed)) continue;
          if (key === 'scope' && !['all', 'course', 'level'].includes(trimmed)) continue;
          clean[key] = trimmed;
        }
      } else if (typeof val === 'number' && Number.isFinite(val)) {
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
 * Avoids sending unnecessary cookies or referrer headers.
 */
async function defaultAnalyticsTransport(endpointUrl, payload) {
  if (typeof globalThis.fetch !== 'function') return;
  await globalThis.fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
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
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}),
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

    const sanitizedMeta = sanitizeMetadata(eventName, rawMetadata);

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
