import { buildCloudImportItems } from './cloudImportRecords.js';
import { readCloudSnapshot } from './cloudImportService.js';
import { executeDurableImport, readDurableRecord, markDurableApplied } from './cloudImportDurableRequest.js';
import { restoreAccountSnapshot } from './cloudSnapshotHydration.js';
import { readGuestSnapshot } from './guestImportData.js';
import { verifyGuestImportAccount } from './guestImportService.js';

const CHANGED = 'Your account changed. Reopen guest import for the current account.';
const SOURCE_CHANGED = 'Guest learning data changed. Reload the guest import offer before choosing.';

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createCloudGuestImportService({
  storageOwner,
  getAuthState,
  getClient,
  fingerprint = sha256,
  now = () => new Date().toISOString(),
}) {
  const offers = new WeakMap();
  const busy = new Set();

  function captureAccount() {
    const state = getAuthState();
    if (!state?.user?.id || !Number.isSafeInteger(state.generation) || state.generation < 0
      || state.loading || state.isTransitioning || state.error || state.passwordRecoveryUserId
      || storageOwner.getOwner() !== state.user.id) {
      throw new Error('Sign in and finish account verification before importing guest data.');
    }
    return { ownerId: state.user.id, generation: state.generation };
  }

  function guard(account) {
    const current = captureAccount();
    if (current.ownerId !== account.ownerId || current.generation !== account.generation) {
      throw new Error(CHANGED);
    }
  }

  async function inspect() {
    const account = captureAccount();
    const client = getClient();
    const storage = globalThis.localStorage;

    // Check if durable record already applied
    const existingDurable = readDurableRecord(storage, account.ownerId);
    if (existingDurable.record?.state === 'locally_applied') {
      return Object.freeze({
        status: 'nothing-to-import',
        persistence: 'cloud',
        ownerId: account.ownerId,
        summary: Object.freeze([]),
      });
    }

    const guestSnapshot = readGuestSnapshot(storageOwner.scope(null));
    const hash = await fingerprint(guestSnapshot.source);
    guard(account);

    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new Error('Could not identify the guest data. Please retry.');
    }

    // Read cloud snapshot to obtain current reset_version and verify auth
    const snapshotRes = await readCloudSnapshot(client, {
      expectedUserId: account.ownerId,
      isCurrent: () => {
        try { guard(account); return true; } catch { return false; }
      },
    });

    guard(account);

    if (snapshotRes.error || !snapshotRes.snapshot) {
      throw new Error(snapshotRes.error || 'Could not verify account cloud status.');
    }

    const expectedResetVersion = snapshotRes.snapshot.reset_version;

    // Build items from guest snapshot
    const items = buildCloudImportItems(guestSnapshot.tables);

    // Group items into summary counts per language
    const langMap = {
      zh: { languageId: 'zh', languageLabel: 'Chinese', savedWords: 0, reviewWords: 0, progressRecords: 0 },
      ja: { languageId: 'ja', languageLabel: 'Japanese', savedWords: 0, reviewWords: 0, progressRecords: 0 },
      en: { languageId: 'en', languageLabel: 'English', savedWords: 0, reviewWords: 0, progressRecords: 0 },
    };

    for (const item of items) {
      const counts = langMap[item.language];
      if (!counts) continue;
      if (item.kind === 'saved_words') counts.savedWords++;
      else if (item.kind === 'review_cards') counts.reviewWords++;
      else counts.progressRecords++;
    }

    const summary = Object.values(langMap).filter(c => c.savedWords + c.reviewWords + c.progressRecords > 0);

    const offer = Object.freeze({
      status: summary.length ? 'available' : 'nothing-to-import',
      persistence: 'cloud',
      ownerId: account.ownerId,
      expectedResetVersion,
      summary: Object.freeze(summary.map(counts => Object.freeze(counts))),
    });

    offers.set(offer, {
      account,
      guestSnapshot,
      fingerprint: hash,
      items,
      expectedResetVersion,
    });

    return offer;
  }

  async function choose(offer, choice) {
    if (!['merge', 'account-only'].includes(choice)) {
      throw new TypeError('Choose merge or account-only explicitly.');
    }
    const prepared = offers.get(offer);
    if (!prepared) {
      throw new Error('Reload the guest import offer before choosing.');
    }
    const { account, guestSnapshot, fingerprint: sourceFingerprint, expectedResetVersion } = prepared;
    guard(account);

    if (busy.has(account.ownerId)) {
      throw new Error('A guest import decision is already being saved. Please wait.');
    }
    if (offer.status !== 'available') {
      throw new Error('There is no new guest data to import.');
    }

    busy.add(account.ownerId);

    try {
      const client = getClient();
      const storage = globalThis.localStorage;

      // Verify server user and live SDK session
      await verifyGuestImportAccount(client, account.ownerId, () => guard(account));
      guard(account);

      if (readGuestSnapshot(storageOwner.scope(null)).source !== guestSnapshot.source) {
        throw new Error(SOURCE_CHANGED);
      }

      const itemsToSend = choice === 'merge' ? prepared.items : [];

      const result = await executeDurableImport(client, storage, {
        ownerId: account.ownerId,
        expectedResetVersion,
        sourceFingerprint,
        choice,
        items: itemsToSend,
        isCurrent: () => {
          try { guard(account); return true; } catch { return false; }
        },
        now,
      });

      guard(account);

      if (result.outcome === 'server_acknowledged' || result.outcome === 'locally_applied') {
        let addedRecords = result.receipt?.added_count ?? 0;

        if (choice === 'merge') {
          // Reconcile and commit local cache so the current browser updates immediately
          await restoreAccountSnapshot(client, storageOwner, {
            expectedUserId: account.ownerId,
            isCurrent: () => {
              try { guard(account); return true; } catch { return false; }
            },
            now,
          });
        }

        markDurableApplied(storage, account.ownerId, now);

        return {
          status: 'saved',
          choice,
          persistence: 'cloud',
          addedRecords,
        };
      }

      if (result.outcome === 'unconfirmed') {
        throw new Error(result.error || 'Could not confirm cloud import with server. Keep original request to retry.');
      }

      throw new Error(result.error || 'Cloud import could not be completed.');
    } finally {
      busy.delete(account.ownerId);
    }
  }

  return Object.freeze({ inspect, choose });
}
