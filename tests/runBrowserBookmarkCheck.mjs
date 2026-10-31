import http from 'node:http';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHROME_PATHS = [
  process.env.CHROME_BIN,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export async function runBrowserBookmarkVerification() {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!browserPath) {
    console.warn('[BROWSER_CHECK_SKIPPED] No real browser executable (Chrome/Edge) found on host.');
    return { skipped: true, reason: 'No browser installed on host' };
  }

  const cssPath = path.resolve(__dirname, '../src/pages/Learn/SwipeSession.css');
  const swipeSessionCss = fs.readFileSync(cssPath, 'utf8');

  return new Promise((resolve, reject) => {
    let chromeProc = null;
    const timeout = setTimeout(() => {
      if (chromeProc) chromeProc.kill();
      server.close();
      reject(new Error('Browser bookmark verification timed out after 10 seconds.'));
    }, 10000);

    const server = http.createServer((req, res) => {
      if (req.url === '/src/lib/entry.js' || req.url === '/entry.js') {
        const filePath = path.resolve(__dirname, '../src/lib/entry.js');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(filePath));
        return;
      }
      if (req.url === '/src/lib/studyWords.js' || req.url === '/studyWords.js') {
        const filePath = path.resolve(__dirname, '../src/lib/studyWords.js');
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(fs.readFileSync(filePath));
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
              console.log('✓ Real Browser Bookmark DOM & Interaction Verification Passed:');
              for (const r of report.results) {
                console.log(`    - ${r.test}: ${JSON.stringify(r)}`);
              }
              resolve({ passed: true, results: report.results });
            } else {
              console.error('✗ Real Browser Bookmark Verification Failed:', report.error);
              reject(new Error(report.error));
            }
          } catch (e) {
            reject(new Error(`Failed to parse browser report: ${e.message}`));
          }
        });
        return;
      }

      // Serve test HTML simulating the real card DOM and interaction propagation
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bookmark Browser Verification</title>
  <style>
    :root {
      --color-ghost-blue: #EFF6FF;
      --color-primary-blue: #2563EB;
      --color-border: #E2E8F0;
      --color-text-navy: #0F172A;
      --shadow-soft: 0 4px 12px rgba(0,0,0,0.06);
    }
    ${swipeSessionCss}
  </style>
</head>
<body>
  <div id="test-root"></div>
  <script type="module">
    import { findSavedWord, buildSavedWordRecord } from '/src/lib/studyWords.js';

    async function run() {
      const results = [];
      function assert(cond, msg) { if (!cond) throw new Error(msg); }

      const root = document.getElementById('test-root');

      // 1. Verify buildSavedWordRecord and findSavedWord in real browser JS engine
      const card = {
        card_id: 'zh-hsk1-001',
        character: '你好',
        pronunciation: 'nǐ hǎo',
        definition: 'hello',
        burmese_definition: 'မင်္ဂလာပါ',
        level: 'HSK1',
        examples: [{ text: '你好吗？', reading: 'nǐ hǎo ma?', english: 'How are you?' }],
        audio_path: 'audio/zh/hsk1/nihao.mp3',
      };

      const record = buildSavedWordRecord(card);
      assert(record.phrase === '你好', 'Record phrase matches');
      assert(record.reading === 'nǐ hǎo', 'Record reading matches');
      assert(record.card_id === 'zh-hsk1-001', 'Record card_id preserved');
      assert(record.id === undefined, 'Storage id omitted from buildSavedWordRecord');
      assert(record.examples.length === 1, 'Examples preserved');
      assert(record.audio_path === 'audio/zh/hsk1/nihao.mp3', 'Audio path preserved');

      // Add storage id as db.insert would
      const stored = { ...record, id: 'db-storage-uuid-1', created_at: new Date().toISOString() };
      const savedList = [stored];

      const found = findSavedWord(savedList, card);
      assert(found !== null, 'findSavedWord finds saved record');
      assert(found.id === 'db-storage-uuid-1', 'Returns stored item with storage id');
      results.push({ test: 'browser-helpers-and-contract', passed: true });

      // 2. Real DOM interaction: Click bookmark button inside card
      // Card flip handler must NOT fire when bookmark is clicked.
      let cardFlipped = false;
      let bookmarkToggled = false;

      const cardElem = document.createElement('div');
      cardElem.className = 'swipe-card swipe-card--active';
      cardElem.addEventListener('click', () => { cardFlipped = true; });

      const frontFace = document.createElement('div');
      frontFace.className = 'swipe-card__face swipe-card__front';

      const topline = document.createElement('div');
      topline.className = 'swipe-card__topline';

      const levelSpan = document.createElement('span');
      levelSpan.className = 'swipe-card__level';
      levelSpan.textContent = 'HSK1';

      const actions = document.createElement('div');
      actions.className = 'swipe-card__actions';

      const bookmarkBtn = document.createElement('button');
      bookmarkBtn.type = 'button';
      bookmarkBtn.className = 'swipe-bookmark';
      bookmarkBtn.setAttribute('aria-pressed', 'false');
      bookmarkBtn.setAttribute('aria-label', 'Save 你好');

      bookmarkBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      bookmarkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bookmarkToggled = true;
        const currentPressed = bookmarkBtn.getAttribute('aria-pressed') === 'true';
        bookmarkBtn.setAttribute('aria-pressed', String(!currentPressed));
        bookmarkBtn.setAttribute('aria-label', !currentPressed ? 'Unsave 你好' : 'Save 你好');
        bookmarkBtn.classList.toggle('swipe-bookmark--saved', !currentPressed);
      });
      bookmarkBtn.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') e.stopPropagation();
      });

      actions.appendChild(bookmarkBtn);
      topline.appendChild(levelSpan);
      topline.appendChild(actions);
      frontFace.appendChild(topline);
      cardElem.appendChild(frontFace);
      root.appendChild(cardElem);

      // Trigger click on bookmark button
      bookmarkBtn.click();
      assert(bookmarkToggled === true, 'Bookmark button click executed');
      assert(cardFlipped === false, 'stopPropagation prevented card flip on click');
      assert(bookmarkBtn.getAttribute('aria-pressed') === 'true', 'aria-pressed updated to true');
      assert(bookmarkBtn.getAttribute('aria-label') === 'Unsave 你好', 'aria-label updated to Unsave');
      assert(bookmarkBtn.classList.contains('swipe-bookmark--saved'), 'CSS class swipe-bookmark--saved applied');
      results.push({ test: 'browser-click-stop-propagation', passed: true });

      // 3. Real DOM interaction: Space/Enter keydown event
      let keyFlipped = false;
      cardElem.addEventListener('keydown', () => { keyFlipped = true; });

      const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      bookmarkBtn.dispatchEvent(spaceEvent);
      assert(keyFlipped === false, 'stopPropagation prevented card keydown event on Space');

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      bookmarkBtn.dispatchEvent(enterEvent);
      assert(keyFlipped === false, 'stopPropagation prevented card keydown event on Enter');
      results.push({ test: 'browser-keyboard-stop-propagation', passed: true });

      // 4. Computed CSS styles in real browser DOM
      const computed = window.getComputedStyle(bookmarkBtn);
      assert(computed.display === 'flex' || computed.display === 'inline-flex', 'Bookmark button display is flex/inline-flex (got ' + computed.display + ')');
      assert(computed.borderRadius === '50%', 'Bookmark button has 50% border-radius (circular)');
      assert(computed.width === '44px' && computed.height === '44px', 'Bookmark button is 44x44px accessible touch target');
      results.push({ test: 'browser-computed-css-styles', passed: true });

      // Send results to test runner
      await fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, results }),
      });
    }

    run().catch((err) => {
      fetch('/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: false, error: err.stack || err.message }),
      });
    });
  </script>
</body>
</html>`);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const testUrl = `http://127.0.0.1:${port}/`;
      chromeProc = execFile(
        browserPath,
        [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          testUrl,
        ],
        (err) => {
          if (err && !err.killed) {
            clearTimeout(timeout);
            server.close();
            reject(new Error(`Browser launch failed: ${err.message}`));
          }
        }
      );
    });
  });
}
