/**
 * Safe return-to path validation.
 *
 * Rejects:
 * - Non-string and empty inputs
 * - Control characters (e.g. \t, \r, \n, ASCII 0-31, 127) anywhere in raw or decoded inputs
 * - Backslashes (including URL-encoded variants like %5c / %5C)
 * - Protocol-relative paths ("//evil.example", "///evil.example", "/\evil.example")
 * - URL-encoded protocol-relative variants (e.g. "/%2f/...", "/%2F%2F...")
 * - External URI schemes ("javascript:", "data:", "https:", "http:", etc.)
 * - URLs that resolve outside the safe base origin
 * - Auth loop destinations (/login, /signup, /auth/callback, /verify-email, /forgot-password, /reset-password)
 * - Malformed percent-encoded sequences
 */
const SAFE_BASE = 'https://safe-origin.internal';

const AUTH_PATHS = new Set([
  '/login',
  '/signup',
  '/auth/callback',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
]);

function hasControlCharacter(str) {
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function normalizePathname(pathname) {
  const lower = pathname.toLowerCase();
  const trimmed = lower.replace(/\/+$/, '');
  return trimmed || '/';
}

function resolveSafeFallback(fallback) {
  if (!fallback || typeof fallback !== 'string') return '/';
  const trimmed = fallback.trim();
  if (hasControlCharacter(trimmed) || trimmed.includes('\\') || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return '/';
  }
  try {
    const parsed = new URL(trimmed, SAFE_BASE);
    if (parsed.origin !== SAFE_BASE) return '/';
    const norm = normalizePathname(parsed.pathname);
    if (AUTH_PATHS.has(norm)) return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}

export function safeReturnPath(raw, fallback = '/') {
  const safeDefault = resolveSafeFallback(fallback);
  if (!raw || typeof raw !== 'string') return safeDefault;

  // 1. Reject control characters in raw input
  if (hasControlCharacter(raw)) return safeDefault;

  // 2. Reject backslashes (literal or encoded %5c)
  if (raw.includes('\\') || /%5c/i.test(raw)) return safeDefault;

  const trimmed = raw.trim();

  // 3. Must begin with a single slash, not // or /\ or encoded slash
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) return safeDefault;
  if (/^\/(?:%2f|\/)/i.test(trimmed) || /%2f%2f/i.test(trimmed)) return safeDefault;

  // 4. Reject scheme prefixes (e.g. javascript:, data:, https:)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return safeDefault;

  // 5. Decode check: reject malformed encodings, decoded control chars, backslashes, or scheme prefixes
  try {
    const decoded = decodeURIComponent(trimmed);
    if (hasControlCharacter(decoded) || decoded.includes('\\')) return safeDefault;
    if (decoded.startsWith('//') || decoded.startsWith('/\\')) return safeDefault;
    if (/^[a-z][a-z0-9+.-]*:/i.test(decoded)) return safeDefault;
  } catch {
    return safeDefault;
  }

  // 6. Verify against a fixed origin to guarantee the resolved URL stays internal
  try {
    const parsed = new URL(trimmed, SAFE_BASE);
    if (parsed.origin !== SAFE_BASE) return safeDefault;
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return safeDefault;

    // 7. Guard against redirect loops to authentication and recovery routes
    const normalized = normalizePathname(parsed.pathname);
    if (AUTH_PATHS.has(normalized)) return safeDefault;

    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return safeDefault;
  }
}
