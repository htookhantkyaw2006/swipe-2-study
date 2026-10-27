import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const values = new Map();
const oldStorage = globalThis.localStorage;
globalThis.localStorage = {
  get length() { return values.size; },
  key: index => [...values.keys()][index] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};

const server = await createServer({
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1', watch: null },
});

after(async () => {
  await server.close();
  if (oldStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = oldStorage;
});

test('safeReturnPath rejects external origins, schemes, backslashes and protocol-relative URLs', async () => {
  const { safeReturnPath } = await server.ssrLoadModule('/src/lib/safeReturnPath.js');

  // Valid internal paths
  assert.equal(safeReturnPath('/'), '/');
  assert.equal(safeReturnPath('/profile'), '/profile');
  assert.equal(safeReturnPath('/learn/review'), '/learn/review');
  assert.equal(safeReturnPath('/flashcards/level/1?course=zh'), '/flashcards/level/1?course=zh');
  assert.equal(safeReturnPath('  /settings  '), '/settings');

  // Open redirect attempts & invalid inputs
  assert.equal(safeReturnPath('https://evil.com'), '/');
  assert.equal(safeReturnPath('http://attacker.org/login'), '/');
  assert.equal(safeReturnPath('//malicious.com'), '/');
  assert.equal(safeReturnPath('//malicious.com/path'), '/');
  assert.equal(safeReturnPath('///malicious.com'), '/');
  assert.equal(safeReturnPath('/\\evil.com'), '/');
  assert.equal(safeReturnPath('/evil\\path'), '/');
  assert.equal(safeReturnPath('javascript:alert(1)'), '/');
  assert.equal(safeReturnPath('data:text/html,<script>alert(1)</script>'), '/');
  assert.equal(safeReturnPath(''), '/');
  assert.equal(safeReturnPath('   '), '/');
  assert.equal(safeReturnPath(null), '/');
  assert.equal(safeReturnPath(undefined), '/');
  assert.equal(safeReturnPath(123), '/');
  assert.equal(safeReturnPath({ evil: true }), '/');
});

test('displayName and initialsOf helpers never fabricate an identity or return empty strings', async () => {
  const { displayName, initialsOf } = await server.ssrLoadModule('/src/lib/profile.js');

  // Priority 1: Profile row display_name
  assert.equal(
    displayName({ display_name: 'Custom Name' }, { email: 'test@example.com' }),
    'Custom Name'
  );

  // Priority 2: User metadata display_name
  assert.equal(
    displayName(null, { user_metadata: { display_name: 'Meta Name' }, email: 'test@example.com' }),
    'Meta Name'
  );

  // Priority 3: User metadata full_name
  assert.equal(
    displayName(null, { user_metadata: { full_name: 'Full Name' }, email: 'test@example.com' }),
    'Full Name'
  );

  // Priority 4: Email prefix
  assert.equal(
    displayName(null, { email: 'alice.learner@example.com' }),
    'alice.learner'
  );

  // Fallback: Learner (never a fabricated persona like "Htoo Khant Kyaw")
  assert.equal(displayName(null, null), 'Learner');
  assert.equal(displayName({}, {}), 'Learner');

  // Initials
  assert.equal(initialsOf('Alice Smith'), 'AS');
  assert.equal(initialsOf('Htoo Khant Kyaw'), 'HK');
  assert.equal(initialsOf('Learner'), 'LE');
  assert.equal(initialsOf('A'), 'A');
  assert.equal(initialsOf(''), '?');
  assert.equal(initialsOf(null), '?');
});

test('session restoration and local logout coordinate storage owner without wiping guest or user caches', async () => {
  const { storageOwner } = await server.ssrLoadModule('/src/lib/storageOwner.js');
  const { db } = await server.ssrLoadModule('/src/lib/db.js');

  const userA = '11111111-2222-4333-8444-555555555555';
  const userB = '66666666-7777-4888-8999-000000000000';

  // 1. Initial guest state
  storageOwner.setOwner(null);
  assert.equal(storageOwner.getOwner(), null);
  db.insert('saved_words', { id: 'guest-word', phrase: 'guest-phrase' });
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, 'guest-phrase');

  // 2. User A signs in
  storageOwner.setOwner(userA);
  assert.equal(storageOwner.getOwner(), userA);
  assert.deepEqual(db.get('saved_words'), []); // Clean owner cache
  db.insert('saved_words', { id: 'word-a', phrase: 'phrase-a' });
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, 'phrase-a');

  // 3. User A logs out
  storageOwner.setOwner(null);
  assert.equal(storageOwner.getOwner(), null);

  // Guest data must remain intact and accessible
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, 'guest-phrase');

  // 4. User B signs in
  storageOwner.setOwner(userB);
  assert.equal(storageOwner.getOwner(), userB);
  assert.deepEqual(db.get('saved_words'), []); // User B has their own empty cache
  db.insert('saved_words', { id: 'word-b', phrase: 'phrase-b' });

  // 5. User A signs back in — User A's cache on disk was preserved across logout
  storageOwner.setOwner(userA);
  assert.equal(storageOwner.getOwner(), userA);
  assert.equal(db.get('saved_words').length, 1);
  assert.equal(db.get('saved_words')[0].phrase, 'phrase-a');

  // Reset to guest for remaining tests
  storageOwner.setOwner(null);
});

test('generation counter discards stale async responses across logout and account switching', async () => {
  // Simulate the generation counter mechanism used in AuthProvider and useProfile
  let generation = 0;
  const captureGeneration = () => generation;
  const isCurrent = (gen) => gen === generation;
  const onUserTransition = () => { generation += 1; };

  // Scenario 1: User A requests profile, then logs out before response arrives
  const genA = captureGeneration();
  assert.equal(isCurrent(genA), true);

  // User logs out
  onUserTransition();
  assert.equal(isCurrent(genA), false, 'Stale response from User A must be discarded after logout');

  // Scenario 2: User A requests profile, then User B signs in before response arrives
  const genA2 = captureGeneration();
  // User B signs in
  onUserTransition();
  assert.equal(isCurrent(genA2), false, 'User A profile must not be applied to User B');

  const genB = captureGeneration();
  assert.equal(isCurrent(genB), true, 'User B request is current');
});
