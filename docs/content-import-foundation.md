# HSK1 and JLPT N5 Content Import & Publication Foundation

## 1. Overview & Architecture

The Content Import and Publication Foundation provides an operator-controlled, two-phase publication workflow for language curriculum datasets. The foundation is strictly constrained to **Chinese HSK 1** (`zh-hsk1`) and **Japanese JLPT N5** (`ja-n5`).

### Key Architectural Principles
- **Explicit Retirement (No Hard Deletes)**: Vocabulary items are **never automatically retired upon omission**. Partial or subset CSV imports preserve omitted items as active. Retirement requires explicit operator intent via `--retire-ids <id1,id2>`. Retired items are set to `is_active = false` (never hard-deleted), ensuring existing study bookmarks and history cards remain readable by clients.
- **Natural Identity Protection**: Learner progress records in `public.user_items` and client offline caches are keyed by natural identity:
  $$\text{Record Key} = \text{SHA-256}(\text{language} \parallel \text{kind} \parallel \text{written\_form} \parallel \text{reading})$$
  Because learner progress connects via natural keys, neither `written_form` nor `reading` may change for an existing curriculum ID. Attempting to modify either fails closed (`NATURAL_IDENTITY_CHANGE`). Non-identifying metadata updates (definitions, example sentences, audio paths, sort orders) never sever or rewrite existing learner progress.
- **Course Isolation**: Item IDs are strictly isolated per course. Reusing an existing ID across courses fails closed (`CROSS_COURSE_ID_CONFLICT`).
- **Stale Stage Protection**: Staged content records the target `stage_version`. If a concurrent publication advances the course version, publishing a stale stage fails closed (`STALE_STAGE_VERSION`).
- **Two-Phase Publication (Stage $\rightarrow$ Publish)**: Content is parsed, validated against schema constraints, and staged into `private.content_stages`. An incomplete or interrupted staging process never affects the currently published curriculum.
- **Pre-Update Recoverable Backups**: Before applying any publish or rollback mutation, an automated export of the current state is written to disk. If writing the backup file fails, the entire operation fails closed and aborts before touching the database.
- **RLS & Privilege Isolation**:
  - `public.courses` and `public.vocabulary` are read-only for public clients (`anon`, `authenticated`) and only expose published courses (`is_published = true`).
  - Staging and publication tables (`private.content_stages`, `private.content_publication_history`) and RPCs (`s2s_stage_course_content`, `s2s_publish_staged_content`, `s2s_rollback_course_content`, `s2s_get_course_content_status`) are restricted exclusively to `service_role`.
  - Client-facing `VITE_*` keys are strictly rejected by operator tooling.

---

## 2. Content Rollback vs. Database Disaster Recovery

It is critical to distinguish between application-level **Content Rollback** and infrastructure-level **Database Disaster Recovery**:

| Aspect | Content Rollback | Database Disaster Recovery |
| :--- | :--- | :--- |
| **Scope** | Single course curriculum (`zh-hsk1` or `ja-n5`) | Complete database instance / cluster |
| **Command / Mechanism** | `node tools/content-csv/content-manager.mjs rollback <course-id> --to-version <ver>` | Point-in-time PostgreSQL recovery (WAL / snapshot restore) |
| **Learner Data Impact** | **ZERO IMPACT**. Learner progress (`user_items`), study streaks, learned words, user preferences, and profiles remain 100% intact. | **DESTRUCTIVE**. Overwrites all user records created or updated after the snapshot timestamp. |
| **Intended Use Case** | Correction of erroneous curriculum definitions, broken audio paths, or incorrect sentence examples. | Catastrophic infrastructure corruption, storage failure, or accidental drop of cluster. |
| **Deactivation Handling** | Newer words not present in the restored version are marked `is_active = false`, preserving user history. | Restores raw state; any records created between backup and current time are permanently lost. |

> [!CAUTION]
> Never perform a database infrastructure restore to fix a curriculum typo or rollback a course version. Always use the built-in Content Rollback tool.

---

## 3. Operator Commands & Usage

The operator tool is located at `tools/content-csv/content-manager.mjs`.

### 3.1 Validate (Structural & Schema Check)
Validates CSV headers, byte lengths, JSON structure, and audio path security rules without requiring database credentials.
```bash
node tools/content-csv/content-manager.mjs validate tools/content-csv/fixtures/valid-zh-hsk1.csv
```

### 3.2 Dry-Run (Default Mode)
Validates the CSV and, when database credentials are provided, compares incoming records against the database. Reports counts for `inserted`, `updated`, `unchanged`, and `retired` items without making any modifications.
```bash
# Offline Dry Run
node tools/content-csv/content-manager.mjs tools/content-csv/fixtures/valid-zh-hsk1.csv

# Online Dry Run (requires service role key)
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs dry-run tools/content-csv/fixtures/valid-zh-hsk1.csv --target staging
```

### 3.3 Export Recoverable Backup
Creates a versioned, recoverable JSON export of the currently published course content.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs export zh-hsk1 --out ./content-backups
```

### 3.4 Stage Content
Validates the CSV, checks identity compatibility, and stores items in `private.content_stages`. Write operations require an explicit `--target <env>`.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs stage tools/content-csv/fixtures/valid-zh-hsk1.csv \
  --target staging \
  --operator "admin-alice"
```
Output returns the generated `stage_id`.

### 3.5 Publish Staged Content
Atomically applies a staged dataset to `public.vocabulary`, increments the course version, exports a pre-update backup, and records publication history.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs publish zh-hsk1 \
  --stage-id "12345678-1234-1234-1234-123456789abc" \
  --target staging \
  --operator "admin-alice" \
  --reason "Initial HSK1 curriculum release"
```

### 3.6 Stage and Publish (Combined Shortcut)
Stages verified content and immediately executes atomic publication.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs stage-and-publish tools/content-csv/fixtures/valid-ja-n5.csv \
  --target staging \
  --operator "admin-alice" \
  --reason "Release JLPT N5 v1"
```

### 3.7 Content Rollback
Reverts a course's vocabulary to any previously published version from `private.content_publication_history`.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs rollback zh-hsk1 \
  --to-version 1 \
  --target staging \
  --operator "admin-alice" \
  --reason "Reverting to version 1 due to audio path correction"
```

### 3.8 Course Status
Inspects current published version, active word counts, retired word counts, and latest stage info.
```bash
SUPABASE_URL="https://your-project.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJhbGci..." \
node tools/content-csv/content-manager.mjs status zh-hsk1
```

---

## 4. Stable Natural Identity Rules & Protection

Each vocabulary record must maintain stable natural identity:
- **Valid Content Updates**:
  - Updating `meaning_english` or `meaning_burmese`.
  - Adding or modifying `examples` JSON.
  - Adding or changing `audio_path`.
  - Reordering items via `sort_order`.
- **Natural Identity Changes (Strictly Rejected)**:
  - If an incoming row reuses an existing `id` but changes `written_form` OR `reading` (e.g., changing pinyin reading from `zhōng` to `zhòng`, or changing kanji from `日` to `月`).
  - Both the operator tool and the database stored function reject this with error `NATURAL_IDENTITY_CHANGE`.
  - Because learner progress is linked to `written_form:reading`, modifying either would detach learner records.
  - To introduce a new word or alternate pronunciation, assign a new stable content ID.
- **Cross-Course ID Conflicts (Strictly Rejected)**:
  - If an incoming row uses an ID that already exists in another course (e.g., an N5 item using an existing HSK1 ID `zh_hsk1_001`), the operation fails closed with `CROSS_COURSE_ID_CONFLICT`.
- **Explicit Retirement**:
  - Words omitted from CSV files remain active. To deactivate an obsolete word, use `--retire-ids <id1,id2>`. Both CLI diffing and database publication track retired items explicitly.

---

## 5. Synthetic Fixtures vs. Real Client Data Prerequisites

### Synthetic Test Fixtures
The following fixtures in `tools/content-csv/fixtures/` are synthetic test fixtures designed for automated testing:
- `valid-zh-hsk1.csv`: Minimal synthetic Chinese vocabulary items.
- `valid-ja-n5.csv`: Minimal synthetic Japanese vocabulary items.
- `warnings-partial-meanings-and-dupes.csv`: Demonstrates non-fatal warnings.
- `invalid-*.csv`: Synthetic failure test cases covering malformed UTF-8, NUL bytes, unsafe paths, and schema violations.

### Prerequisites for Real Client Data & Audio Approval
Before deploying production curriculum data, the following criteria must be satisfied:
1. **Curriculum Completeness**: Full vocabulary datasets for HSK 1 (~150 terms) and JLPT N5 (~700 terms) fully translated into English and Burmese.
2. **Burmese Encoding Verification**: All Burmese strings must use standard Unicode (`my_MM`), verified against rendering artifacts or legacy Zawgyi encoding.
3. **Audio Asset Storage & Approval**:
   - Audio files must be uploaded to the private Supabase Storage `audio` bucket.
   - Relative paths must follow standard convention: `audio/zh/hsk1/<filename>.mp3` or `audio/ja/n5/<filename>.mp3`.
   - Audio files must be licensed or studio-recorded, normalized in loudness, and encoded in a supported format (`.mp3`, `.m4a`, `.ogg`, `.webm`, `.wav`).
   - No external URL references or directory traversals (`..`) are permitted.
4. **Staging Environment Sign-off**: Operator must execute `stage` and `publish` in `--target staging` and complete QA review before promoting to `--target production`.

