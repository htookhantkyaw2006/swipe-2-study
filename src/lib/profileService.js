// Profile writes use the learner's normal Supabase client and existing RLS.
// Never accept an owner ID from a form or store signed photo URLs in the profile.
export const PROFILE_FIELDS = 'id, display_name, avatar_path, created_at, updated_at';
export const AVATAR_LIMIT = 1048576;
export const AVATAR_URL_SECONDS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const CHANGED = 'Your account changed. Reload this page before trying again.';
const VERIFY = 'Could not verify your account. Check your connection and sign in again if needed.';
const CONFLICT = 'Your saved profile changed or is unavailable. Reload it before saving again.';

class ProfileFailure extends Error {}

export function validateDisplayName(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Enter a display name.';
  if ([...value.trim()].length > 100) return 'Use 100 characters or fewer for your name.';
  if ([...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return 'Use a name without line breaks or control characters.';
  return null;
}

export function ownsAvatarPath(userId, path) {
  return UUID.test(userId ?? '') && typeof path === 'string' && path.length <= 256
    && path.startsWith(userId.toLowerCase() + '/') && !path.includes('..')
    && /^[a-z0-9-]+\/[a-z0-9_-][a-z0-9._-]*\.(?:jpg|jpeg|png|webp)$/i.test(path);
}

export async function validateAvatarFile(file) {
  if (!file || !TYPES[file.type]) return 'Choose a JPEG, PNG or WebP image.';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > AVATAR_LIMIT) return 'Choose an image up to 1 MB.';
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const png = [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte);
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!(file.type === 'image/jpeg' && jpeg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) return 'This file does not match its image type. Choose another photo.';
  } catch { return 'This image could not be read. Choose another photo.'; }
  return null;
}

function assertCurrent(expectedUserId, isCurrent) {
  if (!UUID.test(expectedUserId ?? '') || !isCurrent()) throw new ProfileFailure(CHANGED);
}
async function verifyAccount(client, expectedUserId, isCurrent) {
  assertCurrent(expectedUserId, isCurrent);
  let verified, session;
  try {
    verified = await client.auth.getUser();
    assertCurrent(expectedUserId, isCurrent);
    if (verified.error) throw new ProfileFailure(VERIFY);
    if (verified.data?.user?.id !== expectedUserId) throw new ProfileFailure(CHANGED);
    session = await client.auth.getSession();
  } catch (error) { throw error instanceof ProfileFailure ? error : new ProfileFailure(VERIFY); }
  assertCurrent(expectedUserId, isCurrent);
  if (session.error) throw new ProfileFailure(VERIFY);
  if (session.data?.session?.user?.id !== expectedUserId) throw new ProfileFailure(CHANGED);
}
const failureMessage = (error, fallback) => error instanceof ProfileFailure ? error.message : fallback;

export async function readProfile(client, { userId, isCurrent }) {
  try {
    await verifyAccount(client, userId, isCurrent);
    const result = await client.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle();
    assertCurrent(userId, isCurrent);
    if (result.error || result.data?.id !== userId) return { error: 'Could not load your profile. Please retry.', profile: null };
    return { error: null, profile: result.data };
  } catch (error) { return { error: failureMessage(error, 'Could not load your profile. Check your connection and retry.'), profile: null }; }
}

export async function readAvatarUrl(client, { userId, path, isCurrent }) {
  if (!path) return { url: null, error: null };
  if (!ownsAvatarPath(userId, path)) return { url: null, error: 'Your profile photo is unavailable. Choose a new photo.' };
  try {
    await verifyAccount(client, userId, isCurrent);
    const result = await client.storage.from('avatars').createSignedUrl(path, AVATAR_URL_SECONDS);
    assertCurrent(userId, isCurrent);
    if (result.error || !result.data?.signedUrl) return { url: null, error: 'Could not load your photo. Please retry.' };
    return { url: result.data.signedUrl, error: null };
  } catch (error) { return { url: null, error: failureMessage(error, 'Could not load your photo. Please retry.') }; }
}

export async function retryAvatarCleanup(client, { userId, path, isCurrent }) {
  if (!ownsAvatarPath(userId, path)) return { error: 'The previous photo could not be cleaned up automatically.' };
  try {
    await verifyAccount(client, userId, isCurrent);
    const current = await client.from('profiles').select('id, avatar_path').eq('id', userId).maybeSingle();
    assertCurrent(userId, isCurrent);
    if (current.error || current.data?.id !== userId) throw new ProfileFailure('Could not check the saved photo. Retry cleanup later.');
    if (current.data.avatar_path === path) throw new ProfileFailure('That photo is in use. Reload your profile before trying again.');
    // Recheck the live SDK session after reading; never follow a switched account.
    await verifyAccount(client, userId, isCurrent);
    const result = await client.storage.from('avatars').remove([path]);
    assertCurrent(userId, isCurrent);
    if (result.error) throw new ProfileFailure('The previous photo could not be deleted. Please retry cleanup.');
    return { error: null };
  } catch (error) { return { error: failureMessage(error, 'The previous photo could not be deleted. Please retry cleanup.') }; }
}

export async function saveProfile(client, { userId, baseProfile, displayName, file = null, removeAvatar = false, isCurrent, makeId = () => crypto.randomUUID() }) {
  const invalidName = validateDisplayName(displayName);
  if (invalidName) return { error: invalidName };
  if (file && removeAvatar) return { error: 'Choose a photo or remove it, then save again.' };
  if (baseProfile?.id !== userId || typeof baseProfile.updated_at !== 'string' || !baseProfile.updated_at) return { error: CONFLICT, reloadRequired: true };
  const patch = { display_name: displayName.trim() };
  let uploadedPath = null;
  try {
    assertCurrent(userId, isCurrent);
    if (file) {
      const invalidFile = await validateAvatarFile(file);
      if (invalidFile) return { error: invalidFile };
    }
    await verifyAccount(client, userId, isCurrent);
    if (file) {
      const objectId = makeId();
      if (!UUID.test(objectId)) throw new ProfileFailure('Could not prepare your photo. Please try again.');
      uploadedPath = `${userId}/${objectId}.${TYPES[file.type]}`;
      const upload = await client.storage.from('avatars').upload(uploadedPath, file, { upsert: false, contentType: file.type, cacheControl: '300' });
      assertCurrent(userId, isCurrent);
      if (upload.error || upload.data?.path !== uploadedPath) return { error: 'Could not upload your photo. Your saved profile has not been changed. Please retry.' };
      patch.avatar_path = uploadedPath;
      await verifyAccount(client, userId, isCurrent);
    } else if (removeAvatar) patch.avatar_path = null;
    let result;
    try {
      result = await client.from('profiles').update(patch).eq('id', userId).eq('updated_at', baseProfile.updated_at).select(PROFILE_FIELDS).maybeSingle();
    } catch {
      // A lost response can follow a committed update. Never delete its new file.
      return { error: 'Could not confirm your changes. Reload your saved profile before trying again.', reloadRequired: true };
    }
    assertCurrent(userId, isCurrent);
    if (result.error) return { error: 'Could not confirm your changes. Reload your saved profile before trying again.', reloadRequired: true };
    if (!result.data) {
      // A completed zero-row CAS is a confirmed conflict, so its new upload is unused.
      if (uploadedPath) await retryAvatarCleanup(client, { userId, path: uploadedPath, isCurrent });
      return { error: CONFLICT, reloadRequired: true };
    }
    if (result.data.id !== userId || result.data.display_name !== patch.display_name
      || ('avatar_path' in patch && result.data.avatar_path !== patch.avatar_path)) return { error: 'Could not confirm your changes. Reload your saved profile before trying again.', reloadRequired: true };
    const oldPath = baseProfile.avatar_path;
    if ((file || removeAvatar) && oldPath && oldPath !== result.data.avatar_path) {
      const cleanup = await retryAvatarCleanup(client, { userId, path: oldPath, isCurrent });
      assertCurrent(userId, isCurrent);
      if (cleanup.error) return { error: null, profile: result.data, cleanupPath: oldPath, warning: 'Your profile was saved, but the previous photo could not be deleted.' };
    }
    return { error: null, profile: result.data };
  } catch (error) {
    return { error: failureMessage(error, 'Could not save your profile. Check your connection and retry.') };
  }
}
