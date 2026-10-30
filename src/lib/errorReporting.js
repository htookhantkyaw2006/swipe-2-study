/**
 * Centralized, Privacy-Conscious Error Monitoring
 *
 * Captures unhandled frontend errors, rejected promises, route boundary errors,
 * and server/edge errors while strictly stripping all PII, tokens, credentials,
 * and sensitive URL parameters.
 *
 * Disabled by default. Activated only when VITE_ERROR_REPORTING_ENABLED === 'true'
 * and VITE_ERROR_REPORTING_URL is configured.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const TOKEN_REGEX = /(?:bearer\s+|token[=:]\s*|jwt[=:]\s*|key[=:]\s*)[a-zA-Z0-9._~+/-]{10,}/gi;
const PASSWORD_REGEX = /(?:password|passwd|secret)[=:\s]+[^\s,"'&]+/gi;
const AUTH_HEADER_REGEX = /authorization:\s*[^\r\n]+/gi;

const reportedErrors = new WeakSet();
const recentSignatures = new Map();
const SIGNATURE_WINDOW_MS = 5000;

let isReporting = false;

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
    return stripped.replace(EMAIL_REGEX, '[REDACTED_EMAIL]').replace(TOKEN_REGEX, '[REDACTED_TOKEN]');
  }
}

/**
 * Sanitizes an error message or stack string, stripping tokens, emails, passwords,
 * and sensitive URL parameters.
 */
export function scrubSensitiveText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(AUTH_HEADER_REGEX, 'Authorization: [REDACTED]')
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(PASSWORD_REGEX, 'password=[REDACTED]')
    .replace(TOKEN_REGEX, '[REDACTED_TOKEN]')
    .replace(/(https?:\/\/[^\s"'<>]+)/g, (match) => sanitizeUrl(match));
}

/**
 * Extracts and sanitizes error details.
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

  const name = typeof error.name === 'string' ? error.name.slice(0, 100) : 'Error';
  const message = typeof error.message === 'string' ? scrubSensitiveText(error.message).slice(0, 500) : 'Unknown error';
  let stack = typeof error.stack === 'string' ? scrubSensitiveText(error.stack) : '';

  // Bound stack trace length (max 20 lines)
  if (stack) {
    stack = stack.split('\n').slice(0, 20).join('\n');
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
        safe[key] = scrubSensitiveText(val).slice(0, 1000);
      } else if (typeof val === 'number' || typeof val === 'boolean') {
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
 */
async function defaultTransport(endpointUrl, payload) {
  if (typeof globalThis.fetch !== 'function') return;
  await globalThis.fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  });
}

/**
 * Central reportError function.
 *
 * @param {Error|string} error
 * @param {object} context
 * @param {object} options
 */
export async function reportError(error, context = {}, {
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}),
  transport,
} = {}) {
  // 1. Recursive reporting guard
  if (isReporting) {
    return { reported: false, reason: 'recursive_guard' };
  }

  // 2. Check if reporting is enabled
  if (!isErrorReportingEnabled(env)) {
    return { reported: false, reason: 'disabled' };
  }

  // 3. Deduplication via WeakSet (for exact Error object instances)
  if (error && typeof error === 'object') {
    if (reportedErrors.has(error)) {
      return { reported: false, reason: 'deduplicated' };
    }
    reportedErrors.add(error);
  }

  const sanitizedErr = sanitizeError(error);
  const sanitizedCtx = sanitizeContext(context);

  // 4. Deduplication via signature (for identical errors across boundary & window.onerror)
  const now = Date.now();
  pruneSignatures(now);
  const signature = getErrorSignature(sanitizedErr, sanitizedCtx);
  if (recentSignatures.has(signature)) {
    return { reported: false, reason: 'deduplicated' };
  }
  recentSignatures.set(signature, now);

  const payload = {
    error: sanitizedErr,
    context: sanitizedCtx,
    url: sanitizeUrl(typeof window !== 'undefined' ? window.location?.href : ''),
    timestamp: new Date(now).toISOString(),
  };

  isReporting = true;
  try {
    const endpoint = env.VITE_ERROR_REPORTING_URL;
    const send = typeof transport === 'function' ? transport : (p) => defaultTransport(endpoint, p);
    await send(payload);
    return { reported: true, payload };
  } catch {
    // Monitoring failures must NEVER affect application execution
    return { reported: false, reason: 'transport_error' };
  } finally {
    isReporting = false;
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
