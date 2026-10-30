/**
 * Centralized, Privacy-Conscious Error Monitoring
 *
 * Captures unhandled frontend errors, rejected promises, route boundary errors,
 * and server/edge errors while strictly enforcing static approved error categories
 * and messages. Raw arbitrary error messages, rejection strings, component text,
 * and user filesystem paths are NEVER sent to the telemetry endpoint.
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

export const APPROVED_ERROR_CATEGORIES = Object.freeze({
  TypeError: 'Type error occurred',
  ReferenceError: 'Reference error occurred',
  RangeError: 'Range error occurred',
  SyntaxError: 'Syntax error occurred',
  URIError: 'URI error occurred',
  NetworkError: 'Network request failed',
  ChunkLoadError: 'Dynamic import chunk failed to load',
  AbortError: 'Operation was aborted',
  TimeoutError: 'Operation timed out',
  DOMException: 'DOM exception occurred',
  UnhandledRejection: 'Unhandled promise rejection occurred',
  ApplicationError: 'Application error occurred',
  Error: 'An unexpected application error occurred',
});

export const APPROVED_ERROR_CODES = Object.freeze({
  SERVER_CONFIG_ERROR: 'Server configuration error',
  RATE_LIMITED: 'Rate limit exceeded',
  CHUNK_LOAD_FAILED: 'Dynamic import chunk failed to load',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  METHOD_NOT_ALLOWED: 'Method not allowed',
  UNAUTHORIZED: 'Authentication required',
  INVALID_REQUEST: 'Invalid request',
  NETWORK_ERROR: 'Network request failed',
  NOT_FOUND: 'Resource not found',
  ERROR: 'An unexpected error occurred',
});

export const APPROVED_SOURCES = Object.freeze([
  'RouteErrorBoundary',
  'window_onerror',
  'unhandled_rejection',
  'accountDeletionHandler',
  'test',
]);

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

export const STATIC_ASSET_PLACEHOLDER = '/assets/app.js';

export const APPROVED_APP_ROUTES = Object.freeze([
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/auth/callback',
  '/learn',
  '/learn/session',
  '/learn/review',
  '/learn/review/session',
  '/library',
  '/flashcards',
  '/flashcards/session',
  '/saved',
  '/saved/session',
  '/dictionary',
  '/interest',
  '/writing',
  '/radicals',
  '/kana',
  '/sounds',
  '/notifications',
  '/profile',
  '/profile/edit',
  '/premium',
  '/settings',
  '/about',
  '/privacy',
  '/terms',
  '/support',
]);

const APPROVED_LEVEL_IDS_SET = new Set(['1', 'hsk1', 'HSK1', '5', 'n5', 'N5']);

export function isApprovedRoute(pathname) {
  if (!pathname || typeof pathname !== 'string') return false;
  const normalized = pathname.replace(/\/+$/, '') || '/';
  if (APPROVED_APP_ROUTES.includes(normalized)) return true;

  // Parameterized routes: /learn/level/:levelId and /flashcards/level/:levelId
  const learnLevelMatch = normalized.match(/^\/learn\/level\/([a-zA-Z0-9_-]+)$/);
  if (learnLevelMatch && APPROVED_LEVEL_IDS_SET.has(learnLevelMatch[1])) return true;

  const flashLevelMatch = normalized.match(/^\/flashcards\/level\/([a-zA-Z0-9_-]+)$/);
  if (flashLevelMatch && APPROVED_LEVEL_IDS_SET.has(flashLevelMatch[1])) return true;

  // Approved asset URLs
  if (/^\/assets\/[a-zA-Z0-9._-]+\.(?:js|mjs|css|wasm|map|html|png|svg|ico|webp)$/i.test(normalized)) return true;
  if (/^\/(?:index\.html|favicon\.ico|robots\.txt|manifest\.json|sw\.js)$/i.test(normalized)) return true;

  return false;
}

/**
 * Strips query parameters, hash fragments, and sensitive credentials from URLs.
 * Validates against approved application routes and assets; unknown paths
 * become a static placeholder to prevent leakage of arbitrary segments or user text.
 */
export function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  try {
    const isRelative = trimmed.startsWith('/') || trimmed.startsWith('.');
    const parsed = new URL(trimmed, 'https://swipe2study.app');
    const pathname = parsed.pathname;

    if (isApprovedRoute(pathname)) {
      return isRelative ? pathname : `${parsed.origin}${pathname}`;
    }

    // Unknown or unapproved path: return static placeholder
    // Do not preserve arbitrary path segments, traversal, usernames, or user text
    return isRelative ? '/' : `${parsed.origin}/`;
  } catch {
    const stripped = trimmed.split(/[?#]/)[0];
    const isRelative = stripped.startsWith('/') || stripped.startsWith('.');
    return isRelative ? '/' : 'https://swipe2study.app/';
  }
}

/**
 * Strips tokens, emails, passwords, bare JWTs, JSON credentials, and UUIDs.
 * Used as defense-in-depth on validated diagnostics.
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

const APPROVED_ASSET_REGEX = /^(?:https?:\/\/[^/]+)?(?:\/)?assets\/([a-zA-Z0-9._-]+\.(?:js|mjs|css|wasm|map|html|png|svg|ico|webp|jpg|jpeg))$/i;
const APPROVED_ROOT_ASSET_REGEX = /^(?:https?:\/\/[^/]+)?(?:\/)?(index\.html|favicon\.ico|robots\.txt|manifest\.json|sw\.js)$/i;
const APPROVED_SRC_REGEX = /^src\/(?:(?:components|courses|data|lib|pages|server|assets)\/[a-zA-Z0-9._/-]+\.(?:js|jsx|ts|tsx|json|css|html)|(?:App|main|index|responsive-tools)\.(?:js|jsx|css|html))$/i;

/**
 * Sanitizes a file path or URL to strictly approved application asset or source references.
 * Unknown paths, traversal, usernames, or arbitrary user directory structures become
 * the static placeholder '/assets/app.js'.
 */
export function sanitizeAssetPath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return '';
  const trimmed = rawPath.trim();
  if (!trimmed) return '';

  // Strip query strings and hash fragments
  const clean = trimmed.split(/[?#]/)[0];
  const normalized = clean.replace(/\\/g, '/');

  // Reject path traversal explicitly
  if (normalized.includes('..')) {
    return STATIC_ASSET_PLACEHOLDER;
  }

  // 1. Web asset check (e.g. /assets/index-D6ZxBklE.js or https://.../assets/foo.js)
  const assetMatch = normalized.match(APPROVED_ASSET_REGEX);
  if (assetMatch) {
    return '/assets/' + assetMatch[1];
  }

  // 2. Root static asset check (e.g. /index.html)
  const rootAssetMatch = normalized.match(APPROVED_ROOT_ASSET_REGEX);
  if (rootAssetMatch) {
    return '/' + rootAssetMatch[1];
  }

  // 3. Source reference check (e.g. src/lib/errorReporting.js or C:/Users/.../src/lib/foo.js)
  let srcCandidate = null;
  if (normalized.startsWith('src/')) {
    srcCandidate = normalized;
  } else {
    const srcIdx = normalized.lastIndexOf('/src/');
    if (srcIdx !== -1) {
      srcCandidate = normalized.slice(srcIdx + 1); // "src/..."
    }
  }

  if (srcCandidate && APPROVED_SRC_REGEX.test(srcCandidate)) {
    return srcCandidate;
  }

  // Fallback for unknown / arbitrary paths (e.g. /private/MY_PRIVATE_NOTE/file.js)
  return STATIC_ASSET_PLACEHOLDER;
}

/**
 * Classifies an untrusted error or rejection into a static approved error category and message.
 * Strictly guarantees that no arbitrary learner text, notes, or raw rejection strings are forwarded.
 */
function classifyError(error, context = {}) {
  // 1. Check if an approved code is provided in context or error
  const rawCode = context?.code || error?.code;
  if (typeof rawCode === 'string' && rawCode in APPROVED_ERROR_CODES) {
    return {
      name: 'ApplicationError',
      message: APPROVED_ERROR_CODES[rawCode],
    };
  }

  // 2. If it's a raw string rejection
  if (typeof error === 'string') {
    return {
      name: 'UnhandledRejection',
      message: APPROVED_ERROR_CATEGORIES.UnhandledRejection,
    };
  }

  if (!error || typeof error !== 'object') {
    return {
      name: 'Error',
      message: APPROVED_ERROR_CATEGORIES.Error,
    };
  }

  // 3. Inspect error.name against approved categories
  const rawName = typeof error.name === 'string' ? error.name.trim() : '';
  if (rawName in APPROVED_ERROR_CATEGORIES) {
    return {
      name: rawName,
      message: APPROVED_ERROR_CATEGORIES[rawName],
    };
  }

  // 4. Check for chunk load or network keywords in message as coarse diagnostic
  const rawMsg = typeof error.message === 'string' ? error.message : '';
  if (/chunk|dynamically imported/i.test(rawMsg)) {
    return {
      name: 'ChunkLoadError',
      message: APPROVED_ERROR_CATEGORIES.ChunkLoadError,
    };
  }
  if (/network|failed to fetch|load failed/i.test(rawMsg)) {
    return {
      name: 'NetworkError',
      message: APPROVED_ERROR_CATEGORIES.NetworkError,
    };
  }
  if (/aborted/i.test(rawMsg)) {
    return {
      name: 'AbortError',
      message: APPROVED_ERROR_CATEGORIES.AbortError,
    };
  }

  // Default static category
  return {
    name: 'Error',
    message: APPROVED_ERROR_CATEGORIES.Error,
  };
}

/**
 * Validates and extracts safe asset stack frames.
 * Replaces the unscrubbed message header with static approved category/message,
 * drops arbitrary text, and strips local user directories from paths.
 */
function sanitizeStack(rawStack, staticName, staticMessage) {
  if (!rawStack || typeof rawStack !== 'string') {
    return '';
  }

  const lines = rawStack.split('\n');
  const cleanFrames = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match 'at functionName (path:line:col)' or 'at path:line:col'
    const atMatch = trimmed.match(/^at\s+(?:([A-Za-z0-9_$.<>]+)\s+\((.+):(\d+):(\d+)\)|(.+):(\d+):(\d+))/);
    if (atMatch) {
      if (atMatch[1]) {
        const funcName = atMatch[1];
        const safePath = sanitizeAssetPath(atMatch[2]);
        const lineNo = atMatch[3];
        const colNo = atMatch[4];
        cleanFrames.push(`    at ${funcName} (${safePath}:${lineNo}:${colNo})`);
      } else if (atMatch[5]) {
        const safePath = sanitizeAssetPath(atMatch[5]);
        const lineNo = atMatch[6];
        const colNo = atMatch[7];
        cleanFrames.push(`    at ${safePath}:${lineNo}:${colNo}`);
      }
    } else {
      // Safari / Firefox style: funcName@path:line:col
      const safariMatch = trimmed.match(/^([A-Za-z0-9_$.]+)?@(.+):(\d+):(\d+)/);
      if (safariMatch) {
        const funcName = safariMatch[1] || 'anonymous';
        const safePath = sanitizeAssetPath(safariMatch[2]);
        const lineNo = safariMatch[3];
        const colNo = safariMatch[4];
        cleanFrames.push(`    at ${funcName} (${safePath}:${lineNo}:${colNo})`);
      }
    }

    if (cleanFrames.length >= 10) break;
  }

  if (cleanFrames.length === 0) {
    return '';
  }

  return `${staticName}: ${staticMessage}\n${cleanFrames.join('\n')}`;
}

/**
 * Extracts and sanitizes error details using static approved categories and messages.
 * Arbitrary learner text, raw rejection strings, and user directory paths are strictly discarded.
 */
export function sanitizeError(error, context = {}) {
  const { name, message } = classifyError(error, context);
  const rawStack = error && typeof error === 'object' && typeof error.stack === 'string' ? error.stack : '';
  const stack = sanitizeStack(rawStack, name, message);

  return { name, message, stack };
}

/**
 * Sanitizes the reporting context, permitting only approved enum sources/codes,
 * stripped component names, and safe asset paths.
 */
export function sanitizeContext(context = {}) {
  if (!context || typeof context !== 'object') return {};

  const safe = {};

  // 1. source: must be in approved sources
  if ('source' in context) {
    const rawSource = String(context.source);
    safe.source = APPROVED_SOURCES.includes(rawSource) ? rawSource : 'unknown';
  }

  // 2. code: must be in approved codes
  if ('code' in context) {
    const rawCode = String(context.code);
    safe.code = rawCode in APPROVED_ERROR_CODES ? rawCode : 'ERROR';
  }

  // 3. status: must be valid HTTP status
  if ('status' in context) {
    const statusNum = Number(context.status);
    if (Number.isInteger(statusNum) && statusNum >= 100 && statusNum <= 599) {
      safe.status = statusNum;
    }
  }

  // 4. componentStack: only allow validated component names (no props, text, or attributes)
  if ('componentStack' in context && typeof context.componentStack === 'string') {
    const rawComp = context.componentStack;
    const compMatches = [];
    for (const line of rawComp.split('\n')) {
      const match = line.match(/\bin\s+([A-Za-z0-9_]+)/);
      if (match && match[1]) {
        compMatches.push(`    in ${match[1]}`);
      }
      if (compMatches.length >= 10) break;
    }
    if (compMatches.length > 0) {
      safe.componentStack = compMatches.join('\n');
    }
  }

  // 5. filename: validated asset-frame path only (no user directories)
  if ('filename' in context && typeof context.filename === 'string') {
    safe.filename = sanitizeAssetPath(context.filename);
  }

  // 6. lineno, colno: non-negative integers
  if ('lineno' in context && Number.isFinite(context.lineno)) {
    const line = Math.floor(context.lineno);
    if (line >= 0 && line < 1000000) safe.lineno = line;
  }
  if ('colno' in context && Number.isFinite(context.colno)) {
    const col = Math.floor(context.colno);
    if (col >= 0 && col < 100000) safe.colno = col;
  }

  return safe;
}

/**
 * Generates a deduplication signature for an error and context.
 */
function getErrorSignature(sanitizedErr, sanitizedCtx) {
  return `${sanitizedErr.name}:${sanitizedErr.message}:${sanitizedCtx.source || ''}:${sanitizedCtx.code || ''}:${sanitizedCtx.filename || ''}:${sanitizedCtx.lineno || ''}`;
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
  // 1. Synchronous recursion guard
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
    sanitizedCtx = sanitizeContext(context);
    sanitizedErr = sanitizeError(error, sanitizedCtx);
    signature = getErrorSignature(sanitizedErr, sanitizedCtx);
  } finally {
    isSyncReporting = false;
  }

  // 4. In-flight duplicate protection
  if (inFlightSignatures.has(signature)) {
    return { reported: false, reason: 'deduplicated' };
  }

  // 5. Recent duplicate deduplication
  const now = Date.now();
  pruneSignatures(now);
  if (recentSignatures.has(signature)) {
    return { reported: false, reason: 'deduplicated' };
  }

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
        filename: sanitizeAssetPath(event.filename || ''),
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
