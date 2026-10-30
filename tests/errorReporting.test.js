import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isErrorReportingEnabled,
  sanitizeUrl,
  scrubSensitiveText,
  sanitizeError,
  sanitizeContext,
  reportError,
  initGlobalErrorMonitoring,
} from '../src/lib/errorReporting.js';
import { createDeletionHttpHandler } from '../src/server/accountDeletion.js';

test('errorReporting: isErrorReportingEnabled is false by default and requires URL + enabled flag', () => {
  assert.equal(isErrorReportingEnabled({}), false);
  assert.equal(isErrorReportingEnabled(undefined), false);
  assert.equal(isErrorReportingEnabled({ VITE_ERROR_REPORTING_ENABLED: 'true' }), false);
  assert.equal(isErrorReportingEnabled({ VITE_ERROR_REPORTING_URL: 'https://errors.example.com' }), false);
  assert.equal(isErrorReportingEnabled({ VITE_ERROR_REPORTING_ENABLED: 'false', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' }), false);
  assert.equal(isErrorReportingEnabled({ VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' }), true);
});

test('errorReporting: sanitizeUrl strips sensitive query params, recovery hashes, and tokens', () => {
  const urlWithTokens = 'https://app.swipe2study.com/auth/callback?token=secret123&code=xyz#access_token=jwt456&refresh_token=r789';
  const sanitized = sanitizeUrl(urlWithTokens);
  assert.equal(sanitized, 'https://app.swipe2study.com/auth/callback');

  const relativeUrl = '/reset-password?token=abcdef#recovery_hash';
  const sanitizedRelative = sanitizeUrl(relativeUrl);
  assert.equal(sanitizedRelative, '/reset-password');

  assert.equal(sanitizeUrl(''), '');
  assert.equal(sanitizeUrl(null), '');
});

test('errorReporting: scrubSensitiveText removes bare JWTs, quoted JSON credentials, emails, and passwords', () => {
  // Bare JWT without "Bearer" prefix
  const bareJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const textWithBareJwt = `Crash occurred while processing token: ${bareJwt}`;
  const scrubbedJwt = scrubSensitiveText(textWithBareJwt);
  assert.doesNotMatch(scrubbedJwt, /eyJhbGci/);
  assert.match(scrubbedJwt, /\[REDACTED_TOKEN\]/);

  // Quoted JSON credentials
  const jsonCredentials = 'Failed API call with body {"password": "SuperSecretPassword123", "token": "abcde1234567890", "email": "test@example.com"}';
  const scrubbedJson = scrubSensitiveText(jsonCredentials);
  assert.doesNotMatch(scrubbedJson, /SuperSecretPassword123/);
  assert.doesNotMatch(scrubbedJson, /abcde1234567890/);
  assert.doesNotMatch(scrubbedJson, /test@example\.com/);
  assert.match(scrubbedJson, /\[REDACTED\]/);

  // UUIDs
  const textWithUuid = 'User account 550e8400-e29b-41d4-a716-446655440000 encountered error';
  const scrubbedUuid = scrubSensitiveText(textWithUuid);
  assert.doesNotMatch(scrubbedUuid, /550e8400-e29b-41d4-a716-446655440000/);
  assert.match(scrubbedUuid, /\[REDACTED_ID\]/);
});

test('errorReporting: sanitizeError sanitizes error.name and restricts stack frames', () => {
  // error.name containing email
  const emailNameError = new Error('Database connection failed');
  emailNameError.name = 'john.doe@example.com';
  const sanitized1 = sanitizeError(emailNameError);
  assert.equal(sanitized1.name, 'Error', 'Email in error.name must be replaced with static Error');

  // error.name containing bare JWT
  const jwtNameError = new Error('Auth error');
  jwtNameError.name = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc';
  const sanitized2 = sanitizeError(jwtNameError);
  assert.equal(sanitized2.name, 'Error', 'JWT in error.name must be replaced with static Error');

  // error.name containing arbitrary learner text with spaces
  const arbitraryNameError = new Error('Some error');
  arbitraryNameError.name = 'Arbitrary Learner Notes In Error Name';
  const sanitized3 = sanitizeError(arbitraryNameError);
  assert.equal(sanitized3.name, 'Error', 'Arbitrary text with spaces in error.name must be replaced with static Error');

  // error.name with valid identifier
  const validError = new TypeError('Cannot read property of undefined');
  const sanitized4 = sanitizeError(validError);
  assert.equal(sanitized4.name, 'TypeError');

  // Restricted stack frames (arbitrary injected text outside stack frame dropped)
  const errorWithInjectedStack = new Error('Render crash');
  errorWithInjectedStack.stack = `Error: Render crash\nLearner free-form notes injected here\n    at Component.render (https://app.local/bundle.js?token=secret123:10:20)\nMore arbitrary text\n    at Object.click (https://app.local/main.js:5:6)`;
  const sanitizedStack = sanitizeError(errorWithInjectedStack);
  assert.doesNotMatch(sanitizedStack.stack, /Learner free-form notes/);
  assert.doesNotMatch(sanitizedStack.stack, /More arbitrary text/);
  assert.doesNotMatch(sanitizedStack.stack, /token=secret123/);
  assert.match(sanitizedStack.stack, /Component\.render/);
  assert.match(sanitizedStack.stack, /Object\.click/);
});

test('errorReporting: sanitizeContext keeps only allowed coarse metadata and scrubs values', () => {
  const rawContext = {
    source: 'RouteErrorBoundary',
    status: 500,
    code: 'CHUNK_LOAD_FAILED',
    authorization: 'Bearer secret_auth_token_value',
    rawBody: '{"email":"leak@example.com","password":"secretpassword"}',
    userPassword: 'secretpassword',
    componentStack: 'in LazyRoute\n  in RouteErrorBoundary',
  };

  const cleanContext = sanitizeContext(rawContext);
  assert.equal(cleanContext.source, 'RouteErrorBoundary');
  assert.equal(cleanContext.status, 500);
  assert.equal(cleanContext.code, 'CHUNK_LOAD_FAILED');
  assert.equal(cleanContext.componentStack, 'in LazyRoute\n  in RouteErrorBoundary');

  assert.equal(cleanContext.authorization, undefined);
  assert.equal(cleanContext.rawBody, undefined);
  assert.equal(cleanContext.userPassword, undefined);
});

test('errorReporting: disabled reporting performs zero network requests', async () => {
  let transportCalled = false;
  const mockTransport = () => { transportCalled = true; };

  const res = await reportError(new Error('Sample test error'), { source: 'test' }, {
    env: { VITE_ERROR_REPORTING_ENABLED: 'false' },
    transport: mockTransport,
  });

  assert.equal(res.reported, false);
  assert.equal(res.reason, 'disabled');
  assert.equal(transportCalled, false);
});

test('errorReporting: deduplicates identical Error instances and rolling signatures', async () => {
  const sentPayloads = [];
  const mockTransport = (p) => { sentPayloads.push(p); };
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };

  const sharedError = new Error('Unique render crash 1');
  const res1 = await reportError(sharedError, { source: 'RouteErrorBoundary' }, { env, transport: mockTransport });
  assert.equal(res1.reported, true);
  assert.equal(sentPayloads.length, 1);

  // Second call with the exact same error object instance
  const res2 = await reportError(sharedError, { source: 'window_onerror' }, { env, transport: mockTransport });
  assert.equal(res2.reported, false);
  assert.equal(res2.reason, 'deduplicated');
  assert.equal(sentPayloads.length, 1);

  // Third call with distinct error instance but identical signature
  const duplicateErr = new Error('Unique render crash 2');
  const res3 = await reportError(duplicateErr, { source: 'window_onerror' }, { env, transport: mockTransport });
  assert.equal(res3.reported, true);
  assert.equal(sentPayloads.length, 2);

  const res4 = await reportError(new Error('Unique render crash 2'), { source: 'window_onerror' }, { env, transport: mockTransport });
  assert.equal(res4.reported, false);
  assert.equal(res4.reason, 'deduplicated');
  assert.equal(sentPayloads.length, 2);
});

test('errorReporting: independent concurrent errors are NOT dropped while a request is in flight', async () => {
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };
  const dispatchedErrors = [];

  // Transport with artificial delay simulating network transit
  const slowTransport = async (payload) => {
    dispatchedErrors.push(payload.error.message);
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  const errA = new Error('Concurrent Error Alpha');
  const errB = new Error('Concurrent Error Beta');

  // Trigger Error A and Error B concurrently
  const [resA, resB] = await Promise.all([
    reportError(errA, { source: 'source_a' }, { env, transport: slowTransport }),
    reportError(errB, { source: 'source_b' }, { env, transport: slowTransport }),
  ]);

  assert.equal(resA.reported, true, 'Error A must be reported');
  assert.equal(resB.reported, true, 'Error B must NOT be dropped while Error A is in flight');
  assert.equal(dispatchedErrors.length, 2);
  assert.ok(dispatchedErrors.includes('Concurrent Error Alpha'));
  assert.ok(dispatchedErrors.includes('Concurrent Error Beta'));
});

test('errorReporting: transport failure is safely isolated and never throws or breaks execution', async () => {
  const failingTransport = () => { throw new Error('Network failure or DNS timeout'); };
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };

  const res = await reportError(new Error('Sample error with failing transport'), {}, { env, transport: failingTransport });
  assert.equal(res.reported, false);
  assert.equal(res.reason, 'transport_error');

  // Verify recursion guard resets and subsequent report succeeds
  let recovered = false;
  const succeedingTransport = () => { recovered = true; };
  const res2 = await reportError(new Error('Subsequent error'), {}, { env, transport: succeedingTransport });
  assert.equal(res2.reported, true);
  assert.equal(recovered, true);
});

test('errorReporting: initGlobalErrorMonitoring attaches listeners and returns cleanup', () => {
  const eventsAdded = [];
  const eventsRemoved = [];

  const fakeWindow = {
    addEventListener: (type, fn) => eventsAdded.push({ type, fn }),
    removeEventListener: (type, fn) => eventsRemoved.push({ type, fn }),
  };

  const originalWindow = globalThis.window;
  try {
    globalThis.window = fakeWindow;

    const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };
    const cleanup = initGlobalErrorMonitoring({ env });

    assert.equal(eventsAdded.length, 2);
    assert.equal(eventsAdded[0].type, 'error');
    assert.equal(eventsAdded[1].type, 'unhandledrejection');

    cleanup();

    assert.equal(eventsRemoved.length, 2);
    assert.equal(eventsRemoved[0].type, 'error');
    assert.equal(eventsRemoved[1].type, 'unhandledrejection');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('errorReporting: Edge Function failure handles sync throws and rejected promises in reporting hook', async () => {
  // 1. Hook that throws synchronously
  const syncThrowHook = () => { throw new Error('Synchronous hook failure'); };
  const handlerWithSyncThrow = createDeletionHttpHandler({
    adminClient: {},
    env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    reportError: syncThrowHook,
  });

  const req1 = new Request('https://edge.supabase.com/account-deletion', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'user-pass' }),
  });

  const res1 = await handlerWithSyncThrow(req1);
  assert.equal(res1.status, 500, 'Sync throw in hook must not change deletion error status');
  const body1 = await res1.json();
  assert.equal(body1.code, 'SERVER_CONFIG_ERROR');

  // 2. Hook that returns a rejected promise
  const asyncRejectHook = () => Promise.reject(new Error('Async rejected hook'));
  const handlerWithAsyncReject = createDeletionHttpHandler({
    adminClient: {},
    env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    reportError: asyncRejectHook,
  });

  const req2 = new Request('https://edge.supabase.com/account-deletion', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'user-pass' }),
  });

  const res2 = await handlerWithAsyncReject(req2);
  assert.equal(res2.status, 500, 'Rejected promise in hook must not cause unhandled rejection or alter response');
  const body2 = await res2.json();
  assert.equal(body2.code, 'SERVER_CONFIG_ERROR');
});
