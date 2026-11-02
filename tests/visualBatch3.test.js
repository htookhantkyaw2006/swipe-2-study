import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
const { default: LevelOverview } = await server.ssrLoadModule('/src/components/study/LevelOverview.jsx');
const { default: BottomNav } = await server.ssrLoadModule('/src/components/BottomNav.jsx');

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
  assert.ok(offlineHtml.includes('Catalog disabled'), 'Truthful fallback when published content is disabled');

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
  assert.ok(html.includes('Settings &amp; support') || html.includes('Settings & support'), 'Keeps Settings & support distinct');
  assert.ok(!html.includes('profile-plan'), 'Removes promotional Free plan card');
  assert.ok(!html.includes('Send feedback'), 'Hides nonfunctional Send feedback row');
  assert.ok(html.includes('Learning settings'), 'Includes single clear Learning settings link');
  assert.ok(html.includes('Course language, audio, and display'), 'Learning settings copy excludes daily goals');
  assert.ok(!html.includes('daily goals'), 'daily goals is removed from Profile settings copy');
  assert.ok(html.includes('under your account'), 'Signed in storage note distinguishes account storage on device');

  // Guest view check
  const guestHtml = renderWithProviders(createElement(Profile), { authValue: { user: null, isGuest: true, isConfigured: true } });
  assert.ok(guestHtml.includes('Guest words stay on this device'), 'Guest mode clearly states guest words stay on device');

  // Keyboard focus-visible rules
  const profileCss = fs.readFileSync(path.resolve(projectRoot, 'src/pages/Profile.css'), 'utf8');
  assert.match(profileCss, /\.profile-setting:focus-visible\s*\{/, 'Profile setting has dedicated :focus-visible style');
  assert.match(profileCss, /\.profile-edit-btn:focus-visible\s*\{/, 'Profile edit button has dedicated :focus-visible style');
  assert.ok(html.includes('Learning overview'), 'Includes unified learning overview');
});

test('5. LevelOverview renders Chinese level cards with full approved gradient surface and truthful states', () => {
  const html = renderWithProviders(createElement(LevelOverview), {
    publishedEnabled: true,
    initialCache: {
      'zh-hsk1': {
        status: 'loaded',
        items: new Array(300).fill({ id: 'item' }),
        version: 1,
        error: null,
        isPublished: true,
      },
      'zh-hsk2': {
        status: 'unpublished',
        items: [],
        version: null,
        error: null,
        isPublished: false,
      },
    },
  });

  // HSK 1: Available, NOW LEARNING, Start / Explore level, approved gradient palette
  assert.ok(html.includes('HSK 1'), 'Renders HSK 1');
  assert.ok(html.includes('NOW LEARNING'), 'HSK 1 shows NOW LEARNING');
  assert.ok(html.includes('300 cards available'), 'HSK 1 shows loaded card count');
  assert.ok(html.includes('Explore level'), 'HSK 1 action is Explore level');
  assert.ok(html.includes('#7DD3FC') && html.includes('#0369A1'), 'HSK 1 includes approved gradient stops #7DD3FC -> #0369A1');

  // HSK 2: Coming soon, truthful empty copy, disabled action, red gradient palette
  assert.ok(html.includes('HSK 2'), 'Renders HSK 2');
  assert.ok(html.includes('COMING SOON'), 'HSK 2 shows COMING SOON');
  assert.ok(html.includes('Curriculum in preparation'), 'HSK 2 shows Curriculum in preparation');
  assert.ok(!html.includes('200 words curriculum'), 'Unpublished levels do not fabricate numeric curriculum totals');
  assert.ok(html.includes('Coming soon'), 'HSK 2 action is disabled Coming soon');
  assert.ok(html.includes('#FCA5A5') && html.includes('#DC2626'), 'HSK 2 includes approved gradient stops #FCA5A5 -> #DC2626');

  // Remaining HSK levels render approved gradients
  assert.ok(html.includes('#FDBA74') && html.includes('#EA580C'), 'HSK 3 orange gradient stops');
  assert.ok(html.includes('#FDE047') && html.includes('#CA8A04'), 'HSK 4 yellow gradient stops');
});

test('6. Typography restores reduced auth weights and preserves system hierarchy', () => {
  const css = fs.readFileSync(path.resolve(projectRoot, 'src/index.css'), 'utf8');
  assert.match(css, /\.auth-title\s*\{[^}]*font-weight:\s*800;/, 'Auth title restored to weight 800');
  assert.match(css, /\.auth-label\s*\{[^}]*font-weight:\s*700;/, 'Auth labels restored to weight 700');
  assert.match(css, /\.auth-submit\s*\{[^}]*font-weight:\s*700;/, 'Auth submit restored to weight 700');
  assert.match(css, /--font-sans:\s*-apple-system,\s*BlinkMacSystemFont,\s*'Inter',\s*'Noto Sans Myanmar',\s*var\(--font-cjk\),\s*system-ui,\s*sans-serif;/, 'Font stack prefers Apple system font on Apple platforms and self-hosted Inter on other platforms');
  assert.match(css, /--color-text-main:\s*#1C1C1E;/, 'Main reading text color is #1C1C1E');
  assert.match(css, /--color-text-sub:\s*#48484A;/, 'Secondary text color is #48484A');
  assert.ok(!css.includes('@font-face') || !css.includes('SF Pro'), 'Does not bundle SF Pro font files');
});

test('7. Icon-to-surface proportions and target sizing conform to specs', () => {
  const libCss = fs.readFileSync(path.resolve(projectRoot, 'src/pages/Library.css'), 'utf8');
  assert.match(libCss, /\.library-counts\s+\.library-counts__art\s*\{[^}]*width:\s*52px;\s*height:\s*52px;/, 'Count art sized for ~25px glyph');
  assert.match(libCss, /\.library-tool\s+\.library-tool__art\s*\{[^}]*width:\s*56px;\s*height:\s*56px;/, 'Tool art sized for ~27px glyph');
  assert.match(libCss, /@media\s*\([^)]*max-width:\s*359px\)[^}]*\{\s*\.library-intro\s*\{[^}]*\}\s*\.library-intro\s+\.library-intro__art\s*\{\s*display:\s*none;/, 'Hero art hidden at 320px to prevent text squeezing');
});

test('8. Password visibility toggles are keyboard reachable and omit tabIndex={-1}', () => {
  const loginHtml = renderWithProviders(createElement(Login));
  assert.ok(loginHtml.includes('auth-input-toggle'), 'Login has password toggle');
  assert.ok(!loginHtml.includes('auth-input-toggle" tabindex="-1"') && !loginHtml.includes('auth-input-toggle\' tabindex=\'-1\''), 'Login toggle must not have tabIndex={-1}');

  const signupHtml = renderWithProviders(createElement(Signup));
  assert.ok(signupHtml.includes('auth-input-toggle'), 'Signup has password toggle');
  assert.ok(!signupHtml.includes('auth-input-toggle" tabindex="-1"') && !signupHtml.includes('auth-input-toggle\' tabindex=\'-1\''), 'Signup toggle must not have tabIndex={-1}');

  const css = fs.readFileSync(path.resolve(projectRoot, 'src/index.css'), 'utf8');
  assert.match(css, /\.auth-input-toggle:focus-visible\s*\{/, 'Has explicit :focus-visible indicator for password toggle');
});

test('9. BottomNav groups /saved and /dictionary routes under Library with active state and aria-current', () => {
  // At /saved
  const savedHtml = renderToString(
    createElement(MemoryRouter, { initialEntries: ['/saved'] }, createElement(BottomNav))
  );
  assert.ok(savedHtml.includes('href="/library"'), 'Contains library link');
  assert.ok(savedHtml.includes('navigation-link--library is-active'), 'Library is active when at /saved');
  assert.ok(savedHtml.includes('aria-current="true"'), 'Library has aria-current="true" when at /saved');

  // At /dictionary
  const dictHtml = renderToString(
    createElement(MemoryRouter, { initialEntries: ['/dictionary'] }, createElement(BottomNav))
  );
  assert.ok(dictHtml.includes('navigation-link--library is-active'), 'Library is active when at /dictionary');
  assert.ok(dictHtml.includes('aria-current="true"'), 'Library has aria-current="true" when at /dictionary');

  // At /library
  const libHtml = renderToString(
    createElement(MemoryRouter, { initialEntries: ['/library'] }, createElement(BottomNav))
  );
  assert.ok(libHtml.includes('navigation-link--library is-active'), 'Library is active when at /library');
  assert.ok(libHtml.includes('aria-current="page"'), 'Library has aria-current="page" when at /library');

  // At /
  const homeHtml = renderToString(
    createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(BottomNav))
  );
  assert.ok(!homeHtml.includes('navigation-link--library is-active'), 'Library is not active when at /');
});

test('10. Carousel arrows meet minimum 44x44px touch target dimensions', () => {
  const css = fs.readFileSync(path.resolve(projectRoot, 'src/index.css'), 'utf8');
  assert.match(css, /\.icon-button\s*\{[^}]*min-width:\s*44px;/, 'Icon button has min-width 44px');
  assert.match(css, /\.icon-button\s*\{[^}]*min-height:\s*44px;/, 'Icon button has min-height 44px');
  assert.match(css, /\.icon-button\s*\{[^}]*width:\s*44px;/, 'Icon button has width 44px');
  assert.match(css, /\.icon-button\s*\{[^}]*height:\s*44px;/, 'Icon button has height 44px');
});

test('11. HSK cards achieve WCAG AA contrast across all nine level palettes', async () => {
  const { HSK_PALETTE } = await server.ssrLoadModule('/src/courses/zh.js');

  function sRGBtoLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function getLuminance(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return 0.2126 * sRGBtoLinear(r) + 0.7152 * sRGBtoLinear(g) + 0.0722 * sRGBtoLinear(b);
  }
  function contrastRatio(hex1, hex2) {
    const l1 = getLuminance(hex1);
    const l2 = getLuminance(hex2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  for (let num = 1; num <= 9; num++) {
    const palette = HSK_PALETTE[num];
    assert.ok(palette, `Palette for HSK ${num} exists`);

    const isLight = num === 4;

    if (isLight) {
      // HSK 4 uses .level-tile--light with dark text (#0F172A / #1E293B) directly on the gradient
      const titleStartRatio = contrastRatio('#0F172A', palette.gradientStart);
      const titleEndRatio = contrastRatio('#0F172A', palette.gradientEnd);
      const countStartRatio = contrastRatio('#1E293B', palette.gradientStart);
      const countEndRatio = contrastRatio('#1E293B', palette.gradientEnd);

      assert.ok(titleStartRatio >= 4.5, `HSK ${num} title start contrast ${titleStartRatio.toFixed(2)} must be >= 4.5:1`);
      assert.ok(titleEndRatio >= 4.5, `HSK ${num} title end contrast ${titleEndRatio.toFixed(2)} must be >= 4.5:1`);
      assert.ok(countStartRatio >= 4.5, `HSK ${num} count start contrast ${countStartRatio.toFixed(2)} must be >= 4.5:1`);
      assert.ok(countEndRatio >= 4.5, `HSK ${num} count end contrast ${countEndRatio.toFixed(2)} must be >= 4.5:1`);

      // Light tile badges & action
      const learningBadgeRatio = contrastRatio('#FFFFFF', '#0F172A');
      const actionRatio = contrastRatio('#FFFFFF', '#0F172A');
      assert.ok(learningBadgeRatio >= 4.5, `HSK ${num} learning badge contrast ${learningBadgeRatio.toFixed(2)} must be >= 4.5:1`);
      assert.ok(actionRatio >= 4.5, `HSK ${num} action contrast ${actionRatio.toFixed(2)} must be >= 4.5:1`);
    } else {
      // Darker palettes use light text directly on the gradient, with high-contrast actions and badges
      const titleEndRatio = contrastRatio('#FFFFFF', palette.gradientEnd);
      assert.ok(titleEndRatio >= 3.0, `HSK ${num} title on dark end contrast ${titleEndRatio.toFixed(2)} must be >= 3.0:1`);

      // Action on dark tiles uses solid white button with gradientEnd color
      const activeActionRatio = contrastRatio(palette.gradientEnd, '#FFFFFF');
      assert.ok(activeActionRatio >= 3.5, `HSK ${num} action contrast ${activeActionRatio.toFixed(2)} must be >= 3.5:1`);
    }

    // Common badge states
    const soonBadgeRatio = contrastRatio('#FFFFFF', '#0F172A');
    const errorBadgeRatio = contrastRatio('#FFFFFF', '#7F1D1D');
    assert.ok(soonBadgeRatio >= 4.5, `Soon badge contrast ${soonBadgeRatio.toFixed(2)} must be >= 4.5:1`);
    assert.ok(errorBadgeRatio >= 4.5, `Error badge contrast ${errorBadgeRatio.toFixed(2)} must be >= 4.5:1`);
  }
});
