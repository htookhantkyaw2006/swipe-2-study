import {
  IMPORT_LANGUAGES, IMPORT_TABLES, readGuestSnapshot, pendingGuestTables,
  handledGuestTables, validateImportRows, mergeGuestRows,
} from './guestImportData.js';

const CHANGED = 'Your account changed. Reopen guest import for the current account.';
const SOURCE_CHANGED = 'Guest learning data changed. Reload the guest import offer before choosing.';
const STATE_CHANGED = 'Learning data changed. Reload the guest import offer before retrying.';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyGuestImportAccount(client, expectedId, guard) {
  const verificationError = () => new Error('Could not verify your account. Reopen guest import after signing in.');
  guard();
  let user;
  try { user = await client.auth.getUser(); } catch { guard(); throw verificationError(); }
  guard();
  if (user?.error || user?.data?.user?.id !== expectedId) throw verificationError();
  let session;
  try { session = await client.auth.getSession(); } catch { guard(); throw verificationError(); }
  guard();
  if (session?.error || session?.data?.session?.user?.id !== expectedId) throw new Error('Your sign-in session changed. Reopen guest import after signing in.');
}

/** Prepares and commits explicit, device-only guest-import decisions.
 * No UI, storage-owner changes, guest deletion or cloud writes happen here.
 * verifyUser must verify both the server user and live SDK session for expectedId.
 */
export function createGuestImportService({
  storageOwner, getAuthState, verifyUser,
  fingerprint = sha256, makeId = () => globalThis.crypto.randomUUID(),
  now = () => new Date().toISOString(),
}) {
  const offers = new WeakMap();
  const busy = new Set();

  function captureAccount() {
    const state = getAuthState();
    if (!state?.user?.id || !Number.isSafeInteger(state.generation) || state.generation < 0
      || state.loading || state.isTransitioning || state.error || state.passwordRecoveryUserId
      || storageOwner.getOwner() !== state.user.id) throw new Error('Sign in and finish account verification before importing guest data.');
    return { ownerId: state.user.id, generation: state.generation };
  }

  function guard(account) {
    const current = captureAccount();
    if (current.ownerId !== account.ownerId || current.generation !== account.generation) throw new Error(CHANGED);
  }

  async function inspect() {
    const account = captureAccount();
    const scope = storageOwner.scope(account.ownerId);
    const snapshot = readGuestSnapshot(storageOwner.scope(null));
    const hash = await fingerprint(snapshot.source);
    guard(account);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Could not identify the guest data. Please retry.');
    if (readGuestSnapshot(storageOwner.scope(null)).source !== snapshot.source) throw new Error(SOURCE_CHANGED);
    const { value } = scope.readLearningDocument();
    const { summary } = pendingGuestTables(snapshot, value?.guestImport);
    const offer = Object.freeze({
      status: summary.length ? 'available' : 'nothing-to-import',
      persistence: 'device-only', ownerId: account.ownerId,
      summary: Object.freeze(summary.map(counts => Object.freeze(counts))),
    });
    offers.set(offer, { account, snapshot, fingerprint: hash });
    return offer;
  }

  async function choose(offer, choice) {
    if (!['merge', 'account-only'].includes(choice)) throw new TypeError('Choose merge or account-only explicitly.');
    const prepared = offers.get(offer);
    if (!prepared) throw new Error('Reload the guest import offer before choosing.');
    const { account, snapshot } = prepared;
    guard(account);
    if (busy.has(account.ownerId)) throw new Error('A guest import decision is already being saved. Please wait.');
    if (offer.status !== 'available') throw new Error('There is no new guest data to import.');
    busy.add(account.ownerId);
    try {
      await verifyUser(account.ownerId, () => { guard(account); });
      guard(account);
      if (readGuestSnapshot(storageOwner.scope(null)).source !== snapshot.source) throw new Error(SOURCE_CHANGED);
      const scope = storageOwner.scope(account.ownerId);
      const { raw, value } = scope.readLearningDocument();
      const previous = value?.guestImport;
      if (previous?.fingerprint === prepared.fingerprint) {
        return { status: 'already-decided', choice: previous.choice, persistence: 'device-only' };
      }
      const pending = pendingGuestTables(snapshot, previous);
      if (!pending.summary.length) return { status: 'already-decided', choice: previous?.choice ?? choice, persistence: 'device-only' };
      const tables = { ...(value?.tables ?? {}) };
      const expectedTables = {};
      let addedRecords = 0;
      if (choice === 'merge') {
        for (const { languageId } of IMPORT_LANGUAGES) {
          for (const table of IMPORT_TABLES) {
            const name = `${languageId}_${table}`;
            const incoming = pending.tables[name];
            if (!incoming.length) continue;
            const accountRaw = scope.getTable(languageId, table);
            const accountRows = validateImportRows(accountRaw, languageId, table);
            const merged = mergeGuestRows(accountRows, incoming, table, makeId);
            addedRecords += merged.length - accountRows.length;
            // Do not rewrite an unchanged account table merely to record a decision.
            if (merged.length !== accountRows.length) {
              tables[name] = JSON.stringify(merged);
              expectedTables[name] = accountRaw;
            }
          }
        }
      }
      guard(account);
      if (scope.readLearningDocument().raw !== raw) throw new Error(STATE_CHANGED);
      scope.commitLearningDocument(raw, {
        ...(value ?? {}),
        version: 1, revision: (value?.revision ?? 0) + 1, tables,
        guestImport: {
          fingerprint: prepared.fingerprint, choice, decidedAt: now(),
          handled: handledGuestTables(snapshot, previous),
        },
      }, expectedTables);
      return { status: 'saved', choice, persistence: 'device-only', addedRecords };
    } finally {
      busy.delete(account.ownerId);
    }
  }

  return Object.freeze({ inspect, choose });
}
