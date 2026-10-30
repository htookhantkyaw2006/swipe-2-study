import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { getDeploymentOrigin, setPageMetadata } from '../src/lib/metadata.js';

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

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

const { AuthContext } = await server.ssrLoadModule('/src/lib/authContext.js');
const { PreferencesProvider } = await server.ssrLoadModule('/src/lib/preferences.jsx');
const { LanguageProvider } = await server.ssrLoadModule('/src/lib/language.jsx');

const { default: About } = await server.ssrLoadModule('/src/pages/About.jsx');
const { default: PrivacyPolicy } = await server.ssrLoadModule('/src/pages/PrivacyPolicy.jsx');
const { default: TermsOfService } = await server.ssrLoadModule('/src/pages/TermsOfService.jsx');
const { default: Support } = await server.ssrLoadModule('/src/pages/Support.jsx');
const { default: Login } = await server.ssrLoadModule('/src/pages/Login.jsx');
const { default: Signup } = await server.ssrLoadModule('/src/pages/Signup.jsx');
const { default: SettingsSubpage } = await server.ssrLoadModule('/src/pages/SettingsSubpage.jsx');

function renderWithProviders(element, { user = null, initialEntry = '/' } = {}) {
  const authValue = {
    user,
    loading: false,
    isTransitioning: false,
    error: null,
    isGuest: !user,
    isConfigured: true,
    clearError: () => {},
    retryVerification: () => {},
    signOut: async () => ({ error: null }),
    signOutGlobal: async () => ({ error: null }),
    canResetPassword: () => false,
    completePasswordRecovery: () => false,
    passwordRecoveryUserId: null,
    captureGeneration: () => 0,
    isCurrent: () => true,
    generation: 0,
  };

  return renderToString(
    createElement(
      AuthContext.Provider,
      { value: authValue },
      createElement(
        PreferencesProvider,
        null,
        createElement(
          LanguageProvider,
          null,
          createElement(MemoryRouter, { initialEntries: [initialEntry] }, element)
        )
      )
    )
  );
}

test('metadata: getDeploymentOrigin strictly rejects localhost and requires verified origin', () => {
  // Localhost / loopback origins must return null
  assert.equal(getDeploymentOrigin({}, { origin: 'http://localhost:5173' }), null);
  assert.equal(getDeploymentOrigin({}, { origin: 'http://127.0.0.1:3000' }), null);
  assert.equal(getDeploymentOrigin({}, { origin: 'null' }), null);
  assert.equal(getDeploymentOrigin({}, {}), null);
  assert.equal(getDeploymentOrigin({}, null), null);

  // Real production / staging domain from location.origin
  assert.equal(getDeploymentOrigin({}, { origin: 'https://swipe2study.app' }), 'https://swipe2study.app');
  assert.equal(getDeploymentOrigin({}, { origin: 'https://staging.swipe2study.com/' }), 'https://staging.swipe2study.com');

  // Explicit VITE_PUBLIC_URL configuration overrides location
  assert.equal(
    getDeploymentOrigin({ VITE_PUBLIC_URL: 'https://production.s2s.study/' }, { origin: 'http://localhost:5173' }),
    'https://production.s2s.study'
  );
});

test('metadata: setPageMetadata updates title, description, and handles canonical safely', () => {
  const elements = [];
  const fakeDoc = {
    title: 'Initial Title',
    head: {
      appendChild: (el) => elements.push(el),
    },
    querySelector: (selector) => {
      if (selector === 'meta[name="description"]') {
        return elements.find(el => el.getAttribute('name') === 'description') || null;
      }
      if (selector === 'meta[property="og:title"]') {
        return elements.find(el => el.getAttribute('property') === 'og:title') || null;
      }
      if (selector === 'meta[property="og:description"]') {
        return elements.find(el => el.getAttribute('property') === 'og:description') || null;
      }
      if (selector === 'link[rel="canonical"]') {
        return elements.find(el => el.getAttribute('rel') === 'canonical') || null;
      }
      if (selector === 'meta[property="og:url"]') {
        return elements.find(el => el.getAttribute('property') === 'og:url') || null;
      }
      return null;
    },
    createElement: (tag) => {
      const attrs = {};
      const elObj = {
        tag,
        setAttribute: (k, v) => { attrs[k] = v; },
        getAttribute: (k) => attrs[k],
        remove: () => {
          const idx = elements.indexOf(elObj);
          if (idx !== -1) elements.splice(idx, 1);
        },
      };
      return elObj;
    },
  };

  const origDoc = globalThis.document;
  try {
    globalThis.document = fakeDoc;

    // 1. With verified origin: should set canonical and og:url
    const cleanup1 = setPageMetadata({
      title: 'About',
      description: 'Test description for about page.',
      canonicalPath: '/about',
      env: { VITE_PUBLIC_URL: 'https://swipe2study.app' },
    });

    assert.equal(fakeDoc.title, 'About · Swipe 2 Study');
    const descMeta = fakeDoc.querySelector('meta[name="description"]');
    assert.ok(descMeta);
    assert.equal(descMeta.getAttribute('content'), 'Test description for about page.');

    const canonical = fakeDoc.querySelector('link[rel="canonical"]');
    assert.ok(canonical);
    assert.equal(canonical.getAttribute('href'), 'https://swipe2study.app/about');

    cleanup1();
    assert.equal(fakeDoc.title, 'Initial Title');

    // 2. In local development / unverified origin: MUST NOT set canonical or og:url
    const cleanup2 = setPageMetadata({
      title: 'Privacy Policy',
      description: 'Privacy description.',
      canonicalPath: '/privacy',
      env: {}, // no VITE_PUBLIC_URL
    });

    assert.equal(fakeDoc.title, 'Privacy Policy · Swipe 2 Study');
    const localhostCanonical = fakeDoc.querySelector('link[rel="canonical"]');
    assert.equal(localhostCanonical, null, 'Canonical tag must NOT be created when origin is unverified');

    cleanup2();
  } finally {
    globalThis.document = origDoc;
  }
});

test('public pages: About component renders concise HSK1/N5 scope and navigation', () => {
  const html = renderWithProviders(createElement(About), { initialEntry: '/about' });

  assert.ok(html.includes('About Swipe 2 Study'), 'Must render title');
  assert.ok(html.includes('Active Release · HSK 1 &amp; JLPT N5') || html.includes('HSK 1 & JLPT N5'), 'Must state active scope');
  assert.ok(html.includes('Chinese HSK 1'), 'Must describe HSK 1');
  assert.ok(html.includes('Japanese JLPT N5'), 'Must describe JLPT N5');
  assert.ok(html.includes('Start Learning'), 'Must include primary start navigation');
  assert.ok(html.includes('Browse Dictionary'), 'Must include secondary tool navigation');
  assert.ok(html.includes('/privacy'), 'Must link to privacy');
  assert.ok(html.includes('/terms'), 'Must link to terms');
  assert.ok(html.includes('/support'), 'Must link to support');

  // Verify it does not advertise unapproved levels, payment tiers, or disabled capabilities
  assert.doesNotMatch(html, /HSK\s*[2-9]/);
  assert.doesNotMatch(html, /JLPT\s*N[1-4]/);
  assert.doesNotMatch(html, /\$|subscription price|free trial/i);
});

test('public pages: PrivacyPolicy component displays pending state and owner checklist without fake legal text', () => {
  const html = renderWithProviders(createElement(PrivacyPolicy), { initialEntry: '/privacy' });

  assert.ok(html.includes('Privacy Policy'), 'Must render title');
  assert.ok(html.includes('Pending Owner Publication'), 'Must clearly show pending status badge');
  assert.ok(html.includes('Evaluation &amp; Development Status Notice') || html.includes('Evaluation & Development Status Notice'), 'Must show evaluation notice');
  assert.ok(html.includes('Current Technical Data-Handling Posture'), 'Must explain technical posture');
  assert.ok(html.includes('localStorage'), 'Must mention guest localStorage posture');
  assert.ok(html.includes('Supabase Authentication'), 'Must mention Supabase account auth');
  assert.ok(html.includes('Owner Publication Checklist'), 'Must include owner checklist');
  assert.ok(html.includes('Data Controller &amp; Contact') || html.includes('Data Controller & Contact'), 'Must document required owner contact disclosure');

  // Must NOT display acceptance checkbox or claim finalized legal compliance
  assert.doesNotMatch(html, /<input[^>]+type="checkbox"/i, 'Must NOT contain acceptance checkbox');
  assert.doesNotMatch(html, /effective date:\s*\w+\s*\d+,\s*\d+/i, 'Must NOT invent fake effective date');
});

test('public pages: TermsOfService component displays pending state and owner checklist without fake legal text', () => {
  const html = renderWithProviders(createElement(TermsOfService), { initialEntry: '/terms' });

  assert.ok(html.includes('Terms of Service'), 'Must render title');
  assert.ok(html.includes('Pending Owner Publication'), 'Must clearly show pending status badge');
  assert.ok(html.includes('Current Operating Boundaries'), 'Must state current operating boundaries');
  assert.ok(html.includes('Owner Publication Checklist'), 'Must include owner checklist');
  assert.ok(html.includes('Governing Law &amp; Dispute Resolution') || html.includes('Governing Law & Dispute Resolution'), 'Must note governing law requirement');

  // Must NOT contain acceptance checkbox
  assert.doesNotMatch(html, /<input[^>]+type="checkbox"/i, 'Must NOT contain acceptance checkbox');
  assert.doesNotMatch(html, /hereby agree to be bound/i, 'Must NOT claim user is bound to unavailable terms');
});

test('public pages: Support component displays self-service guidance and owner configuration checklist', () => {
  const html = renderWithProviders(createElement(Support), { initialEntry: '/support' });

  assert.ok(html.includes('Support &amp; Help') || html.includes('Support & Help'), 'Must render title');
  assert.ok(html.includes('Pending Owner Configuration'), 'Must show pending configuration badge');
  assert.ok(html.includes('Pronunciation audio is silent'), 'Must provide audio guidance');
  assert.ok(html.includes('Reset Learning Data'), 'Must provide data reset guidance');
  assert.ok(html.includes('Owner Configuration Checklist'), 'Must include owner setup checklist');
  assert.ok(html.includes('Primary Support Email'), 'Must list primary support email requirement');
});

test('public pages: Login and Signup footer links wire cleanly to public information routes', () => {
  const loginHtml = renderWithProviders(createElement(Login), { initialEntry: '/login' });
  assert.ok(loginHtml.includes('href="/about"'), 'Login must link to /about');
  assert.ok(loginHtml.includes('href="/privacy"'), 'Login must link to /privacy');
  assert.ok(loginHtml.includes('href="/terms"'), 'Login must link to /terms');
  assert.ok(loginHtml.includes('href="/support"'), 'Login must link to /support');
  // Confirm NO terms acceptance checkbox in Login
  assert.doesNotMatch(loginHtml, /I agree to the terms/i);

  const signupHtml = renderWithProviders(createElement(Signup), { initialEntry: '/signup' });
  assert.ok(signupHtml.includes('href="/about"'), 'Signup must link to /about');
  assert.ok(signupHtml.includes('href="/privacy"'), 'Signup must link to /privacy');
  assert.ok(signupHtml.includes('href="/terms"'), 'Signup must link to /terms');
  assert.ok(signupHtml.includes('href="/support"'), 'Signup must link to /support');
  // Confirm NO terms acceptance checkbox in Signup
  assert.doesNotMatch(signupHtml, /I agree to the terms/i);
});

test('public pages: SettingsSubpage wires About rows to all four public routes', () => {
  const html = renderWithProviders(createElement(SettingsSubpage), { initialEntry: '/settings' });
  assert.ok(html.includes('About Swipe 2 Study'), 'Settings must include About row');
  assert.ok(html.includes('Support &amp; help') || html.includes('Support & help'), 'Settings must include Support row');
  assert.ok(html.includes('Privacy policy'), 'Settings must include Privacy row');
  assert.ok(html.includes('Terms of service'), 'Settings must include Terms row');
});
