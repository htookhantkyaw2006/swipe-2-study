import test from 'node:test';
import assert from 'node:assert/strict';
import { createStorageOwner, CacheStorageError } from '../src/lib/storageOwner.js';
import { createLocalDatabase } from '../src/lib/localDatabase.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function fixture(initial = []) {
  const data = new Map(initial);
  let failWrites = false;
  const storage = {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('Quota exceeded');
      data.set(key, value);
    },
  };
  const owner = createStorageOwner({ storage: () => storage });
  let language = 'zh';
  const db = createLocalDatabase({ getScope: () => owner.scope(), getLanguage: () => language });
  return { data, storage, owner, db, useLanguage: id => { language = id; }, failWrites: () => { failWrites = true; } };
}

test('existing guest keys and rows remain readable without migration or deletion', () => {
  const value = JSON.stringify([{ id: 'legacy', phrase: '你好' }]);
  const { owner, db, data } = fixture([['s2s_zh_saved_words', value], ['s2s_language', 'ja']]);
  assert.equal(owner.getOwner(), null);
  assert.equal(owner.scope().tableKey('zh', 'saved_words'), 's2s_zh_saved_words');
  assert.deepEqual(db.get('saved_words'), [{ id: 'legacy', phrase: '你好' }]);
  assert.equal(owner.scope().getItem('language'), 'ja');
  assert.equal(data.get('s2s_zh_saved_words'), value);
});

test('guest, account A and account B can save the same card without reading each other', () => {
  const { owner, db } = fixture();
  db.insert('saved_words', { id: 'same', phrase: 'guest' });
  owner.setOwner(A);
  assert.deepEqual(db.get('saved_words'), []);
  db.insert('saved_words', { id: 'same', phrase: 'A' });
  owner.setOwner(B);
  assert.deepEqual(db.get('saved_words'), []);
  db.insert('saved_words', { id: 'same', phrase: 'B' });
  for (const [id, phrase] of [[null, 'guest'], [A, 'A'], [B, 'B']]) {
    owner.setOwner(id);
    assert.equal(db.get('saved_words')[0].phrase, phrase);
  }
});

test('all local database operations remain synchronous and preserve language separation', () => {
  const { db, useLanguage } = fixture();
  const inserted = db.insert('review_cards', { id: 'card', learned: false });
  assert.equal(typeof inserted.created_at, 'string');
  assert.equal(inserted?.then, undefined);
  assert.equal(db.findOne('review_cards', { learned: false }).id, 'card');
  db.update('review_cards', 'card', { learned: true, id: 'cannot-change-id' });
  assert.equal(db.find('review_cards', { learned: true })[0].id, 'card');
  assert.equal(db.update('review_cards', 'missing', {}), null);
  useLanguage('ja');
  assert.deepEqual(db.get('review_cards'), []);
  assert.equal(db.getFor('zh', 'review_cards').length, 1);
  db.setFor('en', 'saved_words', [{ id: 'english' }]);
  assert.equal(db.getFor('en', 'saved_words')[0].id, 'english');
  useLanguage('zh');
  assert.equal(db.remove('review_cards', 'card'), true);
  assert.equal(db.remove('review_cards', 'card'), false);
});

test('a captured scope stays on its original owner after an account switch', () => {
  const { owner } = fixture();
  owner.setOwner(A);
  const delayedResponseScope = owner.scope();
  owner.setOwner(B);
  delayedResponseScope.setTable('zh', 'saved_words', '[{"id":"A-response"}]');
  assert.equal(owner.scope().getTable('zh', 'saved_words'), null);
  assert.equal(owner.scope(A).getTable('zh', 'saved_words'), '[{"id":"A-response"}]');
});

test('preferences and language are owner-scoped and never automatically copied from guest', () => {
  const { owner } = fixture();
  owner.scope().setItem('preferences', '{"showPinyin":false}');
  owner.scope().setItem('language', 'ja');
  owner.setOwner(A);
  assert.equal(owner.scope().getItem('preferences'), null);
  assert.equal(owner.scope().getItem('language'), null);
  owner.scope().setItem('preferences', '{"showPinyin":true}');
  owner.scope().setItem('language', 'zh');
  owner.setOwner(null);
  assert.equal(owner.scope().getItem('language'), 'ja');
  assert.equal(JSON.parse(owner.scope().getItem('preferences')).showPinyin, false);
});

test('owner-specific entries exclude tokens, migration markers and other accounts', () => {
  const { owner, data } = fixture([
    ['s2s_auth_session', 'private-token'],
    ['s2s_auth_session-code-verifier', 'private-verifier'],
    ['s2s_storage_version', '2'],
    ['unrelated', 'other-app'],
  ]);
  owner.scope().setItem('language', 'zh');
  owner.scope(A).setTable('zh', 'saved_words', '[]');
  owner.scope(B).setItem('preferences', '{}');
  assert.deepEqual(owner.scope().entries(), [['s2s_language', 'zh']]);
  owner.setOwner(A);
  assert.deepEqual(owner.scope().entries(), [[`s2s_user_${A}_zh_saved_words`, '[]']]);
  assert.equal(data.get('s2s_auth_session'), 'private-token');
});

test('deleting a row or clearing a table affects only the current owner and language', () => {
  const { owner, db } = fixture();
  for (const id of [null, A, B]) {
    owner.setOwner(id);
    db.set('saved_words', [{ id: 'shared' }]);
    db.setFor('ja', 'saved_words', [{ id: 'japanese' }]);
  }
  owner.setOwner(A);
  db.set('saved_words', []);
  assert.equal(db.getFor('ja', 'saved_words').length, 1);
  for (const id of [null, B]) {
    owner.setOwner(id);
    assert.equal(db.get('saved_words').length, 1);
  }
});

test('a new page starts as guest even when account caches exist on disk', () => {
  const { owner, db, storage } = fixture();
  owner.setOwner(A);
  db.insert('saved_words', { id: 'private' });
  const freshPage = createStorageOwner({ storage: () => storage });
  assert.equal(freshPage.getOwner(), null);
  assert.equal(freshPage.scope().getTable('zh', 'saved_words'), null);
});

test('malformed caches are preserved rather than treated as empty and overwritten', () => {
  for (const raw of ['not-json', '{}', '[null]', '[7]', '[[]]']) {
    const { data, db } = fixture([['s2s_zh_saved_words', raw]]);
    assert.throws(() => db.get('saved_words'), /kept for recovery/);
    assert.throws(() => db.insert('saved_words', { id: 'new' }), /kept for recovery/);
    assert.equal(data.get('s2s_zh_saved_words'), raw);
  }
});

test('quota failures propagate and do not return a successful local save', () => {
  const { data, db, failWrites } = fixture([['s2s_zh_saved_words', '[{"id":"before"}]']]);
  failWrites();
  assert.throws(() => db.insert('saved_words', { id: 'not-saved' }), CacheStorageError);
  assert.equal(data.get('s2s_zh_saved_words'), '[{"id":"before"}]');
  const blocked = createStorageOwner({ storage: () => { throw new Error('Blocked'); } });
  assert.throws(() => blocked.scope().getItem('preferences'), CacheStorageError);
});

test('owner identifiers and key names cannot escape their namespace', () => {
  const { owner } = fixture();
  for (const id of ['', 'guest', undefined, {}, `${A}_zh_saved_words`]) assert.throws(() => owner.setOwner(id), TypeError);
  owner.setOwner(A.toUpperCase());
  assert.equal(owner.getOwner(), A);
  for (const name of ['user_other_zh_saved_words', 'auth_session', '../preferences', '', 'storage_version']) {
    assert.throws(() => owner.scope().keyFor(name), TypeError);
  }
});

test('subscribers are notified once per real owner transition and can unsubscribe', () => {
  const { owner } = fixture();
  const seen = [];
  const unsubscribe = owner.subscribe(() => seen.push(owner.getOwner()));
  owner.setOwner(A);
  owner.setOwner(A);
  owner.setOwner(B);
  unsubscribe();
  owner.setOwner(null);
  assert.deepEqual(seen, [A, B]);
});
