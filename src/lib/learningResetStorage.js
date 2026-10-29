/**
 * Durable owner-scoped storage helpers for learning reset request identity.
 * Reuses the same request_id across retries of an uncertain network request.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getPendingLearningResetKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string') {
    throw new TypeError('Valid ownerId string required to get pending learning reset key.');
  }
  return `s2s_user_${ownerId.toLowerCase()}_pending_learning_reset_v1`;
}

export function readPendingLearningReset(storage, ownerId) {
  if (!storage || !ownerId) return { state: null, error: null };
  const key = getPendingLearningResetKey(ownerId);
  let raw = null;
  try {
    raw = storage.getItem(key);
    if (!raw) return { state: null, error: null };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      parsed.ownerId?.toLowerCase() !== ownerId.toLowerCase() ||
      typeof parsed.requestId !== 'string' ||
      !UUID_REGEX.test(parsed.requestId) ||
      typeof parsed.expectedResetVersion !== 'string'
    ) {
      return { state: null, error: 'Malformed pending learning reset record.', raw, corrupt: true };
    }
    return { state: parsed, error: null };
  } catch (err) {
    return { state: null, error: err?.message || 'Storage error reading pending learning reset.', raw, corrupt: true };
  }
}

export function writePendingLearningReset(storage, ownerId, state) {
  if (!storage || !ownerId || !state) return false;
  if (
    typeof state.requestId !== 'string' ||
    !UUID_REGEX.test(state.requestId) ||
    typeof state.expectedResetVersion !== 'string'
  ) {
    return false;
  }
  const key = getPendingLearningResetKey(ownerId);
  const data = JSON.stringify({
    ...state,
    ownerId: ownerId.toLowerCase(),
  });
  try {
    storage.setItem(key, data);
    return storage.getItem(key) === data;
  } catch {
    return false;
  }
}

export function clearPendingLearningReset(storage, ownerId) {
  if (!storage || !ownerId) return;
  try {
    const key = getPendingLearningResetKey(ownerId);
    storage.removeItem(key);
  } catch {
    // best-effort cleanup
  }
}
