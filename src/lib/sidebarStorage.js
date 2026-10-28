export const SIDEBAR_STORAGE_KEY = 'sidebar_collapsed';

export function readCollapsedPreference(storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  try {
    if (!storage) return false;
    return storage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeCollapsedPreference(collapsed, storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  try {
    if (!storage) return;
    storage.setItem(SIDEBAR_STORAGE_KEY, String(Boolean(collapsed)));
  } catch {
    // Graceful fallback when sessionStorage is restricted or quota is exceeded.
  }
}
