import { decimalVersion } from './cloudImportRecords.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getPendingSyncRequestKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string' || !UUID_REGEX.test(ownerId)) {
    throw new TypeError('Owner ID must be a valid UUID');
  }
  return `s2s_user_${ownerId.toLowerCase()}_pending_sync_request_v1`;
}

export function validatePendingSyncRequest(request, expectedOwnerId = null) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { valid: false, error: 'Invalid pending sync request schema' };
  }
  if (request.schemaVersion !== 1) {
    return { valid: false, error: 'Unsupported schema version' };
  }
  if (typeof request.ownerId !== 'string' || !UUID_REGEX.test(request.ownerId)) {
    return { valid: false, error: 'Invalid owner ID' };
  }
  if (expectedOwnerId && request.ownerId.toLowerCase() !== expectedOwnerId.toLowerCase()) {
    return { valid: false, error: 'Owner mismatch' };
  }
  if (typeof request.requestId !== 'string' || !UUID_REGEX.test(request.requestId)) {
    return { valid: false, error: 'Invalid request ID' };
  }
  if (!decimalVersion(request.resetVersion)) {
    return { valid: false, error: 'Invalid reset version' };
  }
  if (!Array.isArray(request.mutations) || request.mutations.length === 0) {
    return { valid: false, error: 'Invalid mutations array' };
  }
  if (!request.itemsSnapshot || typeof request.itemsSnapshot !== 'object' || Array.isArray(request.itemsSnapshot)) {
    return { valid: false, error: 'Invalid items snapshot' };
  }
  return { valid: true, error: null };
}

export function readPendingSyncRequest(storage, ownerId) {
  try {
    const key = getPendingSyncRequestKey(ownerId);
    const raw = storage.getItem(key);
    if (!raw) return { request: null, error: null };
    const parsed = JSON.parse(raw);
    const validation = validatePendingSyncRequest(parsed, ownerId);
    if (!validation.valid) {
      return { request: null, error: validation.error };
    }
    return { request: parsed, error: null };
  } catch (err) {
    return { request: null, error: err?.message || 'Storage error' };
  }
}

export function writePendingSyncRequest(storage, ownerId, request) {
  const key = getPendingSyncRequestKey(ownerId);
  const validation = validatePendingSyncRequest(request, ownerId);
  if (!validation.valid) {
    throw new TypeError(`Cannot persist invalid pending sync request: ${validation.error}`);
  }
  const raw = JSON.stringify(request);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) {
    throw new Error('Device storage failed to confirm pending request.');
  }
}

export function clearPendingSyncRequest(storage, ownerId, requestId = null) {
  try {
    const key = getPendingSyncRequestKey(ownerId);
    if (!requestId) {
      storage.removeItem(key);
      return;
    }
    const raw = storage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed?.requestId === requestId) {
      storage.removeItem(key);
    }
  } catch {
    // Best-effort removal
  }
}

