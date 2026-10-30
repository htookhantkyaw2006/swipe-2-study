/**
 * Centralized, Privacy-Conscious Error Monitoring
 *
 * Captures unhandled frontend errors, rejected promises, route boundary errors,
 * and server/edge errors while strictly stripping all credentials, bare tokens,
 * passwords, emails, UUIDs, and sensitive URL parameters.
 *
 * Disabled by default. Activated only when VITE_ERROR_REPORTING_ENABLED === 'true'
 * and VITE_ERROR_REPORTING_URL is configured.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
const BARE_JWT_REGEX = /(?:\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]+\b|\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b)/g;
const JSON_CREDENTIAL_REGEX = /"(?:password|passwd|secret|token|access_token|refresh_token|id_token|apiKey|api_key|auth|credential|credentials)"\s*:\s*"[^"]*"/gi;
const KEY_VALUE_CREDENTIAL_REGEX = /(?:password|passwd|secret|access_token|refresh_token|id_token|api_?key|auth_token)[=:\s]+[^\s,"'&`]+/gi;
const BEARER_REGEX = /bearer\s+(?:"[^"]+"|[a-zA-Z0-9._~+/-]{8,})/gi;
const AUTH_HEADER_REGEX = /(?:authorization|proxy-authorization):\s*[^\r\n]+/gi;
const UUID_REGEX = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/gi;
const SAFE_NAME_REGEX = /^[A-Za-z][A-Za-z0-9_$]{0,50}$/;
const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9_$.-]{1,60}$/;

const reportedErrors = new WeakSet();
const recentSignatures = new Map();
const inFlightSignatures = new Set();
const SIGNATURE_WINDOW_MS = 5000;

let isSyncReporting = false;

/**
 * Checks whether error reporting is enabled in the current environment.
 */
export function isErrorReportingEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env) return false;
  return env.VITE_ERROR_REPORTING_ENABLED === 'true' && typeof env.VITE_ERROR_REPORTING_URL === 'string' && env.VITE_ERROR_REPORTING_URL.trim().length > 0;
}

/**
 * Strips query parameters, hash fragments, and sensitive credentials from URLs.
 * Preserves only origin and path.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, 'https://swipe2study.app');
    // If it's a relative URL in browser or dummy origin
    if (trimmed.startsWith('/') || trimmed.startsWith('.')) {
      return parsed.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    // Fallback: strip everything from first '?' or '#'
    const stripped = trimmed.split(/[?#]/)[0];
    return stripped.replace(EMAIL_REGEX, '[REDACTED_EMAIL]').replace(BARE_JWT_REGEX, '[REDACTED_TOKEN]');
  }
}

/**
 * Sanitizes an error message or stack string, stripping tokens, emails, passwords,
 * bare JWTs, JSON credentials, UUIDs, and sensitive URL parameters.
 */
export function scrubSensitiveText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(AUTH_HEADER_REGEX, 'Authorization: [REDACTED]')
    .replace(JSON_CREDENTIAL_REGEX, (match) => {
      const colonIdx = match.indexOf(':');
      if (colonIdx === -1) return '"[REDACTED_CREDENTIAL]"';
      return `${match.slice(0, colonIdx)}: "[REDACTED]"`;
    })
    .replace(BEARER_REGEX, 'Bearer [REDACTED_TOKEN]')
    .replace(KEY_VALUE_CREDENTIAL_REGEX, (match) => {
      const sep = match.includes('=') ? '=' : ': ';
      const key = match.split(/[=:\s]/)[0];
      return `${key}${sep}[REDACTED]`;
    })
    .replace(BARE_JWT_REGEX, '[REDACTED_TOKEN]')
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(UUID_REGEX, '[REDACTED_ID]')
    .replace(/(https?:\/\/[^\s"'<>]+)/g, (match) => sanitizeUrl(match));
}

/**
 * Extracts and sanitizes error details, including error.name and stack traces.
 * Untrusted or arbitrary name fields are strictly scrubbed and replaced with static categories.
 */
export function sanitizeError(error) {
  if (!error) {
    return { name: 'Error', message: 'Unknown error', stack: '' };
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: scrubSensitiveText(error).slice(0, 500),
      stack: '',
    };
  }

  // 1. Sanitize error.name: replace with 'Error' if it contains emails, credentials, UUIDs, or arbitrary text
  const rawName = typeof error.name === 'string' ? error.name.trim() : 'Error';
  const scrubbedName = scrubSensitiveText(rawName);
  let name = 'Error';
  if (
    SAFE_NAME_REGEX.test(rawName) &&
    !scrubbedName.includes('[REDACTED') &&
    !/@/.test(rawName) &&
    !UUID_REGEX.test(rawName)
  ) {
    name = rawName;
  }

  // 2. Sanitize error.message
  const message = typeof error.message === 'string'
    ? scrubSensitiveText(error.message).slice(0, 500)
    : 'Unknown error';

  // 3. Sanitize error.stack: restrict to genuine stack frame lines
  let stack = '';
  if (typeof error.stack === 'string') {
    const rawLines = error.stack.split('\n');
    const cleanLines = [];

    for (const line of rawLines) {
      const trimmed = line.trim();
      // Match typical JS stack frames: 'at ...' or 'name@url:line:col'
      if (/^at\s+/i.test(trimmed) || /^[\w$@/.-]+@/i.test(trimmed)) {
        cleanLines.push('    ' + scrubSensitiveText(trimmed));
      }
      if (cleanLines.length >= 15) break;
    }

    if (cleanLines.length > 0) {
      stack = `${name}: ${message}\n${cleanLines.join('\n')}`;
    }
  }

  return { name, message, stack };
}

/**
 * Sanitizes the reporting context, permitting only safe metadata keys and scrubbing text.
 */
export function sanitizeContext(context = {}) {
  if (!context || typeof context !== 'object') return {};

  const safe = {};
  const allowedKeys = ['source', 'status', 'code', 'componentStack', 'filename', 'lineno', 'colno'];

  for (const key of allowedKeys) {
    if (key in context) {
      const val = context[key];
      if (typeof val === 'string') {
        const scrubbed = scrubSensitiveText(val).slice(0, 1000);
        // Code and source must be safe identifiers without redactions or special characters
        if (key === 'code' || key === 'source') {
          if (SAFE_IDENTIFIER_REGEX.test(val) && !scrubbed.includes('[REDACTED') && !/@/.test(val)) {
            safe[key] = val;
          } else {
            safe[key] = key === 'code' ? 'ERROR' : 'unknown';
          }
        } else {
          safe[key] = scrubbed;
        }
      } else if (typeof val === 'number' && Number.isFinite(val)) {
        safe[key] = Math.floor(val);
      } else if (typeof val === 'boolean') {
        safe[key] = val;
      }
    }
  }

  return safe;
}

/**
 * Generates a deduplication signature for an error and context.
 */
function getErrorSignature(sanitizedErr, sanitizedCtx) {
  return `${sanitizedErr.name}:${sanitizedErr.message}:${sanitizedCtx.source || ''}:${sanitizedCtx.filename || ''}:${sanitizedCtx.lineno || ''}`;
}

/**
 * Prunes expired signatures from the deduplication map.
 */
function pruneSignatures(now = Date.now()) {
  for (const [key, timestamp] of recentSignatures.entries()) {
    if (now - timestamp > SIGNATURE_WINDOW_MS) {
      recentSignatures.delete(key);
    }
  }
}

/**
 * Default network transport for reporting errors.
 * Avoids unnecessary cookies and referrer information.
 */
async function defaultTransport(endpointUrl, payload) {
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
 * Central reportError function.
 *
 * Concurrently dispatches independent errors while deduplicating in-flight and
 * recent duplicates, and preventing synchronous recursive loops.
 *
 * @param {Error|string} error
 * @param {object} context
 * @param {object} options
 */
export async function reportError(error, context = {}, {
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}),
  transport,
} = {}) {
  // 1. Synchronous recursion guard (prevents infinite synchronous loops during error handling)
  if (isSyncReporting) {
    return { reported: false, reason: 'recursive_guard' };
  }

  // 2. Check if reporting is enabled
  if (!isErrorReportingEnabled(env)) {
    return { reported: false, reason: 'disabled' };
  }

  // 3. Deduplication via WeakSet (for exact Error object instances already reported)
  if (error && typeof error === 'object') {
    if (reportedErrors.has(error)) {
      return { reported: false, reason: 'deduplicated' };
    }
  }

  isSyncReporting = true;
  let sanitizedErr;
  let sanitizedCtx;
  let signature;
  try {
    sanitizedErr = sanitizeError(error);
    sanitizedCtx = sanitizeContext(context);
    signature = getErrorSignature(sanitizedErr, sanitizedCtx);
  } finally {
    isSyncReporting = false;
  }

  // 4. In-flight duplicate protection (drops identical error while already sending, but NOT independent errors)
  if (inFlightSignatures.has(signature)) {
    return { reported: false, reason: 'deduplicated' };
  }

  // 5. Recent duplicate deduplication (time-window based)
  const now = Date.now();
  pruneSignatures(now);
  if (recentSignatures.has(signature)) {
    return { reported: false, reason: 'deduplicated' };
  }

  // Mark error as reported and currently in flight
  if (error && typeof error === 'object') {
    reportedErrors.add(error);
  }
  inFlightSignatures.add(signature);

  const payload = {
    error: sanitizedErr,
    context: sanitizedCtx,
    url: sanitizeUrl(typeof window !== 'undefined' ? window.location?.href : ''),
    timestamp: new Date(now).toISOString(),
  };

  try {
    const endpoint = env.VITE_ERROR_REPORTING_URL;
    const send = typeof transport === 'function' ? transport : (p) => defaultTransport(endpoint, p);
    await send(payload);
    recentSignatures.set(signature, Date.now());
    return { reported: true, payload };
  } catch {
    // Monitoring failures must NEVER affect application execution
    return { reported: false, reason: 'transport_error' };
  } finally {
    inFlightSignatures.delete(signature);
  }
}

/**
 * Initializes global error listeners for frontend unhandled errors and rejected promises.
 * Returns an unregister cleanup function.
 */
export function initGlobalErrorMonitoring({
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}),
  transport,
} = {}) {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }

  if (!isErrorReportingEnabled(env)) {
    return () => {};
  }

  const handleError = (event) => {
    try {
      const err = event.error || event.message;
      reportError(err, {
        source: 'window_onerror',
        filename: sanitizeUrl(event.filename || ''),
        lineno: event.lineno,
        colno: event.colno,
      }, { env, transport });
    } catch {}
  };

  const handleRejection = (event) => {
    try {
      const reason = event.reason || 'Unhandled Promise Rejection';
      reportError(reason, {
        source: 'unhandled_rejection',
      }, { env, transport });
    } catch {}
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
  };
}
