/**
 * Safe return-to path validation.
 *
 * Rejects:
 * - Non-string and empty inputs
 * - Control characters (e.g. \t, \r, \n, ASCII 0-31, 127) which can be abused
 *   by browsers stripping them to form protocol-relative URLs (e.g. "/\t/evil.example")
 * - Backslashes (which browsers normalize to forward slashes)
 * - Protocol-relative paths ("//evil.example", "///evil.example")
 * - External URI schemes ("javascript:", "data:", "https:", "http:", etc.)
 * - URLs that resolve outside the safe base origin
 */
const SAFE_BASE = 'https://safe-origin.internal';

function hasControlCharacter(str) {
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

export function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';

  // 1. Reject control characters (ASCII 0-31 and 127) anywhere in the input
  if (hasControlCharacter(raw)) return '/';

  // 2. Reject backslashes
  if (raw.includes('\\')) return '/';

  const trimmed = raw.trim();

  // 3. Must begin with a single slash, not //
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/';

  // 4. Reject scheme prefixes (e.g. javascript:, data:, https:)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return '/';

  // 5. Verify against a fixed origin to guarantee the resolved URL stays internal
  try {
    const parsed = new URL(trimmed, SAFE_BASE);
    if (parsed.origin !== SAFE_BASE) return '/';
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return '/';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/';
  }
}
