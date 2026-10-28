import { validateCloudItem, decimalVersion, validTimestamp } from './cloudImportRecords.js';
import { verifyGuestImportAccount } from './guestImportService.js';

const uuid = value => typeof value === 'string' && value.length === 36 && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const hash = value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => JSON.parse(JSON.stringify(value));
const count = value => Number.isSafeInteger(value) && value >= 0;
class CloudImportFailure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function guard(userId, isCurrent) {
  if (!uuid(userId) || typeof isCurrent !== 'function' || !isCurrent()) throw new CloudImportFailure('ACCOUNT_CHANGED', 'Your account changed. Reopen cloud import for the current account.');
}

function validateRequest(request) {
  if (!plain(request) || Object.keys(request).some(key => !['schemaVersion', 'ownerId', 'requestId', 'expectedResetVersion', 'sourceFingerprint', 'choice', 'items'].includes(key))
    || request.schemaVersion !== 1 || !uuid(request.ownerId) || !uuid(request.requestId)
    || !decimalVersion(request.expectedResetVersion) || !hash(request.sourceFingerprint)
    || !['merge', 'account-only'].includes(request.choice) || !Array.isArray(request.items)
    || request.items.length > 5000 || (request.choice === 'account-only' && request.items.length > 0)
    || new TextEncoder().encode(JSON.stringify(request.items)).length > 2097152) throw new CloudImportFailure('INVALID_REQUEST', 'The cloud import request is invalid. Guest records have been kept.');
  request.items.forEach(validateCloudItem);
}

/** Persist this exact owner-bound envelope before sending when UI is integrated.
 * Retries must reuse it, including its UUID and contents, until reconciled.
 */
export function prepareCloudImportRequest({ ownerId, expectedResetVersion, sourceFingerprint, choice, items, makeId = () => crypto.randomUUID() }) {
  const request = copy({ schemaVersion: 1, ownerId, requestId: makeId(), expectedResetVersion, sourceFingerprint, choice, items });
  validateRequest(request);
  return request;
}

function validateSnapshot(value, userId) {
  if (!plain(value) || value.schema_version !== 1 || value.user_id !== userId
    || !decimalVersion(value.reset_version) || !validTimestamp(value.server_time)
    || !Array.isArray(value.items) || value.items.length > 20000) throw new Error('Invalid snapshot');
  const keys = new Set();
  for (const row of value.items) {
    if (!plain(row) || !hash(row.item_key) || keys.has(row.item_key) || !decimalVersion(row.revision, true)
      || !validTimestamp(row.created_at) || !validTimestamp(row.updated_at)) throw new Error('Invalid snapshot item');
    validateCloudItem({ language: row.language, kind: row.kind, written_form: row.written_form, reading: row.reading, data: row.data, observed_at: row.observed_at });
    keys.add(row.item_key);
  }
  return value;
}

function apiFailure(error) {
  if (error?.message?.includes('ACCOUNT_CHANGED')) return new CloudImportFailure('ACCOUNT_CHANGED', 'Your account changed before the cloud request was authorized. Reopen import for the current account.');
  if (error?.code === '40001' && error.message?.includes('RESET_VERSION_CHANGED')) return new CloudImportFailure('RESET_VERSION_CHANGED', 'Learning data was reset. Reload the cloud snapshot before preparing another import.');
  if (error?.message?.includes('ACCOUNT_UNAVAILABLE') || error?.message?.includes('ACCOUNT_REQUIRED')) return new CloudImportFailure('ACCOUNT_UNAVAILABLE', 'This account cannot import learning data. Sign in again or contact the account owner.');
  if (error?.code === 'PGRST202' || error?.code === '42883') return new CloudImportFailure('CLOUD_NOT_READY', 'Cloud import has not been activated for this environment. Guest records have been kept.');
  return new CloudImportFailure('UNCONFIRMED', 'Could not confirm the cloud import. Keep the original request and retry it without clearing guest records.');
}

export async function readCloudSnapshot(client, { expectedUserId, isCurrent }) {
  try {
    const check = () => guard(expectedUserId, isCurrent);
    await verifyGuestImportAccount(client, expectedUserId, check);
    const result = await client.rpc('s2s_account_snapshot', { p_expected_user_id: expectedUserId });
    check();
    if (result.error) throw apiFailure(result.error);
    return { error: null, snapshot: copy(validateSnapshot(result.data, expectedUserId)) };
  } catch (error) {
    return { error: error instanceof CloudImportFailure ? error.message : 'Could not load a verified cloud snapshot. Existing device data has been kept.', code: error?.code ?? 'SNAPSHOT_UNAVAILABLE', snapshot: null };
  }
}

export async function submitCloudImport(client, { request, expectedUserId, isCurrent }) {
  let sent = false;
  try {
    // Pin a copy before any await; a caller cannot change the request in flight.
    const stable = copy(request);
    validateRequest(stable);
    if (stable.ownerId !== expectedUserId) throw new CloudImportFailure('ACCOUNT_CHANGED', 'This import belongs to a different account. Guest records have been kept.');
    const check = () => guard(expectedUserId, isCurrent);
    await verifyGuestImportAccount(client, expectedUserId, check);
    sent = true;
    const result = await client.rpc('s2s_import_guest', {
      p_expected_user_id: expectedUserId,
      p_request_id: stable.requestId, p_expected_reset_version: stable.expectedResetVersion,
      p_source_fingerprint: stable.sourceFingerprint, p_choice: stable.choice, p_items: stable.items,
    });
    check();
    if (result.error) throw apiFailure(result.error);
    const ack = result.data;
    if (!plain(ack) || ack.status !== 'committed' || ack.persistence !== 'cloud' || ack.schema_version !== 1
      || ack.user_id !== expectedUserId || ack.request_id !== stable.requestId || ack.reset_version !== stable.expectedResetVersion
      || ack.source_fingerprint !== stable.sourceFingerprint || ack.choice !== stable.choice || typeof ack.replayed !== 'boolean'
      || ack.accepted_count !== stable.items.length || !count(ack.added_count) || !count(ack.updated_count)
      || ack.added_count + ack.updated_count > ack.accepted_count) throw apiFailure(null);
    return { error: null, cloudOutcome: 'confirmed', receipt: copy(ack) };
  } catch (error) {
    return {
      error: error instanceof CloudImportFailure ? error.message : sent
        ? 'Could not confirm the cloud import. Keep the original request and retry it without clearing guest records.'
        : 'Could not prepare or verify this import. Guest records have been kept.',
      code: error?.code ?? (sent ? 'UNCONFIRMED' : 'NOT_SENT'),
      cloudOutcome: sent ? 'unconfirmed' : 'not-sent', receipt: null,
    };
  }
}
