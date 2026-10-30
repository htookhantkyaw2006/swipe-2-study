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

test('analytics: enforces event-specific coarse enums and approved course/level identifiers', () => {
  // 1. auth:signin_success only accepts coarse mode enum ('password', 'oauth_callback')
  const validSignin = sanitizeMetadata('auth:signin_success', { mode: 'password' });
  assert.equal(validSignin.mode, 'password');

  const invalidSigninMode = sanitizeMetadata('auth:signin_success', { mode: 'arbitrary_mode_text' });
  assert.equal(invalidSigninMode.mode, undefined, 'Arbitrary text mode must be rejected');

  // 2. study:session_start enforces approved courseId and levelId
  const validStudy = sanitizeMetadata('study:session_start', {
    courseId: 'zh-hsk1',
    levelId: 'HSK1',
    cardCount: 20,
  });
  assert.equal(validStudy.courseId, 'zh-hsk1');
  assert.equal(validStudy.levelId, 'HSK1');
  assert.equal(validStudy.cardCount, 20);

  const invalidCourseStudy = sanitizeMetadata('study:session_start', {
    courseId: 'unapproved_course_name',
    levelId: 'HSK9',
  });
  assert.equal(invalidCourseStudy.courseId, undefined);
  assert.equal(invalidCourseStudy.levelId, undefined);

  // 3. import:guest_completed only accepts coarse choice ('merge', 'replace', 'discard')
  const validImport = sanitizeMetadata('import:guest_completed', { choice: 'merge', recordCount: 15 });
  assert.equal(validImport.choice, 'merge');
  assert.equal(validImport.recordCount, 15);

  const invalidImportChoice = sanitizeMetadata('import:guest_completed', { choice: 'user_custom_choice' });
  assert.equal(invalidImportChoice.choice, undefined);

  // 4. learning:reset_confirmed only accepts coarse scope ('all', 'course', 'level')
  const validReset = sanitizeMetadata('learning:reset_confirmed', { scope: 'all' });
  assert.equal(validReset.scope, 'all');

  const invalidResetScope = sanitizeMetadata('learning:reset_confirmed', { scope: 'arbitrary_scope' });
  assert.equal(invalidResetScope.scope, undefined);
});

test('analytics: strictly rejects bare credentials, quoted JSON credentials, emails, learner text, and UUID values', () => {
  const dirty = {
    // Bare credentials / JWT
    mode: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHVo',
    // Quoted JSON credentials
    choice: '{"password":"supersecret123"}',
    // Email
    courseId: 'learner@example.com',
    // Arbitrary learner text
    levelId: 'My personal vocabulary notes and translation questions',
    // UUID values
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

test('analytics: trackEvent sends sanitized payload and avoids unnecessary cookies/referrer data', async () => {
  let capturedPayload = null;
  const mockTransport = (payload) => { capturedPayload = payload; };
  const env = { VITE_ANALYTICS_ENABLED: 'true', VITE_ANALYTICS_URL: 'https://analytics.example.com' };

  const res = await trackEvent('study:session_start', {
    courseId: 'ja-n5',
    levelId: 'N5',
    cardCount: 15,
    // Sensitive injection attempt
    userId: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
  }, { env, transport: mockTransport });

  assert.equal(res.tracked, true);
  assert.ok(capturedPayload);
  assert.equal(capturedPayload.event, 'study:session_start');
  assert.equal(capturedPayload.metadata.courseId, 'ja-n5');
  assert.equal(capturedPayload.metadata.levelId, 'N5');
  assert.equal(capturedPayload.metadata.cardCount, 15);
  assert.equal(capturedPayload.metadata.userId, undefined);
  assert.equal(capturedPayload.metadata.email, undefined);
});
