import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasInternalHistory, safeNavigateBack } from '../src/lib/navigation.js';

test('safeNavigateBack: when window.history.state.idx > 0, invokes navigate(-1)', () => {
  const origWindow = global.window;
  try {
    global.window = {
      history: {
        length: 10,
        state: { idx: 2 }
      }
    };
    assert.equal(hasInternalHistory(), true);

    let navigatedArg = null;
    safeNavigateBack((arg) => { navigatedArg = arg; }, '/fallback');
    assert.equal(navigatedArg, -1, 'Should call navigate(-1)');
  } finally {
    global.window = origWindow;
  }
});

test('safeNavigateBack: when idx is 0 but history.length > 1 (e.g. direct entry with external tab history), navigates to fallback', () => {
  const origWindow = global.window;
  try {
    global.window = {
      history: {
        length: 5, // External sites in tab history
        state: { idx: 0 } // First internal SPA entry
      }
    };
    assert.equal(hasInternalHistory(), false, 'history.length > 1 must NOT count as internal history');

    let navigatedArg = null;
    safeNavigateBack((arg) => { navigatedArg = arg; }, '/library');
    assert.equal(navigatedArg, '/library', 'Should safely fall back to internal route');
  } finally {
    global.window = origWindow;
  }
});

test('safeNavigateBack: on page reload (idx is 0 or null), navigates to fallback', () => {
  const origWindow = global.window;
  try {
    global.window = {
      history: {
        length: 1,
        state: null
      }
    };
    assert.equal(hasInternalHistory(), false);

    let navigatedArg = null;
    safeNavigateBack((arg) => { navigatedArg = arg; }, '/learn');
    assert.equal(navigatedArg, '/learn', 'Should safely fall back to internal route');
  } finally {
    global.window = origWindow;
  }
});
