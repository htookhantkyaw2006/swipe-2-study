/**
 * Safe return-to path validation. Only internal app paths are allowed.
 * Rejects absolute URLs, protocol-relative URLs, schemes, backslashes,
 * or anything that could redirect to an external origin.
 */
export function safeReturnPath(raw) {
  if (!raw || typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  // Must start with / and not with // or /\
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/';
  }
  // Reject schemes (e.g. javascript:, data:, https:)
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return '/';
  }
  return trimmed;
}
