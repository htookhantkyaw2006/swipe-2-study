import {
  getSyncStateKey,
  identityOfRow,
  readSyncState,
  isCloudTable,
  mirrorSyncStateToSidecar,
} from './cloudSyncState.js';
// Local cache isolation is not authorization. Supabase RLS remains authoritative.
// Only the verified Auth coordinator should select an owner.
import { parseLearningDocument, parseLearningRows } from './learningDocument.js';
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABLE_NAME = /^[a-z][a-z0-9_]*$/;
const LANGUAGE = /^[a-z]{2,3}$/;
const CACHE_NAME = /^(?:language|preferences|[a-z]{2,3}_[a-z][a-z0-9_]*)$/;

function ownerId(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !USER_ID.test(value)) {
    throw new TypeError('Cache owner must be an Auth user UUID or null for a guest.');
  }
  return value.toLowerCase();
}

export class CacheStorageError extends Error {
  constructor(operation, cause) {
    super(`Device storage ${operation} failed. Your data has not been confirmed saved.`, { cause });
    this.name = 'CacheStorageError';
    this.code = 'CACHE_STORAGE_UNAVAILABLE';
  }
}

function rowsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.hasOwn(b, key)) return false;
    const valA = a[key];
    const valB = b[key];
    if (typeof valA === 'object' && valA !== null && typeof valB === 'object' && valB !== null) {
      if (JSON.stringify(valA) !== JSON.stringify(valB)) return false;
    } else if (valA !== valB) {
      return false;
    }
  }
  return true;
}

export function createStorageOwner({
  storage = () => globalThis.localStorage,
  cloudTracking = false,
} = {}) {
  let activeOwner = null;
  let isCloudTrackingEnabled = Boolean(cloudTracking);
  const listeners = new Set();
  const changeListeners = new Set();
  const notifyChange = (detail) => {
    for (const listener of changeListeners) {
      try { listener(detail); } catch { /* ignore subscriber error */ }
    }
  };
  const access = (operation, run) => {
    try {
      const target = storage();
      if (!target) throw new Error('Storage is unavailable.');
      return run(target);
    } catch (cause) {
      if (cause instanceof CacheStorageError) throw cause;
      throw new CacheStorageError(operation, cause);
    }
  };

  // Capture the owner. A delayed response must not follow an account switch
  // and write account A's response into account B's cache.
  function scope(forOwner = activeOwner, { cloudTracking: scopeTracking } = {}) {
    const id = ownerId(forOwner);
    const prefix = id === null ? 's2s_' : `s2s_user_${id}_`;
    const keyFor = name => {
      if (typeof name !== 'string' || !CACHE_NAME.test(name)) throw new TypeError('Invalid cache key.');
      return prefix + name;
    };
    const tableName = (language, table) => {
      if (typeof language !== 'string' || typeof table !== 'string'
        || !LANGUAGE.test(language) || !TABLE_NAME.test(table)) throw new TypeError('Invalid cache table.');
      return `${language}_${table}`;
    };
    const getItem = name => access('read', target => target.getItem(keyFor(name)));
    const setItem = (name, value) => {
      if (typeof value !== 'string') throw new TypeError('Cache values must be serialized strings.');
      access('write', target => target.setItem(keyFor(name), value));
    };
    // A reserved key is deliberately excluded from entries()/ordinary cache keys.
    // Untouched tables keep their original keys; imported tables become authoritative
    // in this document so quota failures cannot leave a half-imported account.
    const documentKey = `${prefix}learning_document_v1`;
    const readLearningDocument = () => {
      const raw = id === null ? null : access('read', target => target.getItem(documentKey));
      return { raw, value: parseLearningDocument(raw) };
    };
    const commitLearningDocument = (expectedRaw, value, expectedTables = {}) => {
      if (id === null) throw new TypeError('Guest imports require an account scope.');
      const raw = JSON.stringify(value);
      parseLearningDocument(raw);
      access('write', target => {
        const currentRaw = target.getItem(documentKey);
        if (currentRaw !== expectedRaw) {
          throw new Error('Learning data changed. Reload the guest import offer before retrying.');
        }
        const current = parseLearningDocument(currentRaw);
        for (const [name, expected] of Object.entries(expectedTables)) {
          if (!/^(?:zh|ja|en)_[a-z][a-z0-9_]*$/.test(name)) throw new TypeError('Invalid learning table.');
          const actual = current && Object.hasOwn(current.tables, name) ? current.tables[name] : target.getItem(keyFor(name));
          if (actual !== expected) throw new Error('Learning data changed. Reload the guest import offer before retrying.');
        }
        target.setItem(documentKey, raw);
        if (target.getItem(documentKey) !== raw) throw new Error('The local save could not be confirmed.');
      });
    };
    const getTable = (language, table) => {
      const name = tableName(language, table);
      const { value } = readLearningDocument();
      return value && Object.hasOwn(value.tables, name) ? value.tables[name] : getItem(name);
    };
    const setTable = (language, table, rows) => {
      const prevRaw = getTable(language, table);
      const name = tableName(language, table);
      if (prevRaw === rows) return;
      parseLearningRows(rows);

      if (id === null || !isCloudTable(language, table)) {
        // Device-only write behavior: guest or non-cloud table (e.g. flashcards)
        const { raw, value } = readLearningDocument();
        if (value) {
          commitLearningDocument(raw, {
            ...value,
            revision: value.revision + 1,
            tables: { ...value.tables, [name]: rows },
          }, { [name]: prevRaw });
        } else {
          setItem(name, rows);
        }
        return;
      }

      // Check whether this account scope is cloud-tracked:
      // 1. Authoritative embedded cloudSync exists in learning_document_v1, OR
      // 2. Explicit tracking option enabled, OR
      // 3. Legacy cloud_sync_state_v1 sidecar exists
      const { raw, value } = readLearningDocument();
      let isTracked = Boolean(scopeTracking || isCloudTrackingEnabled || value?.cloudSync);

      if (!isTracked) {
        // Only inspect the legacy sidecar if authoritative tracking is not already known.
        // A failure to determine tracking status must stop the mutation before any write.
        const sidecarKey = getSyncStateKey(id);
        const sidecarRaw = access('read', target => target.getItem(sidecarKey));
        isTracked = sidecarRaw !== null && sidecarRaw !== undefined;
      }

      if (!isTracked) {
        // Default device-only path: preserve legacy key / document without cloudSync
        if (value) {
          commitLearningDocument(raw, {
            ...value,
            revision: value.revision + 1,
            tables: { ...value.tables, [name]: rows },
          }, { [name]: prevRaw });
        } else {
          setItem(name, rows);
        }
        return;
      }

      // Tracked account mutation: effective rows and sync state commit together in ONE authoritative setItem
      access('write', target => {
        // 1. Read existing sync state (embedded authoritative or legacy sidecar)
        const { state: syncState, error: syncError } = readSyncState(target, id);
        if (syncError) {
          throw new Error(`Could not update sync state: ${syncError}`);
        }

        const currentSyncState = syncState || {
          schemaVersion: 1,
          ownerId: id.toLowerCase(),
          resetVersion: '0',
          lastServerTime: null,
          records: {},
        };

        // 2. Compute changed records (dirty/deleted)
        const prevRows = prevRaw ? JSON.parse(prevRaw) : [];
        const nextRows = JSON.parse(rows);
        const nextRecords = { ...(currentSyncState.records ?? {}) };

        const prevMap = new Map();
        for (const row of prevRows) {
          if (row && typeof row === 'object') {
            const k = identityOfRow(name, row);
            prevMap.set(k, row);
          }
        }

        const nextMap = new Map();
        for (const row of nextRows) {
          if (row && typeof row === 'object') {
            const k = identityOfRow(name, row);
            nextMap.set(k, row);
          }
        }

        const nowIso = new Date().toISOString();

        // Record deletions
        for (const k of prevMap.keys()) {
          if (!nextMap.has(k)) {
            nextRecords[k] = {
              ...(currentSyncState.records?.[k] ?? {}),
              status: 'deleted',
              deletedAt: nowIso,
            };
          }
        }

        // Record dirty updates / additions
        for (const [k, row] of nextMap.entries()) {
          const prevRow = prevMap.get(k);
          if (!prevRow || !rowsEqual(prevRow, row)) {
            nextRecords[k] = {
              ...(currentSyncState.records?.[k] ?? {}),
              status: 'dirty',
              updatedAt: row.updated_at || row.created_at || nowIso,
            };
          }
        }

        const nextCloudSync = {
          ...currentSyncState,
          records: nextRecords,
          updatedAt: nowIso,
        };

        // 3. Construct next authoritative document
        let nextDocument;
        if (value) {
          nextDocument = {
            ...value,
            version: 1,
            revision: value.revision + 1,
            tables: {
              ...value.tables,
              [name]: rows,
            },
            cloudSync: nextCloudSync,
          };
        } else {
          // Migrate legacy tables into authoritative document during first tracked write
          const migratedTables = {};
          for (const lang of ['zh', 'ja', 'en']) {
            for (const kind of ['saved_words', 'review_cards', 'search_history', 'written_chars', 'learned_radicals', 'learned_kana', 'learned_sounds']) {
              const tName = `${lang}_${kind}`;
              if (tName === name) {
                migratedTables[tName] = rows;
              } else {
                const legacyVal = target.getItem(keyFor(tName));
                if (legacyVal !== null) {
                  migratedTables[tName] = legacyVal;
                }
              }
            }
          }
          migratedTables[name] = rows;
          nextDocument = {
            version: 1,
            revision: 1,
            tables: migratedTables,
            cloudSync: nextCloudSync,
            guestImport: {
              fingerprint: '0'.repeat(64),
              choice: 'account-only',
              decidedAt: nowIso,
              handled: {},
            },
          };
        }

        // 4. Authoritative atomic commit
        commitLearningDocument(raw, nextDocument, { [name]: prevRaw });

        // 5. Best-effort update of legacy sidecar for non-breaking legacy reader compatibility
        mirrorSyncStateToSidecar(target, nextCloudSync);

        // 6. Notify subscribers of successful table mutation
        notifyChange({ ownerId: id, language, table });
      });
    };
    return Object.freeze({
      ownerId: id,
      keyFor,
      tableKey: (language, table) => keyFor(tableName(language, table)),
      getItem,
      setItem,
      getTable,
      setTable,
      readLearningDocument,
      commitLearningDocument,
      getStorage: () => storage(),
      entries: () => access('read', target => {
        const result = [];
        for (let index = 0; index < target.length; index += 1) {
          const key = target.key(index);
          if (!key?.startsWith(prefix)) continue;
          const name = key.slice(prefix.length);
          // Exclude other owners, Auth tokens and storage migration flags.
          if (CACHE_NAME.test(name)) result.push([key, target.getItem(key) ?? '']);
        }
        return result;
      }),
    });
  }

  return Object.freeze({
    getOwner: () => activeOwner,
    setOwner: value => {
      const next = ownerId(value);
      if (next === activeOwner) return;
      activeOwner = next;
      // No persisted owner: Auth must restore the session on a fresh page.
      for (const listener of listeners) listener();
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeChange: listener => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    setCloudTracking: val => {
      isCloudTrackingEnabled = Boolean(val);
    },
    isCloudTracking: () => isCloudTrackingEnabled,
    notifyChange,
    getStorage: () => storage(),
    scope,
  });
}

export const storageOwner = createStorageOwner();
