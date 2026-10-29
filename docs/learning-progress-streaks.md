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

