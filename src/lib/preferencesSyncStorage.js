/**
 * Owner-scoped storage helpers for account preferences sync pending state.
 */

export function getPendingPreferencesKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string') {
    throw new TypeError('Valid ownerId string required to get pending preferences key.');
  }
  return `s2s_user_${ownerId.toLowerCase()}_pending_preferences_sync_v1`;
}

export function readPendingPreferences(storage, ownerId) {
  if (!storage || !ownerId) return { state: null, error: null };
  const key = getPendingPreferencesKey(ownerId);
  let raw = null;
  try {
    raw = storage.getItem(key);
    if (!raw) return { state: null, error: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.ownerId !== ownerId.toLowerCase()) {
      return { state: null, error: 'Malformed pending preferences record.', raw, corrupt: true };
    }
    return { state: parsed, error: null };
  } catch (err) {
    return {
      state: null,
      error: err?.message || 'Storage error reading pending preferences.',
      raw,
      corrupt: true,
    };
  }
}

export function writePendingPreferences(storage, ownerId, state) {
  if (!storage || !ownerId) return false;
  const key = getPendingPreferencesKey(ownerId);

  // Preserve newer mutations if already recorded in storage
  try {
    const existingRaw = storage.getItem(key);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw);
      if (
        existing &&
        typeof existing.localMutationId === 'number' &&
        typeof state?.localMutationId === 'number' &&
        existing.localMutationId > state.localMutationId
      ) {
        return false;
      }
    }
  } catch {
    // If existing bytes are corrupt, do not silently overwrite without explicit handling
  }

  const data = JSON.stringify({
    ...state,
    ownerId: ownerId.toLowerCase(),
  });
  storage.setItem(key, data);
  return true;
}

export function clearPendingPreferences(storage, ownerId, localMutationId = null) {
  if (!storage || !ownerId) return;
  try {
    const key = getPendingPreferencesKey(ownerId);
    if (localMutationId === null) {
      storage.removeItem(key);
      return;
    }
    const raw = storage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.localMutationId === 'number') {
      if (parsed.localMutationId <= localMutationId) {
        storage.removeItem(key);
      }
    } else {
      storage.removeItem(key);
    }
  } catch {
    // best-effort cleanup
  }
}
