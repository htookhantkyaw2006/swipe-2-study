import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { getAuthCallbackState, parseCallbackError } from '../src/lib/authCallbackState.js';

const user = { id: '11111111-1111-4111-8111-111111111111' };

test('expired or denied callback cannot navigate even with an existing verified user', () => {
  for (const location of [
    { search: '?error_code=otp_expired' },
    { hash: '#error=access_denied&error_description=Invalid+link' },
  ]) {
    const state = getAuthCallbackState({ ...location, user });
    assert.equal(state.canNavigate, false);
    assert.ok(state.error);
  }
});

test('callback descriptions decode once and retain literal percent signs and plus signs', () => {
  for (const description of ['Verification failed 100%', 'Use a+b@example.com', '%E0%A4%A', '確認できません']) {
    const encoded = new URLSearchParams({ error_description: description });
    assert.equal(parseCallbackError(`?${encoded}`), description);
    assert.equal(parseCallbackError('', `#${encoded}`), description);
  }
  assert.doesNotThrow(() => parseCallbackError('?error_description=%'));
});

test('code-only errors retain an actionable error instead of allowing success', () => {
  const state = getAuthCallbackState({ user, search: '?error_code=invalid_grant' });
  assert.equal(state.error, 'invalid_grant');
  assert.equal(state.canNavigate, false);
});

test('only verified, settled and error-free callbacks may navigate', () => {
  assert.equal(getAuthCallbackState({ user }).canNavigate, true);
  for (const pending of [
    { user, loading: true },
    { user, isTransitioning: true },
    { user, authError: 'Could not verify the session.' },
    { user, timedOut: true },
    { search: '?code=waiting-for-exchange' },
  ]) {
    assert.equal(getAuthCallbackState(pending).canNavigate, false);
  }
});

test('empty code/token values are missing; actual code waits for verification', () => {
  for (const location of [{}, { search: '?code=' }, { hash: '#access_token=%20' }]) {
    const state = getAuthCallbackState(location);
    assert.match(state.error, /No verification code/);
    assert.equal(state.canNavigate, false);
  }
  assert.equal(getAuthCallbackState({ search: '?code=real-code' }).error, null);
  assert.equal(getAuthCallbackState({ loading: true }).error, null);
});

test('URL errors take precedence and Auth errors are not hidden by missing-code messaging', () => {
  assert.match(getAuthCallbackState({ search: '?error_code=otp_expired', authError: 'Network error' }).error, /expired/);
  assert.equal(getAuthCallbackState({ authError: 'Network error' }).error, 'Network error');
});

// ws: false prevents Vite from starting its HMR WebSocket server, avoiding
// port 24678 conflicts when multiple Vite servers run in the same test process.
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});
after(() => server.close());

async function renderPage(path, entry, auth = {}) {
  const { default: Page } = await server.ssrLoadModule(path);
  const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
  return renderToString(React.createElement(
    AuthContext.Provider,
    { value: { user: null, loading: false, isTransitioning: false, error: null, isConfigured: true, ...auth } },
    React.createElement(MemoryRouter, { initialEntries: [entry] }, React.createElement(Page))
  ));
}

test('callback error screen renders safely for literal percent descriptions with a signed-in user', async () => {
  const html = await renderPage('/src/pages/AuthCallback.jsx', '/auth/callback?error_description=Failure%20100%25', { user });
  assert.ok(html.includes('Verification issue'));
  assert.ok(html.includes('Failure 100%'));
  assert.ok(!html.includes('Verifying your account'));
});

test('resend recovery without a query email renders an editable required email form', async () => {
  const html = await renderPage('/src/pages/VerifyEmail.jsx', '/verify-email?returnTo=%2Fprofile');
  assert.match(html, /<form/);
  assert.match(html, /<label[^>]*for="verification-email"/);
  const input = html.match(/<input[^>]*id="verification-email"[^>]*>/)?.[0];
  assert.ok(input);
  assert.match(input, /type="email"/);
  assert.match(input, /required/);
  assert.ok(!input.includes('disabled'));
  assert.ok(!input.includes('readOnly'));
  assert.ok(html.includes('enter your account email'));
  assert.ok(!html.includes('We sent a verification link to'));
});

test('signup-provided email stays prefilled and return path survives resend recovery', async () => {
  const html = await renderPage('/src/pages/VerifyEmail.jsx', '/verify-email?email=a%2Bb%40example.com&returnTo=%2Fprofile');
  assert.ok(html.includes('value="a+b@example.com"'));
  assert.ok(html.includes('/login?returnTo=%2Fprofile'));
});
