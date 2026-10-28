import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPasswordRecovery, updateRecoveredPassword, validateNewPassword, recoveryLinkError, RESET_EMAIL_SENT } from '../src/lib/passwordRecovery.js';

const id = '11111111-1111-4111-8111-111111111111';
const args = { password: 'test-only-new-password', confirmation: 'test-only-new-password', expectedUserId: id, isAllowed: value => value === id };
function client(overrides = {}) {
  const writes = [];
  return { writes, auth: {
    getUser: async () => ({ data: { user: { id } }, error: null }),
    getSession: async () => ({ data: { session: { user: { id } } }, error: null }),
    updateUser: async values => { writes.push(values); return { data: { user: { id } }, error: null }; },
    ...overrides,
  } };
}

test('recovery email uses a trimmed address and the fixed same-origin reset route', async () => {
  const requests = [];
  const auth = { resetPasswordForEmail: async (...values) => { requests.push(values); return { data: {}, error: null }; } };
  const result = await requestPasswordRecovery(auth, '  learner@example.test  ', 'http://127.0.0.1:5173');
  assert.deepEqual(requests, [['learner@example.test', { redirectTo: 'http://127.0.0.1:5173/reset-password' }]]);
  assert.equal(result.message, RESET_EMAIL_SENT);
  assert.equal(result.error, null);
  assert.match(result.message, /If an account/);
});

test('invalid recovery addresses do not call the SDK', async () => {
  let calls = 0;
  const auth = { resetPasswordForEmail: async () => { calls += 1; } };
  for (const address of ['', '   ', 'no-at-sign', 'one@two', 'a b@example.test']) assert.match((await requestPasswordRecovery(auth, address, 'https://app.example.test')).error, /valid email/);
  assert.equal(calls, 0);
});

test('recovery request rate limits and network failures do not report success or expose raw errors', async () => {
  const rate = await requestPasswordRecovery({ resetPasswordForEmail: async () => ({ error: { status: 429 } }) }, 'a@example.test', 'https://app.example.test');
  assert.match(rate.error, /wait/); assert.equal(rate.message, undefined);
  const failed = await requestPasswordRecovery({ resetPasswordForEmail: async () => { throw Error('secret diagnostic'); } }, 'a@example.test', 'https://app.example.test');
  assert.match(failed.error, /connection/); assert.ok(!failed.error.includes('secret'));
});

test('resend cooldown does not claim when the project email quota resets', async () => {
  const limited = await requestPasswordRecovery({ resetPasswordForEmail: async () => ({ error: { status: 429, code: 'over_email_send_rate_limit' } }) }, 'a@example.test', 'https://app.example.test');
  assert.match(limited.error, /email sending limit/i);
  assert.equal(limited.cooldownSeconds, 60);
  assert.ok(!limited.error.includes('60'));
  assert.equal(limited.message, undefined);
  const sent = await requestPasswordRecovery({ resetPasswordForEmail: async () => ({ error: null }) }, 'a@example.test', 'https://app.example.test');
  assert.equal(sent.cooldownSeconds, 60);
});

test('short or mismatched passwords are rejected before any Auth call', async () => {
  assert.match(validateNewPassword('12345', '12345'), /6 characters/);
  assert.match(validateNewPassword('long-enough', 'different'), /do not match/);
  assert.equal(validateNewPassword('test-only-password', 'test-only-password'), null);
  const result = await updateRecoveredPassword({}, { ...args, confirmation: 'different' });
  assert.match(result.error, /do not match/);
});

test('a normal signed-in account without a recovery grant cannot submit a password reset', async () => {
  const { auth, writes } = client();
  assert.ok((await updateRecoveredPassword(auth, { ...args, isAllowed: () => false })).error);
  assert.equal(writes.length, 0);
});

test('a server user or cached session mismatch blocks the password mutation', async () => {
  for (const overrides of [
    { getUser: async () => ({ data: { user: { id: 'another-user' } }, error: null }) },
    { getSession: async () => ({ data: { session: { user: { id: 'another-user' } } }, error: null }) },
  ]) {
    const { auth, writes } = client(overrides);
    assert.ok((await updateRecoveredPassword(auth, args)).error);
    assert.equal(writes.length, 0);
  }
});

test('an account switch during verification discards the old reset attempt before mutation', async () => {
  let allowed = true;
  const { auth, writes } = client({ getUser: async () => { allowed = false; return { data: { user: { id } }, error: null }; } });
  assert.ok((await updateRecoveredPassword(auth, { ...args, isAllowed: () => allowed })).error);
  assert.equal(writes.length, 0);
});

test('successful recovery verifies the intended user and performs exactly one SDK password update', async () => {
  const { auth, writes } = client();
  assert.deepEqual(await updateRecoveredPassword(auth, args), { error: null });
  assert.deepEqual(writes, [{ password: args.password }]);
});

test('password policy errors and missing user responses cannot produce a false success', async () => {
  const weak = client({ updateUser: async () => ({ data: { user: null }, error: { code: 'weak_password' } }) });
  assert.match((await updateRecoveredPassword(weak.auth, args)).error, /stronger/);
  const missing = client({ updateUser: async () => ({ data: { user: null }, error: null }) });
  assert.ok((await updateRecoveredPassword(missing.auth, args)).error);
});

test('expired or denied reset URLs remain errors regardless of an existing account', () => {
  assert.match(recoveryLinkError('?error_code=otp_expired'), /fresh password reset/);
  assert.match(recoveryLinkError('', '#error=access_denied&error_description=used'), /fresh password reset/);
  assert.equal(recoveryLinkError('?code=fresh-test-code'), null);
  assert.equal(recoveryLinkError(), null);
});

test('recoveryLinkError surfaces detailed expired and invalid message descriptions', () => {
  const expired = recoveryLinkError('?error=access_denied&error_code=otp_expired');
  assert.match(expired, /expired/i);
  assert.match(expired, /fresh password reset/);

  const custom = recoveryLinkError('?error=access_denied&error_description=Custom+server+expired+notice');
  assert.match(custom, /Custom server expired notice/);
  assert.match(custom, /fresh password reset/);
});
