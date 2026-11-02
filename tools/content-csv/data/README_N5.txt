Swipe 2 Study — N5 content handoff

706 client vocabulary entries, 2,118 examples. Content is preserved, not proofread or rewritten.

Files
- N5_Swipe2Study_import.csv: UTF-8 with BOM, CRLF, the current 11-column import contract.
- N5_mapping.json: authoritative stable ID registry, all 22 original source fields, kana, word romaji and part of speech keyed by ID.
- convert_n5.py: standard-library converter. Retain the registry when rerunning.
- N5_validation.json: actual repository structural validator result.
- client_source/: original CSV and XLSX, unchanged. XLSX includes Notes and Burmese review sheets.

Mapping
id: ja-n5-<24 hex digits>, unique for every sense.
course_id: ja-n5; language: ja; level_id: N5.
character -> written_form.
kana -> reading. Current Japanese card mapping and speech require kana here.
definition -> meaning_english; burmese_definition -> meaning_burmese.
ex1/ex2/ex3 -> ordered examples_json with text, reading (kana), romaji, english, burmese.
audio_path: empty because no client recordings were supplied.
sort_order: 10,20,...,7060 in original source order.

Important integration requirements BEFORE publication
1. Preserve the five intentional same-written-form/same-kana sense pairs independently:
   あの, ある, かける, キロ, もう. All 706 rows are intentional. Do not deduplicate them.
   Structural validation reports five expected DUPLICATE_VOCABULARY_IDENTITY warnings and zero errors.
   Current learner matching collapses these senses. Agent must fix canonical sense identity across progress, Saved, Review, session exclusion, import and sync before publication.
2. The current 11-column database/import contract has no separate word-romaji or POS columns.
   The CSV alone cannot supply those fields to the app. Agent must integrate N5_mapping.json metadata through a supported extension, or extend their import schema while preserving these IDs and all client values. Do not silently discard this metadata.
   Example romaji is retained as an extra property in examples_json; verify end-to-end preservation and UI mapping.
3. No hosted dry-run, stage, publish or schema migration has been executed for this package.
   Reconcile against any already-hosted N5 records before import. Do not overwrite unrelated content.
4. Client workbook's Burmese review notes remain unresolved and unchanged by explicit user direction. They are not conversion failures.

Stable identity
Initial hashes use course, written form, kana and INITIAL sense ordinal. Initial ordinals are assigned in source order only once.
N5_mapping.json is authoritative thereafter. Do not regenerate IDs from edited translations or reordered rows.
On rerun, unambiguous word/kana identities reuse IDs even when definitions change.
Multi-sense entries reconcile against stored POS/English/Burmese sense signatures; ambiguous edits fail and require explicit registry reconciliation. New entries also require explicit reconciliation.
This prevents silent reassignment of learner progress to a different meaning.

Reproduce
python convert_n5.py client_source/swipe2study_N5_vocab.csv .

Validate from repository root
node tools/content-csv/validate.mjs PATH_TO/N5_Swipe2Study_import.csv

Do not bypass warnings by deleting senses or changing genuine Japanese spellings/readings.
No external TTS provider or audio generation is required. Audio remains a client dependency.
