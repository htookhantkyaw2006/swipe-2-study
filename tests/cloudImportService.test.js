import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { buildCloudImportItems, cloudSnapshotTables } from '../src/lib/cloudImportRecords.js';
import { prepareCloudImportRequest, readCloudSnapshot, submitCloudImport } from '../src/lib/cloudImportService.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';
const fingerprint = 'a'.repeat(64);
const itemKey = 'b'.repeat(64);
const items = () => buildCloudImportItems({ zh_saved_words: [{ id: 'random-local-id', phrase: '你好', reading: 'nǐ hǎo', english: 'Hello', created_at: '2026-01-01T00:00:00Z' }] });
const request = patch => prepareCloudImportRequest({ ownerId: A, expectedResetVersion: '0', sourceFingerprint: fingerprint, choice: 'merge', items: items(), makeId: () => ID, ...patch });
const ack = req => ({ status: 'committed', persistence: 'cloud', schema_version: 1, user_id: req.ownerId, request_id: req.requestId, reset_version: req.expectedResetVersion, source_fingerprint: req.sourceFingerprint, choice: req.choice, accepted_count: req.items.length, added_count: req.items.length, updated_count: 0, replayed: false });
const snapshot = () => ({ schema_version: 1, user_id: A, reset_version: '0', server_time: '2026-01-02T00:00:00Z', items: [{ ...items()[0], item_key: itemKey, revision: '1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }] });
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const calls = [];
  let rpc = async name => ({ data: name === 's2s_account_snapshot' ? snapshot() : ack(request()), error: null });
  const client = { auth: {
    getUser: async () => ({ data: { user: { id: A } }, error: null }),
    getSession: async () => ({ data: { session: { user: { id: A } } }, error: null }),
  }, rpc: async (...args) => { calls.push(args); return rpc(...args); } };
  return { client, calls, setRpc: fn => { rpc = fn; }, args: patch => ({ expectedUserId: A, isCurrent: () => true, ...patch }) };
}

test('cloud records exclude seeds, owner metadata, settings, content tables and random device IDs', () => {
  const tables = Object.freeze({
    zh_saved_words: Object.freeze([
      Object.freeze({ id: 'device', phrase: '你好', pinyin: 'nǐ hǎo', english: 'Hello', language: 'zh', created_at: '2026-01-01T00:00:00Z' }),
      Object.freeze({ id: 'sample', phrase: 'sample', is_sample: true }),
    ]),
    zh_flashcards: [{ character: 'seed content' }], preferences: '{"private":true}', auth_session: 'secret',
  });
  const result = buildCloudImportItems(tables);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], { language: 'zh', kind: 'saved_words', written_form: '你好', reading: 'nǐ hǎo', data: { english: 'Hello' }, observed_at: '2026-01-01T00:00:00.000Z' });
  assert.equal(tables.zh_saved_words[0].id, 'device');
  assert.equal(buildCloudImportItems({ zh_review_cards: [{ character: '真实', seeded: true }] }).length, 1, 'seeded course origin must not discard a genuine user review');
});

test('search history and legacy drill/writing records preserve their identity and useful details', () => {
  const result = buildCloudImportItems({
    zh_search_history: [{ id: '1704067200000', term: 'Apple' }],
    ja_learned_kana: [{ id: 'kana', kana: 'あ', seen: 2, correct: 1, wrong: 1, streak: 0 }],
    zh_written_chars: [{ id: 'written', character: '中' }],
  });
  assert.equal(result.find(row => row.kind === 'search_history').observed_at, '2024-01-01T00:00:00.000Z');
  assert.deepEqual(result.find(row => row.kind === 'learned_kana').data, { seen: 2, correct: 1, wrong: 1, streak: 0 });
  assert.equal(result.find(row => row.kind === 'written_chars').observed_at, '1970-01-01T00:00:00.000Z');
});

test('malformed rows, impossible counters, invalid calendar dates and oversized imports fail before sending', () => {
  for (const tables of [
    { zh_saved_words: [{}] }, { zh_saved_words: [{ phrase: 'x', language: 'ja' }] },
    { zh_saved_words: [{ phrase: 'x', created_at: '2026-02-30T00:00:00Z' }] },
    { zh_saved_words: [{ phrase: 'x', english: {} }] },
    { zh_review_cards: [{ character: 'x', examples: [null] }] },
    { ja_learned_kana: [{ kana: 'あ', seen: 1, correct: 1, wrong: 0, streak: 2 }] },
    { zh_saved_words: Array.from({ length: 5001 }, () => ({ phrase: 'x' })) },
  ]) assert.throws(() => buildCloudImportItems(tables));
});

test('request envelopes survive JSON persistence with exact owner, UUID and bigint reset version', () => {
  const value = request({ expectedResetVersion: '9223372036854775700' });
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value);
  assert.equal(value.expectedResetVersion, '9223372036854775700');
  for (const patch of [
    { ownerId: B + '\n' }, { expectedResetVersion: 0 }, { expectedResetVersion: '0\n' },
    { expectedResetVersion: '9223372036854775808' }, { sourceFingerprint: fingerprint + '\n' },
    { choice: 'account-only', items: items() },
  ]) assert.throws(() => request(patch));
});

test('cloud submit verifies both Auth identities and sends no caller-selected owner or row IDs', async () => {
  const f = fixture();
  const value = request();
  const result = await submitCloudImport(f.client, f.args({ request: value }));
  assert.equal(result.cloudOutcome, 'confirmed');
  assert.equal(result.receipt.request_id, ID);
  assert.deepEqual(f.calls[0], ['s2s_import_guest', { p_expected_user_id: A, p_request_id: ID, p_expected_reset_version: '0', p_source_fingerprint: fingerprint, p_choice: 'merge', p_items: value.items }]);
  assert.equal('user_id' in f.calls[0][1], false);
});

test('a request owned by A cannot be sent while B is expected; mismatched live sessions also block RPCs', async () => {
  const f = fixture();
  let result = await submitCloudImport(f.client, f.args({ request: request(), expectedUserId: B }));
  assert.equal(result.cloudOutcome, 'not-sent');
  f.client.auth.getSession = async () => ({ data: { session: { user: { id: B } } } });
  result = await submitCloudImport(f.client, f.args({ request: request() }));
  assert.equal(result.cloudOutcome, 'not-sent');
  assert.equal(f.calls.length, 0);
});

test('mutation of caller data during verification cannot change the pinned RPC payload', async () => {
  const f = fixture();
  const value = request();
  const wait = defer();
  f.client.auth.getUser = () => wait.promise;
  const action = submitCloudImport(f.client, f.args({ request: value }));
  value.items[0].written_form = 'changed after click';
  wait.resolve({ data: { user: { id: A } }, error: null });
  assert.equal((await action).cloudOutcome, 'confirmed');
  assert.equal(f.calls[0][1].p_items[0].written_form, '你好');
});

test('a lost response is unconfirmed; the original UUID/body can reconcile on explicit retry', async () => {
  const f = fixture();
  const value = request();
  f.setRpc(async () => { throw new Error('Sensitive endpoint/token details'); });
  const first = await submitCloudImport(f.client, f.args({ request: value }));
  assert.equal(first.cloudOutcome, 'unconfirmed');
  assert.equal(first.receipt, null);
  assert.doesNotMatch(first.error, /Sensitive/);
  f.setRpc(async () => ({ data: { ...ack(value), replayed: true }, error: null }));
  const retry = await submitCloudImport(f.client, f.args({ request: JSON.parse(JSON.stringify(value)) }));
  assert.equal(retry.cloudOutcome, 'confirmed');
  assert.equal(retry.receipt.replayed, true);
  assert.deepEqual(f.calls[0][1], f.calls[1][1]);
});

test('malformed or mismatched acknowledgements never mark a cloud import confirmed', async () => {
  for (const patch of [{ user_id: B }, { request_id: B }, { reset_version: '1' }, { persistence: 'device-only' }, { source_fingerprint: itemKey }, { accepted_count: 0 }, { added_count: -1 }, { added_count: 2 }, { choice: 'account-only' }]) {
    const f = fixture();
    f.setRpc(async () => ({ data: { ...ack(request()), ...patch }, error: null }));
    const result = await submitCloudImport(f.client, f.args({ request: request() }));
    assert.equal(result.cloudOutcome, 'unconfirmed');
    assert.equal(result.receipt, null);
  }
});

test('account changes before sending block the RPC; changes after sending never apply its receipt to another user', async () => {
  const f = fixture();
  let current = true;
  f.client.auth.getUser = async () => { current = false; return { data: { user: { id: A } } }; };
  let result = await submitCloudImport(f.client, f.args({ request: request(), isCurrent: () => current }));
  assert.equal(result.cloudOutcome, 'not-sent');
  assert.equal(f.calls.length, 0);
  current = true;
  f.client.auth.getUser = async () => ({ data: { user: { id: A } } });
  f.setRpc(async () => { current = false; return { data: ack(request()), error: null }; });
  result = await submitCloudImport(f.client, f.args({ request: request(), isCurrent: () => current }));
  assert.equal(result.cloudOutcome, 'unconfirmed');
  assert.equal(result.code, 'ACCOUNT_CHANGED');
  assert.equal(result.receipt, null);
});

test('reset and missing-migration errors remain actionable without exposing raw database errors', async () => {
  for (const [error, code] of [[{ code: '40001', message: 'RESET_VERSION_CHANGED' }, 'RESET_VERSION_CHANGED'], [{ code: 'PGRST202', message: 'Sensitive schema names' }, 'CLOUD_NOT_READY']]) {
    const f = fixture();
    f.setRpc(async () => ({ data: null, error }));
    const result = await submitCloudImport(f.client, f.args({ request: request() }));
    assert.equal(result.code, code);
    assert.equal(result.receipt, null);
    assert.doesNotMatch(result.error, /Sensitive/);
  }
});

test('snapshots are owner-verified and converted without changing source metadata or writing storage', async () => {
  const f = fixture();
  const result = await readCloudSnapshot(f.client, f.args());
  assert.equal(result.error, null);
  assert.deepEqual(f.calls, [['s2s_account_snapshot', { p_expected_user_id: A }]]);
  const before = JSON.stringify(result.snapshot);
  const tables = cloudSnapshotTables(result.snapshot);
  assert.equal(tables.zh_saved_words[0].id, itemKey);
  assert.equal(tables.zh_saved_words[0].phrase, '你好');
  assert.equal(tables.zh_saved_words[0].reading, 'nǐ hǎo');
  assert.equal(tables.ja_saved_words.length, 0);
  assert.equal(JSON.stringify(result.snapshot), before);
});

test('wrong-owner, duplicate-key and malformed snapshots are rejected without returning partial data', async () => {
  for (const edit of [value => { value.user_id = B; }, value => { value.items.push(value.items[0]); }, value => { value.reset_version = 0; }, value => { value.items[0].data = { id: 'spoof' }; }]) {
    const f = fixture(); const bad = snapshot(); edit(bad);
    f.setRpc(async () => ({ data: bad, error: null }));
    const result = await readCloudSnapshot(f.client, f.args());
    assert.equal(result.snapshot, null);
    assert.ok(result.error);
  }
});

test('the installed Supabase SDK uses the intended Auth/RPC requests with the persisted retry envelope', async () => {
  const calls = [];
  const user = { id: A, email: 'cloud-test@example.test', aud: 'authenticated', role: 'authenticated' };
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: A, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.test-signature';
  const client = createClient('https://cloud-test.supabase.co', 'sb_publishable_cloud_test_12345678901234567890', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, options) => {
      const path = new URL(typeof input === 'string' ? input : input.url).pathname;
      calls.push(path);
      let data;
      if (path === '/auth/v1/user') data = user;
      else if (path === '/rest/v1/rpc/s2s_import_guest') {
        const body = JSON.parse(options.body);
        assert.equal(body.p_request_id, ID);
        assert.equal(body.p_expected_reset_version, '0');
        assert.equal(body.p_expected_user_id, A);
        assert.equal('ownerId' in body, false);
        data = ack(request());
      } else if (path === '/rest/v1/rpc/s2s_account_snapshot') data = snapshot();
      else throw new Error('Unexpected SDK endpoint');
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  await client.auth.setSession({ access_token: jwt, refresh_token: 'synthetic-refresh' });
  const args = { expectedUserId: A, isCurrent: () => true };
  assert.equal((await submitCloudImport(client, { ...args, request: request() })).cloudOutcome, 'confirmed');
  assert.equal((await readCloudSnapshot(client, args)).snapshot.user_id, A);
  assert.ok(calls.includes('/rest/v1/rpc/s2s_import_guest'));
  assert.ok(calls.includes('/rest/v1/rpc/s2s_account_snapshot'));
  client.auth.stopAutoRefresh();
});
