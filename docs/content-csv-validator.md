# Course Content CSV Validator
_Swipe 2 Study — Structural Vocabulary Validation Tool_

## 1. Overview & Purpose

The Course Content CSV Validator is a standalone, offline Node.js command-line utility for verifying course vocabulary CSV files against the application database schema before ingestion.

It performs **strict structural validation only**:
- Validates field constraints, lengths, data types, and uniqueness matching the PostgreSQL `public.courses` and `public.vocabulary` schema.
- Enforces relational consistency across course metadata and levels.
- Rejects dangerous path traversals, absolute URLs, malformed quoting, and corrupted JSON.
- **Scope Boundary**: This tool is an offline structural linter. It does not perform database writes, network calls, environment file reads, automated translations, curriculum approvals, or assume fixed word counts.

---

## 2. CSV Contract & Header Specification

All course vocabulary CSV files must include the following 11 headers in exact order:

```csv
id,course_id,language,level_id,written_form,reading,meaning_english,meaning_burmese,audio_path,examples_json,sort_order
```

### Field Definitions & Schema Rules

| Header | Database Column | Type / Constraint | Required | Rules & Validation |
| :--- | :--- | :--- | :---: | :--- |
| `id` | `public.vocabulary.id` | `text` (1–150 chars) | **Yes** | Unique primary key across the entire file. Must be a stable, caller-supplied identifier. The tool never generates or alters IDs. |
| `course_id` | `public.vocabulary.course_id` | `text` (1–100 chars) | **Yes** | Identifier of the course (e.g. `zh-hsk1`, `ja-n5`). Every occurrence of a `course_id` must consistently map to the same `language` and `level_id`. |
| `language` | `public.courses.language` | `text` (`'zh'` or `'ja'`) | **Yes** | Target learning language code. Only `'zh'` (Chinese) and `'ja'` (Japanese) are supported. |
| `level_id` | `public.courses.level_id` | `text` (1–100 chars) | **Yes** | Level identifier (e.g. `HSK1`, `N5`). Under `unique(language, level_id)`, a level cannot be assigned to multiple conflicting courses. |
| `written_form` | `public.vocabulary.written_form` | `text` (1–500 chars) | **Yes** | Primary written form of the vocabulary (Hanzi or Kanji/Kana). Unicode and Chinese/Japanese characters are strictly preserved. |
| `reading` | `public.vocabulary.reading` | `text` (1–2000 chars) | **Yes** | Pronunciation/reading (Pinyin with tone marks, or Romaji/Kana). |
| `meaning_english`| `public.vocabulary.meaning_english`| `text` (max 2000 chars) | At least one | English definition. If omitted while Burmese is present, a warning is emitted. |
| `meaning_burmese`| `public.vocabulary.meaning_burmese`| `text` (max 2000 chars) | At least one | Burmese definition (Myanmar script). If omitted while English is present, a warning is emitted. |
| `audio_path` | `public.vocabulary.audio_path` | `text` (max 256 chars) | No (Optional) | Relative Storage object path (e.g. `audio/zh/hsk1/001.mp3`). Must **not** be an absolute URL (`http://`, `https://`), must not contain `..` traversal, query parameters (`?`), or leading slashes. |
| `examples_json`| `public.vocabulary.examples` | `jsonb` (array <= 3 items) | No (Optional) | JSON array of up to 3 example objects. Blank/empty string defaults to `[]`. Each object must contain `text` and at least one translation (`english` or `burmese`). |
| `sort_order` | `public.vocabulary.sort_order` | `integer` (4-byte signed) | **Yes** | Display sequence number between `-2147483648` and `2147483647`. |

### Content Preservation & Duplicate Warnings
- **Unicode Preservation**: Chinese characters, Japanese kanji/kana, Burmese script (Myanmar Unicode), and tone-marked Latin characters are strictly preserved without normalization loss.
- **Duplicate Word Identity Warning**: If multiple rows share the same `(course_id, written_form, reading)`, the validator emits a warning (`DUPLICATE_VOCABULARY_IDENTITY`). It **never** silently merges, rewrites, or discards duplicate rows.

---

## 3. RFC 4180 Parser Specifications

The parser (`tools/content-csv/parser.mjs`) is an in-memory character state machine:
- **No naive `split(',')`**: Correctly handles commas inside quoted fields.
- **Multiline Fields**: Line breaks (`\n` and `\r\n`) within quotes are preserved as field content without corrupting row numbers.
- **Escaped Quotes**: Double quotes (`""`) inside quoted fields are unescaped to single literal quotes (`"`).
- **UTF-8 BOM**: Byte order mark (`\uFEFF`) at the beginning of the file is automatically stripped.
- **Input Bounding**: Input size is strictly capped at **10 MiB** (`MAX_INPUT_BYTES = 10485760`). Files exceeding this limit are rejected immediately.

---

## 4. CLI Usage & Contract

### Exact Command
```bash
node tools/content-csv/validate.mjs <input.csv>
```

### Exit Codes

| Code | Meaning | Details |
| :---: | :--- | :--- |
| **`0`** | **Valid** | File is structurally valid. All schema rules pass. (Warnings may be present in the report). |
| **`1`** | **Validation Failure** | File contains one or more structural, syntax, or schema errors. |
| **`2`** | **Usage / I/O Failure** | Missing arguments, help request, file not found, unreadable file, or file exceeding 10 MiB. |

### JSON Output Format

The CLI writes a single structured JSON report to standard output:

```json
{
  "file": "path/to/course.csv",
  "valid": true,
  "summary": {
    "total_rows": 150,
    "valid_rows": 150,
    "error_count": 0,
    "warning_count": 2
  },
  "errors": [],
  "warnings": [
    {
      "row": 12,
      "column": "meaning_burmese",
      "code": "MISSING_BURMESE_MEANING",
      "message": "Row has English meaning but is missing Burmese meaning."
    }
  ]
}
```

---

## 5. Error & Warning Codes Reference

| Code | Severity | Description |
| :--- | :---: | :--- |
| `EMPTY_FILE` | Error | CSV content contains no records or headers. |
| `MALFORMED_QUOTING` | Error | Unescaped quote inside unquoted field or trailing character after quote. |
| `UNCLOSED_QUOTE` | Error | Opening quote was not closed before end of file. |
| `INCONSISTENT_COLUMN_COUNT` | Error | Row has fewer or more than 11 columns. |
| `INVALID_HEADER_COUNT` | Error | Header row has fewer or more than 11 columns. |
| `DUPLICATE_HEADER` | Error | Header row contains duplicate column names. |
| `HEADER_MISMATCH` | Error | Header name does not match expected name or order. |
| `MISSING_ID` | Error | `id` column is empty or whitespace-only. |
| `ID_TOO_LONG` | Error | `id` exceeds 150 characters. |
| `DUPLICATE_ID` | Error | `id` is duplicated in another row within the file. |
| `MISSING_COURSE_ID` | Error | `course_id` is empty. |
| `COURSE_ID_TOO_LONG` | Error | `course_id` exceeds 100 characters. |
| `INVALID_LANGUAGE` | Error | `language` is not `'zh'` or `'ja'`. |
| `MISSING_LEVEL_ID` | Error | `level_id` is empty. |
| `LEVEL_ID_TOO_LONG` | Error | `level_id` exceeds 100 characters. |
| `CONFLICTING_COURSE_METADATA` | Error | Same `course_id` maps to conflicting language or level. |
| `CONFLICTING_LEVEL_ASSIGNMENT` | Error | `(language, level_id)` assigned to multiple distinct courses. |
| `MISSING_WRITTEN_FORM` | Error | `written_form` is empty. |
| `WRITTEN_FORM_TOO_LONG` | Error | `written_form` exceeds 500 characters. |
| `MISSING_READING` | Error | `reading` is empty. |
| `READING_TOO_LONG` | Error | `reading` exceeds 2000 characters. |
| `MISSING_MEANING` | Error | Both `meaning_english` and `meaning_burmese` are empty. |
| `MEANING_TOO_LONG` | Error | Definition exceeds 2000 characters. |
| `MISSING_SORT_ORDER` | Error | `sort_order` is empty. |
| `INVALID_INTEGER` | Error | `sort_order` is not a valid integer. |
| `INTEGER_OUT_OF_RANGE` | Error | `sort_order` is outside `[-2147483648, 2147483647]`. |
| `UNSAFE_AUDIO_PATH` | Error | `audio_path` contains absolute URL, `..` traversal, query strings, or leading slashes. |
| `AUDIO_PATH_TOO_LONG` | Error | `audio_path` exceeds 256 characters. |
| `INVALID_AUDIO_FORMAT` | Error | `audio_path` extension is not an audio format (`.mp3`, `.wav`, etc.). |
| `INVALID_JSON` | Error | `examples_json` cannot be parsed by `JSON.parse`. |
| `EXAMPLES_NOT_ARRAY` | Error | `examples_json` root is not a JSON array. |
| `TOO_MANY_EXAMPLES` | Error | `examples_json` contains more than 3 example objects. |
| `INVALID_EXAMPLE_OBJECT` | Error | Item inside `examples_json` is not an object. |
| `INVALID_EXAMPLE_TEXT` | Error | Example object missing non-empty `text` string. |
| `EXAMPLE_TEXT_TOO_LONG` | Error | Example `text` exceeds 1000 characters. |
| `MISSING_EXAMPLE_TRANSLATION` | Error | Example object missing both `english` and `burmese` translations. |
| `MISSING_ENGLISH_MEANING` | Warning | Row has Burmese meaning but is missing English meaning. |
| `MISSING_BURMESE_MEANING` | Warning | Row has English meaning but is missing Burmese meaning. |
| `DUPLICATE_VOCABULARY_IDENTITY` | Warning | Row has same `(written_form, reading)` as a preceding row in the course. |
| `MISSING_EXAMPLE_ENGLISH` | Warning | Example object has Burmese translation but is missing English. |
| `MISSING_EXAMPLE_BURMESE` | Warning | Example object has English translation but is missing Burmese. |

---

## 6. Templates & Test Fixtures

### Header-Only Templates
- `tools/content-csv/templates/hsk1-template.csv`: Chinese HSK 1 template with valid headers.
- `tools/content-csv/templates/n5-template.csv`: Japanese N5 template with valid headers.

### Synthetic Test Fixtures
All fixtures in `tools/content-csv/fixtures/` are synthetic and clearly labeled:
- `valid-zh-hsk1.csv`: Valid Chinese HSK 1 records with Pinyin, Burmese, and example JSON.
- `valid-ja-n5.csv`: Valid Japanese N5 records with Kana, Romaji, and Burmese definitions.
- `invalid-duplicate-id.csv`: Triggering `DUPLICATE_ID`.
- `invalid-malformed-csv.csv`: Triggering `UNCLOSED_QUOTE`.
- `invalid-course-conflict.csv`: Triggering `CONFLICTING_COURSE_METADATA`.
- `invalid-examples.csv`: Triggering `INVALID_JSON`, `INVALID_EXAMPLE_TEXT`, `TOO_MANY_EXAMPLES`.
- `invalid-audio-path.csv`: Triggering `UNSAFE_AUDIO_PATH` (URLs, traversal, leading slashes, query strings).
- `warnings-partial-meanings-and-dupes.csv`: Demonstrating warning reporting for missing meanings and duplicate identities.

---

## 7. Running Tests

Run the dedicated validator test suite:
```bash
node --test tools/content-csv/validator.test.mjs
```
