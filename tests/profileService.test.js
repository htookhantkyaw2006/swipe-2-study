import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_LIMIT, AVATAR_URL_SECONDS, ownsAvatarPath, validateAvatarFile, validateDisplayName, readProfile, readAvatarUrl, saveProfile, retryAvatarCleanup } from '../src/lib/profileService.js';

const alice = '11111111-1111-4111-8111-111111111111';
const bob = '22222222-2222-4222-8222-222222222222';
const objectId = '33333333-3333-4333-8333-333333333333';
const oldPath = `${alice}/old-photo.webp`, newPath = `${alice}/${objectId}.png`;
const png = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13])], '../../private-avatar.png', { type: 'image/png' });
const original = () => ({ id: alice, display_name: 'Learner', avatar_path: oldPath, updated_at: '2026-10-28T12:00:00.000001Z', created_at: '2026-10-27T12:00:00Z' });
function fake(options = {}) {
  const events = [], state = { profile: original(), active: alice, ...options.state };
  const client = {
    auth: {
      getUser: async () => { events.push('verify'); await options.onVerify?.(state); return { data: { user: { id: state.active } }, error: options.verifyError || null }; },
      getSession: async () => { await options.onSession?.(state); return { data: { session: { user: { id: state.active } } }, error: null }; },
    },
    from: table => {
      assert.equal(table, 'profiles');
      const filters = {}; let patch;
      const builder = {
        select: () => builder,
        update: values => { patch = values; return builder; },
        eq: (field, value) => { filters[field] = value; return builder; },
        maybeSingle: async () => {
          if (!patch) { events.push('read'); return { data: state.profile && { ...state.profile }, error: options.readError || null }; }
          events.push('write'); state.patch = patch; state.filters = filters;
          await options.onWrite?.(state);
          if (options.writeThrows) throw new Error('Sensitive network response');
          if (options.writeError) return { data: null, error: { message: 'Internal database details' } };
          if (options.conflict || state.profile?.updated_at !== filters.updated_at || state.profile?.id !== filters.id) return { data: null, error: null };
          state.profile = { ...state.profile, ...patch, updated_at: '2026-10-28T12:00:01.000002Z' };
          return { data: { ...state.profile }, error: null };
        },
      }; return builder;
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'avatars');
      return {
        upload: async (path, file, config) => { events.push('upload'); state.upload = { path, file, config }; await options.onUpload?.(state); return { data: { path }, error: options.uploadError || null }; },
        remove: async paths => { events.push('delete'); state.deleted = paths; return { data: [], error: options.deleteError || null }; },
        createSignedUrl: async (path, ttl) => { events.push('sign'); state.signed = { path, ttl }; await options.onSign?.(state); return { data: { signedUrl: 'https://test.invalid/signed-private-photo' }, error: null }; },
      };
    } },
  };
  const args = overrides => ({ userId: alice, baseProfile: original(), displayName: '  New Learner  ', isCurrent: () => true, makeId: () => objectId, ...overrides });
  return { client, events, state, args };
}

test('names use Unicode character counts, trim whitespace, reject empty/oversized/control input', () => {
  assert.equal(validateDisplayName(' မြန်မာ Learner '), null);
  assert.equal(validateDisplayName('😀'.repeat(100)), null);
  for (const value of ['', '  ', '😀'.repeat(101), 'Two\nLines', 'Name\u0000', 'Name\u007f']) assert.ok(validateDisplayName(value));
});

test('avatar validation rejects unsupported, oversized, empty and disguised files', async () => {
  assert.equal(await validateAvatarFile(png()), null);
  assert.equal(await validateAvatarFile(new File([new Uint8Array([255,216,255,224])], 'a.jpeg', { type: 'image/jpeg' })), null);
  assert.equal(await validateAvatarFile(new File(['RIFF0000WEBP'], 'a.webp', { type: 'image/webp' })), null);
  for (const file of [new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }), new File(['<svg/>'], 'a.png', { type: 'image/png' }), new File([], 'a.png', { type: 'image/png' }), new File([new Uint8Array(AVATAR_LIMIT+1)], 'a.png', { type: 'image/png' }), new File([new Uint8Array([255,216,255])], 'a.png', { type: 'image/png' })]) assert.ok(await validateAvatarFile(file));
});

test('only simple own-folder raster paths can be signed or cleaned up', () => {
  assert.equal(ownsAvatarPath(alice, oldPath), true);
  for (const path of [`${bob}/avatar.png`, `${alice}/../avatar.png`, `${alice}/nested/avatar.png`, `${alice}/avatar.svg`, `${alice}/avatar.png?token=x`, 'https://test.invalid/photo.png', null]) assert.equal(ownsAvatarPath(alice, path), false);
});

test('profile read requires server verification and the matching current SDK session', async () => {
  const f = fake();
  assert.equal((await readProfile(f.client, { userId: alice, isCurrent: () => true })).profile.id, alice);
  f.state.active = bob;
  const result = await readProfile(f.client, { userId: alice, isCurrent: () => true });
  assert.match(result.error, /account changed/); assert.equal(f.events.filter(e=>e==='read').length, 1);
});

test('name-only save touches only display_name and uses owner/timestamp compare-and-swap', async () => {
  const f = fake(), result = await saveProfile(f.client, f.args());
  assert.equal(result.error, null); assert.equal(result.profile.display_name, 'New Learner');
  assert.deepEqual(f.state.patch, { display_name: 'New Learner' });
  assert.deepEqual(f.state.filters, { id: alice, updated_at: original().updated_at });
  assert.equal(f.events.includes('upload'), false); assert.equal(f.events.includes('delete'), false);
});

test('new photo uses a random owned path, no overwrite, then commits before old-file deletion', async () => {
  const f = fake(), result = await saveProfile(f.client, f.args({ file: png() }));
  assert.equal(result.error, null); assert.equal(result.profile.avatar_path, newPath);
  assert.equal(f.state.upload.path, newPath); assert.equal(f.state.upload.config.upsert, false);
  assert.equal(f.state.upload.config.contentType, 'image/png');
  assert.ok(f.events.indexOf('upload') < f.events.indexOf('write'));
  assert.ok(f.events.indexOf('write') < f.events.indexOf('delete'));
  assert.deepEqual(f.state.deleted, [oldPath]);
});

test('removal first unlinks the photo from the profile and then deletes only its old object', async () => {
  const f = fake(), result = await saveProfile(f.client, f.args({ removeAvatar: true }));
  assert.equal(result.profile.avatar_path, null); assert.deepEqual(f.state.deleted, [oldPath]);
  assert.equal(f.events.includes('upload'), false); assert.ok(f.events.indexOf('write') < f.events.indexOf('delete'));
});

test('failed upload cannot change the profile or delete the old photo', async () => {
  const f = fake({ uploadError: { message: 'upload denied' } });
  const result = await saveProfile(f.client, f.args({ file: png() }));
  assert.match(result.error, /Could not upload/); assert.equal(f.state.profile.avatar_path, oldPath);
  assert.equal(f.events.includes('write'), false); assert.equal(f.events.includes('delete'), false);
});

test('stale generation and account/session changes stop writes, including after upload', async () => {
  for (const options of [
    { current: () => false },
    { state: { active: bob } },
    { onSession: state => { state.active = bob; } },
    { onUpload: state => { state.active = bob; } },
  ]) {
    const f = fake(options), result = await saveProfile(f.client, f.args({ file: png(), isCurrent: options.current || (() => true) }));
    assert.match(result.error, /account changed/); assert.equal(f.events.includes('write'), false); assert.equal(f.events.includes('delete'), false);
  }
  let current = true;
  const f = fake({ onUpload: () => { current = false; } });
  assert.match((await saveProfile(f.client, f.args({ file: png(), isCurrent: () => current }))).error, /account changed/);
  assert.equal(f.events.includes('write'), false);
});

test('concurrent-edit conflict preserves existing profile and cleans only its confirmed unused upload', async () => {
  const f = fake({ conflict: true }), result = await saveProfile(f.client, f.args({ file: png() }));
  assert.equal(result.reloadRequired, true); assert.equal(result.profile, undefined);
  assert.equal(f.state.profile.avatar_path, oldPath); assert.deepEqual(f.state.deleted, [newPath]);
});

test('lost or rejected write responses require reload and never delete a possibly committed upload', async () => {
  for (const options of [{ writeError: true }, { writeThrows: true }, { writeThrows: true, onWrite: state => { state.profile = { ...state.profile, avatar_path: newPath }; } }]) {
    const f = fake(options), result = await saveProfile(f.client, f.args({ file: png() }));
    assert.equal(result.reloadRequired, true); assert.match(result.error, /Could not confirm/);
    assert.equal(f.events.includes('delete'), false); assert.ok(!result.error.includes('Sensitive'));
  }
});

test('failed old-photo cleanup reports saved data plus a retryable warning', async () => {
  const f = fake({ deleteError: { message: 'network' } }), result = await saveProfile(f.client, f.args({ file: png() }));
  assert.equal(result.error, null); assert.equal(result.profile.avatar_path, newPath);
  assert.equal(result.cleanupPath, oldPath); assert.match(result.warning, /profile was saved/);
});

test('cleanup retry never deletes another user photo or a currently referenced object', async () => {
  const f = fake();
  assert.ok((await retryAvatarCleanup(f.client, { userId: alice, path: `${bob}/photo.png`, isCurrent: () => true })).error);
  assert.ok((await retryAvatarCleanup(f.client, { userId: alice, path: oldPath, isCurrent: () => true })).error);
  assert.equal(f.events.includes('delete'), false);
});

test('private photos use a short-lived signed URL and reject stale results and foreign paths', async () => {
  const f = fake();
  assert.ok((await readAvatarUrl(f.client, { userId: alice, path: oldPath, isCurrent: () => true })).url);
  assert.deepEqual(f.state.signed, { path: oldPath, ttl: AVATAR_URL_SECONDS });
  const foreign = await readAvatarUrl(f.client, { userId: alice, path: `${bob}/photo.png`, isCurrent: () => true });
  assert.equal(foreign.url, null); assert.equal(f.events.filter(e=>e==='sign').length, 1);
  let current = true;
  const stale = fake({ onSign: () => { current = false; } });
  assert.equal((await readAvatarUrl(stale.client, { userId: alice, path: oldPath, isCurrent: () => current })).url, null);
});

test('invalid names, types and snapshots make no network mutation', async () => {
  for (const values of [{ displayName: ' ' }, { file: new File(['bad'], 'a.svg', { type: 'image/svg+xml' }) }, { baseProfile: { ...original(), id: bob } }, { file: png(), removeAvatar: true }]) {
    const f = fake(); assert.ok((await saveProfile(f.client, f.args(values))).error);
    assert.equal(f.events.includes('upload'), false); assert.equal(f.events.includes('write'), false);
  }
});
