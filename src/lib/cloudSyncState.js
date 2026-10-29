import { wordOf, readingOf } from './entry.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KIND_FIELDS = {
  search_history: 'term',
  written_chars: 'character',
  learned_radicals: 'radical',
  learned_kana: 'kana',
  learned_sounds: 'sound',
};

export function getSyncStateKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string' || !UUID_REGEX.test(ownerId)) {
    throw new TypeError('Owner ID must be a valid UUID');
  }
  return `s2s_user_${ownerId.toLowerCase()}_cloud_sync_state_v1`;
}

export function recordKey(language, kind, writtenForm, reading = '') {
  const normForm = String(writtenForm || '').normalize('NFC').trim();
  const normReading = String(reading || '').normalize('NFC').trim();
  return `${language}:${kind}:${normForm}:${normReading}`;
}

export function identityOfRow(table, row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  const [language, ...rest] = table.split('_');
  const kind = rest.join('_');
  if (kind === 'saved_words' || kind === 'review_cards') {
    const written = wordOf(row);
    if (typeof written !== 'string' || written.trim().length === 0) {
      throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
    }
    const reading = row.pronunciation ?? readingOf(row) ?? '';
    if (typeof reading !== 'string') {
      throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
    }
    return recordKey(language, kind, written, reading);
  }
  const field = KIND_FIELDS[kind];
  if (!field) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  const written = row[field];
  if (typeof written !== 'string' || written.trim().length === 0) {
    throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
  }
  return recordKey(language, kind, written, '');
}

export function validateSyncState(state, expectedOwnerId = null) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  if (state.schemaVersion !== 1) {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  if (typeof state.ownerId !== 'string' || !UUID_REGEX.test(state.ownerId)) {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  if (expectedOwnerId && state.ownerId.toLowerCase() !== expectedOwnerId.toLowerCase()) {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  if (state.resetVersion !== undefined && typeof state.resetVersion !== 'string') {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  if (state.records === undefined || state.records === null || typeof state.records !== 'object' || Array.isArray(state.records)) {
    return { valid: false, error: 'Invalid sync state schema' };
  }
  for (const rec of Object.values(state.records)) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !['synced', 'dirty', 'deleted'].includes(rec.status)) {
      return { valid: false, error: 'Invalid sync state schema' };
    }
  }
  return { valid: true, error: null };
}

export function readSyncState(storage, ownerId) {
  const normOwner = ownerId?.toLowerCase();
  const docKey = `s2s_user_${normOwner}_learning_document_v1`;

  // 1. Check authoritative embedded metadata inside learning_document_v1 first
  let docRaw = null;
  let docReadError = false;
  try {
    docRaw = storage.getItem(docKey);
  } catch {
    docReadError = true;
  }

  if (docReadError) {
    return { state: null, error: 'Storage access error' };
  }

  if (docRaw !== null && docRaw !== undefined) {
    let doc = null;
    let parseFailed = false;
    try {
      doc = JSON.parse(docRaw);
    } catch {
      parseFailed = true;
    }

    if (!parseFailed && doc && typeof doc === 'object') {
      if (doc.cloudSync !== undefined) {
        if (doc.cloudSync === null) {
          return { state: null, error: 'Invalid sync state schema' };
        }
        const validation = validateSyncState(doc.cloudSync, ownerId);
        if (!validation.valid) {
          // Authoritative embedded metadata is corrupt; never fall back to old sidecars
          return { state: null, error: validation.error };
        }
        return { state: doc.cloudSync, error: null };
      }
    }
  }

  // 2. Otherwise fall back to reading existing owner-specific sidecar
  const sidecarKey = getSyncStateKey(ownerId);
  let raw;
  try {
    raw = storage.getItem(sidecarKey);
  } catch {
    return { state: null, error: 'Storage access error' };
  }

  if (raw === null || raw === undefined) {
    return { state: null, error: null };
  }

  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { state: null, error: 'Malformed sync state JSON' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: null, error: 'Malformed sync state JSON' };
  }

  const validation = validateSyncState(parsed, ownerId);
  if (!validation.valid) {
    return { state: null, error: validation.error };
  }

  return { state: parsed, error: null };
}

export function persistSyncState(storage, state) {
  const ownerId = state.ownerId.toLowerCase();
  const docKey = `s2s_user_${ownerId}_learning_document_v1`;
  const sidecarKey = getSyncStateKey(ownerId);

  // Update embedded cloudSync if authoritative document exists
  try {
    const raw = storage.getItem(docKey);
    if (raw) {
      const doc = JSON.parse(raw);
      if (doc && typeof doc === 'object' && !Array.isArray(doc) && doc.version === 1) {
        doc.cloudSync = state;
        doc.revision = (doc.revision || 0) + 1;
        storage.setItem(docKey, JSON.stringify(doc));
      }
    }
  } catch {}

  // Update legacy sidecar
  try {
    storage.setItem(sidecarKey, JSON.stringify(state));
  } catch {}
}

export function recordLocalDeletion(storage, ownerId, language, kind, writtenForm, reading = '', now = () => new Date().toISOString()) {
  const { state, error } = readSyncState(storage, ownerId);
  if (error) {
    throw new Error(`Could not update sync state: ${error}`);
  }
  const nextState = state || {
    schemaVersion: 1,
    ownerId: ownerId.toLowerCase(),
    resetVersion: '0',
    lastServerTime: null,
    records: {},
  };
  const key = recordKey(language, kind, writtenForm, reading);
  nextState.records[key] = {
    status: 'deleted',
    deletedAt: now(),
  };
  persistSyncState(storage, nextState);
}

export function recordLocalDirty(storage, ownerId, language, kind, writtenForm, reading = '', now = () => new Date().toISOString()) {
  const { state, error } = readSyncState(storage, ownerId);
  if (error) {
    throw new Error(`Could not update sync state: ${error}`);
  }
  const nextState = state || {
    schemaVersion: 1,
    ownerId: ownerId.toLowerCase(),
    resetVersion: '0',
    lastServerTime: null,
    records: {},
  };
  const key = recordKey(language, kind, writtenForm, reading);
  nextState.records[key] = {
    status: 'dirty',
    updatedAt: now(),
  };
  persistSyncState(storage, nextState);
}
