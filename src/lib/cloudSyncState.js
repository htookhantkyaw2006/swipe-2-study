import { wordOf, readingOf } from './entry.js';
import { parseLearningDocument } from './learningDocument.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const CLOUD_LANGUAGES = ['zh', 'ja', 'en'];

export const CLOUD_KINDS = [
  'saved_words',
  'review_cards',
  'search_history',
  'written_chars',
  'learned_radicals',
  'learned_kana',
  'learned_sounds',
  'learned_words',
];

export function isCloudTable(language, table) {
  return CLOUD_LANGUAGES.includes(language) && CLOUD_KINDS.includes(table);
}

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
  if (kind === 'saved_words' || kind === 'review_cards' || kind === 'learned_words') {
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

export function mirrorSyncStateToSidecar(storage, state) {
  if (!storage || !state || typeof state !== 'object' || typeof state.ownerId !== 'string') {
    return;
  }
  try {
    const sidecarKey = getSyncStateKey(state.ownerId);
    storage.setItem(sidecarKey, JSON.stringify(state));
  } catch {
    // Best-effort mirror write only; failures do not invalidate confirmed authoritative state
  }
}

export function persistSyncState(storage, state) {
  if (!state || typeof state !== 'object' || typeof state.ownerId !== 'string') {
    throw new TypeError('Invalid sync state: missing or invalid ownerId');
  }
  const ownerId = state.ownerId.toLowerCase();
  const validation = validateSyncState(state, ownerId);
  if (!validation.valid) {
    throw new Error(`Invalid sync state schema: ${validation.error}`);
  }

  const docKey = `s2s_user_${ownerId}_learning_document_v1`;
  const raw = storage.getItem(docKey);

  if (raw !== null && raw !== undefined) {
    // Authoritative document exists: update embedded cloudSync and bump revision
    const doc = parseLearningDocument(raw);
    const nextDoc = {
      ...doc,
      revision: (doc.revision || 0) + 1,
      cloudSync: state,
    };
    const nextRaw = JSON.stringify(nextDoc);
    parseLearningDocument(nextRaw);
    storage.setItem(docKey, nextRaw);
    if (storage.getItem(docKey) !== nextRaw) {
      throw new Error('The local save could not be confirmed.');
    }

    // Only update compatibility mirror after confirmed authoritative commit
    mirrorSyncStateToSidecar(storage, state);
    return;
  }

  // Standalone legacy mode: required sidecar persistence failure must propagate
  const sidecarKey = getSyncStateKey(ownerId);
  const sidecarRaw = JSON.stringify(state);
  storage.setItem(sidecarKey, sidecarRaw);
  if (storage.getItem(sidecarKey) !== sidecarRaw) {
    throw new Error('The local save could not be confirmed.');
  }
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
    ...(nextState.records[key] ?? {}),
    status: 'deleted',
    deletedAt: now(),
  };
  nextState.updatedAt = now();
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
    ...(nextState.records[key] ?? {}),
    status: 'dirty',
    updatedAt: now(),
  };
  nextState.updatedAt = now();
  persistSyncState(storage, nextState);
}
