import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, RefreshCw, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../lib/useAuth.js';
import { useProfile } from '../lib/profile.js';
import { useAvatarUrl } from '../lib/useAvatarUrl.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { notifyProfileChanged } from '../lib/profileEvents.js';
import { saveProfile, retryAvatarCleanup, validateAvatarFile, validateDisplayName } from '../lib/profileService.js';
import Avatar from '../components/ui/Avatar';
import { StudyHeader } from '../components/study/StudyPage';
import './EditProfile.css';

async function checkImage(file) {
  const invalid = await validateAvatarFile(file);
  if (invalid) return invalid;
  let image, objectUrl;
  try {
    if (typeof createImageBitmap === 'function') image = await createImageBitmap(file);
    else {
      image = new Image();
      objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      await image.decode();
    }
    const width = image.width || image.naturalWidth, height = image.height || image.naturalHeight;
    return !width || !height || width > 4096 || height > 4096 ? 'Choose a photo no larger than 4096 × 4096 pixels.' : null;
  } catch { return 'This image could not be opened. Choose another photo.'; }
  finally { image?.close?.(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
}

function ProfileEditor({ initialProfile, onReload }) {
  const { user, captureGeneration, isCurrent } = useAuth();
  const [base, setBase] = useState(initialProfile);
  const [name, setName] = useState(initialProfile.display_name);
  const [file, setFile] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [nameError, setNameError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingPhoto, setCheckingPhoto] = useState(false);
  const [reloadRequired, setReloadRequired] = useState(false);
  const [cleanupPath, setCleanupPath] = useState(null);
  const [warning, setWarning] = useState('');
  const [cleaning, setCleaning] = useState(false);
  const photo = useAvatarUrl(base.avatar_path);
  const inputRef = useRef(null);
  const nameRef = useRef(null);
  const alive = useRef(false);
  const selection = useRef(0);
  const locked = useRef(false);
  const cleanupLocked = useRef(false);
  const userId = user.id;
  const dirty = name.trim() !== base.display_name || Boolean(file) || removePhoto;

  useEffect(() => { alive.current = true; return () => { alive.current = false; selection.current += 1; }; }, []);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choosePhoto = async event => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected || locked.current) return;
    const sequence = ++selection.current;
    const gen = captureGeneration();
    setCheckingPhoto(true); setPhotoError(''); setSaved(false);
    const invalid = await checkImage(selected);
    if (!alive.current || sequence !== selection.current || !isCurrent(gen)) return;
    setCheckingPhoto(false);
    if (invalid) { setFile(null); setRemovePhoto(false); setPhotoError(invalid); return; }
    setFile(selected); setRemovePhoto(false);
  };
  const remove = () => {
    selection.current += 1; setCheckingPhoto(false); setPhotoError(''); setSaved(false);
    setFile(null); setRemovePhoto(Boolean(base.avatar_path));
  };
  const undoPhoto = () => {
    selection.current += 1; setCheckingPhoto(false); setFile(null); setRemovePhoto(false); setPhotoError(''); setSaved(false);
  };
  const save = async event => {
    event.preventDefault();
    if (locked.current || checkingPhoto || reloadRequired || cleanupLocked.current) return;
    const invalid = validateDisplayName(name);
    setNameError(invalid || ''); setFormError(''); setSaved(false);
    if (invalid) { nameRef.current?.focus(); return; }
    if (!dirty) return;
    locked.current = true; setBusy(true);
    const gen = captureGeneration();
    try {
      const result = await saveProfile(getSupabaseClient(), { userId, baseProfile: base, displayName: name, file, removeAvatar: removePhoto, isCurrent: () => isCurrent(gen) });
      // A save can finish after navigation. Notify any currently mounted owner view.
      if (result.profile && isCurrent(gen)) notifyProfileChanged(userId);
      if (!alive.current || !isCurrent(gen)) return;
      if (result.error) {
        setFormError(result.error); setReloadRequired(Boolean(result.reloadRequired)); return;
      }
      setBase(result.profile); setName(result.profile.display_name); setFile(null); setRemovePhoto(false);
      setPhotoError(''); setSaved(true); setWarning(result.warning || ''); setCleanupPath(result.cleanupPath || null);
    } catch { if (alive.current && isCurrent(gen)) setFormError('Could not save your profile. Please retry.'); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  const cleanup = async () => {
    if (!cleanupPath || cleanupLocked.current || locked.current) return;
    cleanupLocked.current = true; setCleaning(true);
    const gen = captureGeneration();
    try {
      const result = await retryAvatarCleanup(getSupabaseClient(), { userId, path: cleanupPath, isCurrent: () => isCurrent(gen) });
      if (!alive.current || !isCurrent(gen)) return;
      setWarning(result.error || ''); if (!result.error) setCleanupPath(null);
    } catch { if (alive.current) setWarning('Could not delete the previous photo. Please retry cleanup.'); }
    finally { cleanupLocked.current = false; if (alive.current) setCleaning(false); }
  };
  const photoSource = removePhoto ? null : file ? preview : photo.url;
  const disabled = busy || checkingPhoto || cleaning;

  return <form className="edit-profile__form" onSubmit={save} noValidate aria-busy={busy}>
    <section className="edit-profile__photo surface-card" aria-labelledby="edit-photo-title">
      <span className="edit-profile__eyebrow"><Camera size={17} aria-hidden="true" />YOUR PROFILE</span>
      <Avatar src={photoSource} alt={file ? 'New profile photo preview' : 'Your profile photo'} size={112} />
      <h2 id="edit-photo-title">Make it yours</h2>
      <p>Add a photo so your learning space feels like you.</p>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} hidden aria-label="Choose profile photo" disabled={disabled || reloadRequired} />
      <div className="edit-profile__photo-actions"><button type="button" className="btn-secondary" onClick={() => inputRef.current?.click()} disabled={disabled || reloadRequired}><Camera size={18} aria-hidden="true" />{checkingPhoto ? 'Checking photo…' : 'Choose photo'}</button>
        {(file || base.avatar_path) && !removePhoto && <button type="button" className="edit-profile__remove" onClick={remove} disabled={disabled || reloadRequired}><Trash2 size={17} aria-hidden="true" />Remove photo</button>}
        {(file || removePhoto) && <button type="button" className="edit-profile__undo" onClick={undoPhoto} disabled={disabled}>Undo photo change</button>}
      </div>
      <p className="edit-profile__help" id="photo-guidance">JPEG, PNG or WebP · Up to 1 MB<br />Maximum 4096 × 4096 pixels</p>
      {(file || removePhoto) && <p className="edit-profile__draft">{removePhoto ? 'Photo will be removed when you save.' : 'Your new photo is ready to save.'}</p>}
      {photoError && <p className="edit-profile__error" role="alert">{photoError}</p>}
      {!file && !removePhoto && photo.error && <div className="edit-profile__notice" role="status"><p>{photo.error}</p><button type="button" onClick={photo.retry} disabled={disabled}><RefreshCw size={16} aria-hidden="true" />Retry photo</button></div>}
    </section>
    <section className="edit-profile__details surface-card" aria-labelledby="edit-details-title">
      <div><h2 id="edit-details-title">Your details</h2><p className="edit-profile__intro">Choose the name you want to see while learning.</p></div>
      <div className="edit-profile__field"><label htmlFor="profile-display-name">Display name</label><input ref={nameRef} id="profile-display-name" value={name} autoComplete="nickname" onChange={event => { setName(event.target.value); setSaved(false); setNameError(''); }} disabled={busy || reloadRequired} required aria-invalid={Boolean(nameError)} aria-describedby="profile-name-help profile-name-error" />
        <p className="edit-profile__help" id="profile-name-help">Up to 100 characters <span>{[...name.trim()].length}/100</span></p><p className="edit-profile__error" id="profile-name-error" role={nameError ? 'alert' : undefined}>{nameError}</p></div>
      <div className="edit-profile__email"><span>Account email</span><p>{user.email}</p></div>
      {saved && <div className="edit-profile__success" role="status"><CheckCircle2 size={20} aria-hidden="true" /><p>Profile updated.</p></div>}
      {formError && <div className="edit-profile__notice edit-profile__notice--error" role="alert"><p>{formError}</p>{reloadRequired && <><p>Reloading discards the edits shown here and loads your saved profile.</p><button type="button" onClick={onReload} disabled={disabled}><RefreshCw size={16} aria-hidden="true" />Reload saved profile</button></>}</div>}
      {warning && <div className="edit-profile__notice" role="status"><p>{warning}</p>{cleanupPath && <button type="button" onClick={cleanup} disabled={disabled}><RefreshCw size={16} aria-hidden="true" />{cleaning ? 'Deleting previous photo…' : 'Retry photo cleanup'}</button>}</div>}
      <div className="edit-profile__actions"><button className="btn-primary" type="submit" disabled={disabled || !dirty || reloadRequired}>{busy ? 'Saving profile…' : 'Save changes'}</button><Link className="btn-secondary" to="/profile" aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}>Back to profile</Link></div>
    </section>
  </form>;
}

export default function EditProfile() {
  const { user, loading, isTransitioning } = useAuth();
  const { profile, loading: profileLoading, error, retry } = useProfile({ listen: false });
  return <div className="study-page edit-profile-page">
    <StudyHeader title="Edit profile" subtitle="Your name and photo" backTo="/profile" backLabel="Back to profile" />
    {loading || isTransitioning ? <div className="study-empty" role="status" aria-busy="true"><h2>Connecting your account…</h2></div>
      : !user ? <div className="study-empty"><UserRound size={32} aria-hidden="true" /><h2>Make yourself at home</h2><p>Sign in to update your name and profile photo.</p><Link className="study-text-link" to="/login?returnTo=%2Fprofile%2Fedit">Sign in</Link></div>
      : profileLoading ? <div className="study-empty" role="status" aria-busy="true"><h2>Loading your profile…</h2></div>
      : error || !profile ? <div className="study-empty" role="alert"><h2>Could not load your profile</h2><p>{error || 'Please retry to load your saved details.'}</p><button className="btn-secondary" onClick={retry}><RefreshCw size={17} aria-hidden="true" />Retry profile</button></div>
      : <ProfileEditor key={user.id} initialProfile={profile} onReload={retry} />}
  </div>;
}
