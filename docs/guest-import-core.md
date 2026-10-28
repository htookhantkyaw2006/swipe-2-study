# Guest import service checkpoint

28 October 2026. Core checkpoint `c55e015`, based on `d92dcf1`, implemented the
service/cache primitives. The subsequent [combined flow](guest-import.md) now
integrates the IDE dialog, automatic offers, Profile re-entry and notices.
Cloud sync remains unimplemented. The service/storage contract below still applies.

## Ownership and integration contract

The IDE-agent contribution owns only `GuestImportDialog.jsx`, its CSS and its
handoff document. The integrating developer owns the provider/controller and
entry points. No SQL, hosted configuration, dependencies, global styling,
main-branch or deployment changes belong to this checkpoint.

Production entry: `src/lib/guestImport.js` exports `guestImportService`.

1. After verified, settled sign-in, call `await guestImportService.inspect()`.
   It returns an opaque offer with `status` (`available` or `nothing-to-import`),
   `ownerId`, `persistence: 'device-only'`, and `summary` using the dialog's exact
   `{ languageId, languageLabel, savedWords, reviewWords, progressRecords }` shape.
   Inspection is read-only. Offers and summaries are frozen. An offer cannot be
   reconstructed from JSON or reused across a reload/service instance.
2. Keep the original offer in memory. Open the dialog only for `available` and
   the same verified account. Close/defer does not call `choose` or save a choice.
3. For an explicit action, set pending and await
   `guestImportService.choose(offer, 'merge' | 'account-only')`. Reset pending in
   `finally`, display caught errors, and support a fresh inspection after stale
   source/account errors. Do not automatically retry, import, or switch owners.
4. Results use `status: 'saved' | 'already-decided'`, `choice` and
   `persistence: 'device-only'`. `addedRecords` is present on a newly saved choice.
   Repeated/lost-response retries reconcile to the original decision. A second
   choice cannot reverse an already saved decision for that source.
5. After a confirmed save, refresh/remount the learning views so their existing
   React snapshots reflect the synchronous DB's updated tables. Do not remount
   Auth or treat an unmounted/stale request as UI success for a different account.
6. The integration must visibly explain that learning data remains **on this
   device**. An appropriate merge confirmation is “Guest learning added on this
   device. Cloud sync is not available yet.” Never say “cloud saved”, promise
   cross-device availability, or imply the account was hydrated from Supabase.
7. Provide a reachable way to reopen a deferred offer, and suppress prompts on
   Auth/recovery routes and during study sessions. The service additionally blocks
   unverified, transitioning, failed and password-recovery Auth states.

The production adapter verifies `auth.getUser()` AND `auth.getSession()` before
committing. Every await is followed by an owner/generation check. A generation
change, including sign-out then back to the same user, invalidates the offer.
Fingerprinting identifies a source snapshot; it is not authorization.

## Imported data and merge policy

Only these tables are read from the explicit guest scope, for Chinese (`zh`),
Japanese (`ja`) and English (`en`):

- `saved_words` and `review_cards`;
- `written_chars`, `learned_radicals`, `learned_kana`, `learned_sounds`.

Seeded `flashcards` are course content, not progress. Search history, preferences,
language selection, tokens, migration flags, unknown tables and other accounts
are excluded. No source key is deleted or modified.

Word identity is NFC-normalized, trimmed, whitespace-normalized, lowercase written
form plus pronunciation/reading/legacy pinyin. Tone accents and distinct readings
are preserved. Progress identity is the relevant character/radical/kana/sound
within its own language and table. Duplicate guest identities use the first
record. Existing account records win completely on identity conflicts; counters
are never added and streaks are never maximized. New imported records get fresh
UUIDs. Existing account rows and IDs remain unchanged.

Review membership/removal now uses the same word identity rather than separately
generated deck IDs. Learning an imported word does not create a duplicate queue
entry, and marking it learned in Review removes the correct semantic word.

Each explicit decision remembers handled identities per account. Subsequent
offers contain only previously undecided guest identities. This prevents a user
deleting an imported word and having it resurrect on retry or when another guest
word appears. “Use account data only” also handles the offered identities without
importing them. Another account needs its own explicit choice. Re-importing an
intentionally removed/skipped identity would require a future explicit reset of
import history; there is no such control in this checkpoint.

Malformed source/destination rows abort rather than silently discarding data.
Mixed language rows, impossible drill counters, over 10,000 rows in a table read
for import and a source larger than 4 Mi JavaScript characters are rejected. Error
paths keep stored values for recovery. Counts are records, not completed lessons.

## Atomic device commit and compatibility

The existing DB remains synchronous. Ordinary guest keys and untouched account
tables keep their original format. A saved import writes one reserved account
key, `s2s_user_<uuid>_learning_document_v1`, containing affected table strings and
the decision receipt together. Thus a rejected single-key quota write cannot
leave a multi-table import half applied. Readback must match before success.

Imported tables become authoritative in that document. Subsequent normal DB
CRUD reads/writes that document and retains the receipt, so old per-table data
cannot resurrect a cleared list. Old account table keys remain as recovery
data; they are not authoritative after a table has moved into the document.
Other tables, settings, guest storage and other users remain separate.

The reserved document is excluded from `scope.entries()` and ordinary cache
keys. Future export/sync/cleanup code must use the effective table APIs and
explicitly account for this document; enumerating legacy keys alone is incomplete.
Malformed/unsupported documents fail closed and are kept, rather than falling
back to older data. A captured scope continues to target its original owner;
Auth verification, not cache isolation, is the security boundary.

Before commit the service re-reads guest data and the latest account cache after
network verification, checks the document revision/raw value, and checks the
legacy target values. A changed source requires reinspection. A lost response
after a committed write is resolved using the atomically stored receipt.

**Concurrency limit:** localStorage has no multi-key/cross-tab compare-and-swap.
The checks detect changes observed before commit, and duplicate choices in this
service instance are blocked. They cannot guarantee exclusion against a separate
tab writing between the final check and setItem, or an old app version writing
legacy keys after a table moved. This is not a general multi-tab/cloud sync
protocol. Hosted sync must introduce server transactions, idempotency and
reset/deletion version checks; it must not upload this cache envelope blindly.

## Validation and remaining work

At the original core checkpoint (superseded by the combined-flow checks):

- 145 Node tests pass, including 28 new service/data boundary tests and one real
  Vite module/cache integration test. Existing Auth, profile, policy, cache,
  recovery and UI-helper tests remain passing.
- Lint: zero errors, eight existing Fast Refresh warnings. Production build and
  whitespace checks pass. The existing large-bundle warning remains.
- 15 Chromium checks pass using native localStorage/crypto (including an actual
  quota rejection, retry, refresh and account separation) and synthetic verified Auth
  state. They test the service without claiming a connected hosted import flow.
  The two review-identity checks exercise real study/review buttons.
- No real account, email, Storage or hosted database mutation is performed here.

The dialog review, parent integration/re-entry and simulated combined browser
flow have since been completed; see guest-import.md. Actual configured account
acceptance, stronger multi-tab safeguards, hosted cloud progress sync and
Safari/physical-device checks remain pending.
