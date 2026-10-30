import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnalyticsEnabled,
  sanitizeMetadata,
  trackEvent,
  ALLOWED_ANALYTICS_EVENTS,
  ALLOWED_METADATA_KEYS,
} from '../src/lib/analytics.js';

test('analytics: isAnalyticsEnabled is false by default and requires URL + enabled flag', () => {
  assert.equal(isAnalyticsEnabled({}), false);
  assert.equal(isAnalyticsEnabled(undefined), false);
  assert.equal(isAnalyticsEnabled({ VITE_ANALYTICS_ENABLED: 'true' }), false);
  assert.equal(isAnalyticsEnabled({ VITE_ANALYTICS_URL: 'https://analytics.example.com' }), false);
  assert.equal(isAnalyticsEnabled({ VITE_ANALYTICS_ENABLED: 'false', VITE_ANALYTICS_URL: 'https://analytics.example.com' }), false);
  assert.equal(isAnalyticsEnabled({ VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' }), true);
});

test('analytics: event allowlist and metadata keys contain exactly in-scope definitions', () => {
  assert.deepEqual(ALLOWED_ANALYTICS_EVENTS, [
    'auth:signup_success',
    'auth:signin_success',
    'study:session_start',
    'study:session_complete',
    'study:word_saved',
    'import:guest_completed',
    'learning:reset_confirmed',
  ]);
  assert.deepEqual(ALLOWED_METADATA_KEYS, [
    'courseId',
    'levelId',
    'mode',
    'cardCount',
    'choice',
    'scope',
    'recordCount',
  ]);
});

test('analytics: unlisted events are rejected', async () => {
  let transportCalled = false;
  const mockTransport = () => { transportCalled = true; };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  const res = await trackEvent('unlisted:event', { courseId: 'zh' }, { env, transport: mockTransport });
  assert.equal(res.tracked, false);
  assert.equal(res.reason, 'unallowed_event');
  assert.equal(transportCalled, false);
});

test('analytics: sanitizeMetadata keeps only allowed coarse metadata keys and strips PII', () => {
  const raw = {
    courseId: 'zh',
    levelId: 'HSK1',
    mode: 'learn',
    cardCount: 25,
    choice: 'merge',
    scope: 'account',
    recordCount: 150,
    // Sensitive / unlisted properties
    userId: 'usr_123456789',
    email: 'learner@example.com',
    userText: 'Hello world! This is user text',
    characterWord: '你好',
    nestedObj: { test: true },
    token: 'Bearer sensitive_token_xyz',
  };

  const clean = sanitizeMetadata(raw);
  assert.equal(clean.courseId, 'zh');
  assert.equal(clean.levelId, 'HSK1');
  assert.equal(clean.mode, 'learn');
  assert.equal(clean.cardCount, 25);
  assert.equal(clean.choice, 'merge');
  assert.equal(clean.scope, 'account');
  assert.equal(clean.recordCount, 150);

  assert.equal(clean.userId, undefined);
  assert.equal(clean.email, undefined);
  assert.equal(clean.userText, undefined);
  assert.equal(clean.characterWord, undefined);
  assert.equal(clean.nestedObj, undefined);
  assert.equal(clean.token, undefined);
});

test('analytics: sanitizeMetadata strips emails, tokens, and out-of-bounds numbers in allowed keys', () => {
  const dirty = {
    mode: 'learner@example.com', // email pattern in string
    levelId: 'Bearer sensitive_auth_key', // token pattern in string
    cardCount: -10, // negative number
    recordCount: 99999999, // out of bounds
  };

  const clean = sanitizeMetadata(dirty);
  assert.equal(clean.mode, undefined);
  assert.equal(clean.levelId, undefined);
  assert.equal(clean.cardCount, undefined);
  assert.equal(clean.recordCount, undefined);
});

test('analytics: disabled tracking performs zero network requests', async () => {
  let transportCalled = false;
  const mockTransport = () => { transportCalled = true; };

  const res = await trackEvent('study:session_start', { courseId: 'zh' }, {
    env: { VITE_ANALYTICS_ENABLED: 'false' },
    transport: mockTransport,
  });

  assert.equal(res.tracked, false);
  assert.equal(res.reason, 'disabled');
  assert.equal(transportCalled, false);
});

test('analytics: deduplicates rapid calls with identical signature or dedupeKey', async () => {
  const sentPayloads = [];
  const mockTransport = (p) => { sentPayloads.push(p); };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  // 1. Signature-based deduplication (React StrictMode simulation)
  const res1 = await trackEvent('study:session_start', { courseId: 'zh', levelId: 'HSK1' }, { env, transport: mockTransport });
  assert.equal(res1.tracked, true);
  assert.equal(sentPayloads.length, 1);

  const res2 = await trackEvent('study:session_start', { courseId: 'zh', levelId: 'HSK1' }, { env, transport: mockTransport });
  assert.equal(res2.tracked, false);
  assert.equal(res2.reason, 'deduplicated');
  assert.equal(sentPayloads.length, 1);

  // 2. Explicit dedupeKey deduplication
  const res3 = await trackEvent('study:session_complete', { courseId: 'ja', levelId: 'N5' }, {
    env,
    transport: mockTransport,
    dedupeKey: 'session-complete-ja-n5-test-key-1',
  });
  assert.equal(res3.tracked, true);
  assert.equal(sentPayloads.length, 2);

  const res4 = await trackEvent('study:session_complete', { courseId: 'ja', levelId: 'N5' }, {
    env,
    transport: mockTransport,
    dedupeKey: 'session-complete-ja-n5-test-key-1',
  });
  assert.equal(res4.tracked, false);
  assert.equal(res4.reason, 'deduplicated');
  assert.equal(sentPayloads.length, 2);
});

test('analytics: transport failures never throw or disrupt application execution', async () => {
  const failingTransport = () => { throw new Error('Ingest endpoint 503 unavailable'); };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  const res = await trackEvent('study:word_saved', { courseId: 'zh' }, { env, transport: failingTransport, dedupeKey: 'unique-fail-key' });
  assert.equal(res.tracked, false);
  assert.equal(res.reason, 'transport_error');
});

test('analytics: all 7 business events track successfully with valid coarse metadata', async () => {
  const sentPayloads = [];
  const mockTransport = (p) => { sentPayloads.push(p); };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  const testCases = [
    { event: 'auth:signup_success', meta: { mode: 'email_confirmation' } },
    { event: 'auth:signin_success', meta: { mode: 'password' } },
    { event: 'study:session_start', meta: { courseId: 'zh', levelId: 'hsk1', mode: 'learn', cardCount: 20 } },
    { event: 'study:session_complete', meta: { courseId: 'zh', levelId: 'hsk1', mode: 'learn', cardCount: 20 } },
    { event: 'study:word_saved', meta: { courseId: 'zh' } },
    { event: 'import:guest_completed', meta: { choice: 'merge', recordCount: 15 } },
    { event: 'learning:reset_confirmed', meta: { scope: 'account' } },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const { event, meta } = testCases[i];
    const res = await trackEvent(event, meta, { env, transport: mockTransport, dedupeKey: `all-events-test-${i}` });
    assert.equal(res.tracked, true, `Event ${event} should have been tracked`);
    assert.equal(res.payload.event, event);
    assert.deepEqual(res.payload.metadata, meta);
  }

  assert.equal(sentPayloads.length, 7);
});
