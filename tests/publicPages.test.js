import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { getDeploymentOrigin, parseCleanOrigin, setPageMetadata } from '../src/lib/metadata.js';

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

function createFakeDocument({ initialTitle = 'Default Title', initialElements = [] } = {}) {
  const elements = [...initialElements];
  return {
    title: initialTitle,
    head: {
      appendChild: (el) => {
        elements.push(el);
        return el;
      },
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
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => attrs[k] ?? null,
        removeAttribute: (k) => { delete attrs[k]; },
        remove: () => {
          const idx = elements.indexOf(elObj);
          if (idx !== -1) elements.splice(idx, 1);
        },
      };
      return elObj;
    },
    getElements: () => [...elements],
  };
}

test('metadata: parseCleanOrigin rejects invalid schemes, embedded credentials, and local/development origins', () => {
  // Reject local and development hosts
  assert.equal(parseCleanOrigin('http://localhost:5173'), null);
  assert.equal(parseCleanOrigin('http://localhost:5173/some/path?query=1#hash'), null);
  assert.equal(parseCleanOrigin('http://127.0.0.1:3000'), null);
  assert.equal(parseCleanOrigin('http://127.0.0.1:3000/app'), null);
  assert.equal(parseCleanOrigin('http://127.5.6.7:8080'), null);
  assert.equal(parseCleanOrigin('http://0.0.0.0:8000'), null);
  assert.equal(parseCleanOrigin('http://[::1]:5000'), null);
  assert.equal(parseCleanOrigin('https://sub.localhost:8000'), null);
  assert.equal(parseCleanOrigin('https://dev.local:4000/app'), null);
  assert.equal(parseCleanOrigin('https://test.test/path'), null);
  assert.equal(parseCleanOrigin('http://example.invalid'), null);

  // Reject non-http(s) schemes
  assert.equal(parseCleanOrigin('javascript:alert(1)'), null);
  assert.equal(parseCleanOrigin('ftp://ftp.example.com'), null);
  assert.equal(parseCleanOrigin('file:///etc/passwd'), null);
  assert.equal(parseCleanOrigin('data:text/html,test'), null);

  // Reject embedded credentials
  assert.equal(parseCleanOrigin('https://user:password@example.com'), null);
  assert.equal(parseCleanOrigin('http://admin:token@api.swipe2study.com/v1'), null);

  // Reject malformed or empty inputs
  assert.equal(parseCleanOrigin(''), null);
  assert.equal(parseCleanOrigin('    '), null);
  assert.equal(parseCleanOrigin('not a url'), null);
  assert.equal(parseCleanOrigin(null), null);
  assert.equal(parseCleanOrigin(undefined), null);

  // Derive clean origin without path/query/hash from valid remote URLs
  assert.equal(
    parseCleanOrigin('https://swipe2study.app/about?foo=1&bar=2#hash'),
    'https://swipe2study.app'
  );
  assert.equal(
    parseCleanOrigin('https://learn.swipe2study.com:8443/nested/deep/path/?query=true'),
    'https://learn.swipe2study.com:8443'
  );
  assert.equal(
    parseCleanOrigin('http://public.example.org/'),
    'http://public.example.org'
  );
});

test('metadata: getDeploymentOrigin safely parses VITE_PUBLIC_URL and location', () => {
  // Explicit localhost in VITE_PUBLIC_URL is strictly rejected
  assert.equal(getDeploymentOrigin({ VITE_PUBLIC_URL: 'http://localhost:5173/path?arg=1#ref' }), null);
  assert.equal(getDeploymentOrigin({ VITE_PUBLIC_URL: 'https://user:pass@example.com' }), null);

  // Valid VITE_PUBLIC_URL strips path/query/hash cleanly
  assert.equal(
    getDeploymentOrigin({ VITE_PUBLIC_URL: 'https://production.swipe2study.com/app/?lang=en#home' }),
    'https://production.swipe2study.com'
  );

  // Location fallback handles localhost safely
  assert.equal(getDeploymentOrigin({}, { origin: 'http://localhost:5173' }), null);
  assert.equal(getDeploymentOrigin({}, { href: 'http://127.0.0.1:3000/about' }), null);
  assert.equal(getDeploymentOrigin({}, { origin: 'null' }), null);
  assert.equal(getDeploymentOrigin({}, null), null);

  // Valid location origin is accepted
  assert.equal(
    getDeploymentOrigin({}, { origin: 'https://staging.swipe2study.com' }),
    'https://staging.swipe2study.com'
  );
});

test('metadata: setPageMetadata accurately restores pre-existing values on cleanup', () => {
  const fakeDoc = createFakeDocument({ initialTitle: 'Root Home' });

  // Pre-seed the document with initial tags (simulating index.html)
  const initialDesc = fakeDoc.createElement('meta');
  initialDesc.setAttribute('name', 'description');
  initialDesc.setAttribute('content', 'Root initial description');
  fakeDoc.head.appendChild(initialDesc);

  const initialOgTitle = fakeDoc.createElement('meta');
  initialOgTitle.setAttribute('property', 'og:title');
  initialOgTitle.setAttribute('content', 'Root initial OG title');
  fakeDoc.head.appendChild(initialOgTitle);

  const initialOgDesc = fakeDoc.createElement('meta');
  initialOgDesc.setAttribute('property', 'og:description');
  initialOgDesc.setAttribute('content', 'Root initial OG description');
  fakeDoc.head.appendChild(initialOgDesc);

  const initialCanonical = fakeDoc.createElement('link');
  initialCanonical.setAttribute('rel', 'canonical');
  initialCanonical.setAttribute('href', 'https://swipe2study.app/root');
  fakeDoc.head.appendChild(initialCanonical);

  const initialOgUrl = fakeDoc.createElement('meta');
  initialOgUrl.setAttribute('property', 'og:url');
  initialOgUrl.setAttribute('content', 'https://swipe2study.app/root');
  fakeDoc.head.appendChild(initialOgUrl);

  const origDoc = globalThis.document;
  try {
    globalThis.document = fakeDoc;

    const cleanup = setPageMetadata({
      title: 'About Us',
      description: 'About page description.',
      canonicalPath: '/about',
      env: { VITE_PUBLIC_URL: 'https://swipe2study.app/nested?q=1#h' },
    });

    // Check page metadata was applied
    assert.equal(fakeDoc.title, 'About Us · Swipe 2 Study');
    assert.equal(initialDesc.getAttribute('content'), 'About page description.');
    assert.equal(initialOgTitle.getAttribute('content'), 'About Us · Swipe 2 Study');
    assert.equal(initialOgDesc.getAttribute('content'), 'About page description.');
    assert.equal(initialCanonical.getAttribute('href'), 'https://swipe2study.app/about');
    assert.equal(initialOgUrl.getAttribute('content'), 'https://swipe2study.app/about');

    // Run cleanup
    cleanup();

    // Verify exact pre-existing values were restored and elements were NOT deleted
    assert.equal(fakeDoc.title, 'Root Home');
    assert.equal(initialDesc.getAttribute('content'), 'Root initial description');
    assert.equal(initialOgTitle.getAttribute('content'), 'Root initial OG title');
    assert.equal(initialOgDesc.getAttribute('content'), 'Root initial OG description');
    assert.equal(initialCanonical.getAttribute('href'), 'https://swipe2study.app/root');
    assert.equal(initialOgUrl.getAttribute('content'), 'https://swipe2study.app/root');

    const allElements = fakeDoc.getElements();
    assert.ok(allElements.includes(initialDesc), 'Pre-existing description must NOT be removed');
    assert.ok(allElements.includes(initialOgTitle), 'Pre-existing og:title must NOT be removed');
    assert.ok(allElements.includes(initialOgDesc), 'Pre-existing og:description must NOT be removed');
    assert.ok(allElements.includes(initialCanonical), 'Pre-existing canonical must NOT be removed');
    assert.ok(allElements.includes(initialOgUrl), 'Pre-existing og:url must NOT be removed');
  } finally {
    globalThis.document = origDoc;
  }
});

test('metadata: setPageMetadata removes only elements introduced by the page and handles unknown origins safely', () => {
  const fakeDoc = createFakeDocument({ initialTitle: 'Swipe 2 Study' });

  const origDoc = globalThis.document;
  try {
    globalThis.document = fakeDoc;

    // 1. Mount page on unverified/local origin: MUST NOT invent canonical URL
    const cleanup1 = setPageMetadata({
      title: 'Local Test',
      description: 'Local test description',
      canonicalPath: '/local-page',
      env: { VITE_PUBLIC_URL: 'http://localhost:5173/app' },
    });

    assert.equal(fakeDoc.title, 'Local Test · Swipe 2 Study');
    assert.equal(fakeDoc.querySelector('link[rel="canonical"]'), null, 'Must NOT create canonical tag for localhost');
    assert.equal(fakeDoc.querySelector('meta[property="og:url"]'), null, 'Must NOT create og:url tag for localhost');

    cleanup1();
    assert.equal(fakeDoc.title, 'Swipe 2 Study');
    assert.equal(fakeDoc.getElements().length, 0, 'Introduced tags must be removed cleanly on cleanup');

    // 2. Mount page with verified origin: creates tags, and removes them on cleanup
    const cleanup2 = setPageMetadata({
      title: 'Verified Page',
      description: 'Verified description',
      canonicalPath: '/verified',
      env: { VITE_PUBLIC_URL: 'https://swipe2study.app' },
    });

    assert.ok(fakeDoc.querySelector('link[rel="canonical"]'));
    assert.ok(fakeDoc.querySelector('meta[property="og:url"]'));

    cleanup2();
    assert.equal(fakeDoc.getElements().length, 0, 'All introduced tags must be removed on cleanup');
  } finally {
    globalThis.document = origDoc;
  }
});

test('public pages: About component renders concise HSK1/N5 scope and navigation without unapproved claims', () => {
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

  // Verify it does not advertise unapproved levels, payment tiers, or unapproved claims
  assert.doesNotMatch(html, /HSK\s*[2-9]/);
  assert.doesNotMatch(html, /JLPT\s*N[1-4]/);
  assert.doesNotMatch(html, /\$|subscription price|free trial/i);
  assert.doesNotMatch(html, /verified vocabulary/i, 'Must not claim verified vocabulary');
});

test('public pages: PrivacyPolicy displays concise unavailable state with navigation and NO developer checklists', () => {
  const html = renderWithProviders(createElement(PrivacyPolicy), { initialEntry: '/privacy' });

  assert.ok(html.includes('Privacy Policy'), 'Must render title');
  assert.ok(html.includes('Pending Owner Publication'), 'Must clearly show pending status badge');
  assert.ok(html.includes('No approved privacy policy or designated privacy contact'), 'Must explain unavailable state');

  // Useful navigation links present
  assert.ok(html.includes('/about'), 'Must link to About');
  assert.ok(html.includes('/learn'), 'Must link to Learn');
  assert.ok(html.includes('Go to Home'), 'Must link to Home');

  // Must NOT expose developer/owner requirements checklist
  assert.doesNotMatch(html, /Owner Publication Checklist/i, 'Must NOT contain owner checklist on learner page');
  assert.doesNotMatch(html, /☐/, 'Must NOT contain checklist checkboxes');
  assert.doesNotMatch(html, /Data Controller &amp; Contact/i);
  assert.doesNotMatch(html, /Subprocessor Disclosures/i);

  // Must NOT contain inaccurate technical claims or unapproved terms
  assert.doesNotMatch(html, /passwords are never accessible to client-side scripts/i, 'Must NOT make inaccurate password access claims');
  assert.doesNotMatch(html, /No guest learning activity is transmitted/i, 'Must NOT make inaccurate guest activity transmission claims');
  assert.doesNotMatch(html, /“as-is” basis/i, 'Must NOT contain unapproved as-is terms');
  assert.doesNotMatch(html, /commercial deployment|commercial operation/i, 'Must NOT promise commercial launch');

  // Must NOT display acceptance checkboxes or fake effective dates
  assert.doesNotMatch(html, /<input[^>]+type="checkbox"/i, 'Must NOT contain acceptance checkbox');
  assert.doesNotMatch(html, /effective date:\s*\w+\s*\d+,\s*\d+/i, 'Must NOT invent fake effective date');
});

test('public pages: TermsOfService displays concise unavailable state with navigation and NO developer checklists', () => {
  const html = renderWithProviders(createElement(TermsOfService), { initialEntry: '/terms' });

  assert.ok(html.includes('Terms of Service'), 'Must render title');
  assert.ok(html.includes('Pending Owner Publication'), 'Must clearly show pending status badge');
  assert.ok(html.includes('No approved terms of service or binding terms agreements'), 'Must explain unavailable state');

  // Useful navigation links present
  assert.ok(html.includes('/about'), 'Must link to About');
  assert.ok(html.includes('/learn'), 'Must link to Learn');
  assert.ok(html.includes('Go to Home'), 'Must link to Home');

  // Must NOT expose developer/owner requirements checklist
  assert.doesNotMatch(html, /Owner Publication Checklist/i, 'Must NOT contain owner checklist on learner page');
  assert.doesNotMatch(html, /☐/, 'Must NOT contain checklist checkboxes');
  assert.doesNotMatch(html, /Governing Law &amp; Dispute Resolution/i);

  // Must NOT contain unapproved terms, verified claims, or commercial promises
  assert.doesNotMatch(html, /“as-is”/i, 'Must NOT contain unapproved as-is terms');
  assert.doesNotMatch(html, /without warranty/i, 'Must NOT contain unapproved warranty disclaimers');
  assert.doesNotMatch(html, /commercial licensing|commercial operation/i, 'Must NOT promise commercial launch');
  assert.doesNotMatch(html, /verified starter vocabulary/i, 'Must NOT make verified curriculum claims');

  // Must NOT contain acceptance checkbox
  assert.doesNotMatch(html, /<input[^>]+type="checkbox"/i, 'Must NOT contain acceptance checkbox');
  assert.doesNotMatch(html, /hereby agree to be bound/i, 'Must NOT claim user is bound to unavailable terms');
});

test('public pages: Support displays concise unavailable state, self-service tips, and NO excluded dictionary promotion', () => {
  const html = renderWithProviders(createElement(Support), { initialEntry: '/support' });

  assert.ok(html.includes('Support &amp; Help') || html.includes('Support & Help'), 'Must render title');
  assert.ok(html.includes('Pending Owner Configuration'), 'Must show pending configuration badge');
  assert.ok(html.includes('Direct contact channels are currently unavailable'), 'Must explain unavailable state');

  // Self-service audio and language guidance
  assert.ok(html.includes('Pronunciation audio'), 'Must provide audio guidance');
  assert.ok(html.includes('Language &amp; preferences') || html.includes('Language & preferences'), 'Must provide language guidance');

  // Useful navigation
  assert.ok(html.includes('/settings'), 'Must link to Settings');
  assert.ok(html.includes('/learn'), 'Must link to Learn');
  assert.ok(html.includes('/about'), 'Must link to About');

  // Must NOT contain owner setup checklist
  assert.doesNotMatch(html, /Owner Configuration Checklist/i, 'Must NOT contain owner checklist on learner page');
  assert.doesNotMatch(html, /☐/, 'Must NOT contain checklist checkboxes');
  assert.doesNotMatch(html, /Primary Support Email/i);

  // Support must NOT promote excluded Dictionary functionality or describe account learning reset as local-only
  assert.doesNotMatch(html, /Words can be saved from the Dictionary/i, 'Must NOT promote excluded Dictionary functionality');
  assert.doesNotMatch(html, /safely wipe your local learning history/i, 'Must NOT describe account learning reset as local-only');

  // Must NOT promise commercial launch or direct to non-existent deployment admins
  assert.doesNotMatch(html, /activated upon commercial launch/i);
  assert.doesNotMatch(html, /designated deployment administrator/i);
});

test('public pages: Login and Signup footer links wire cleanly to public information routes', () => {
  const loginHtml = renderWithProviders(createElement(Login), { initialEntry: '/login' });
  assert.ok(loginHtml.includes('href="/about"'), 'Login must link to /about');
  assert.ok(loginHtml.includes('href="/privacy"'), 'Login must link to /privacy');
  assert.ok(loginHtml.includes('href="/terms"'), 'Login must link to /terms');
  assert.ok(loginHtml.includes('href="/support"'), 'Login must link to /support');
  assert.doesNotMatch(loginHtml, /I agree to the terms/i);

  const signupHtml = renderWithProviders(createElement(Signup), { initialEntry: '/signup' });
  assert.ok(signupHtml.includes('href="/about"'), 'Signup must link to /about');
  assert.ok(signupHtml.includes('href="/privacy"'), 'Signup must link to /privacy');
  assert.ok(signupHtml.includes('href="/terms"'), 'Signup must link to /terms');
  assert.ok(signupHtml.includes('href="/support"'), 'Signup must link to /support');
  assert.doesNotMatch(signupHtml, /I agree to the terms/i);
});

test('public pages: SettingsSubpage wires About rows to all four public routes', () => {
  const html = renderWithProviders(createElement(SettingsSubpage), { initialEntry: '/settings' });
  assert.ok(html.includes('About Swipe 2 Study'), 'Settings must include About row');
  assert.ok(html.includes('Support &amp; help') || html.includes('Support & help'), 'Settings must include Support row');
  assert.ok(html.includes('Privacy policy'), 'Settings must include Privacy row');
  assert.ok(html.includes('Terms of service'), 'Settings must include Terms row');
});
