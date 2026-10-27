// Local cache isolation is not authorization. Supabase RLS remains authoritative.
// Only the future Auth coordinator should select an owner.
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
    return Object.freeze({
      ownerId: id,
      keyFor,
      tableKey: (language, table) => keyFor(tableName(language, table)),
      getItem,
      setItem,
      getTable: (language, table) => getItem(tableName(language, table)),
      setTable: (language, table, value) => setItem(tableName(language, table), value),
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
