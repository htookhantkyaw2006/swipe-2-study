import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

// Vite loads the actual app modules, including JSX providers and course imports.
// This checks their real bindings without claiming browser interaction coverage.
const values = new Map();
const oldStorage = globalThis.localStorage;
globalThis.localStorage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
const server = await createServer({ server: { middlewareMode: true, hmr: false, host: '127.0.0.1', watch: null } });
after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

test('actual db, language, preferences and seeding modules follow an owner switch', async () => {
  const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  const { db } = await server.ssrLoadModule('/src/lib/db.js');
  const language = await server.ssrLoadModule('/src/lib/activeLanguage.js');
  const { readPreferences } = await server.ssrLoadModule('/src/lib/preferences.jsx');
  const { seedCourse } = await server.ssrLoadModule('/src/lib/seed.js');
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  storageOwner.scope().setItem('preferences', '{"showPinyin":false}');
  assert.equal(language.setActiveLanguageId('ja'), true);
  db.insert('saved_words', { id: 'guest-card', phrase: 'guest-only' });

  storageOwner.setOwner(A);
  assert.equal(language.getActiveLanguageId(), 'zh');
  assert.equal(readPreferences().showPinyin, true);
  assert.deepEqual(db.get('saved_words'), []);
  seedCourse('zh');
  assert.ok(db.get('flashcards').length > 0);
  db.insert('saved_words', { id: 'A-card', phrase: 'A-only' });
  assert.equal(language.setActiveLanguageId('en'), true);
  assert.equal(language.setActiveLanguageId('not-a-course'), false);

  storageOwner.setOwner(B);
  assert.equal(language.getActiveLanguageId(), 'zh');
  assert.deepEqual(db.get('flashcards'), []);
  assert.deepEqual(db.get('saved_words'), []);

  storageOwner.setOwner(A);
  assert.equal(language.getActiveLanguageId(), 'en');
  assert.equal(db.getFor('zh', 'saved_words')[0].phrase, 'A-only');

  storageOwner.setOwner(null);
  assert.equal(language.getActiveLanguageId(), 'ja');
  assert.equal(readPreferences().showPinyin, false);
  assert.equal(db.get('saved_words')[0].phrase, 'guest-only');
});
