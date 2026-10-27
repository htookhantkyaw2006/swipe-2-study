import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthClient } from '@supabase/supabase-js';
import { inspectAuthCallbackSession } from '../src/lib/authCallbackSession.js';
import { getAuthCallbackState } from '../src/lib/authCallbackState.js';

test('callback inspection surfaces initialization failure even when getSession would hide it', async () => {
  let sessionReads = 0;
  const error = await inspectAuthCallbackSession({
    initialize: async () => ({ error: { code: 'bad_code_verifier' } }),
    getSession: async () => { sessionReads += 1; return { data: { session: null }, error: null }; },
  });
  assert.match(error, /different browser/);
  assert.equal(sessionReads, 0);
  assert.equal(getAuthCallbackState({ user: { id: 'existing' }, callbackError: error }).canNavigate, false);
});

test('verified users cannot leave callback before inspection settles', () => {
  const user = { id: 'verified' };
  assert.equal(getAuthCallbackState({ user, callbackPending: true }).canNavigate, false);
  assert.equal(getAuthCallbackState({ user, callbackPending: false }).canNavigate, true);
});

test('callback inspection handles rejected network operations without leaking raw error text', async () => {
  const error = await inspectAuthCallbackSession({
    initialize: async () => { throw new Error('internal URL containing a secret'); },
  });
  assert.match(error, /Check your connection/);
  assert.ok(!error.includes('secret'));
});

// Run the installed Supabase Auth SDK with browser-shaped globals and a fake
// token endpoint. No hosted requests, real email links, or credentials are used.
async function withBrowserAuth({ verifier = true, rejectedExchange = false, recovery = false }, run) {
  const saved = Object.fromEntries(['window', 'document', 'BroadcastChannel'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let href = 'http://127.0.0.1:5173/auth/callback?code=test-only-auth-code&returnTo=%2F';
  const storageKey = `callback-test-${verifier}-${rejectedExchange}-${recovery}`;
  const rows = new Map();
  if (verifier) rows.set(`${storageKey}-code-verifier`, JSON.stringify(recovery ? 'test-only-verifier/recovery' : 'test-only-verifier'));
  const requests = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { get href() { return href; } },
    history: { state: null, replaceState(_state, _title, url) { href = url; } },
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } });
  Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });
  const auth = new AuthClient({
    url: 'https://callback-test.invalid/auth/v1',
    storageKey,
    storage: {
      getItem: key => rows.get(key) ?? null,
      setItem: (key, value) => rows.set(key, value),
      removeItem: key => rows.delete(key),
    },
    flowType: 'pkce', detectSessionInUrl: true, persistSession: true,
    autoRefreshToken: false,
    fetch: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      assert.match(String(url), /\/token\?grant_type=pkce$/);
      return new Response(JSON.stringify(rejectedExchange
        ? { code: 'bad_code_verifier', msg: 'Code verifier mismatch' }
        : {
          access_token: 'test-only-access-token', refresh_token: 'test-only-refresh-token',
          expires_in: 3600, token_type: 'bearer',
          user: { id: '11111111-1111-4111-8111-111111111111' },
        }), {
        status: rejectedExchange ? 400 : 200,
        headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' },
      });
    },
  });
  try {
    await run({ auth, requests, href: () => href });
    // Let the SDK's queued post-initialization notification complete before
    // restoring globals for the next case.
    await new Promise(resolve => setTimeout(resolve, 10));
  } finally {
    await auth.stopAutoRefresh();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('real SDK completes a PKCE callback once and inspection never exchanges the code twice', async () => {
  await withBrowserAuth({}, async ({ auth, requests, href }) => {
    assert.equal(await inspectAuthCallbackSession(auth), null);
    assert.equal(await inspectAuthCallbackSession(auth), null);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.code_verifier, 'test-only-verifier');
    assert.ok(!new URL(href()).searchParams.has('code'));
    assert.ok((await auth.getSession()).data.session);
  });
});

test('real SDK skips an unmatchable callback; inspection provides immediate sign-in recovery', async () => {
  await withBrowserAuth({ verifier: false }, async ({ auth, requests }) => {
    const ordinarySession = await auth.getSession();
    assert.equal(ordinarySession.error, null);
    assert.equal(ordinarySession.data.session, null);
    const error = await inspectAuthCallbackSession(auth);
    assert.match(error, /same browser, browser profile, and app address/);
    assert.match(error, /email may already be confirmed/);
    assert.equal(requests.length, 0);
  });
});

test('real SDK rejected exchange is surfaced despite getSession reporting no session error', async () => {
  await withBrowserAuth({ rejectedExchange: true }, async ({ auth, requests }) => {
    const error = await inspectAuthCallbackSession(auth);
    assert.match(error, /different browser/);
    const session = await auth.getSession();
    assert.equal(session.error, null);
    assert.equal(session.data.session, null);
    assert.equal(requests.length, 1);
  });
});


test('real SDK exchanges a recovery code once and emits recovery rather than ordinary sign-in', async () => {
  await withBrowserAuth({ recovery: true }, async ({ auth, requests }) => {
    const events = [];
    const { data } = auth.onAuthStateChange((event) => events.push(event));
    assert.equal(await inspectAuthCallbackSession(auth), null);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.code_verifier, 'test-only-verifier');
    assert.ok(events.filter(event => event === 'PASSWORD_RECOVERY').length >= 1);
    assert.equal(events.filter(event => event === 'SIGNED_IN').length, 0);
    data.subscription.unsubscribe();
  });
});
