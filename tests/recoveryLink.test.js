import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthClient } from '@supabase/supabase-js';
import { createRecoveryLinkController } from '../src/lib/recoveryLink.js';

const token = 'test-only-recovery-token-hash-1234567890';
const id = '11111111-1111-4111-8111-111111111111';
const link = `https://app.example.test/reset-password#token_hash=${token}&type=recovery`;
const success = { data: { user: { id }, session: { user: { id } } }, error: null };

test('loading a recovery link scrubs history, exposes no token and makes no verification request', async () => {
  let calls = 0;
  const replaced = [];
  const controller = createRecoveryLinkController(async () => { calls++; return success; });
  controller.capture(link, path => replaced.push(path));
  // Reinitialization/remount must neither lose the credential nor consume it.
  controller.capture('https://app.example.test/reset-password', () => assert.fail('already captured'));
  await Promise.resolve();
  assert.equal(calls, 0);
  assert.deepEqual(replaced, ['/reset-password']);
  assert.deepEqual(controller.getState(), { status: 'pending', error: null });
  assert.ok(!JSON.stringify(controller.getState()).includes(token));
  await controller.confirm();
  assert.equal(calls, 1);
  assert.equal(controller.getState().status, 'verified');
});

test('confirmation uses recovery type exactly once across duplicate clicks and subscriptions', async () => {
  let resolve;
  const seen = [];
  const controller = createRecoveryLinkController(params => {
    seen.push(params);
    return new Promise(done => { resolve = done; });
  });
  controller.capture(link, () => {});
  const first = controller.confirm();
  assert.equal(controller.getState().status, 'verifying');
  const unsubscribe = controller.subscribe(() => {});
  unsubscribe();
  const second = controller.confirm();
  assert.equal(first, second);
  await Promise.resolve();
  assert.deepEqual(seen, [{ token_hash: token, type: 'recovery' }]);
  resolve(success);
  await first;
  await controller.confirm();
  assert.equal(seen.length, 1);
});

test('query-form links are supported but credentials are scrubbed before any request', async () => {
  let clean = false;
  const controller = createRecoveryLinkController(async () => { assert.equal(clean, true); return success; });
  controller.capture(link.replace('#', '?'), () => { clean = true; });
  await controller.confirm();
  assert.equal(controller.getState().status, 'verified');
});

test('wrong/missing types, duplicate tokens, mixed callbacks and empty tokens fail closed', async () => {
  for (const href of [
    link.replace('type=recovery', 'type=signup'),
    link.replace('&type=recovery', ''),
    `${link}&type=recovery`,
    `${link}&token_hash=${token}`,
    `${link}&code=untrusted-code`,
    `${link}&access_token=untrusted-session`,
    `${link}&error_code=otp_expired`,
    link.replace(token, ''),
    `https://app.example.test/reset-password?token_hash=${token}#token_hash=${token}&type=recovery`,
  ]) {
    const controller = createRecoveryLinkController(() => assert.fail('invalid links must not verify'));
    let scrubbed = false;
    controller.capture(href, () => { scrubbed = true; });
    assert.equal(scrubbed, true);
    assert.equal(controller.getState().status, 'error');
    await controller.confirm();
  }
});

test('ordinary routes and legacy PKCE callbacks remain owned by the SDK', async () => {
  for (const href of [
    'https://app.example.test/reset-password',
    'https://app.example.test/reset-password?code=test-only-legacy-code',
    'https://app.example.test/reset-password#error_code=otp_expired',
    link.replace('/reset-password', '/auth/callback'),
  ]) {
    const controller = createRecoveryLinkController(() => assert.fail('not a custom link'));
    controller.capture(href, () => assert.fail('must not scrub SDK callback'));
    assert.equal(controller.getState().status, 'none');
    await controller.confirm();
  }
});

test('a token is discarded if URL cleanup fails', async () => {
  const controller = createRecoveryLinkController(() => assert.fail('unsafe URL'));
  controller.capture(link, () => { throw Error('history unavailable'); });
  assert.equal(controller.getState().status, 'error');
  await controller.confirm();
});

test('expired, network, malformed and mismatched responses never report verified or retry automatically', async () => {
  for (const response of [
    { error: { code: 'otp_expired', message: token } },
    { data: { user: { id } }, error: null },
    { data: { user: { id }, session: { user: { id: 'different-user' } } }, error: null },
    'throw',
  ]) {
    let calls = 0;
    const controller = createRecoveryLinkController(async () => {
      calls++;
      if (response === 'throw') throw Error(token);
      return response;
    });
    controller.capture(link, () => {});
    await controller.confirm();
    assert.equal(controller.getState().status, 'error');
    assert.ok(!controller.getState().error.includes(token));
    await controller.confirm();
    assert.equal(calls, 1);
  }
});

test('installed PKCE SDK verifies a recovery TokenHash with no initiating-browser storage or verifier', async () => {
  const rows = new Map();
  const requests = [];
  const events = [];
  const auth = new AuthClient({
    url: 'https://recovery-test.invalid/auth/v1',
    storageKey: 'cross-browser-recovery-test',
    storage: { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) },
    flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      assert.match(String(url), /\/verify$/);
      return new Response(JSON.stringify({
        access_token: 'test-only-access-token', refresh_token: 'test-only-refresh-token',
        token_type: 'bearer', expires_in: 3600, user: { id },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  const { data } = auth.onAuthStateChange(event => events.push(event));
  try {
    await auth.initialize();
    assert.equal(rows.size, 0);
    const controller = createRecoveryLinkController(params => auth.verifyOtp(params));
    controller.capture(link, () => {});
    assert.equal(requests.length, 0);
    await controller.confirm();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.type, 'recovery');
    assert.equal(requests[0].body.token_hash, token);
    assert.ok(!('code_verifier' in requests[0].body));
    assert.equal(controller.getState().status, 'verified');
    assert.ok(events.includes('PASSWORD_RECOVERY'));
    assert.ok(!events.includes('SIGNED_IN'));
    assert.equal((await auth.getSession()).data.session.user.id, id);
  } finally {
    data.subscription.unsubscribe();
    await auth.stopAutoRefresh();
  }
});
