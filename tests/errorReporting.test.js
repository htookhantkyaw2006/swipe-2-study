import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isErrorReportingEnabled,
  sanitizeUrl,
  scrubSensitiveText,
  sanitizeAssetPath,
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

  // Unknown / unapproved paths must become a static placeholder without preserving user text
  const unapprovedFull = sanitizeUrl('https://swipe2study.app/private/MY_PRIVATE_NOTE/page');
  assert.equal(unapprovedFull, 'https://swipe2study.app/');
  assert.doesNotMatch(unapprovedFull, /MY_PRIVATE_NOTE/);

  const unapprovedRelative = sanitizeUrl('/private/MY_PRIVATE_NOTE/page');
  assert.equal(unapprovedRelative, '/');
  assert.doesNotMatch(unapprovedRelative, /MY_PRIVATE_NOTE/);

  assert.equal(sanitizeUrl(''), '');
  assert.equal(sanitizeUrl(null), '');
});

test('errorReporting: sanitizeAssetPath strips user home directories and keeps safe asset paths', () => {
  // Strip Windows user home directory
  assert.equal(
    sanitizeAssetPath('C:\\Users\\VivoBook\\Desktop\\swipe-2-study\\src\\lib\\errorReporting.js'),
    'src/lib/errorReporting.js'
  );
  // Strip POSIX user home directory
  assert.equal(
    sanitizeAssetPath('/Users/johndoe/projects/swipe-2-study/src/pages/Learn.jsx'),
    'src/pages/Learn.jsx'
  );
  // Keep web assets
  assert.equal(
    sanitizeAssetPath('https://swipe2study.app/assets/index-D6ZxBklE.js?token=secret#h'),
    '/assets/index-D6ZxBklE.js'
  );
  // Valid asset and source controls
  assert.equal(
    sanitizeAssetPath('/assets/index-D6ZxBklE.js'),
    '/assets/index-D6ZxBklE.js'
  );
  assert.equal(
    sanitizeAssetPath('src/App.jsx'),
    'src/App.jsx'
  );
  // Arbitrary leading-slash path must become static placeholder
  assert.equal(
    sanitizeAssetPath('/private/MY_PRIVATE_NOTE/file.js'),
    '/assets/app.js'
  );
  // Traversal must become static placeholder
  assert.equal(
    sanitizeAssetPath('src/../../private/MY_PRIVATE_NOTE/file.js'),
    '/assets/app.js'
  );
});

test('errorReporting: scrubSensitiveText removes bare JWTs, quoted JSON credentials, emails, and passwords', () => {
  const bareJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const textWithBareJwt = `Crash occurred while processing token: ${bareJwt}`;
  const scrubbedJwt = scrubSensitiveText(textWithBareJwt);
  assert.doesNotMatch(scrubbedJwt, /eyJhbGci/);
  assert.match(scrubbedJwt, /\[REDACTED_TOKEN\]/);

  const jsonCredentials = 'Failed API call with body {"password": "SuperSecretPassword123", "token": "abcde1234567890", "email": "test@example.com"}';
  const scrubbedJson = scrubSensitiveText(jsonCredentials);
  assert.doesNotMatch(scrubbedJson, /SuperSecretPassword123/);
  assert.doesNotMatch(scrubbedJson, /abcde1234567890/);
  assert.doesNotMatch(scrubbedJson, /test@example\.com/);
  assert.match(scrubbedJson, /\[REDACTED\]/);

  const textWithUuid = 'User account 550e8400-e29b-41d4-a716-446655440000 encountered error';
  const scrubbedUuid = scrubSensitiveText(textWithUuid);
  assert.doesNotMatch(scrubbedUuid, /550e8400-e29b-41d4-a716-446655440000/);
  assert.match(scrubbedUuid, /\[REDACTED_ID\]/);
});

test('errorReporting: sanitizeError strictly enforces static approved messages and excludes learner text', () => {
  // Untrusted error with private learner note
  const learnerError = new Error('Could not save learner note: MY_PRIVATE_NOTE');
  learnerError.stack = `Error: Could not save learner note: MY_PRIVATE_NOTE\n    at saveNote (C:\\Users\\JohnDoe\\Desktop\\swipe-2-study\\src\\pages\\Study.jsx:10:20)\nArbitrary injected text with user data\n    at onClick (/assets/index-abc.js:30:40)`;

  const sanitized = sanitizeError(learnerError);

  // Must use static approved category and message
  assert.equal(sanitized.name, 'Error');
  assert.equal(sanitized.message, 'An unexpected application error occurred');

  // Must NOT include MY_PRIVATE_NOTE in message or stack
  assert.doesNotMatch(sanitized.message, /MY_PRIVATE_NOTE/);
  assert.doesNotMatch(sanitized.stack, /MY_PRIVATE_NOTE/);

  // Stack must not include user directory or arbitrary injected text
  assert.doesNotMatch(sanitized.stack, /JohnDoe/);
  assert.doesNotMatch(sanitized.stack, /Arbitrary injected text/);
  assert.match(sanitized.stack, /src\/pages\/Study\.jsx:10:20/);
  assert.match(sanitized.stack, /\/assets\/index-abc\.js:30:40/);

  // Raw string rejection must NOT pass raw rejection text
  const stringRejection = sanitizeError('Custom rejection string: MY_SECRET_INPUT');
  assert.equal(stringRejection.name, 'UnhandledRejection');
  assert.equal(stringRejection.message, 'Unhandled promise rejection occurred');
  assert.doesNotMatch(stringRejection.message, /MY_SECRET_INPUT/);

  // TypeError preserves standard static category
  const typeErr = new TypeError('Cannot read properties of undefined');
  const sanitizedType = sanitizeError(typeErr);
  assert.equal(sanitizedType.name, 'TypeError');
  assert.equal(sanitizedType.message, 'Type error occurred');

  // Error with approved code
  const codeErr = new Error('Raw server fail details');
  const sanitizedCode = sanitizeError(codeErr, { code: 'SERVER_CONFIG_ERROR' });
  assert.equal(sanitizedCode.name, 'ApplicationError');
  assert.equal(sanitizedCode.message, 'Server configuration error');
  assert.doesNotMatch(sanitizedCode.message, /Raw server fail details/);
});

test('errorReporting: sanitizeContext keeps only approved metadata keys and strips component text/paths', () => {
  const rawContext = {
    source: 'RouteErrorBoundary',
    status: 500,
    code: 'CHUNK_LOAD_FAILED',
    authorization: 'Bearer secret_auth_token_value',
    rawBody: '{"email":"leak@example.com","password":"secretpassword"}',
    userPassword: 'secretpassword',
    componentStack: 'in UserCard (at UserCard.jsx:10)\n  with privateText="MY_NOTE"\n  in RouteErrorBoundary',
    filename: 'C:\\Users\\JohnDoe\\Desktop\\swipe-2-study\\src\\App.jsx',
    lineno: 42,
    colno: 15,
  };

  const cleanContext = sanitizeContext(rawContext);
  assert.equal(cleanContext.source, 'RouteErrorBoundary');
  assert.equal(cleanContext.status, 500);
  assert.equal(cleanContext.code, 'CHUNK_LOAD_FAILED');
  assert.equal(cleanContext.filename, 'src/App.jsx');
  assert.doesNotMatch(cleanContext.filename, /JohnDoe/);
  assert.equal(cleanContext.lineno, 42);
  assert.equal(cleanContext.colno, 15);

  // ComponentStack must only retain component names, not component text or props
  assert.doesNotMatch(cleanContext.componentStack, /MY_NOTE/);
  assert.doesNotMatch(cleanContext.componentStack, /privateText/);
  assert.match(cleanContext.componentStack, /in UserCard/);
  assert.match(cleanContext.componentStack, /in RouteErrorBoundary/);

  assert.equal(cleanContext.authorization, undefined);
  assert.equal(cleanContext.rawBody, undefined);
  assert.equal(cleanContext.userPassword, undefined);
});

test('errorReporting: final reportError transport payload excludes arbitrary learner text and user paths', async () => {
  let capturedPayload = null;
  const mockTransport = (payload) => { capturedPayload = payload; };
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };

  // 1. Valid asset controls: local path with user home directory normalizes to approved src reference
  const learnerErr = new Error('Could not save learner note: MY_PRIVATE_NOTE_12345');
  learnerErr.stack = `Error: Could not save learner note: MY_PRIVATE_NOTE_12345\n    at saveWord (C:\\Users\\SecretUser\\Desktop\\app\\src\\lib\\db.js:50:10)`;

  const res = await reportError(learnerErr, {
    source: 'RouteErrorBoundary',
    componentStack: 'in FlashcardView (text="LEARNER_NOTE_CONTENT")\n  in App',
    filename: 'C:\\Users\\SecretUser\\Desktop\\app\\src\\lib\\db.js',
  }, { env, transport: mockTransport });

  assert.equal(res.reported, true);
  assert.ok(capturedPayload);

  // Outgoing error payload must NOT contain the learner note
  assert.doesNotMatch(capturedPayload.error.message, /MY_PRIVATE_NOTE/);
  assert.equal(capturedPayload.error.message, 'An unexpected application error occurred');

  // Outgoing stack must NOT contain the learner note or the local user name
  assert.doesNotMatch(capturedPayload.error.stack, /MY_PRIVATE_NOTE/);
  assert.doesNotMatch(capturedPayload.error.stack, /SecretUser/);
  assert.match(capturedPayload.error.stack, /src\/lib\/db\.js:50:10/);

  // Context componentStack must NOT contain props/learner text
  assert.doesNotMatch(capturedPayload.context.componentStack, /LEARNER_NOTE_CONTENT/);
  assert.doesNotMatch(capturedPayload.context.filename, /SecretUser/);
  assert.equal(capturedPayload.context.filename, 'src/lib/db.js');

  // 2. Arbitrary leading-slash path (/private/MY_PRIVATE_NOTE/file.js) must become static placeholder
  const privateErr = new Error('Could not save note: MY_PRIVATE_NOTE_67890');
  privateErr.stack = 'Error: Could not save note: MY_PRIVATE_NOTE_67890\n    at recordNote (/private/MY_PRIVATE_NOTE/file.js:12:34)\n    at handleAction (src/pages/Learn/SwipeSession.jsx:25:10)';

  const res2 = await reportError(privateErr, {
    source: 'RouteErrorBoundary',
    filename: '/private/MY_PRIVATE_NOTE/file.js',
  }, { env, transport: mockTransport });

  assert.equal(res2.reported, true);
  assert.doesNotMatch(capturedPayload.context.filename, /MY_PRIVATE_NOTE/);
  assert.doesNotMatch(capturedPayload.context.filename, /\/private\//);
  assert.equal(capturedPayload.context.filename, '/assets/app.js');

  assert.doesNotMatch(capturedPayload.error.stack, /MY_PRIVATE_NOTE/);
  assert.doesNotMatch(capturedPayload.error.stack, /\/private\//);
  assert.match(capturedPayload.error.stack, /\/assets\/app\.js:12:34/);
  // Valid asset control in stack is preserved
  assert.match(capturedPayload.error.stack, /src\/pages\/Learn\/SwipeSession\.jsx:25:10/);
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

  const sharedError = new TypeError('Cannot read properties of null');
  const res1 = await reportError(sharedError, { source: 'RouteErrorBoundary' }, { env, transport: mockTransport });
  assert.equal(res1.reported, true);
  assert.equal(sentPayloads.length, 1);

  // Second call with the exact same error object instance
  const res2 = await reportError(sharedError, { source: 'window_onerror' }, { env, transport: mockTransport });
  assert.equal(res2.reported, false);
  assert.equal(res2.reason, 'deduplicated');
  assert.equal(sentPayloads.length, 1);
});

test('errorReporting: independent concurrent errors are NOT dropped while a request is in flight', async () => {
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };
  const dispatchedCategories = [];

  const slowTransport = async (payload) => {
    dispatchedCategories.push(payload.error.name);
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  const errA = new TypeError('First type issue');
  const errB = new ReferenceError('Second reference issue');

  const [resA, resB] = await Promise.all([
    reportError(errA, { source: 'window_onerror' }, { env, transport: slowTransport }),
    reportError(errB, { source: 'unhandled_rejection' }, { env, transport: slowTransport }),
  ]);

  assert.equal(resA.reported, true, 'Error A must be reported');
  assert.equal(resB.reported, true, 'Error B must NOT be dropped while Error A is in flight');
  assert.equal(dispatchedCategories.length, 2);
  assert.ok(dispatchedCategories.includes('TypeError'));
  assert.ok(dispatchedCategories.includes('ReferenceError'));
});

test('errorReporting: transport failure is safely isolated and never throws or breaks execution', async () => {
  const failingTransport = () => { throw new Error('Network failure or DNS timeout'); };
  const env = { VITE_ERROR_REPORTING_ENABLED: 'true', VITE_ERROR_REPORTING_URL: 'https://errors.example.com' };

  const res = await reportError(new Error('Sample error with failing transport'), {}, { env, transport: failingTransport });
  assert.equal(res.reported, false);
  assert.equal(res.reason, 'transport_error');

  let recovered = false;
  const succeedingTransport = () => { recovered = true; };
  const res2 = await reportError(new TypeError('Subsequent error'), {}, { env, transport: succeedingTransport });
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
