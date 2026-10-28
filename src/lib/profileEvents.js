// Owner IDs only; no private profile data or signed URLs are persisted here.
const listeners = new Set();
export const subscribeProfileChanges = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function notifyProfileChanged(userId) {
  for (const listener of listeners) {
    try { listener(userId); }
    catch { /* A view listener cannot turn a confirmed save into a failed write. */ }
  }
}
