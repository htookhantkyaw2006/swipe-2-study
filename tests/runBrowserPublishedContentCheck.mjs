import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

export async function runBrowserPublishedContentVerification() {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!browserPath) {
    console.warn('[BROWSER_CHECK_SKIPPED] No real browser executable (Chrome/Edge) found on host.');
    return { skipped: true, reason: 'No browser installed on host' };
  }

  return new Promise((resolve, reject) => {
    let chromeProc = null;
    const timeout = setTimeout(() => {
      if (chromeProc) chromeProc.kill();
      server.close();
      reject(new Error('Browser verification timed out after 10 seconds.'));
    }, 10000);

    const server = http.createServer((req, res) => {
      if (req.url === '/src/lib/publishedContentGate.js' || req.url === '/publishedContentGate.js') {
        const filePath = path.resolve(__dirname, '../src/lib/publishedContentGate.js');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(filePath));
        return;
      }
      if (req.url === '/src/lib/publishedContentService.js' || req.url === '/publishedContentService.js') {
        const filePath = path.resolve(__dirname, '../src/lib/publishedContentService.js');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(filePath));
        return;
      }
      if (req.url === '/src/lib/supabaseConfig.js' || req.url === '/supabaseConfig.js') {
        const filePath = path.resolve(__dirname, '../src/lib/supabaseConfig.js');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(filePath));
        return;
      }
      if (req.url === '/src/lib/supabase.js' || req.url === '/supabase.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end('export function getSupabaseClient() { return null; }');
        return;
      }

      if (req.url === '/report' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          clearTimeout(timeout);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          server.close();
          if (chromeProc) chromeProc.kill();

          try {
            const report = JSON.parse(body);
            if (report.success) {
              console.log('✓ Real Browser Published Content UI & Mapping Smoke Check Passed:');
              for (const r of report.results) {
                console.log(`    - ${r.test}: ${JSON.stringify(r)}`);
              }
              resolve({ passed: true, results: report.results });
            } else {
              console.error('✗ Real Browser Verification Failed:', report.error);
              reject(new Error(report.error));
            }
          } catch (e) {
            reject(new Error(`Failed to parse browser report: ${e.message}`));
          }
        });
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Published Content Browser Smoke</title></head>
<body>
  <h1>Running Real Browser Published Content Smoke Check...</h1>
  <div id="test-container"></div>
  <script type="module">
    import { isPublishedContentEnabled } from './publishedContentGate.js';
    import {
      resolvePublishedCourseId,
      isPublishedCourseLevel,
      mapVocabularyToCard,
      fetchPublishedCourseContent,
    } from './publishedContentService.js';

    function assert(cond, msg) {
      if (!cond) throw new Error(msg || 'Assertion failed');
    }

    async function run() {
      const results = [];

      // 1. Browser DOM Gate Check
      const disabledGate = isPublishedContentEnabled({});
      assert(disabledGate === false, 'Gate disabled by default in browser');

      const enabledGate = isPublishedContentEnabled({
        VITE_PUBLISHED_CONTENT_ENABLED: 'true',
        VITE_SUPABASE_URL: 'https://demo.supabase.co/',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_12345678901234567890'
      });
      assert(enabledGate === true, 'Gate enabled with valid config in browser');
      results.push({ test: 'browser-published-content-gate', passed: true });

      // 2. Browser HSK 1 Card Contract & DOM Render
      const syntheticHskRow = {
        id: 'zh_hsk1_001',
        course_id: 'zh-hsk1',
        written_form: '中',
        reading: 'zhōng',
        meaning_english: 'center; middle; China',
        meaning_burmese: 'အလယ်ဗဟို',
        audio_path: 'audio/zh/hsk1/001.mp3',
        examples: [{ text: '我是中国人。', reading: 'Wǒ shì zhōngguó rén.', english: 'I am Chinese.', burmese: 'ကျွန်တော် တရုတ်လူမျိုးပါ။' }],
        sort_order: 10,
        is_active: true
      };

      const hskCard = mapVocabularyToCard(syntheticHskRow, { language: 'zh', level_id: 'HSK1' }, 0);
      assert(hskCard.id === 'zh_hsk1_001', 'HSK1 card preserves stable database ID');
      assert(hskCard.character === '中', 'HSK1 written form matches');
      assert(hskCard.pronunciation === 'zhōng', 'HSK1 reading matches');
      assert(hskCard.audio_path === 'audio/zh/hsk1/001.mp3', 'HSK1 audio path matches');
      assert(hskCard.examples.length === 1, 'HSK1 example sentence mapped');

      // Test DOM insertion
      const container = document.getElementById('test-container');
      const hskEl = document.createElement('div');
      hskEl.className = 'lesson-word';
      hskEl.innerHTML = '<span class="char">' + hskCard.character + '</span><span class="reading">' + hskCard.reading + '</span><span class="en">' + hskCard.definition + '</span>';
      container.appendChild(hskEl);
      assert(hskEl.querySelector('.char').textContent === '中', 'DOM renders HSK1 character correctly');
      results.push({ test: 'browser-hsk1-card-contract-and-dom', passed: true });

      // 3. Browser JLPT N5 Card Contract & DOM Render
      const syntheticN5Row = {
        id: 'ja_n5_001',
        course_id: 'ja-n5',
        written_form: '私',
        reading: 'わたし',
        meaning_english: 'I; me',
        meaning_burmese: 'ကျွန်တော် / ကျွန်မ',
        audio_path: 'audio/ja/n5/001.mp3',
        examples: [{ text: '私は学生です。', reading: 'Watashi wa gakusei desu.', english: 'I am a student.', burmese: 'ကျွန်တော် ကျောင်းသားပါ။' }],
        sort_order: 10,
        is_active: true
      };

      const n5Card = mapVocabularyToCard(syntheticN5Row, { language: 'ja', level_id: 'N5' }, 0);
      assert(n5Card.id === 'ja_n5_001', 'N5 card preserves stable database ID');
      assert(n5Card.character === '私', 'N5 kanji matches');
      assert(n5Card.kana === 'わたし', 'N5 kana matches');
      assert(n5Card.audio_path === 'audio/ja/n5/001.mp3', 'N5 audio path matches');

      const n5El = document.createElement('div');
      n5El.className = 'lesson-word';
      n5El.innerHTML = '<span class="char">' + n5Card.character + '</span><span class="kana">' + n5Card.kana + '</span><span class="en">' + n5Card.definition + '</span>';
      container.appendChild(n5El);
      assert(n5El.querySelector('.kana').textContent === 'わたし', 'DOM renders N5 kana correctly');
      results.push({ test: 'browser-n5-card-contract-and-dom', passed: true });

      // 4. Mock Client Fetch & Complete Pagination Smoke
      const mockSupabase = {
        from: (table) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'zh-hsk1', language: 'zh', level_id: 'HSK1', title: 'HSK 1', is_published: true, content_version: 1 },
                error: null
              }),
              eq: () => ({
                order: () => ({
                  order: () => ({
                    range: async () => ({
                      data: [syntheticHskRow],
                      error: null
                    })
                  })
                })
              })
            })
          })
        })
      };

      const fetchResult = await fetchPublishedCourseContent('zh-hsk1', { client: mockSupabase });
      assert(fetchResult.isPublished === true, 'Mock fetch reports published');
      assert(fetchResult.items.length === 1, 'Mock fetch returned 1 card');
      results.push({ test: 'browser-fetch-and-mapping', passed: true });

      await fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, results })
      });
    }

    run().catch(err => {
      fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.stack || err.message })
      });
    });
  </script>
</body>
</html>`);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const targetUrl = `http://127.0.0.1:${port}/`;

      chromeProc = execFile(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        '--disable-background-networking',
        targetUrl,
      ], (err) => {
        if (err && !err.killed) {
          clearTimeout(timeout);
          server.close();
          reject(new Error(`Browser launch error: ${err.message}`));
        }
      });
    });
  });
}

// Allow direct CLI invocation: node tests/runBrowserPublishedContentCheck.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserPublishedContentVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

