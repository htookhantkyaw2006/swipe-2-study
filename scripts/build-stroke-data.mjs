/* ---------------------------------------------------------------
   BUILD STROKE DATA
   ---------------------------------------------------------------
   `hanzi-writer-data` ships ~9,600 characters as one JSON file each
   (~32MB total) — far too much to bundle. This script copies out
   only the characters we actually practise into a single JSON that
   Vite can bundle, so the app works offline without the 32MB dep.

   `hanzi-writer-data` is a devDependency for exactly this reason:
   it is needed to BUILD the data, never to run the app.

   Run after editing src/data/writingChars.js:
     npm run build:strokes

   License:
     Stroke data is provided by hanzi-writer-data under the Arphic Public License.
   --------------------------------------------------------------- */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'node_modules', 'hanzi-writer-data');
const outFile = join(root, 'src', 'data', 'strokeData.json');

if (!existsSync(dataDir)) {
  console.error(
    'hanzi-writer-data not found. Install it first:\n  npm install -D hanzi-writer-data'
  );
  process.exit(1);
}

// Pull the character list straight from the app's own source of truth.
const { writingCharList } = await import('../src/data/writingChars.js');

if (!Array.isArray(writingCharList) || writingCharList.length === 0) {
  console.error('Error: writingCharList in src/data/writingChars.js is empty or not an array.');
  process.exit(1);
}

const strokeData = {};
const missing = [];
const invalid = [];

for (const char of writingCharList) {
  if (typeof char !== 'string' || char.trim().length === 0) {
    invalid.push(`Invalid character token: ${JSON.stringify(char)}`);
    continue;
  }

  const file = join(dataDir, `${char}.json`);
  if (!existsSync(file)) {
    missing.push(char);
    continue;
  }

  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.strokes) || !Array.isArray(parsed.medians) || parsed.strokes.length === 0) {
      invalid.push(`${char} (strokes or medians missing or empty)`);
      continue;
    }
    strokeData[char] = parsed;
  } catch (err) {
    invalid.push(`${char} (JSON parse error: ${err.message})`);
  }
}

if (missing.length > 0 || invalid.length > 0) {
  console.error(`\n[STROKE_DATA_BUILD_FAILED] Incomplete character coverage or invalid stroke data:`);
  if (missing.length > 0) {
    console.error(`  Missing stroke data for ${missing.length} character(s): ${missing.join(', ')}`);
  }
  if (invalid.length > 0) {
    console.error(`  Invalid stroke data for ${invalid.length} character(s): ${invalid.join(', ')}`);
  }
  console.error(`\nComplete stroke data coverage is required for all ${writingCharList.length} characters.`);
  process.exit(1);
}

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(strokeData), 'utf8');

const kb = Math.round((await readFile(outFile)).length / 1024);
console.log(`✓ Verified complete character coverage: ${Object.keys(strokeData).length} of ${writingCharList.length} characters.`);
console.log(`✓ Wrote ${Object.keys(strokeData).length} characters to src/data/strokeData.json (${kb} KB).`);
