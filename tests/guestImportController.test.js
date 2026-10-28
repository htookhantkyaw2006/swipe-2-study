import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestImportController, guestImportRouteAllowed } from '../src/lib/guestImportController.js';

const A = { id: '11111111-1111-4111-8111-111111111111', generation: 1 };
const B = { id: '22222222-2222-4222-8222-222222222222', generation: 2 };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const offer = ownerId => Object.freeze({ ownerId, status: 'available', persistence: 'device-only', summary: [] });
function fixture() {
  let inspect = async () => offer(A.id);
  let choose = async (_, choice) => ({ status: 'saved', choice, persistence: 'device-only' });
  const calls = { inspect: 0, choices: [] };
  const controller = createGuestImportController({
    inspect: () => { calls.inspect++; return inspect(); },
    choose: (...args) => { calls.choices.push(args); return choose(...args); },
  });
  controller.setAccount(A);
  return { controller, calls, inspect: fn => { inspect = fn; }, choose: fn => { choose = fn; } };
}

test('automatic inspection happens once per account lifecycle and dismissal is never a data choice', async () => {
  const f = fixture();
  await f.controller.inspect({ automatic: true });
  assert.equal(f.controller.getState().open, true);
  f.controller.close();
  await f.controller.inspect({ automatic: true });
  assert.equal(f.calls.inspect, 1);
  assert.equal(f.calls.choices.length, 0);
  assert.equal(f.controller.getState().open, false);
  await f.controller.inspect();
  assert.equal(f.calls.inspect, 2, 'Profile can reopen a deferred choice');
  assert.equal(f.controller.getState().open, true);
});

test('choice passes the opaque offer unchanged and refreshes learning views only after confirmed local save', async () => {
  const f = fixture();
  const original = offer(A.id);
  f.inspect(async () => original);
  await f.controller.inspect();
  const beforeVersion = f.controller.getState().learningVersion;
  const wait = deferred();
  f.choose(() => wait.promise);
  const action = f.controller.choose('merge');
  assert.equal(f.controller.getState().pending, true);
  assert.equal(f.controller.getState().notice, null);
  assert.equal(f.controller.getState().learningVersion, beforeVersion);
  assert.equal(f.calls.choices[0][0], original);
  wait.resolve({ status: 'saved', choice: 'merge', persistence: 'device-only' });
  await action;
  const state = f.controller.getState();
  assert.equal(state.open, false);
  assert.equal(state.learningVersion, beforeVersion + 1);
  assert.match(state.notice.message, /on this device.*Cloud sync is not available/);
});

test('pending saves suppress close, repeated choices and reinspection', async () => {
  const f = fixture();
  await f.controller.inspect();
  const wait = deferred();
  f.choose(() => wait.promise);
  const action = f.controller.choose('merge');
  f.controller.close();
  await f.controller.choose('account-only');
  await f.controller.inspect();
  assert.equal(f.controller.getState().open, true);
  assert.equal(f.calls.choices.length, 1);
  assert.equal(f.calls.inspect, 1);
  wait.resolve({ status: 'saved', choice: 'merge', persistence: 'device-only' });
  await action;
});

test('a failed save stays open with retry guidance and never reports success or refreshes pages', async () => {
  const f = fixture();
  await f.controller.inspect();
  const version = f.controller.getState().learningVersion;
  f.choose(async () => { throw Object.assign(new Error('Sensitive storage details'), { code: 'CACHE_STORAGE_UNAVAILABLE' }); });
  await f.controller.choose('merge');
  const state = f.controller.getState();
  assert.equal(state.open, true);
  assert.equal(state.pending, false);
  assert.equal(state.learningVersion, version);
  assert.equal(state.notice, null);
  assert.match(state.error, /Guest records have been kept/);
  assert.doesNotMatch(state.error, /Sensitive/);
  await f.controller.inspect();
  assert.equal(f.controller.getState().error, null);
  assert.equal(f.calls.inspect, 2);
});

test('account-only keeps learning views unchanged and clearly describes separate guest records', async () => {
  const f = fixture();
  await f.controller.inspect();
  const version = f.controller.getState().learningVersion;
  await f.controller.choose('account-only');
  assert.equal(f.controller.getState().learningVersion, version);
  assert.match(f.controller.getState().notice.message, /Guest records have been kept separate/);
  const duplicates = fixture();
  await duplicates.controller.inspect();
  duplicates.choose(async () => ({ status: 'saved', choice: 'merge', persistence: 'device-only', addedRecords: 0 }));
  await duplicates.controller.choose('merge');
  assert.match(duplicates.controller.getState().notice.message, /Existing account records were kept/);
  assert.doesNotMatch(duplicates.controller.getState().notice.message, /learning added/);
});

test('a delayed inspection cannot open a dialog for another account', async () => {
  const f = fixture();
  const wait = deferred();
  f.inspect(() => wait.promise);
  const action = f.controller.inspect();
  f.controller.setAccount(B);
  wait.resolve(offer(A.id));
  await action;
  assert.equal(f.controller.getState().accountId, B.id);
  assert.equal(f.controller.getState().open, false);
  assert.equal(f.controller.getState().offer, null);
});

test('sign-out and account switches discard a delayed success and its UI refresh', async () => {
  for (const next of [null, B]) {
    const f = fixture();
    await f.controller.inspect();
    const wait = deferred();
    f.choose(() => wait.promise);
    const action = f.controller.choose('merge');
    f.controller.setAccount(next);
    const version = f.controller.getState().learningVersion;
    wait.resolve({ status: 'saved', choice: 'merge', persistence: 'device-only' });
    await action;
    assert.equal(f.controller.getState().notice, null);
    assert.equal(f.controller.getState().learningVersion, version);
    assert.equal(f.controller.getState().open, false);
  }
});

test('same-account revalidation refreshes an open read-only offer without restarting study', async () => {
  const f = fixture();
  await f.controller.inspect({ automatic: true });
  const version = f.controller.getState().learningVersion;
  f.controller.setAccount({ ...A, generation: 3 });
  assert.equal(f.controller.getState().learningVersion, version, 'same-account revalidation must not restart a study session');
  assert.equal(f.controller.getState().offer, null);
  assert.equal(f.controller.getState().open, false);
  assert.equal(f.controller.getState().notice, null);
  await f.controller.inspect({ automatic: true });
  assert.equal(f.calls.inspect, 2);
  assert.equal(f.controller.getState().open, true);
});

test('a delayed old inspection cannot hide the fresh offer after same-account revalidation', async () => {
  const f = fixture();
  const wait = deferred();
  f.inspect(() => wait.promise);
  const old = f.controller.inspect({ automatic: true });
  f.controller.setAccount({ ...A, generation: 2 });
  const fresh = offer(A.id);
  f.inspect(async () => fresh);
  await f.controller.inspect({ automatic: true });
  wait.resolve({ ownerId: A.id, status: 'nothing-to-import', persistence: 'device-only' });
  await old;
  assert.equal(f.controller.getState().open, true);
  assert.equal(f.controller.getState().offer, fresh);
  assert.equal(f.calls.choices.length, 0);
});

test('same-account revalidation respects Decide later and never repeats an interrupted save', async () => {
  const f = fixture();
  await f.controller.inspect({ automatic: true });
  f.controller.close();
  f.controller.setAccount({ ...A, generation: 2 });
  await f.controller.inspect({ automatic: true });
  assert.equal(f.calls.inspect, 1, 'a deferred offer must stay deferred');
  await f.controller.inspect();
  const wait = deferred();
  f.choose(() => wait.promise);
  const saving = f.controller.choose('merge');
  f.controller.setAccount({ ...A, generation: 3 });
  await f.controller.inspect({ automatic: true });
  assert.equal(f.calls.inspect, 2);
  assert.equal(f.calls.choices.length, 1);
  assert.match(f.controller.getState().notice.message, /sign-in session changed/);
  wait.resolve({ status: 'saved', choice: 'merge', persistence: 'device-only' });
  await saving;
  assert.equal(f.controller.getState().notice.kind, 'info');
  assert.equal(f.controller.getState().open, false);
});

test('StrictMode cleanup cancels the first inspection but permits a fresh setup', async () => {
  const f = fixture();
  const wait = deferred();
  f.inspect(() => wait.promise);
  const first = f.controller.inspect({ automatic: true });
  f.controller.cancel();
  f.inspect(async () => offer(A.id));
  await f.controller.inspect({ automatic: true });
  wait.resolve({ ownerId: A.id, status: 'nothing-to-import', persistence: 'device-only' });
  await first;
  assert.equal(f.controller.getState().open, true);
  assert.equal(f.calls.inspect, 2);
});

test('automatic empty checks are silent, manual empty checks explain that nothing new is available', async () => {
  const f = fixture();
  f.inspect(async () => ({ ownerId: A.id, status: 'nothing-to-import', persistence: 'device-only' }));
  await f.controller.inspect({ automatic: true });
  assert.equal(f.controller.getState().notice, null);
  assert.equal(f.controller.getState().open, false);
  await f.controller.inspect();
  assert.match(f.controller.getState().notice.message, /No new guest learning/);
  f.controller.dismissNotice();
  assert.equal(f.controller.getState().notice, null);
});

test('inspection errors are actionable and arbitrary upstream messages stay out of the UI', async () => {
  const f = fixture();
  f.inspect(async () => { throw new Error('Private upstream response'); });
  await f.controller.inspect({ automatic: true });
  assert.equal(f.controller.getState().open, false);
  assert.equal(f.controller.getState().notice.kind, 'error');
  assert.doesNotMatch(f.controller.getState().notice.message, /Private upstream/);
  f.inspect(async () => { throw new Error('Guest learning data changed. Reload the guest import offer before choosing.'); });
  await f.controller.inspect();
  assert.match(f.controller.getState().notice.message, /^Guest learning data changed/);
});

test('wrong-owner or unknown-persistence offers and unconfirmed saves cannot produce success', async () => {
  for (const invalid of [offer(B.id), { ...offer(A.id), persistence: 'cloud' }, { ...offer(A.id), status: 'unknown' }]) {
    const f = fixture();
    f.inspect(async () => invalid);
    await f.controller.inspect();
    assert.equal(f.controller.getState().open, false);
    assert.equal(f.controller.getState().notice.kind, 'error');
  }
  for (const invalid of [{}, { status: 'saved', choice: 'merge', persistence: 'cloud' }, { status: 'saved', choice: 'unknown', persistence: 'device-only' }]) {
    const f = fixture();
    await f.controller.inspect();
    f.choose(async () => invalid);
    await f.controller.choose('merge');
    assert.equal(f.controller.getState().open, true);
    assert.ok(f.controller.getState().error);
    assert.equal(f.controller.getState().notice, null);
  }
});

test('lost-response reconciliation refreshes effective tables but does not claim new data was added', async () => {
  const f = fixture();
  await f.controller.inspect();
  const version = f.controller.getState().learningVersion;
  f.choose(async () => ({ status: 'already-decided', choice: 'merge', persistence: 'device-only' }));
  await f.controller.choose('merge');
  assert.equal(f.controller.getState().learningVersion, version + 1);
  assert.match(f.controller.getState().notice.message, /already handled/);
});

test('subscriber failures cannot turn a confirmed save into a UI error', async () => {
  const f = fixture();
  const unsubscribe = f.controller.subscribe(() => { throw new Error('Rendering failure'); });
  await f.controller.inspect();
  await f.controller.choose('merge');
  assert.equal(f.controller.getState().notice.kind, 'success');
  assert.equal(f.controller.getState().error, null);
  unsubscribe();
});

test('auth callbacks, recovery, editing and study sessions suppress automatic prompt surfaces', () => {
  for (const path of ['/login', '/signup', '/forgot-password', '/reset-password', '/verify-email', '/auth/callback', '/profile/edit', '/learn/session', '/flashcards/session', '/saved/session', '/learn/review/session']) assert.equal(guestImportRouteAllowed(path), false, path);
  for (const path of ['/', '/profile', '/saved', '/learn', '/learn/review', '/dictionary', '/settings', '/library']) assert.equal(guestImportRouteAllowed(path), true, path);
});
