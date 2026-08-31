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

const strokeData = {};
const missing = [];

for (const char of writingCharList) {
  const file = join(dataDir, `${char}.json`);
  if (!existsSync(file)) {
    missing.push(char);
    continue;
  }
  strokeData[char] = JSON.parse(await readFile(file, 'utf8'));
}

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(strokeData), 'utf8');

const kb = Math.round((await readFile(outFile)).length / 1024);
console.log(`Wrote ${Object.keys(strokeData).length} characters to src/data/strokeData.json (${kb} KB)`);

if (missing.length) {
  console.warn(`\nNo stroke data for ${missing.length} character(s): ${missing.join(' ')}`);
  console.warn('These are usually multi-character words — split them into single hanzi.');
}
