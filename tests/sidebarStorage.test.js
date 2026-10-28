import test from 'node:test';
import assert from 'node:assert/strict';
import { readCollapsedPreference, writeCollapsedPreference, SIDEBAR_STORAGE_KEY } from '../src/lib/sidebarStorage.js';

test('readCollapsedPreference returns false by default when storage is empty or null', () => {
  assert.equal(readCollapsedPreference(null), false);
  const emptyStorage = {
    getItem: () => null,
    setItem: () => {},
  };
  assert.equal(readCollapsedPreference(emptyStorage), false);
});

test('readCollapsedPreference parses "true" string as boolean true', () => {
  const store = new Map([[SIDEBAR_STORAGE_KEY, 'true']]);
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, val),
  };
  assert.equal(readCollapsedPreference(storage), true);
});

test('readCollapsedPreference safely catches errors when storage.getItem throws', () => {
  const faultyStorage = {
    getItem: () => { throw new Error('SecurityError: sessionStorage is restricted'); },
    setItem: () => {},
  };
  assert.equal(readCollapsedPreference(faultyStorage), false);
});

test('writeCollapsedPreference stores "true" and "false" strings defensively', () => {
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, val) => store.set(key, String(val)),
  };

  writeCollapsedPreference(true, storage);
  assert.equal(store.get(SIDEBAR_STORAGE_KEY), 'true');
  assert.equal(readCollapsedPreference(storage), true);

  writeCollapsedPreference(false, storage);
  assert.equal(store.get(SIDEBAR_STORAGE_KEY), 'false');
  assert.equal(readCollapsedPreference(storage), false);
});

test('writeCollapsedPreference handles quota and security exceptions silently without throwing', () => {
  const faultyStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
  };

  assert.doesNotThrow(() => {
    writeCollapsedPreference(true, faultyStorage);
  });
});

test('default storage access survives a browser sessionStorage getter that throws', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get sessionStorage() { throw new Error('SecurityError'); },
  } });
  try {
    assert.equal(readCollapsedPreference(), false);
    assert.doesNotThrow(() => writeCollapsedPreference(true));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
});
