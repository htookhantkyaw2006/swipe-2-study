import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeFrontendEnv, readSupabaseConfig } from '../src/lib/supabaseConfig.js';

const key = 'sb_publishable_' + 'a'.repeat(30);
const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: key };
const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

test('a checkout without backend credentials stays explicitly unconfigured', () => {
  assert.equal(readSupabaseConfig({}).status, 'unconfigured');
});
test('configured project URL is normalized', () => {
  assert.deepEqual(readSupabaseConfig(env), { status: 'configured', url: env.VITE_SUPABASE_URL, publishableKey: key, issues: [] });
});
test('partial setup fails without returning credentials', () => {
  const result = readSupabaseConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: key });
  assert.equal(result.status, 'invalid');
  assert.equal(result.publishableKey, null);
  assert.ok(!JSON.stringify(result).includes(key));
});
test('legacy anon key is accepted but privileged JWT is rejected', () => {
  assert.equal(readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).status, 'configured');
  assert.equal(readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }).status, 'invalid');
});
test('localhost HTTP requires development; remote HTTP and credential-bearing URLs fail', () => {
  const local = { ...env, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' };
  assert.equal(readSupabaseConfig(local).status, 'invalid');
  assert.equal(readSupabaseConfig({ ...local, DEV: true }).status, 'configured');
  for (const url of ['http://example.com', 'https://user:password@example.com', 'https://example.com/rest/v1', 'https://example.com/?token=secret']) {
    assert.equal(readSupabaseConfig({ ...env, VITE_SUPABASE_URL: url, DEV: true }).status, 'invalid');
  }
});
test('secret keys cannot be hidden in another public environment variable', () => {
  for (const [name, value] of [
    ['VITE_SUPABASE_SERVICE_ROLE_KEY', jwt('service_role')],
    ['VITE_OTHER_VALUE', 'sb_secret_do-not-print'],
    ['VITE_OTHER_VALUE', jwt('service_role')],
    ['VITE_DATABASE_URL', 'postgresql://do-not-print'],
  ]) {
    assert.throws(() => assertSafeFrontendEnv({ [name]: value }), error => {
      assert.ok(error.message.includes(name));
      assert.ok(!error.message.includes(value));
      return true;
    });
  }
  assert.doesNotThrow(() => assertSafeFrontendEnv(env));
});
