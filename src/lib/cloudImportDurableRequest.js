import { prepareCloudImportRequest, submitCloudImport } from './cloudImportService.js';
import { decimalVersion, validTimestamp } from './cloudImportRecords.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_REGEX = /^[a-f0-9]{64}$/;

export const DURABLE_STATES = Object.freeze([
  'not_sent',
  'unconfirmed',
  'server_rejected',
  'server_acknowledged',
  'locally_applied',
]);

export function getDurableRequestKey(ownerId) {
  if (!ownerId || typeof ownerId !== 'string' || !UUID_REGEX.test(ownerId)) {
    throw new TypeError('Owner ID must be a valid UUID');
  }
  return `s2s_user_${ownerId.toLowerCase()}_cloud_import_request_v1`;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function validateDurableRecord(record, expectedOwnerId = null) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Durable record must be an object.');
  }
  if (record.schemaVersion !== 1) {
    throw new Error('Unsupported durable record schema version.');
  }
  if (!record.ownerId || !UUID_REGEX.test(record.ownerId)) {
    throw new Error('Invalid owner ID in durable record.');
  }
  if (expectedOwnerId && record.ownerId.toLowerCase() !== expectedOwnerId.toLowerCase()) {
    throw new Error('Durable record owner does not match expected user.');
  }
  if (!record.requestId || !UUID_REGEX.test(record.requestId)) {
    throw new Error('Invalid requestId in durable record.');
  }
  if (!decimalVersion(record.expectedResetVersion)) {
    throw new Error('Invalid expectedResetVersion in durable record.');
  }
  if (!HASH_REGEX.test(record.sourceFingerprint)) {
    throw new Error('Invalid sourceFingerprint in durable record.');
  }
  if (!['merge', 'account-only'].includes(record.choice)) {
    throw new Error('Invalid choice in durable record.');
  }
  if (!Array.isArray(record.items)) {
    throw new Error('Invalid items in durable record.');
  }
  if (!DURABLE_STATES.includes(record.state)) {
    throw new Error(`Invalid state "${record.state}" in durable record.`);
  }
  if (!validTimestamp(record.createdAt) || !validTimestamp(record.updatedAt)) {
    throw new Error('Invalid timestamps in durable record.');
  }
  return record;
}

export function readDurableRecord(storage, ownerId) {
  const key = getDurableRequestKey(ownerId);
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { record: null, raw: null, error: 'Storage access failed.', code: 'STORAGE_UNAVAILABLE' };
  }

  if (raw === null || raw === undefined) {
    return { record: null, raw: null, error: null };
  }

  try {
    const parsed = JSON.parse(raw);
    validateDurableRecord(parsed, ownerId);
    return { record: parsed, raw, error: null };
  } catch {
    // Preserve corrupted bytes without clearing storage
    return {
      record: null,
      raw,
      error: 'Stored cloud import request is corrupted. Original data has been preserved.',
      code: 'CORRUPTED_STORAGE',
    };
  }
}

export function persistDurableRecord(storage, record) {
  validateDurableRecord(record);
  const key = getDurableRequestKey(record.ownerId);
  const serialized = JSON.stringify(record);
  try {
    storage.setItem(key, serialized);
    // Readback verification
    const verified = storage.getItem(key);
    if (verified !== serialized) {
      throw new Error('Storage write verification failed.');
    }
  } catch (cause) {
    const error = new Error('Could not persist cloud import request to storage before transmission.');
    error.code = 'STORAGE_PERSISTENCE_FAILED';
    error.cause = cause;
    throw error;
  }
}

export function createDurableRecord({
  ownerId,
  expectedResetVersion,
  sourceFingerprint,
  choice,
  items,
  requestId,
  makeId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  const req = prepareCloudImportRequest({
    ownerId,
    expectedResetVersion,
    sourceFingerprint,
    choice,
    items,
    makeId: requestId ? () => requestId : makeId,
  });

  const timestamp = now();
  const record = {
    ...req,
    state: 'not_sent',
    createdAt: timestamp,
    updatedAt: timestamp,
    error: null,
    receipt: null,
  };
  return validateDurableRecord(record);
}

/**
 * Executes a durable cloud import request through all lifecycle states:
 * 1. Checks existing durable record. If an unconfirmed or acknowledged record exists,
 *    reuses its requestId and envelope.
 * 2. Persists to storage BEFORE network transmission. If storage fails, halts without sending.
 * 3. Transitions state across not_sent -> unconfirmed -> server_acknowledged / server_rejected.
 * 4. Guards identity and generation at every async boundary.
 */
export async function executeDurableImport(client, storage, {
  ownerId,
  expectedResetVersion,
  sourceFingerprint,
  choice,
  items,
  isCurrent,
  now = () => new Date().toISOString(),
}) {
  const guard = () => {
    if (typeof isCurrent === 'function' && !isCurrent()) {
      const err = new Error('Your account changed. Reopen cloud import for the current account.');
      err.code = 'ACCOUNT_CHANGED';
      throw err;
    }
  };

  guard();

  // Check if there is an existing durable record for this user
  const existingResult = readDurableRecord(storage, ownerId);
  if (existingResult.error) {
    return {
      outcome: 'storage_error',
      error: existingResult.error,
      code: existingResult.code || 'STORAGE_UNAVAILABLE',
      record: null,
    };
  }

  let record = existingResult.record;

  if (record) {
    // If reset version changed between stored request and currently expected reset version:
    if (record.expectedResetVersion !== expectedResetVersion) {
      // Cannot replay old request after a reset. Stop and report mismatch.
      record.state = 'server_rejected';
      record.error = 'Learning data was reset. Reload the cloud snapshot before preparing another import.';
      record.updatedAt = now();
      try {
        persistDurableRecord(storage, record);
      } catch {
        // preserve existing if persist fails
      }
      return {
        outcome: 'reset_version_mismatch',
        error: record.error,
        code: 'RESET_VERSION_CHANGED',
        record,
      };
    }

    // Reject choice mismatch on unresolved request
    if (choice && record.choice !== choice) {
      return {
        outcome: 'choice_mismatch',
        error: 'Cannot change choice on an unresolved request.',
        code: 'CHOICE_MISMATCH',
        record,
      };
    }

    // Reject fingerprint mismatch on unresolved request
    if (sourceFingerprint && record.sourceFingerprint !== sourceFingerprint) {
      return {
        outcome: 'fingerprint_mismatch',
        error: 'Source fingerprint does not match unresolved request.',
        code: 'FINGERPRINT_MISMATCH',
        record,
      };
    }

    // If already acknowledged by server, return immediately for hydration
    if (record.state === 'server_acknowledged' || record.state === 'locally_applied') {
      return {
        outcome: record.state,
        receipt: record.receipt,
        record,
        error: null,
      };
    }
  } else {
    // Create new durable record
    record = createDurableRecord({
      ownerId,
      expectedResetVersion,
      sourceFingerprint,
      choice,
      items,
      now,
    });

    // Persist BEFORE sending over network. If storage fails (quota etc.), DO NOT SEND.
    try {
      persistDurableRecord(storage, record);
    } catch {
      return {
        outcome: 'storage_error',
        error: 'Device storage is full or unavailable. Cloud import request was not sent.',
        code: 'STORAGE_UNAVAILABLE',
        record: null,
      };
    }
  }

  guard();

  // Mark as unconfirmed before or as it goes over the wire
  record.state = 'unconfirmed';
  record.updatedAt = now();
  try {
    persistDurableRecord(storage, record);
  } catch {
    return {
      outcome: 'storage_error',
      error: 'Could not update request tracking state.',
      code: 'STORAGE_UNAVAILABLE',
      record,
    };
  }

  // Request envelope matching submitCloudImport expectations
  const requestPayload = {
    schemaVersion: record.schemaVersion,
    ownerId: record.ownerId,
    requestId: record.requestId,
    expectedResetVersion: record.expectedResetVersion,
    sourceFingerprint: record.sourceFingerprint,
    choice: record.choice,
    items: record.items,
  };

  const submitResult = await submitCloudImport(client, {
    request: requestPayload,
    expectedUserId: ownerId,
    isCurrent,
  });

  guard();

  if (submitResult.cloudOutcome === 'confirmed' && submitResult.receipt) {
    record.state = 'server_acknowledged';
    record.receipt = copy(submitResult.receipt);
    record.error = null;
    record.updatedAt = now();
    try {
      persistDurableRecord(storage, record);
    } catch {
      // Even if updating storage here fails, we still have the receipt in memory
    }
    return {
      outcome: 'server_acknowledged',
      receipt: record.receipt,
      record,
      error: null,
    };
  }

  if (submitResult.code === 'RESET_VERSION_CHANGED' || submitResult.code === 'ACCOUNT_UNAVAILABLE') {
    record.state = 'server_rejected';
    record.error = submitResult.error;
    record.updatedAt = now();
    try {
      persistDurableRecord(storage, record);
    } catch {}
    return {
      outcome: 'server_rejected',
      error: submitResult.error,
      code: submitResult.code,
      record,
    };
  }

  // Unconfirmed / network failure / timeout: keep request intact with same requestId for retry
  record.state = 'unconfirmed';
  record.error = submitResult.error;
  record.updatedAt = now();
  try {
    persistDurableRecord(storage, record);
  } catch {}

  return {
    outcome: 'unconfirmed',
    error: submitResult.error,
    code: submitResult.code ?? 'UNCONFIRMED',
    record,
  };
}

export function markDurableApplied(storage, ownerId, now = () => new Date().toISOString()) {
  const result = readDurableRecord(storage, ownerId);
  if (!result.record) return;
  const record = result.record;
  record.state = 'locally_applied';
  record.updatedAt = now();
  persistDurableRecord(storage, record);
}
