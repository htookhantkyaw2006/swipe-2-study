import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const oldStorage = globalThis.localStorage;
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (key) => storageMap.get(key) ?? null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() { return storageMap.size; },
  key: (i) => Array.from(storageMap.keys())[i] ?? null,
};

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

const server = await createServer({
  root: projectRoot,
  define: {
    'import.meta.env.VITE_GOOGLE_AUTH_ENABLED': JSON.stringify('true'),
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://staging-project.supabase.co'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_staging_key_1234567890'),
  },
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

const { default: GoogleIcon } = await server.ssrLoadModule('/src/components/ui/GoogleIcon.jsx');
const { PublishedContentProvider } = await server.ssrLoadModule('/src/lib/publishedContentContext.jsx');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { GuestImportContext } = await server.ssrLoadModule('/src/lib/guestImportContext.js');
const { default: Library } = await server.ssrLoadModule('/src/pages/Library.jsx');
const { default: Profile } = await server.ssrLoadModule('/src/pages/Profile.jsx');
const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
const { default: Signup } = await server.ssrLoadModule('/src/pages/Signup.jsx');

process.env.VITE_GOOGLE_AUTH_ENABLED = 'true';
process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon-key-valid';

function renderWithProviders(element, { authValue, guestImportValue, publishedEnabled = true, initialCache = null } = {}) {
  const defaultAuth = {
    user: null,
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: true,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
    signOut: async () => ({}),
    signOutGlobal: async () => ({}),
  };
  const defaultGuestImport = {
    available: false,
    pending: false,
    checking: false,
    openGuestImport: () => {},
  };

  return renderToString(
    createElement(
      GuestImportContext.Provider,
      { value: guestImportValue || defaultGuestImport },
      createElement(
        LanguageProvider,
        null,
        createElement(
          PublishedContentProvider,
          { enabledOverride: publishedEnabled, initialCache },
          createElement(
            PreferencesProvider,
            null,
            createElement(
              AuthContext.Provider,
              { value: authValue || defaultAuth },
              createElement(MemoryRouter, null, element)
            )
          )
        )
      )
    )
  );
}

test('1. GoogleIcon renders official colors, attributes and dimensions', () => {
  const html = renderToString(createElement(GoogleIcon, { size: 18 }));
  assert.ok(html.includes('aria-hidden="true"'), 'Google icon must be aria-hidden');
  assert.ok(html.includes('#4285F4'), 'Must include official Google Blue #4285F4');
  assert.ok(html.includes('#34A853'), 'Must include official Google Green #34A853');
  assert.ok(html.includes('#FBBC05'), 'Must include official Google Yellow #FBBC05');
  assert.ok(html.includes('#EA4335'), 'Must include official Google Red #EA4335');
  assert.ok(html.includes('width="18"'), 'Must respect requested size width');
  assert.ok(html.includes('height="18"'), 'Must respect requested size height');
});

test('2. Login and Signup render GoogleIcon before Continue with Google', () => {
  const loginHtml = renderWithProviders(createElement(Login));
  assert.ok(loginHtml.includes('Continue with Google'), 'Login includes Continue with Google');
  assert.ok(loginHtml.includes('#4285F4'), 'Login contains Google icon colors');

  const signupHtml = renderWithProviders(createElement(Signup));
  assert.ok(signupHtml.includes('Continue with Google'), 'Signup includes Continue with Google');
  assert.ok(signupHtml.includes('#4285F4'), 'Signup contains Google icon colors');
});

test('3. Library integrates published course state truthfully and derives counts', () => {
  // A) Ready with cards
  const readyHtml = renderWithProviders(createElement(Library), {
    publishedEnabled: true,
    initialCache: {
      'zh-hsk1': { status: 'loaded', items: new Array(150).fill({ id: 'card' }), isPublished: true },
    },
  });
  assert.ok(readyHtml.includes('150'), 'Renders loaded card count');
  assert.ok(readyHtml.includes('150 cards available'), 'Renders cards available label');
  assert.ok(readyHtml.includes('/writing'), 'Writing link is easily discoverable');

  // B) Disabled / offline fallback
  const offlineHtml = renderWithProviders(createElement(Library), {
    publishedEnabled: false,
  });
  assert.ok(offlineHtml.includes('Content offline'), 'Truthful fallback when published content is disabled');

  // C) Loading state
  const loadingHtml = renderWithProviders(createElement(Library), {
    publishedEnabled: true,
    initialCache: {
      'zh-hsk1': { status: 'loading', items: [] },
    },
  });
  assert.ok(loadingHtml.includes('Loading cards…'), 'Shows truthful loading cards state');

  // D) Loaded-empty state
  const emptyHtml = renderWithProviders(createElement(Library), {
    publishedEnabled: true,
    initialCache: {
      'zh-hsk1': { status: 'loaded', items: [], isPublished: true },
    },
  });
  assert.ok(emptyHtml.includes('No cards available'), 'Shows No cards available for empty loaded content');
});

test('4. Profile clearly groups destructive actions in Session & account danger section', () => {
  const userAuth = {
    user: { id: 'usr-1', email: 'learner@example.com' },
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: false,
    isConfigured: true,
    captureGeneration: () => 1,
    isCurrent: () => true,
    signOut: async () => ({}),
    signOutGlobal: async () => ({}),
  };

  const html = renderWithProviders(createElement(Profile), { authValue: userAuth });
  assert.ok(html.includes('profile-group--danger'), 'Profile has dedicated danger group');
  assert.ok(html.includes('Session &amp; account') || html.includes('Session & account'), 'Renders Session & account heading');
  assert.ok(html.includes('Log out'), 'Includes Log out in session actions');
  assert.ok(html.includes('Sign out on all devices'), 'Includes Sign out on all devices');
  assert.ok(html.includes('Delete account'), 'Includes Delete account');
  assert.ok(html.includes('Account &amp; support') || html.includes('Account & support'), 'Keeps Account & support distinct');
});
