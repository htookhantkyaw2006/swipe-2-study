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

export function createStorageOwner({ storage = () => globalThis.localStorage } = {}) {
  let activeOwner = null;
  const listeners = new Set();
  const access = (operation, run) => {
    try {
      const target = storage();
      if (!target) throw new Error('Storage is unavailable.');
      return run(target);
    } catch (cause) {
      throw new CacheStorageError(operation, cause);
    }
  };

  // Capture the owner. A delayed response must not follow an account switch
  // and write account A's response into account B's cache.
  function scope(forOwner = activeOwner) {
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
      const name = tableName(language, table);
      const { raw, value } = readLearningDocument();
      if (!value || !Object.hasOwn(value.tables, name)) return setItem(name, rows);
      parseLearningRows(rows);
      commitLearningDocument(raw, {
        ...value, revision: value.revision + 1, tables: { ...value.tables, [name]: rows },
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
    scope,
  });
}

export const storageOwner = createStorageOwner();
