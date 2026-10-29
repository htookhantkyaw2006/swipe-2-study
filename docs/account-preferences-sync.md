# Account Preferences Sync

## 1. Overview
Account Preferences Sync provides repeat-safe, owner-isolated cloud synchronization of user settings and active learning language for verified accounts.
Guest mode preferences and active course selections remain strictly device-only.

When enabled by capability gate (`VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED === 'true'`) and configured with a live Supabase backend, preferences and active language are restored on verified sign-in and synchronized across devices. When disabled or offline, preferences continue working seamlessly via synchronous local cache storage.

---

## 2. In-Scope Preferences & Schema

The synchronization contract maps strictly to `public.user_preferences` (`settings jsonb` and `active_language text`). No new preference fields or daily-goal counting behaviors are introduced.

### Exact Supported Preference Fields (`settings` JSONB)

| Setting Key | Type | Allowed Values / Range | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `dailyGoal` | `number` | Positive integer (e.g., `10`, `20`, `30`, `50`) | `20` | Daily study target (cards to aim for) |
| `cardsPerSession` | `number` | Positive integer (e.g., `5`, `10`, `20`, `30`) | `10` | Swipe session batch size |
| `cardOrder` | `string` | `'sequential'` \| `'shuffle'` | `'sequential'` | Sequencing mode for flashcard deck |
| `showPinyin` | `boolean` | `true` \| `false` | `true` | Display romanization / reading on cards |
| `showBurmese` | `boolean` | `true` \| `false` | `true` | Display Burmese translations on cards |
| `translationLanguage` | `string` | `'english'` \| `'burmese'` \| `'both'` | `'both'` | Selected translation meaning display |
| `autoPlayAudio` | `boolean` | `true` \| `false` | `false` | Auto-pronounce cards when revealed |
| `speechRate` | `string` | `'slow'` \| `'normal'` \| `'fast'` | `'normal'` | Audio speech synthesis speed |
| `accentByLanguage` | `object` | Map of course ID (`'zh'`, `'ja'`) to accent code | `{}` | Per-language speech pronunciation accent |

### Supported Active Language (`active_language` text)

| Column | Type | Allowed Values | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `active_language` | `text` | `'zh'` \| `'ja'` \| `'en'` | `'zh'` | Primary course language currently selected |

Any unknown keys or invalid types received from the cloud or local storage are stripped and sanitized against `DEFAULTS`.

---

## 3. Storage Architecture & Owner Isolation

1. **Immediate Local Persistence**:
   All user preference changes and language switches write synchronously to `storageOwner.scope().setItem('preferences', ...)` and `storageOwner.scope().setItem('language', ...)`. Local reading is never blocked by network calls.
2. **Owner Partitioning**:
   - Guest: `s2s_preferences`, `s2s_language`
   - Verified Accounts: `s2s_user_${accountId}_preferences`, `s2s_user_${accountId}_language`
   Preferences for Account A never leak into Account B or Guest mode.
3. **Dedicated Pending State**:
   A dedicated owner-scoped key `s2s_user_${accountId}_pending_preferences_sync_v1` tracks in-flight mutations:
   - `ownerId`: UUID
   - `localMutationId`: Monotonic integer incremented on every change
   - `settings`: In-scope settings snapshot
   - `activeLanguage`: Active language snapshot
   - `changedKeys`: Keys modified in this mutation
   - `status`: `'saving'` \| `'saved'` \| `'failed'`
   - `error`: Error message if failed
   - `updatedAt`: ISO timestamp

---

## 4. Lifecycle & Conflict Resolution

### Initial Restore on Sign-in
- When a verified account signs in, the client performs initial restore from `public.user_preferences`.
- **Default Overwrite Prevention**: Default local state is never pushed to the cloud before initial hydration completes.
- **Pending Local Edit Preservation**: If the user makes an explicit local change (e.g. adjusts `dailyGoal`) while the initial cloud fetch is pending, the local edit is preserved during hydration and not overwritten by older cloud values. Non-conflicting cloud settings are applied, and the pending local edit is then committed to the cloud.

### In-Flight Save Coordination
- If a save is in flight and the user performs another local change (advancing `localMutationId`), the completion of the earlier save does not falsely mark the pending state as `'saved'` or discard the newer edit.
- The newer mutation remains pending until it is acknowledged by the server.

### Error Handling & Explicit Retry
- If a network error or server failure occurs during save, the status transitions to `'failed'` and the error is recorded in the pending state.
- **No Background Polling / Auto-Replay**: The client avoids automatic offline replay loops or general-purpose queues.
- **Explicit Retry**: The Settings UI provides an accessible "Retry" action that re-transmits the pending payload on demand.

### Account Switch Protection
- All asynchronous operations check `isCurrent()` and verify `storageOwner.getOwner() === expectedUserId` both before dispatch and after every await.
- Stale responses arriving after sign-out or account switching are discarded with zero side-effects on the active session.

---

## 5. Capability Gating

- **Feature Flag**: `VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED === 'true'`.
- **Backend Check**: Supabase client must be configured with a valid URL and anon key.
- When the capability gate is disabled or unconfigured, all settings and active language operate in device-only local mode.
