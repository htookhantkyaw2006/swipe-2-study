# Edit profile: name and private avatar

Implemented on `feat/backend-foundation`, starting from `961acf3`.
The sidebar/collapse work belongs to PT's separate IDE-agent handoff. This change
leaves BottomNav, Layout, global theme CSS and sidebar behavior untouched.

## Delivered behavior

- Signed-in users open **Profile → Edit profile** (`/profile/edit`). Guests see a
  sign-in link carrying a validated return path; no editable guest profile or
  fabricated cloud-save state is shown.
- Display names are trimmed, required, and limited to 100 Unicode code points,
  matching PostgreSQL's character limit. Burmese, CJK and emoji are accepted;
  ASCII control characters are rejected. Email/password changes are separate.
- Avatars accept source JPEG/PNG/WebP up to 8 MiB (8,388,608 bytes) and up to 16 megapixels.
  The client prepares the image before upload using browser-native image/canvas APIs:
  * Rejects SVG, arbitrary files, disguised extensions, and corrupt/undecodable files via magic byte inspection.
  * Rejects source images exceeding 16 megapixels before allocating canvas buffers.
  * Scales image dimensions to fit within a 512×512 bounding box, preserving aspect ratio, without upscaling.
  * Compresses output using bounded quality iterations (max 4 attempts) to ensure the prepared file is <= 1 MiB (1,048,576 bytes) compatible with Storage bucket rules.
  * Generates matching filename extension and MIME type based on actual encoded format (never trusting source extension).
  * Handles EXIF orientation natively via browser-native `imageOrientation: 'from-image'`.
  * Browser EXIF Limitation: Modern browsers (Chrome 52+, Safari 15+, Firefox 93+, Edge 79+) handle EXIF orientation natively; legacy engines lacking `imageOrientation` support fall back to raw storage orientation without throwing.
  * Temporary resources (object URLs, ImageBitmap, canvas pixel buffers) are released promptly.
  * Failed preparation leaves existing avatar completely unchanged (zero Storage/DB operations).
  * Generation/owner-switch guards abort upload if account switches during preparation.
- Choosing/removing a photo stages a change. A local object-URL preview, undo,
  save/loading/error/confirmation states and retry controls are provided.
  Unmounting releases the preview URL. A failed image falls back to the existing
  silhouette, and a new source can load after an earlier image error.
- Confirmed name/photo changes appear on Profile and Home. An owner-only
  invalidation event refreshes a view if a submitted save completes after SPA
  navigation. The editor keeps its confirmed snapshot and cleanup warning.

## Existing backend requirements

Uses the original foundation's `profiles` table and private `avatars` bucket.
No migration, policy change, privileged credential, new dependency or hosted
write was performed in this workspace. Configure the normal publishable client
in PT's local environment. Inspect the actual staging schema/policies if profile
reads fail; do not blindly rerun the foundation SQL.

The learner SDK verifies `getUser()` and the current session before operations.
Requests retain the intended user ID and Auth generation. Guards after awaits
prevent stale reads, writes or signed URLs from following an account switch.
RLS and the existing active-user rules remain authoritative.

Only `display_name` and, when changed, `avatar_path` are updated. Updates filter
both the intended owner and the exact loaded `updated_at`, and request the saved
row. A zero-row conflict blocks further save until an explicit reload. The app
never claims a local edit is a confirmed server update.

Photos use fresh random UUID filenames inside the owner's folder, with
`upsert: false`. Only the object path is stored in `profiles`; five-minute signed
read URLs remain in component memory and are refreshed before expiry/on tab
visibility. No public bucket, public URL or signed URL persistence was added.
Original filenames are not used as object paths. The Storage API handles file
removal; no direct SQL deletion of Storage metadata is used.

## Partial failures and boundaries

Storage upload and profile update are separate operations, not one transaction.
The previous photo is deleted only after a confirmed profile update. Before a
cleanup retry, the service checks that the old object is owned and is no longer
referenced by the current profile. A deletion failure reports the saved profile
and provides a cleanup retry while the editor remains open.

An ambiguous/lost profile-write response requires reload and retains the new
upload: deleting it could break an update that actually committed. A confirmed
zero-row conflict permits best-effort removal of that unused upload. Interrupted
uploads, ambiguous failures or abandoned cleanup warnings can leave private
unreferenced objects. There is no durable cleanup queue or automatic orphan
collector in this milestone; future Storage maintenance/account deletion must
handle those files. Do not describe the operation as atomic or file cleanup as
guaranteed. Local unsaved drafts are not persisted across navigation/reload.

## Verification

- 110 Node tests pass (95 existing + 15 profile-service cases). Cases include
  Unicode names, file/type limits, owner/session/generation guards, compare-and-
  swap filters, upload-before-commit/delete-after-commit ordering, no destructive
  cleanup on ambiguous responses, cleanup retry and private signed reads.
- Lint: 0 errors / 8 existing Fast Refresh warnings. Regular guest and synthetic-
  configured production builds pass; existing large-chunk/test-fixture-port
  warnings remain. Whitespace checks pass.
- The installed SDK was exercised in Chromium production and development
  StrictMode with intercepted Auth/PostgREST/Storage endpoints and synthetic
  accounts/files. No real credentials, account edits or hosted Storage writes
  were used. Production and development StrictMode each passed 32 flow checks
  and 50 layouts; 12 additional production boundary/renewal/reachability checks
  and 20 unconfigured guest layouts passed (76 checks / 120 layouts total).
- Phone/desktop screenshots were inspected. Responsive states cover widths
  320/375/768/1024/1440, guest/load failures, loaded/saved forms, validation,
  local preview, upload failure, conflict and cleanup/photo-read errors.
- Browser flows cover name save, duplicate submissions, private photo upload,
  Profile/Home updates, staged remove/undo, upload and cleanup retries, conflict
  reload, committed-response-loss reconciliation, and sign-out during an upload
  followed by a different account. No uncaught page errors or unmocked external
  requests occurred in the completed runs.

Hosted acceptance, real Storage policy enforcement, Safari and physical-device
image selection remain unverified. The existing SQL tests use managed-schema
fixtures; browser mocks do not establish hosted permissions or availability.

## PT's hosted acceptance check

1. Sign in to the test account on localhost, then open Profile → Edit profile.
2. Save a new display name. Confirm it on Profile and Home and after reload.
3. Choose a JPEG/PNG/WebP under 1 MB, save, then confirm the photo after reload.
4. Replace and remove the photo. Confirm that only the intended owner's files
   change in the private bucket. Use a second test account to confirm isolation.
5. Check actual request errors before changing any hosted configuration. Record
   missing tables/policies/bucket separately from application defects.

SDK references: [update](https://supabase.com/docs/reference/javascript/update),
[upload](https://supabase.com/docs/reference/javascript/storage-from-upload),
[signed reads](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl),
[file removal](https://supabase.com/docs/reference/javascript/storage-from-remove).
