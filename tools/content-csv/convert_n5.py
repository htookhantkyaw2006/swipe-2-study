"""Convert approved N5 source CSV without changing client content.

Usage: python convert_n5.py SOURCE.csv OUTPUT_DIRECTORY
Retain N5_mapping.json between runs. Ambiguous sense edits require explicit reconciliation.
"""
import collections
import csv
import hashlib
import json
import pathlib
import sys

HEADERS = ['id', 'course_id', 'language', 'level_id', 'written_form', 'reading',
           'meaning_english', 'meaning_burmese', 'audio_path', 'examples_json', 'sort_order']
SOURCE_HEADERS = ['level', 'character', 'kana', 'pronunciation', 'part_of_speech',
                  'definition', 'burmese_definition'] + [
    f'ex{i}_{field}' for i in range(1, 4)
    for field in ['text', 'reading', 'romaji', 'english', 'burmese']]


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def identity(row):
    return compact(['ja-n5', row['character'], row['kana']])


def sense_signature(row):
    return compact([row['part_of_speech'], row['definition'], row['burmese_definition']])


def convert(source, output):
    raw = source.read_bytes()
    with source.open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != SOURCE_HEADERS:
            raise ValueError('Unexpected source headers; explicit mapping review required.')
        rows = list(reader)
    if len(rows) != 706:
        raise ValueError(f'Expected approved 706 entries, found {len(rows)}.')
    if any(set(row) != set(SOURCE_HEADERS) or any(not isinstance(v, str) or not v.strip()
           for v in row.values()) for row in rows):
        raise ValueError('Missing/extra fields or blank source values.')
    if any(row['level'] != 'N5' for row in rows):
        raise ValueError('Only approved N5 entries are allowed.')

    output.mkdir(parents=True, exist_ok=True)
    registry_path = output / 'N5_mapping.json'
    previous = json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else None
    old_groups = collections.defaultdict(list)
    if previous:
        for entry in previous['records']:
            old_groups[identity(entry['source'])].append(entry)
    groups = collections.Counter(identity(row) for row in rows)
    ordinals = collections.Counter()
    used = set()
    records, mapped = [], []
    for position, row in enumerate(rows, 1):
        key = identity(row)
        ordinals[key] += 1
        if previous:
            candidates = old_groups.get(key, [])
            if len(candidates) == 1 and groups[key] == 1:
                match = candidates[0]
            else:
                matches = [entry for entry in candidates
                           if sense_signature(entry['source']) == sense_signature(row)]
                if len(matches) != 1:
                    raise ValueError(f'Ambiguous/new sense at source row {position + 1}; reconcile registry explicitly.')
                match = matches[0]
            item_id, ordinal = match['id'], match['sense_ordinal']
        else:
            ordinal = ordinals[key]
            digest = hashlib.sha256(compact(['ja-n5', row['character'], row['kana'], ordinal]).encode()).hexdigest()[:24]
            item_id = 'ja-n5-' + digest
        if item_id in used:
            raise ValueError('Duplicate ID assignment; refusing to overwrite a vocabulary sense.')
        used.add(item_id)
        examples = [{
            'text': row[f'ex{i}_text'], 'reading': row[f'ex{i}_reading'],
            'romaji': row[f'ex{i}_romaji'], 'english': row[f'ex{i}_english'],
            'burmese': row[f'ex{i}_burmese'],
        } for i in range(1, 4)]
        mapped.append(dict(zip(HEADERS, [item_id, 'ja-n5', 'ja', 'N5',
            row['character'], row['kana'], row['definition'], row['burmese_definition'],
            '', compact(examples), str(position * 10)])))
        records.append({'id': item_id, 'source_csv_row': position + 1,
                        'sense_ordinal': ordinal, 'source': row,
                        'word_metadata': {'kana': row['kana'], 'romaji': row['pronunciation'],
                                          'part_of_speech': row['part_of_speech']}})
    manifest = {
        'course_id': 'ja-n5', 'language': 'ja', 'level_id': 'N5',
        'source_sha256': hashlib.sha256(raw).hexdigest(), 'total_records': len(rows),
        'total_examples': len(rows) * 3,
        'id_policy': 'Initial IDs hash course, written form, kana and initial sense ordinal. The persisted registry is authoritative thereafter. Never regenerate IDs from edited content or current row positions.',
        'reading_policy': 'Import reading is kana, as required by current Japanese speech/card mapping. Word romaji and POS are retained here for agent integration; example romaji is also preserved in examples_json.',
        'publish_prerequisites': ['Independent sense identity throughout learner state',
                                 'Word romaji/POS integration from companion metadata',
                                 'Staging dry-run and verification'],
        'intentional_same_identity_pairs': [
            {'written_form': values[0]['source']['character'], 'kana': values[0]['source']['kana'],
             'ids': [value['id'] for value in values]}
            for values in ([entry for entry in records if identity(entry['source']) == key]
                           for key, count in groups.items() if count > 1)],
        'records': records,
    }
    with (output / 'N5_Swipe2Study_import.csv').open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=HEADERS, lineterminator='\r\n')
        writer.writeheader()
        writer.writerows(mapped)
    registry_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Converted {len(rows)} entries and {len(rows) * 3} examples; preserved all source fields in registry.')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: python convert_n5.py SOURCE.csv OUTPUT_DIRECTORY')
    convert(pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]))
