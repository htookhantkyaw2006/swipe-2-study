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

// Portable configurable output directory outside tracked source
export const OUTPUT_DIR = process.env.SCREENSHOT_DIR ||
  (process.env.ARTIFACT_DIR
    ? path.join(process.env.ARTIFACT_DIR, 'screenshots')
    : path.resolve(ROOT_DIR, '..', '.visual-batch1-screenshots'));

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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
    let activeChromeProc = null;
    let serverClosed = false;
    let onReport = null;
    let onMetrics = null;

    const cleanup = async () => {
      if (serverClosed) return;
      serverClosed = true;
      if (activeChromeProc) {
        try { activeChromeProc.kill(); } catch {}
      }
      try { await viteServer.close(); } catch {}
    };

    const overallTimeout = setTimeout(async () => {
      await cleanup();
      reject(new Error('Visual verification runner timed out after 60 seconds.'));
    }, 60000);

    viteServer.middlewares.use((req, res, next) => {
      const url = req.url || '';

      // 1. Endpoint serving approved 300 HSK 1 items
      if (url === '/api/hsk1-items') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hsk1Items));
        return;
      }

      // 2. Report receiver for interaction tests
      if (url === '/report' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          try {
            const report = JSON.parse(body);
            if (onReport) onReport(report);
          } catch (e) {
            if (onReport) onReport({ success: false, error: e.message });
          }
        });
        return;
      }

      // 3. Capture metrics receiver
      if (url === '/capture-metrics' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          try {
            const metrics = JSON.parse(body);
            if (onMetrics) onMetrics(metrics);
          } catch (e) {
            if (onMetrics) onMetrics({ success: false, error: e.message });
          }
        });
        return;
      }

      // 4. Serve test runner / capture HTML transformed by Vite
      // Handles both /tests/helpers/visualBatch1/browserRunner.html AND / AND /capture
      if (
        url.startsWith('/tests/helpers/visualBatch1/browserRunner.html') ||
        url === '/' ||
        url.startsWith('/capture') ||
        url.startsWith('/?')
      ) {
        const runnerHtmlPath = path.resolve(__dirname, 'helpers/visualBatch1/browserRunner.html');
        fs.readFile(runnerHtmlPath, 'utf8', async (err, content) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(err.message);
            return;
          }
          try {
            const transformed = await viteServer.transformIndexHtml(url, content);
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

    viteServer.listen().then(async () => {
      const port = viteServer.httpServer.address().port;

      try {
        // ---------------------------------------------------------------------
        // Phase 1: Functional Interaction & Production Component Verification
        // ---------------------------------------------------------------------
        const interactionUrl = `http://127.0.0.1:${port}/tests/helpers/visualBatch1/browserRunner.html?mode=test`;

        const report = await new Promise((resReport, rejReport) => {
          onReport = (data) => resReport(data);

          activeChromeProc = execFile(browserPath, [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-extensions',
            '--disable-background-networking',
            interactionUrl,
          ], (err) => {
            if (err && !err.killed && !serverClosed) {
              rejReport(new Error(`Interaction test browser exited prematurely: ${err.message}`));
            }
          });
        });

        if (activeChromeProc) {
          try { activeChromeProc.kill(); } catch {}
          activeChromeProc = null;
        }

        if (!report.success) {
          throw new Error(`Visual browser test failed: ${report.error}`);
        }

        console.log('✓ Batch 1 Interaction & Production Component Verification Passed:');
        for (const r of report.results) {
          console.log(`    - ${r.test}: passed`);
        }

        // ---------------------------------------------------------------------
        // Phase 2: Deterministic Capture & Pre-Capture Verification
        // Covering 5 agreed widths across Home, Level selection, and HSK 1 overview
        // ---------------------------------------------------------------------
        const CAPTURES = [
          {
            width: 1440,
            height: 900,
            route: '/',
            page: 'home',
            name: 'home-1440w.png',
            alias: 'hsk-card-1440w.png',
            desc: 'Home (Desktop wide)',
          },
          {
            width: 1024,
            height: 900,
            route: '/learn',
            page: 'levels',
            name: 'level-selection-1024w.png',
            alias: 'hsk-card-1024w.png',
            desc: 'Level selection (Desktop 3-column grid)',
            expectedColumns: 3,
          },
          {
            width: 768,
            height: 900,
            route: '/learn',
            page: 'levels',
            name: 'level-selection-768w.png',
            alias: 'hsk-card-768w.png',
            desc: 'Level selection (Tablet)',
          },
          {
            width: 375,
            height: 900,
            route: '/',
            page: 'home',
            name: 'home-375w.png',
            alias: 'hsk-card-375w.png',
            desc: 'Home (Mobile standard)',
          },
          {
            width: 320,
            height: 900,
            route: '/learn/level/HSK1',
            page: 'course-overview',
            name: 'hsk1-overview-320w.png',
            alias: 'hsk-card-320w.png',
            desc: 'HSK1 course overview (Mobile small)',
          },
        ];

        const screenshots = [];
        const captureMetricsList = [];

        console.log('\n✓ Executing Deterministic Visual Captures with Layout Verification:');
        for (const c of CAPTURES) {
          const outPath = path.join(OUTPUT_DIR, c.name);
          const aliasPath = path.join(OUTPUT_DIR, c.alias);

          const captureUrl = `http://127.0.0.1:${port}/capture?mode=capture&route=${encodeURIComponent(c.route)}&page=${c.page}&width=${c.width}`;

          let captureMetricPromise = new Promise((resMetric, rejMetric) => {
            const metricTimeout = setTimeout(() => {
              rejMetric(new Error(`Timeout waiting for pre-capture metrics on ${c.desc} (${c.width}px)`));
            }, 10000);

            onMetrics = (data) => {
              clearTimeout(metricTimeout);
              resMetric(data);
            };
          });

          await new Promise((resCapture, rejCapture) => {
            const args = [
              '--headless=new',
              '--disable-gpu',
              '--hide-scrollbars',
              `--window-size=${c.width},${c.height}`,
              '--virtual-time-budget=2500',
              `--screenshot=${outPath}`,
              captureUrl,
            ];

            const proc = execFile(browserPath, args, (err) => {
              if (err && !err.killed) {
                return rejCapture(new Error(`Chrome failed during capture of ${c.desc}: ${err.message}`));
              }
              resCapture();
            });
            activeChromeProc = proc;
          });

          if (activeChromeProc) {
            try { activeChromeProc.kill(); } catch {}
            activeChromeProc = null;
          }

          const metrics = await captureMetricPromise;
          if (!metrics.success) {
            throw new Error(`Pre-capture verification failed for ${c.desc}: ${metrics.error}`);
          }

          // Pre-capture assertions
          if (!metrics.pageMounted) {
            throw new Error(`Page failed to mount before capture: ${c.desc}`);
          }
          if (metrics.hasHorizontalOverflow) {
            const elementsDesc = (metrics.overflowElements || []).map(e => `${e.tag}.${e.className} (w=${e.width}, right=${e.right})`).join(', ');
            throw new Error(`Horizontal overflow detected in ${c.desc} (${c.width}px): scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.measuredWidth}. Overflows: [${elementsDesc}]`);
          }
          if (c.expectedColumns && metrics.computedColumns !== c.expectedColumns) {
            throw new Error(`Computed grid columns mismatch in ${c.desc}: expected ${c.expectedColumns}, got ${metrics.computedColumns}`);
          }
          // Record actual window.innerWidth and verify viewport bounds
          // Note: On Windows OS, Chromium's Win32 host window has an OS-level minimum width (~504-522px)
          const isClampedByOs = c.width < 500 && metrics.measuredWidth >= c.width && metrics.measuredWidth <= 525;
          const targetDelta = Math.abs(metrics.measuredWidth - c.width);
          if (!isClampedByOs && targetDelta > 30 && (!metrics.outerWidth || Math.abs(metrics.outerWidth - c.width) > 2)) {
            throw new Error(`Window innerWidth mismatch in ${c.desc}: expected ${c.width}, got innerWidth=${metrics.measuredWidth}, outerWidth=${metrics.outerWidth}`);
          }

          // Verify screenshot PNG was successfully written and is not empty / 404
          if (!fs.existsSync(outPath)) {
            throw new Error(`Screenshot file was not created: ${outPath}`);
          }
          const stat = fs.statSync(outPath);
          if (stat.size < 10000) {
            throw new Error(`Screenshot file is suspiciously small (${stat.size} bytes, possibly blank or 404): ${outPath}`);
          }

          // Also write alias file for backwards-compatible reference
          try {
            fs.copyFileSync(outPath, aliasPath);
          } catch {}

          console.log(`    - ${c.desc} [${c.width}px]: verified (innerWidth=${metrics.measuredWidth}, overflow=none, computedColumns=${metrics.computedColumns ?? 'N/A'}) -> ${outPath} (${stat.size} bytes)`);

          screenshots.push({
            width: c.width,
            page: c.page,
            route: c.route,
            path: outPath,
            size: stat.size,
          });
          captureMetricsList.push(metrics);
        }

        clearTimeout(overallTimeout);
        await cleanup();
        resolve({
          passed: true,
          results: report.results,
          screenshots,
          metrics: captureMetricsList,
          outputDir: OUTPUT_DIR,
        });
      } catch (err) {
        clearTimeout(overallTimeout);
        await cleanup();
        reject(err);
      }
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
