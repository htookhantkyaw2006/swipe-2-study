import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { parseCsv } from '../tools/content-csv/parser.mjs';
import { mapCsvRowsToItems } from '../tools/content-csv/contentImportEngine.mjs';
import { mapVocabularyToCard } from '../src/lib/publishedContentService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const ARTIFACT_DIR = 'C:/Users/VivoBook/.gemini/antigravity/brain/af6d074e-22e2-4aab-9eed-5eeee69609d5';
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

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

export async function runVisualBatch1Verification() {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!browserPath) {
    console.warn('[BROWSER_CHECK_SKIPPED] No real browser executable (Chrome/Edge) found on host.');
    return { skipped: true, reason: 'No browser installed on host' };
  }

  // Load the approved 300 HSK1 items from the repository data and map to flashcard shape
  const csvPath = path.resolve(ROOT_DIR, 'tools/content-csv/data/HSK1_Swipe2Study_import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(csvContent);
  const rawItems = mapCsvRowsToItems(parsed.rows);
  const hsk1Items = rawItems.map((item, index) => mapVocabularyToCard(item, { language: 'zh', level_id: 'HSK1' }, index));

  const viteServer = await createViteServer({
    server: { port: 0, hmr: false, ws: false, host: '127.0.0.1' },
    appType: 'custom',
    root: ROOT_DIR,
  });

  return new Promise((resolve, reject) => {
    let chromeProc = null;
    let serverClosed = false;

    const cleanup = async () => {
      if (serverClosed) return;
      serverClosed = true;
      if (chromeProc) {
        try { chromeProc.kill(); } catch {}
      }
      try { await viteServer.close(); } catch {}
    };

    const timeout = setTimeout(async () => {
      await cleanup();
      reject(new Error('Visual verification runner timed out after 30 seconds.'));
    }, 30000);

    viteServer.middlewares.use((req, res, next) => {
      // 1. Endpoint serving approved 300 HSK 1 items
      if (req.url === '/api/hsk1-items') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hsk1Items));
        return;
      }

      // 2. Report receiver
      if (req.url === '/report' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');

          try {
            const report = JSON.parse(body);
            if (!report.success) {
              clearTimeout(timeout);
              await cleanup();
              reject(new Error(`Visual browser test failed: ${report.error}`));
              return;
            }

            console.log('✓ Batch 1 Interaction & Production Component Verification Passed:');
            for (const r of report.results) {
              console.log(`    - ${r.test}: passed`);
            }

            // After functional tests pass, capture screenshots at the required widths
            const port = viteServer.httpServer.address().port;
            const captureUrl = `http://127.0.0.1:${port}/`;
            const WIDTHS = [320, 375, 768, 1024, 1440];
            const screenshots = [];

            for (const w of WIDTHS) {
              const outPath = path.join(SCREENSHOT_DIR, `hsk-card-${w}w.png`);
              await new Promise((resCapture, rejCapture) => {
                const args = [
                  '--headless=new',
                  '--disable-gpu',
                  '--hide-scrollbars',
                  `--window-size=${w},900`,
                  `--screenshot=${outPath}`,
                  captureUrl,
                ];
                execFile(browserPath, args, (err) => {
                  if (err) return rejCapture(err);
                  const stat = fs.statSync(outPath);
                  console.log(`Saved screenshot at width ${w}px -> ${outPath} (${stat.size} bytes)`);
                  screenshots.push({ width: w, path: outPath, size: stat.size });
                  resCapture();
                });
              });
            }

            clearTimeout(timeout);
            await cleanup();
            resolve({ passed: true, results: report.results, screenshots });
          } catch (e) {
            clearTimeout(timeout);
            await cleanup();
            reject(e);
          }
        });
        return;
      }

      // 3. Serve test runner HTML
      if (req.url.startsWith('/tests/helpers/visualBatch1/browserRunner.html')) {
        const runnerHtmlPath = path.resolve(__dirname, 'helpers/visualBatch1/browserRunner.html');
        fs.readFile(runnerHtmlPath, 'utf8', async (err, content) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(err.message);
            return;
          }
          try {
            const transformed = await viteServer.transformIndexHtml(req.url, content);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(transformed);
          } catch (te) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(te.message);
          }
        });
        return;
      }

      next();
    });

    viteServer.listen().then(() => {
      const port = viteServer.httpServer.address().port;
      const targetUrl = `http://127.0.0.1:${port}/tests/helpers/visualBatch1/browserRunner.html`;

      chromeProc = execFile(browserPath, [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-extensions',
        '--disable-background-networking',
        targetUrl,
      ], (err) => {
        if (err && !err.killed && !serverClosed) {
          clearTimeout(timeout);
          cleanup().finally(() => reject(new Error(`Browser exited prematurely: ${err.message}`)));
        }
      });
    }).catch(async (err) => {
      clearTimeout(timeout);
      await cleanup();
      reject(err);
    });
  });
}

// Allow direct CLI invocation: node tests/runVisualBatch1Check.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVisualBatch1Verification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
