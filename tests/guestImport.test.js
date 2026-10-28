import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageOwner, CacheStorageError } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { createGuestImportService, verifyGuestImportAccount } from '../src/lib/guestImportService.js';
import { studyWordKey, sameStudyWord } from '../src/lib/studyWords.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const word = (phrase, extra = {}) => ({ id: `old-${phrase}`, phrase, reading: 'reading', english: 'Meaning', ...extra });
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixture() {
  const data = new Map();
  const writes = [];
  let failure = null;
  const storage = {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failure === 'before') throw new Error('Quota exceeded');
      data.set(key, value);
      writes.push(key);
      if (failure === 'after') throw new Error('Response lost after commit');
    },
  };
  const owner = createStorageOwner({ storage: () => storage });
  owner.setOwner(A);
  let generation = 1;
  let authPatch = {};
  const getAuthState = () => ({ user: owner.getOwner() ? { id: owner.getOwner() } : null, generation, ...authPatch });
  let verify = async () => {};
  let sequence = 0;
  let makeId = () => `imported-${++sequence}`;
  const options = {
    storageOwner: owner, getAuthState,
    verifyUser: (...args) => verify(...args),
    makeId: () => makeId(), now: () => '2026-10-28T10:00:00.000Z',
  };
  const service = createGuestImportService(options);
  const database = id => createLocalDatabase({ getScope: () => owner.scope(id), getLanguage: () => 'zh' });
  const put = (id, language, table, rows) => owner.scope(id).setTable(language, table, JSON.stringify(rows));
  return {
    data, writes, storage, owner, service, options, database, put,
    fail: mode => { failure = mode; },
    verify: implementation => { verify = implementation; },
    makeId: implementation => { makeId = implementation; },
    auth: patch => { authPatch = patch; },
    switchTo: id => { generation += 1; owner.setOwner(id); },
  };
}

test('inspection ignores starter content, preferences, searches, tokens, other accounts and unknown keys', async () => {
  const f = fixture();
  f.put(null, 'zh', 'flashcards', [word('starter')]);
  f.put(null, 'zh', 'search_history', [{ term: 'hello' }]);
  f.put(B, 'ja', 'saved_words', [word('private')]);
  for (const key of ['s2s_auth_session', 's2s_preferences', 's2s_unknown_table']) f.data.set(key, 'sensitive');
  const before = [...f.data];
  const offer = await f.service.inspect();
  assert.equal(offer.status, 'nothing-to-import');
  assert.equal(offer.persistence, 'device-only');
  assert.deepEqual(offer.summary, []);
  assert.deepEqual([...f.data], before);
  await assert.rejects(f.service.choose(offer, 'merge'), /no new guest data/);
});

test('offers count unique rows per course and do not write or automatically merge anything', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('你好'), word('你好', { id: 'duplicate' })]);
  f.put(null, 'zh', 'review_cards', [word('书')]);
  f.put(null, 'ja', 'written_chars', [{ character: '学' }]);
  const before = [...f.data];
  const offer = await f.service.inspect();
  assert.deepEqual(offer.summary, [
    { languageId: 'zh', languageLabel: 'Chinese', savedWords: 1, reviewWords: 1, progressRecords: 0 },
    { languageId: 'ja', languageLabel: 'Japanese', savedWords: 0, reviewWords: 0, progressRecords: 1 },
  ]);
  assert.deepEqual([...f.data], before);
  assert.equal(f.database(A).get('saved_words').length, 0);
  assert.ok(Object.isFrozen(offer.summary[0]));
});

test('one atomic write imports all courses and a receipt; guest bytes, other users and preferences stay unchanged', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('你好')]);
  f.put(null, 'ja', 'review_cards', [word('学校')]);
  f.put(null, 'en', 'learned_sounds', [{ sound: 'æ', seen: 4, correct: 3, wrong: 1, streak: 2 }]);
  f.put(B, 'zh', 'saved_words', [word('private')]);
  f.owner.scope(null).setItem('preferences', '{"dailyGoal":50}');
  const original = new Map(f.data);
  const offer = await f.service.inspect();
  const previousWrites = f.writes.length;
  const result = await f.service.choose(offer, 'merge');
  assert.deepEqual(result, { status: 'saved', choice: 'merge', persistence: 'device-only', addedRecords: 3 });
  assert.equal(f.writes.length, previousWrites + 1);
  for (const [key, value] of original) assert.equal(f.data.get(key), value);
  assert.equal(f.database(A).get('saved_words')[0].phrase, '你好');
  assert.equal(f.database(A).getFor('ja', 'review_cards')[0].phrase, '学校');
  assert.equal(f.database(A).getFor('en', 'learned_sounds')[0].streak, 2);
  assert.equal(f.owner.scope(A).getItem('preferences'), null);
  assert.equal((await f.service.inspect()).status, 'nothing-to-import');
});

test('account-only remembers the explicit choice without changing account tables or deleting guest data', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  f.put(A, 'zh', 'saved_words', [word('account')]);
  const original = new Map(f.data);
  const result = await f.service.choose(await f.service.inspect(), 'account-only');
  assert.equal(result.addedRecords, 0);
  for (const [key, value] of original) assert.equal(f.data.get(key), value);
  assert.deepEqual(f.database(A).get('saved_words').map(row => row.phrase), ['account']);
  assert.equal((await f.service.inspect()).status, 'nothing-to-import');
  f.switchTo(B);
  assert.equal((await f.service.inspect()).status, 'available', 'another account still needs an explicit choice');
});

test('semantic duplicates keep account IDs, meanings and counters; distinct readings remain separate', async () => {
  const f = fixture();
  const account = word('行', { id: 'account-id', reading: 'xíng', english: 'account meaning' });
  f.put(A, 'zh', 'saved_words', [account]);
  f.put(null, 'zh', 'saved_words', [
    word('行', { reading: 'xíng', english: 'guest meaning' }), word('行', { reading: 'háng' }),
  ]);
  const progress = { id: 'account-progress', radical: '人', seen: 2, correct: 1, wrong: 1, streak: 0 };
  f.put(A, 'zh', 'learned_radicals', [progress]);
  f.put(null, 'zh', 'learned_radicals', [{ radical: '人', seen: 100, correct: 100, wrong: 0, streak: 100 }]);
  const result = await f.service.choose(await f.service.inspect(), 'merge');
  assert.equal(result.addedRecords, 1);
  assert.deepEqual(f.database(A).get('saved_words')[0], account);
  assert.deepEqual(f.database(A).get('learned_radicals'), [progress]);
  assert.equal(f.database(A).get('saved_words')[1].reading, 'háng');
});

test('fresh IDs prevent guest/account collisions and reviews match independently seeded decks', async () => {
  const f = fixture();
  f.put(A, 'zh', 'saved_words', [word('account', { id: 'collision' })]);
  f.put(null, 'zh', 'saved_words', [word('guest', { id: 'collision' })]);
  f.put(null, 'zh', 'review_cards', [{ id: 'old-deck-id', character: '你好', pronunciation: 'nǐ hǎo' }]);
  await f.service.choose(await f.service.inspect(), 'merge');
  assert.equal(new Set(f.database(A).get('saved_words').map(row => row.id)).size, 2);
  const review = f.database(A).get('review_cards')[0];
  assert.ok(sameStudyWord(review, { id: 'new-deck-id', character: '你好', pronunciation: 'nǐ hǎo' }));
  assert.notEqual(review.id, 'old-deck-id');
});

test('quota rejection leaves every table and receipt unchanged and permits retry', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  f.put(null, 'ja', 'saved_words', [word('学校')]);
  const offer = await f.service.inspect();
  const original = [...f.data];
  f.fail('before');
  await assert.rejects(f.service.choose(offer, 'merge'), CacheStorageError);
  assert.deepEqual([...f.data], original);
  f.fail(null);
  assert.equal((await f.service.choose(offer, 'merge')).addedRecords, 2);
});

test('a lost response after the atomic write reconciles on retry without duplicate rows', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  const offer = await f.service.inspect();
  f.fail('after');
  await assert.rejects(f.service.choose(offer, 'merge'), CacheStorageError);
  f.fail(null);
  assert.equal(f.database(A).get('saved_words').length, 1);
  const writes = f.writes.length;
  assert.deepEqual(await f.service.choose(offer, 'merge'), { status: 'already-decided', choice: 'merge', persistence: 'device-only' });
  assert.equal(f.writes.length, writes);
});

test('deleted imported words never resurrect on retry, reload, or when new guest words appear', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('old')]);
  const offer = await f.service.inspect();
  await f.service.choose(offer, 'merge');
  f.database(A).set('saved_words', []);
  await f.service.choose(offer, 'merge');
  const freshService = createGuestImportService(f.options);
  assert.equal((await freshService.inspect()).status, 'nothing-to-import');
  f.put(null, 'zh', 'saved_words', [word('old'), word('new')]);
  const next = await freshService.inspect();
  assert.equal(next.summary[0].savedWords, 1);
  await freshService.choose(next, 'merge');
  assert.deepEqual(f.database(A).get('saved_words').map(row => row.phrase), ['new']);
});

test('account-only decisions also exclude old guest records from a later incremental offer', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('skipped')]);
  await f.service.choose(await f.service.inspect(), 'account-only');
  f.put(null, 'zh', 'saved_words', [word('skipped'), word('new')]);
  await f.service.choose(await f.service.inspect(), 'merge');
  assert.deepEqual(f.database(A).get('saved_words').map(row => row.phrase), ['new']);
});

test('account edits made while identity verification is pending are merged from the latest cache', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  const wait = deferred();
  f.verify(() => wait.promise);
  const promise = f.service.choose(await f.service.inspect(), 'merge');
  f.database(A).set('saved_words', [word('edited during verification')]);
  wait.resolve();
  await promise;
  assert.deepEqual(f.database(A).get('saved_words').map(row => row.phrase), ['edited during verification', 'guest']);
});

test('sign-out, account switch and switching away then back invalidate delayed decisions without writes', async () => {
  for (const destination of [null, B, A]) {
    const f = fixture();
    f.put(null, 'zh', 'saved_words', [word('guest')]);
    const offer = await f.service.inspect();
    const wait = deferred();
    f.verify(() => wait.promise);
    const promise = f.service.choose(offer, 'merge');
    if (destination === A) f.switchTo(B);
    f.switchTo(destination);
    const before = [...f.data];
    wait.resolve();
    await assert.rejects(promise, /account|Sign in/);
    assert.deepEqual([...f.data], before);
  }
});

test('guest edits during verification require a fresh offer and preserve account data', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('before')]);
  const wait = deferred();
  f.verify(() => wait.promise);
  const promise = f.service.choose(await f.service.inspect(), 'merge');
  f.put(null, 'zh', 'saved_words', [word('after')]);
  const before = [...f.data];
  wait.resolve();
  await assert.rejects(promise, /Guest learning data changed/);
  assert.deepEqual([...f.data], before);
});

test('concurrent choices are rejected while the first choice is pending', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  const offer = await f.service.inspect();
  const wait = deferred();
  f.verify(() => wait.promise);
  const first = f.service.choose(offer, 'merge');
  await assert.rejects(f.service.choose(offer, 'account-only'), /already being saved/);
  wait.resolve();
  assert.equal((await first).status, 'saved');
});

test('no import is allowed during unverified, mismatched, failed or password-recovery auth states', async () => {
  for (const patch of [{ loading: true }, { isTransitioning: true }, { error: 'offline' }, { passwordRecoveryUserId: A }, { user: { id: B } }]) {
    const f = fixture();
    f.auth(patch);
    await assert.rejects(f.service.inspect(), /Sign in and finish account verification/);
    assert.equal(f.writes.length, 0);
  }
});

test('a verification failure does not change any data and releases the busy state for retry', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  const offer = await f.service.inspect();
  const before = [...f.data];
  f.verify(async () => { throw new Error('Verification unavailable'); });
  await assert.rejects(f.service.choose(offer, 'merge'), /Verification unavailable/);
  assert.deepEqual([...f.data], before);
  f.verify(async () => {});
  assert.equal((await f.service.choose(offer, 'merge')).status, 'saved');
});

test('malformed guest records, language confusion and impossible progress are kept without any writes', async () => {
  const cases = [
    ['saved_words', 'not-json'], ['saved_words', '{}'], ['saved_words', '[null]'],
    ['saved_words', '[{"phrase":7}]'], ['saved_words', JSON.stringify([word('wrong', { language: 'ja' })])],
    ['learned_kana', '[{"kana":"あ","seen":2,"correct":2,"wrong":1,"streak":2}]'],
    ['learned_kana', '[{"kana":"あ","seen":2,"correct":2,"wrong":0,"streak":3}]'],
    ['learned_kana', '[{"kana":"あ","seen":-1}]'],
  ];
  for (const [table, raw] of cases) {
    const f = fixture();
    f.data.set(`s2s_zh_${table}`, raw);
    const before = [...f.data];
    await assert.rejects(f.service.inspect(), /recovery/);
    assert.deepEqual([...f.data], before);
    assert.equal(f.writes.length, 0);
  }
});

test('one corrupt destination aborts a multi-course merge before its single commit', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('valid')]);
  f.put(null, 'ja', 'saved_words', [word('学校')]);
  f.data.set(`s2s_user_${A}_ja_saved_words`, 'broken');
  const offer = await f.service.inspect();
  const before = [...f.data];
  await assert.rejects(f.service.choose(offer, 'merge'), /recovery/);
  assert.deepEqual([...f.data], before);
});

test('a malformed authoritative document cannot be bypassed by older account table keys', async () => {
  const f = fixture();
  f.put(A, 'zh', 'saved_words', [word('old backup')]);
  const key = `s2s_user_${A}_learning_document_v1`;
  f.data.set(key, '{bad-json');
  await assert.rejects(f.service.inspect(), /kept for recovery/);
  assert.throws(() => f.database(A).get('saved_words'), /kept for recovery/);
  assert.equal(f.data.get(key), '{bad-json');
});

test('imported tables remain authoritative and support synchronous CRUD after a fresh page', async () => {
  const f = fixture();
  f.put(A, 'zh', 'saved_words', [word('existing')]);
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  await f.service.choose(await f.service.inspect(), 'merge');
  const newOwner = createStorageOwner({ storage: () => f.storage });
  newOwner.setOwner(A);
  const db = createLocalDatabase({ getScope: () => newOwner.scope(), getLanguage: () => 'zh', makeId: () => 'fresh' });
  const imported = db.findOne('saved_words', { phrase: 'guest' });
  assert.equal(db.update('saved_words', imported.id, { english: 'changed' }).english, 'changed');
  assert.equal(db.remove('saved_words', imported.id), true);
  assert.equal(db.insert('saved_words', word('new', { id: 'new' })).phrase, 'new');
  assert.deepEqual(db.get('saved_words').map(row => row.phrase), ['existing', 'new']);
  assert.equal(JSON.parse(f.data.get(`s2s_user_${A}_zh_saved_words`))[0].phrase, 'existing', 'old key is retained as recovery data');
});

test('a changed legacy table detected before commit is not overwritten', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  f.makeId(() => {
    f.put(A, 'zh', 'saved_words', [word('other tab edit')]);
    return 'new-id';
  });
  await assert.rejects(f.service.choose(await f.service.inspect(), 'merge'), CacheStorageError);
  assert.deepEqual(f.database(A).get('saved_words').map(row => row.phrase), ['other tab edit']);
  assert.equal(f.owner.scope(A).readLearningDocument().value, null);
});

test('generated ID collisions abort instead of making later updates or removals ambiguous', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  f.put(A, 'zh', 'saved_words', [word('account', { id: 'collision' })]);
  f.makeId(() => 'collision');
  const offer = await f.service.inspect();
  const before = [...f.data];
  await assert.rejects(f.service.choose(offer, 'merge'), /unique learning record/);
  assert.deepEqual([...f.data], before);
});

test('forged offers, foreign-service offers and implicit choices cannot authorize an import', async () => {
  const f = fixture();
  f.put(null, 'zh', 'saved_words', [word('guest')]);
  const offer = await f.service.inspect();
  await assert.rejects(f.service.choose({ ...offer }, 'merge'), /Reload/);
  await assert.rejects(createGuestImportService(f.options).choose(offer, 'merge'), /Reload/);
  for (const choice of [undefined, null, 'close', 'later', '']) await assert.rejects(f.service.choose(offer, choice), TypeError);
  assert.equal(f.database(A).get('saved_words').length, 0);
});

test('hashing is generation guarded and cannot silently accept a changed guest source', async () => {
  for (const change of ['owner', 'guest']) {
    const f = fixture();
    f.put(null, 'zh', 'saved_words', [word('before')]);
    const wait = deferred();
    const service = createGuestImportService({ ...f.options, fingerprint: () => wait.promise });
    const promise = service.inspect();
    if (change === 'owner') f.switchTo(B);
    else f.put(null, 'zh', 'saved_words', [word('after')]);
    wait.resolve('a'.repeat(64));
    await assert.rejects(promise, /account changed|Guest learning data changed/);
    assert.equal(f.owner.scope(A).readLearningDocument().value, null);
  }
});

test('word identity normalizes Unicode/case/spacing but preserves tones, readings and missing-text distinctions', () => {
  assert.equal(studyWordKey({ phrase: ' 学校 ', reading: 'GAKKO\u0304' }), studyWordKey({ character: '学校', pronunciation: 'gakkō' }));
  assert.notEqual(studyWordKey({ phrase: '行', reading: 'xíng' }), studyWordKey({ phrase: '行', reading: 'háng' }));
  assert.notEqual(studyWordKey({ phrase: '妈', reading: 'mā' }), studyWordKey({ phrase: '妈', reading: 'má' }));
  assert.equal(studyWordKey({ id: 'no-text' }), null);
  assert.equal(sameStudyWord({ id: 'a' }, { id: 'b' }), false);
  assert.equal(sameStudyWord({ id: 'a' }, { id: 'a' }), true);
});

test('the production verifier requires a matching server user AND live SDK session', async () => {
  for (const [userId, sessionId, authError] of [[A, A, null], [B, A, null], [A, B, null], [A, A, { message: 'Offline' }]]) {
    let calls = 0;
    const client = { auth: {
      getUser: async () => { calls++; return { data: { user: { id: userId } }, error: authError }; },
      getSession: async () => { calls++; return { data: { session: { user: { id: sessionId } } }, error: null }; },
    } };
    const action = verifyGuestImportAccount(client, A, () => {});
    if (userId === A && sessionId === A && !authError) {
      await action;
      assert.equal(calls, 2);
    } else await assert.rejects(action, /verify your account|session changed/);
  }
  for (const phase of ['getUser', 'getSession']) {
    const client = { auth: {
      getUser: async () => ({ data: { user: { id: A } } }),
      getSession: async () => ({ data: { session: { user: { id: A } } } }),
    } };
    client.auth[phase] = async () => { throw new Error('Sensitive raw Auth URL/response'); };
    await assert.rejects(verifyGuestImportAccount(client, A, () => {}), error => {
      assert.equal(error.message, 'Could not verify your account. Reopen guest import after signing in.');
      return true;
    });
  }
});

test('the production verifier stops before session lookup if the account changes after getUser', async () => {
  let current = true;
  let sessionCalls = 0;
  const client = { auth: {
    getUser: async () => { current = false; return { data: { user: { id: A } }, error: null }; },
    getSession: async () => { sessionCalls++; },
  } };
  await assert.rejects(verifyGuestImportAccount(client, A, () => { if (!current) throw new Error('Account changed'); }), /Account changed/);
  assert.equal(sessionCalls, 0);
});

test('blocked storage and over-limit source data fail without accepting a decision', async () => {
  const blocked = createStorageOwner({ storage: () => { throw new Error('Blocked'); } });
  blocked.setOwner(A);
  const service = createGuestImportService({ storageOwner: blocked, getAuthState: () => ({ user: { id: A }, generation: 1 }) });
  await assert.rejects(service.inspect(), CacheStorageError);
  const f = fixture();
  f.data.set('s2s_zh_saved_words', ' '.repeat(4 * 1024 * 1024 + 1));
  await assert.rejects(f.service.inspect(), /too large/);
  assert.equal(f.writes.length, 0);
});
