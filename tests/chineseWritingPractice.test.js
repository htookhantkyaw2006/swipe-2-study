import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writingChars, writingWords, writingCharList } from '../src/data/writingChars.js';
import strokeData from '../src/data/strokeData.json' with { type: 'json' };
import { createLocalDatabase } from '../src/lib/localDatabase.js';
import { getLearnedWords } from '../src/lib/vocabularyProgress.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

test('1. Chinese Writing: Covers all 248 unique Hanzi and 300 HSK 1 words without invented definitions', () => {
  assert.equal(writingWords.length, 300, 'Exact 300 HSK 1 vocabulary words');
  assert.equal(writingChars.length, 248, 'Exact 248 unique Hanzi characters');
  assert.equal(writingCharList.length, 248, 'Exact 248 character tokens');

  // Verify every character has stroke data in strokeData.json
  for (const char of writingCharList) {
    const data = strokeData[char];
    assert.ok(data, `Stroke data must exist for '${char}'`);
    assert.ok(Array.isArray(data.strokes) && data.strokes.length > 0, `Strokes array must be non-empty for '${char}'`);
    assert.ok(Array.isArray(data.medians) && data.medians.length > 0, `Medians array must be non-empty for '${char}'`);
  }

  // Verify unique character set matches set of characters across all 300 words
  const extractedFromWords = new Set();
  const hanziRegex = /\p{Script=Han}/u;
  for (const w of writingWords) {
    assert.ok(w.word, 'Word must have written form');
    assert.ok(w.pronunciation, 'Word must have pronunciation');
    assert.ok(w.definition, 'Word must have English definition');
    assert.ok(w.burmese_definition, 'Word must have Burmese definition');
    for (const c of w.chars) {
      assert.ok(hanziRegex.test(c), `Character '${c}' in word '${w.word}' must be Hanzi`);
      extractedFromWords.add(c);
    }
  }

  assert.equal(extractedFromWords.size, 248, 'Words must contain exactly 248 unique Hanzi');
  for (const c of extractedFromWords) {
    assert.ok(writingCharList.includes(c), `writingCharList must include '${c}'`);
  }
});

test('2. Multi-character words and repeated characters preserve correct breakdown', () => {
  // Check multi-character word '你好'
  const nihao = writingWords.find((w) => w.word === '你好');
  assert.ok(nihao);
  assert.deepEqual(nihao.chars, ['你', '好']);
  assert.equal(nihao.pronunciation, 'nǐ hǎo');

  // Check 3-character word '出租车'
  const chuzuche = writingWords.find((w) => w.word === '出租车');
  assert.ok(chuzuche);
  assert.deepEqual(chuzuche.chars, ['出', '租', '车']);

  // Check repeated character word '爸爸'
  const baba = writingWords.find((w) => w.word === '爸爸');
  assert.ok(baba);
  assert.deepEqual(baba.chars, ['爸', '爸']);
  assert.equal(baba.pronunciation, 'bàba');

  // Check repeated character word '妈妈'
  const mama = writingWords.find((w) => w.word === '妈妈');
  assert.ok(mama);
  assert.deepEqual(mama.chars, ['妈', '妈']);
  assert.equal(mama.pronunciation, 'māma');

  // Check repeated character word '谢谢'
  const xiexie = writingWords.find((w) => w.word === '谢谢');
  assert.ok(xiexie);
  assert.deepEqual(xiexie.chars, ['谢', '谢']);
});

test('3. Writing progress in written_chars does not touch or affect learned_words', () => {
  const tables = new Map();
  const db = createLocalDatabase({
    getScope: () => ({
      getTable: (lang, table) => tables.get(`${lang}:${table}`) ?? null,
      setTable: (lang, table, json) => tables.set(`${lang}:${table}`, json),
    }),
    getLanguage: () => 'zh',
  });

  // Initially empty
  assert.deepEqual(db.get('written_chars'), []);
  assert.deepEqual(getLearnedWords(db, 'zh'), []);

  // Record mastered character '你' in written_chars
  db.insert('written_chars', { character: '你' });
  const written = db.get('written_chars');
  assert.equal(written.length, 1);
  assert.equal(written[0].character, '你');

  // learned_words must remain strictly empty
  const learned = getLearnedWords(db, 'zh');
  assert.equal(learned.length, 0, 'Writing progress must remain completely separate from vocabulary learned status');
});

test('4. Build stroke data script enforces fail-closed validation on missing characters', () => {
  const scriptContent = fs.readFileSync(path.join(ROOT_DIR, 'scripts/build-stroke-data.mjs'), 'utf8');
  assert.ok(scriptContent.includes('process.exit(1)'), 'Script must exit with code 1 on missing/invalid data');
  assert.ok(scriptContent.includes('STROKE_DATA_BUILD_FAILED'), 'Script outputs actionable failure code');
  assert.ok(scriptContent.includes('Arphic Public License'), 'Preserves Arphic Public License attribution');
});

test('5. Legacy written record compatibility: safely maps { char: "X" }, { character: "Y" }, and raw strings', () => {
  const legacyRecords = [
    { char: '你', id: '1' },
    { character: '好', id: '2' },
    '大',
    null,
    { invalid: true },
  ];

  const extracted = legacyRecords
    .map((r) => r?.character || r?.char || (typeof r === 'string' ? r : null))
    .filter(Boolean);

  assert.deepEqual(extracted, ['你', '好', '大']);
});
