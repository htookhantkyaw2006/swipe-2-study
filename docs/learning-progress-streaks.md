# Real Vocabulary Learning Progress & Server-Confirmed Streaks

## 1. Vocabulary Progress & Completion Rules

### Vocabulary Card Identity
Vocabulary cards are identified by stable language and lexical identity:
- Written form (`character`, `phrase`, or `word`, normalized via NFC, trimmed, case-insensitive).
- Pronunciation / reading (`pronunciation`, `reading`, or `pinyin`, normalized via NFC, trimmed).
- Level / Course tier (e.g. `HSK1`, `N5`).

### Swipe Semantics
- **Swipe Right ("Learned" / "Familiar")**:
  - Sets item `status: 'known'` and `last_action: 'learned'`.
  - Increments item `seen` count by 1.
  - Updates `last_reviewed_at` timestamp.
  - Removes the item from `review_cards` queue if currently present.
- **Swipe Left ("Review" / "Again")**:
  - Sets item `status: 'learning'` and `last_action: 'review'`.
  - Increments item `seen` count by 1.
  - Updates `last_reviewed_at` timestamp.
  - Adds the item to `review_cards` queue if not already present.
- **Phrases Exception**:
  - Phrase practice (`isPhrases: true`) remains independent context practice and does not mutate vocabulary progress or review queue.

### Completion Rule
1. **Unique Seen**: A vocabulary word is considered "seen" if it has been encountered and swiped at least once (`seen >= 1`).
2. **Unique Learned / Mastered**: A vocabulary word is considered "learned" if and only if its latest action was swipe right (`status === 'known'`).
3. **No Inflated Totals**: Repeatedly reviewing or swiping the same word in subsequent sessions increments `seen` and updates timestamps, but never duplicates records or inflates unique seen / unique learned counts.
4. **Demotion & Promotion**: A previously learned word swiped left in a future session is demoted to `status: 'learning'` and re-enters the review queue until swiped right again.
5. **Level Completion**:
   $$\text{Level Completion \%} = \min\left(100, \left\lfloor \frac{\text{Unique Learned in Level}}{\text{Target Level Words}} \times 100 \right\rfloor\right)$$

### Unmapped Bundled Content & Honest Counts
Where bundled starter vocabulary contains a subset of official exam curriculum (e.g. 5 starter words in HSK1 vs 150 official words; 5 starter words in N5 vs 670 official words):
- Screens honestly display available card counts (`5 cards available`) and progress against official curriculum (`1 of 150 words`).
- Deterministic canonical IDs (e.g., `zh_hsk1_1`, `ja_n5_1`) are assigned to seeded starter content, avoiding random ID generation.

---

## 2. Server & Client Sync Extensions (`learned_words`)

- **Kind**: `learned_words` added to `CLOUD_KINDS` and PostgreSQL check constraints on `public.user_items` and `public.user_item_tombstones`.
- **Atomic Cache Mutations**: Tracked locally via `storageOwner.js` and authoritative `learning_document_v1`.
- **Idempotency & Replay Safety**: Replay receipts and optimistic revision checks prevent stale overwrites and out-of-order resurrection.
- **Learning Reset**: `s2s_reset_learning` wipes learning records and tombstones while advancing `reset_version`. Stale client envelopes are rejected with `RESET_VERSION_CHANGED` and cleanly reloaded without touching profiles or preferences.


## 3. Server-Confirmed Asia/Yangon Streaks

### Server Date & Timezone Integrity
All authenticated study streaks derive strictly from server-assigned dates evaluated in **`Asia/Yangon`** (UTC+6:30, fixed offset with no daylight saving time):
- Evaluated on PostgreSQL as `timezone('Asia/Yangon', now())::date`.
- Client system clocks, local device timezones, or simulated timestamps cannot spoof or advance confirmed streak records.

### Streak Calculation Engine
Authenticated study actions that modify learning data (e.g. `learned_words` or `review_cards`) transactionally trigger `private.s2s_record_study_action`:
1. **Day Counting**:
   - Each calendar day in `Asia/Yangon` counts at most once, regardless of how many mutations or swipes occur.
2. **Consecutive Days**:
   - If the previous recorded study date was yesterday (`last_study_date = today_yangon - 1`), `current_streak` increments by 1.
   - `longest_streak` is updated to `max(longest_streak, current_streak)`.
3. **Same Day**:
   - If `last_study_date = today_yangon`, the day is already counted; `current_streak` remains unchanged.
4. **Missed Day / Break**:
   - If `last_study_date < today_yangon - 1`, a missed day occurred; `current_streak` resets to 1 upon the new action.
5. **Passive Queries**:
   - When queried via `s2s_get_study_streak` before any study action today:
     - If studied yesterday (`today_yangon - 1`), yesterday extends through today: `current_streak` is preserved, but `today_studied` reports `false`.
     - If studied prior to yesterday (`< today_yangon - 1`), active streak reports `0` and `today_studied` reports `false`.

### Guest Isolation & Metrics Replacement
- **Guest State**: Guests do not hold a server session or server streak; UI displays honest guest device-local indicators (`isGuest: true`, `—`, "Guest mode (device-local)").
- **Live UI Updates**: All metric surfaces (Home `LevelCarousel` and `practice-links`, `LessonPicker`, `Library`, and `Profile`) actively subscribe to `storageOwner` events to re-render immediately upon session completion, data mutation, or account transition.


## 4. Sync & Progress Integrity Hardening

### In-Flight Acknowledgement Coordination
- **Local Mutation Identity**: Monotonically increasing `localMutationId` counters are tracked locally on each dirty or deleted mutation.
- **Latest Operation Type Preservation**: If an item is modified or deleted locally while an older request is in-flight:
  - If locally deleted, the tombstone retains `status: 'deleted'` and absorbs the new server revision as its `cloudRevision`, preventing an old upsert ACK from converting the tombstone to dirty.
  - If a second edit occurs with the same timestamp, the newer edit is preserved as `status: 'dirty'` and not marked synced prematurely.

### Request / Response / Reset Validation
- **Fail Closed**: Corrupted persisted request envelopes in local storage fail closed, preserving raw recovery bytes without overwriting or transmitting new requests.
- **Exact Generation Matching**: Server responses must match the exact `reset_version` of the transmitted envelope; responses with mismatched generations (e.g. "99" for "0") are rejected.
- **Reset Classification & Validated Hydration**: Transient concurrency errors (SQLSTATE 40001) are not misclassified as resets. On explicit `RESET_VERSION_CHANGED`, tables are not wiped and no fabricated generation is written until `restoreAccountSnapshot` completes successfully.

### Server Compare-And-Swap (CAS)
- **Strict Revision Checks**: Updating or deleting an existing server row requires exact matching between `base_revision` and current `revision`. Omitted base revisions or fabricated future revisions (e.g. "999") are rejected with `STALE_REVISION` conflicts, preventing lost updates and force-write bypass.

### Tombstone Format & Identity Mapping
- **Dual Identity Indexing**: Snapshots emit tombstones containing `item_key`, `language`, `kind`, `written_form`, `reading`, `deleted_at`, and `revision`.
- **Hydration Reconcilation**: Hydration matches tombstones by both record identity (`recordKey`) and server SHA256 key (`cloudItemKey`). Remotely deleted items that were previously synced are cleanly removed from local tables, while genuinely pending local offline edits (`status: 'dirty'`) are preserved.

### Qualifying Study Activity
- **No Bookmark Streaks**: Dictionary bookmarks (`saved_words`) and search history do not count toward study streaks. Only accepted qualifying study actions (`learned_words`, `review_cards`, character drills) transactionally record study activity.
