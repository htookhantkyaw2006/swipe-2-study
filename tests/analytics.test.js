import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAnalyticsEnabled,
  sanitizeMetadata,
  trackEvent,
  ALLOWED_ANALYTICS_EVENTS,
  ALLOWED_METADATA_KEYS,
  APPROVED_COURSE_IDS,
  APPROVED_LEVEL_IDS,
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
  assert.deepEqual(APPROVED_COURSE_IDS, ['zh', 'ja', 'zh-hsk1', 'ja-n5']);
  assert.deepEqual(APPROVED_LEVEL_IDS, ['1', 'hsk1', 'HSK1', '5', 'n5', 'N5']);
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

test('analytics: caller contract test for learning:reset_confirmed (emits scope account or guest)', async () => {
  let captured = null;
  const mockTransport = (p) => { captured = p; };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  // 1. Emitted by SettingsSubpage for authenticated user reset: scope='account'
  await trackEvent('learning:reset_confirmed', { scope: 'account' }, { env, transport: mockTransport });
  assert.ok(captured);
  assert.equal(captured.metadata.scope, 'account');

  // 2. Emitted by SettingsSubpage for guest user reset: scope='guest'
  await trackEvent('learning:reset_confirmed', { scope: 'guest' }, { env, transport: mockTransport, dedupeKey: 'k2' });
  assert.equal(captured.metadata.scope, 'guest');

  // 3. Unsupported legacy scopes (all, course, level) or arbitrary text/UUIDs MUST be rejected
  await trackEvent('learning:reset_confirmed', { scope: 'all' }, { env, transport: mockTransport, dedupeKey: 'k3' });
  assert.equal(captured.metadata.scope, undefined, 'Unsupported scope "all" must be rejected');

  await trackEvent('learning:reset_confirmed', { scope: '550e8400-e29b-41d4-a716-446655440000' }, { env, transport: mockTransport, dedupeKey: 'k4' });
  assert.equal(captured.metadata.scope, undefined, 'UUID in scope must be rejected');
});

test('analytics: caller contract test for import:guest_completed (emits choice account-only or merge)', async () => {
  let captured = null;
  const mockTransport = (p) => { captured = p; };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  // 1. Real caller choice='account-only'
  await trackEvent('import:guest_completed', { choice: 'account-only', recordCount: 25 }, { env, transport: mockTransport });
  assert.ok(captured);
  assert.equal(captured.metadata.choice, 'account-only');
  assert.equal(captured.metadata.recordCount, 25);

  // 2. Real caller choice='merge'
  await trackEvent('import:guest_completed', { choice: 'merge', recordCount: 10 }, { env, transport: mockTransport, dedupeKey: 'imp2' });
  assert.equal(captured.metadata.choice, 'merge');
  assert.equal(captured.metadata.recordCount, 10);

  // 3. Unsupported choices ('replace', 'discard') or arbitrary text/UUIDs MUST be rejected
  await trackEvent('import:guest_completed', { choice: 'replace' }, { env, transport: mockTransport, dedupeKey: 'imp3' });
  assert.equal(captured.metadata.choice, undefined, 'Unsupported choice "replace" must be rejected');

  await trackEvent('import:guest_completed', { choice: 'discard' }, { env, transport: mockTransport, dedupeKey: 'imp4' });
  assert.equal(captured.metadata.choice, undefined, 'Unsupported choice "discard" must be rejected');
});

test('analytics: caller contract test for study session events (emits mode learn/review/saved)', async () => {
  let captured = null;
  let transportCallCount = 0;
  const mockTransport = (p) => {
    transportCallCount++;
    captured = p;
  };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  // 1. Study session start with mode='learn' (supported control)
  const res1 = await trackEvent('study:session_start', {
    courseId: 'zh',
    levelId: 'HSK1',
    mode: 'learn',
    cardCount: 20,
  }, { env, transport: mockTransport, dedupeKey: 's1' });
  assert.equal(res1.tracked, true);
  assert.equal(transportCallCount, 1);
  assert.equal(captured.metadata.mode, 'learn');
  assert.equal(captured.metadata.courseId, 'zh');
  assert.equal(captured.metadata.levelId, 'HSK1');
  assert.equal(captured.metadata.cardCount, 20);

  // 2. Study session start with mode='review' (supported control)
  const res2 = await trackEvent('study:session_start', {
    courseId: 'ja',
    levelId: 'N5',
    mode: 'review',
    cardCount: 15,
  }, { env, transport: mockTransport, dedupeKey: 's2' });
  assert.equal(res2.tracked, true);
  assert.equal(transportCallCount, 2);
  assert.equal(captured.metadata.mode, 'review');
  assert.equal(captured.metadata.courseId, 'ja');
  assert.equal(captured.metadata.levelId, 'N5');

  // 3. Study session complete with mode='saved' (supported control)
  const res3 = await trackEvent('study:session_complete', {
    courseId: 'zh-hsk1',
    levelId: '1',
    mode: 'saved',
    cardCount: 10,
  }, { env, transport: mockTransport, dedupeKey: 's3' });
  assert.equal(res3.tracked, true);
  assert.equal(transportCallCount, 3);
  assert.equal(captured.metadata.mode, 'saved');
  assert.equal(captured.metadata.courseId, 'zh-hsk1');

  // 4. Excluded phrase flow mode='phrases' MUST reject entire event and make ZERO transport calls
  const beforeCount = transportCallCount;
  const res4 = await trackEvent('study:session_start', {
    courseId: 'zh',
    levelId: 'HSK1',
    mode: 'phrases',
    cardCount: 5,
  }, { env, transport: mockTransport, dedupeKey: 's4' });
  assert.equal(res4.tracked, false, 'Excluded phrase flow must not be tracked');
  assert.equal(res4.reason, 'unsupported_mode');
  assert.equal(transportCallCount, beforeCount, 'Transport call count must be zero for excluded phrases mode');

  // 5. Excluded drill / unsupported mode MUST reject entire event and make ZERO transport calls
  const res5 = await trackEvent('study:session_complete', {
    courseId: 'zh',
    levelId: 'HSK1',
    mode: 'drills',
    cardCount: 10,
  }, { env, transport: mockTransport, dedupeKey: 's5' });
  assert.equal(res5.tracked, false, 'Excluded drill flow must not be tracked');
  assert.equal(transportCallCount, beforeCount, 'Transport call count must remain zero for unsupported drills mode');

  // 6. Arbitrary text/UUID under mode or missing mode MUST reject entire event
  const res6 = await trackEvent('study:session_start', {
    courseId: 'user_free_text_course',
    mode: '550e8400-e29b-41d4-a716-446655440000',
  }, { env, transport: mockTransport, dedupeKey: 's6' });
  assert.equal(res6.tracked, false);
  assert.equal(transportCallCount, beforeCount, 'Transport call count must remain zero for UUID mode');

  const res7 = await trackEvent('study:session_start', {
    courseId: 'zh',
    levelId: 'HSK1',
  }, { env, transport: mockTransport, dedupeKey: 's7' });
  assert.equal(res7.tracked, false);
  assert.equal(transportCallCount, beforeCount, 'Transport call count must remain zero for missing mode');
});

test('analytics: strictly rejects bare credentials, quoted JSON credentials, emails, learner text, and UUID values', () => {
  const dirty = {
    mode: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHVo',
    choice: '{"password":"supersecret123"}',
    courseId: 'learner@example.com',
    levelId: 'My personal vocabulary notes and translation questions',
    scope: '550e8400-e29b-41d4-a716-446655440000',
  };

  const clean = sanitizeMetadata(dirty);
  assert.equal(clean.mode, undefined, 'Bare credential must be rejected');
  assert.equal(clean.choice, undefined, 'Quoted JSON must be rejected');
  assert.equal(clean.courseId, undefined, 'Email must be rejected');
  assert.equal(clean.levelId, undefined, 'Arbitrary text must be rejected');
  assert.equal(clean.scope, undefined, 'UUID must be rejected');
});

test('analytics: strictly bounds numeric metadata and rejects negative or out-of-bound numbers', () => {
  const dirtyNumbers = {
    cardCount: -5,
    recordCount: 99999999,
  };

  const clean = sanitizeMetadata('study:session_start', dirtyNumbers);
  assert.equal(clean.cardCount, undefined, 'Negative number must be rejected');

  const cleanImport = sanitizeMetadata('import:guest_completed', dirtyNumbers);
  assert.equal(cleanImport.recordCount, undefined, 'Out-of-bounds number must be rejected');
});
