/**
 * Durable owner-scoped storage helpers for learning reset request identity.
 * Reuses the same request_id across retries of an uncertain network request.
 */

export function getPendingLearningResetKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string') {
    throw new TypeError('Valid ownerId string required to get pending learning reset key.');
  }
  return `s2s_user_${ownerId.toLowerCase()}_pending_learning_reset_v1`;
}

export function readPendingLearningReset(storage, ownerId) {
  if (!storage || !ownerId) return { state: null, error: null };
  try {
    const key = getPendingLearningResetKey(ownerId);
    const raw = storage.getItem(key);
    if (!raw) return { state: null, error: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.ownerId !== ownerId.toLowerCase()) {
      return { state: null, error: 'Malformed pending learning reset record.' };
    }
    return { state: parsed, error: null };
  } catch (err) {
    return { state: null, error: err?.message || 'Storage error reading pending learning reset.' };
  }
}

export function writePendingLearningReset(storage, ownerId, state) {
  if (!storage || !ownerId) return false;
  const key = getPendingLearningResetKey(ownerId);
  const data = JSON.stringify({
    ...state,
    ownerId: ownerId.toLowerCase(),
  });
  storage.setItem(key, data);
  return true;
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

