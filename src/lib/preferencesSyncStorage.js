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
  try {
    const key = getPendingPreferencesKey(ownerId);
    const raw = storage.getItem(key);
    if (!raw) return { state: null, error: null };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.ownerId !== ownerId.toLowerCase()) {
      return { state: null, error: 'Malformed pending preferences record.' };
    }
    return { state: parsed, error: null };
  } catch (err) {
    return { state: null, error: err?.message || 'Storage error reading pending preferences.' };
  }
}

export function writePendingPreferences(storage, ownerId, state) {
  if (!storage || !ownerId) return false;
  const key = getPendingPreferencesKey(ownerId);
  const data = JSON.stringify({
    ...state,
    ownerId: ownerId.toLowerCase(),
  });
  storage.setItem(key, data);
  return true;
}

export function clearPendingPreferences(storage, ownerId) {
  if (!storage || !ownerId) return;
  try {
    const key = getPendingPreferencesKey(ownerId);
    storage.removeItem(key);
  } catch {
    // best-effort cleanup
  }
}
