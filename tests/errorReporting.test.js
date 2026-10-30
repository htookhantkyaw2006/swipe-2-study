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

test('errorReporting: scrubSensitiveText and sanitizeError remove emails, bearer tokens, and passwords', () => {
  const sensitiveMsg = 'Failed login for user test.learner@example.com with password: SuperSecretPassword123 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
  const scrubbed = scrubSensitiveText(sensitiveMsg);

  assert.doesNotMatch(scrubbed, /test\.learner@example\.com/);
  assert.match(scrubbed, /\[REDACTED_EMAIL\]/);
  assert.doesNotMatch(scrubbed, /SuperSecretPassword123/);
  assert.match(scrubbed, /password=\[REDACTED\]/);
  assert.doesNotMatch(scrubbed, /eyJhbGciOiJIUzI1Ni/);
  assert.match(scrubbed, /\[REDACTED_TOKEN\]/);

  const errorObj = new Error('Database query error on https://db.local/query?secret_key=99999');
  errorObj.stack = `Error: Database query error\n    at query (https://db.local/query?secret_key=99999:12:34)\n    at Object.test (file:///app/test.js:1:2)`;

  const sanitized = sanitizeError(errorObj);
  assert.equal(sanitized.name, 'Error');
  assert.doesNotMatch(sanitized.message, /secret_key=99999/);
  assert.doesNotMatch(sanitized.stack, /secret_key=99999/);
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

test('errorReporting: Edge Function failure invokes reporting hook with sanitized error details', async () => {
  const reportedEdgeErrors = [];
  const mockReportError = (err, ctx) => reportedEdgeErrors.push({ err, ctx });

  const handler = createDeletionHttpHandler({
    adminClient: {},
    env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    reportError: mockReportError,
  });

  const request = new Request('https://edge.supabase.com/account-deletion', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer user-sensitive-access-token-999',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: 'user-raw-password' }),
  });

  const response = await handler(request);
  assert.equal(response.status, 500);

  assert.equal(reportedEdgeErrors.length, 1);
  assert.equal(reportedEdgeErrors[0].ctx.source, 'accountDeletionHandler');
  assert.equal(reportedEdgeErrors[0].ctx.status, 500);
  assert.equal(reportedEdgeErrors[0].ctx.code, 'SERVER_CONFIG_ERROR');
  // Ensure sensitive request body and token are NOT in the reported error context
  assert.equal(reportedEdgeErrors[0].ctx.password, undefined);
  assert.equal(reportedEdgeErrors[0].ctx.rawBody, undefined);
  assert.equal(reportedEdgeErrors[0].ctx.authorization, undefined);
});
