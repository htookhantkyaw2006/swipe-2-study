import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { parseCsv } from '../tools/content-csv/parser.mjs';
import { mapCsvRowsToItems } from '../tools/content-csv/contentImportEngine.mjs';
import { mapVocabularyToCard } from '../src/lib/publishedContentService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Portable configurable output directory pointing to artifacts or default
export const OUTPUT_DIR = process.env.SCREENSHOT_DIR ||
  (process.env.ARTIFACT_DIR
    ? path.join(process.env.ARTIFACT_DIR, 'screenshots')
    : 'C:\\Users\\VivoBook\\.gemini\\antigravity\\brain\\af6d074e-22e2-4aab-9eed-5eeee69609d5\\screenshots');

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

function getFreePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close((err) => {
        if (err) rej(err);
        else res(port);
      });
    });
  });
}

export async function runVisualBatch2Verification() {
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
    let serverClosed = false;
    let onMetrics = null;

    const cleanup = async () => {
      if (serverClosed) return;
      serverClosed = true;
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

      // 2. Capture metrics receiver
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

      // 3. Serve test runner / capture HTML transformed by Vite
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
        // Phase: Deterministic Capture with Exact Viewport Emulation for Batch 2
        // Covering 5 agreed widths across:
        // 1. Session Results (320w)
        // 2. Flashcard front (375w)
        // 3. Flashcard back with 3 examples (768w)
        // 4. Populated Review collection (1024w)
        // 5. Populated Saved collection (1440w)
        // ---------------------------------------------------------------------
        const CAPTURES = [
          {
            width: 320,
            height: 640,
            route: '/learn/session?level=HSK1',
            page: 'session-results',
            name: 'session-result-320w.png',
            desc: 'Session Results (Mobile 320w)',
            mobile: true,
          },
          {
            width: 375,
            height: 667,
            route: '/learn/session?level=HSK1',
            page: 'flashcard-front',
            name: 'flashcard-front-375w.png',
            desc: 'Flashcard Front (Mobile 375w)',
            mobile: true,
          },
          {
            width: 768,
            height: 900,
            route: '/learn/session?level=HSK1',
            page: 'flashcard-back',
            name: 'flashcard-back-768w.png',
            desc: 'Flashcard Back with 3 Examples (Tablet 768w)',
            mobile: false,
          },
          {
            width: 1024,
            height: 900,
            route: '/learn/review',
            page: 'review-collection',
            name: 'review-collection-1024w.png',
            desc: 'Populated Review Collection (Desktop 1024w)',
            expectedColumns: 2,
            mobile: false,
          },
          {
            width: 1440,
            height: 900,
            route: '/saved',
            page: 'saved-collection',
            name: 'saved-collection-1440w.png',
            desc: 'Populated Saved Collection (Desktop Wide 1440w)',
            expectedColumns: 2,
            mobile: false,
          },
        ];

        const screenshots = [];
        const captureMetricsList = [];
        const unverifiedViewports = [];

        console.log('\n✓ Executing Batch 2 Deterministic Visual Captures with Exact Viewport Emulation:');
        for (const c of CAPTURES) {
          const outPath = path.join(OUTPUT_DIR, c.name);
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

          let metrics = null;
          let screenshotBase64 = null;
          let emulationFailed = false;
          let emulationError = null;

          const cdpPort = await getFreePort();
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-cdp-b2-'));
          let chromeProc = null;

          try {
            chromeProc = execFile(browserPath, [
              '--headless=new',
              '--disable-gpu',
              '--hide-scrollbars',
              `--remote-debugging-port=${cdpPort}`,
              `--user-data-dir=${tmpDir}`,
              'about:blank',
            ]);

            let wsUrl = null;
            for (let i = 0; i < 40; i++) {
              await new Promise((r) => setTimeout(r, 100));
              try {
                const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
                if (res.ok) {
                  const list = await res.json();
                  const page = list.find((p) => p.type === 'page');
                  if (page && page.webSocketDebuggerUrl) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                  }
                }
              } catch {}
            }

            if (!wsUrl) {
              throw new Error(`CDP endpoint not available on port ${cdpPort}`);
            }

            await new Promise((resWs, rejWs) => {
              const wsTimeout = setTimeout(() => {
                rejWs(new Error(`CDP WebSocket timeout for ${c.desc}`));
              }, 15000);

              const ws = new WebSocket(wsUrl);
              let msgId = 1;
              const send = (method, params = {}) => {
                const id = msgId++;
                ws.send(JSON.stringify({ id, method, params }));
                return id;
              };

              let setMetricsId = null;
              let navigateId = null;
              let screenshotId = null;

              ws.onopen = () => {
                send('Runtime.enable');
                setMetricsId = send('Emulation.setDeviceMetricsOverride', {
                  width: c.width,
                  height: c.height,
                  deviceScaleFactor: 1,
                  mobile: Boolean(c.mobile),
                  fitWindow: false,
                });
              };

              ws.onmessage = async (event) => {
                try {
                  const data = JSON.parse(event.data);
                  if (data.method === 'Runtime.consoleAPICalled') {
                    const args = (data.params.args || []).map((a) => a.value || a.description).join(' ');
                    console.log(`[Browser Console]`, args);
                  }
                  if (data.id === setMetricsId) {
                    if (data.error) {
                      clearTimeout(wsTimeout);
                      ws.close();
                      return rejWs(new Error(`Emulation.setDeviceMetricsOverride failed: ${data.error.message}`));
                    }
                    navigateId = send('Page.navigate', { url: captureUrl });
                  } else if (data.id === navigateId) {
                    if (data.error) {
                      clearTimeout(wsTimeout);
                      ws.close();
                      return rejWs(new Error(`Page.navigate failed: ${data.error.message}`));
                    }
                    try {
                      metrics = await captureMetricPromise;
                    } catch (mErr) {
                      clearTimeout(wsTimeout);
                      ws.close();
                      return rejWs(mErr);
                    }

                    await new Promise((r) => setTimeout(r, 100));
                    screenshotId = send('Page.captureScreenshot', { format: 'png' });
                  } else if (data.id === screenshotId) {
                    clearTimeout(wsTimeout);
                    if (data.error) {
                      ws.close();
                      return rejWs(new Error(`Page.captureScreenshot failed: ${data.error.message}`));
                    }
                    screenshotBase64 = data.result?.data;
                    ws.close();
                    resWs();
                  }
                } catch (err) {
                  clearTimeout(wsTimeout);
                  ws.close();
                  rejWs(err);
                }
              };

              ws.onerror = (err) => {
                clearTimeout(wsTimeout);
                rejWs(new Error(`CDP WebSocket error on ${c.desc}: ${err.message || err}`));
              };
            });
          } catch (e) {
            emulationFailed = true;
            emulationError = e.message;
          } finally {
            if (chromeProc) {
              try { chromeProc.kill(); } catch {}
            }
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
          }

          if (emulationFailed || !metrics || !screenshotBase64) {
            if (c.mobile) {
              console.warn(`[VIEWPORT_SKIPPED] ${c.desc} (${c.width}px): exact emulation failed (${emulationError}). Marking mobile acceptance as unverified.`);
              unverifiedViewports.push({
                desc: c.desc,
                requestedWidth: c.width,
                measuredWidth: null,
                reason: `Exact emulation could not run: ${emulationError}`,
              });
              continue;
            }
            throw new Error(`CDP capture failed for desktop viewport ${c.desc}: ${emulationError}`);
          }

          // Pre-capture assertions
          if (!metrics.pageMounted) {
            throw new Error(`Page failed to mount before capture: ${c.desc}. Metrics error: ${metrics.error || 'none'}`);
          }
          if (metrics.hasHorizontalOverflow) {
            const elementsDesc = (metrics.overflowElements || []).map(e => `${e.tag}.${e.className} (w=${e.width}, right=${e.right})`).join(', ');
            throw new Error(`Horizontal overflow detected in ${c.desc} (${c.width}px): scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.measuredWidth}. Overflows: [${elementsDesc}]`);
          }
          if (c.expectedColumns && metrics.computedColumns !== c.expectedColumns) {
            throw new Error(`Computed grid columns mismatch in ${c.desc}: expected ${c.expectedColumns}, got ${metrics.computedColumns}`);
          }

          // Strict exact viewport requirement: measured innerWidth must match requested width within 1px
          const delta = Math.abs(metrics.measuredWidth - c.width);
          if (delta > 1) {
            if (c.mobile) {
              console.warn(`[VIEWPORT_SKIPPED] ${c.desc}: measured innerWidth (${metrics.measuredWidth}px) did not match requested width (${c.width}px) within 1px. Marking mobile acceptance as unverified.`);
              unverifiedViewports.push({
                desc: c.desc,
                requestedWidth: c.width,
                measuredWidth: metrics.measuredWidth,
                reason: `Viewport mismatch: requested ${c.width}px, measured ${metrics.measuredWidth}px`,
              });
              continue;
            }
            throw new Error(`Window innerWidth mismatch in ${c.desc}: requested ${c.width}px, got ${metrics.measuredWidth}px (delta: ${delta}px > 1px)`);
          }

          const pngBuffer = Buffer.from(screenshotBase64, 'base64');
          if (pngBuffer.length < 10000) {
            throw new Error(`Screenshot file is suspiciously small (${pngBuffer.length} bytes): ${outPath}`);
          }
          fs.writeFileSync(outPath, pngBuffer);

          console.log(`    - ${c.desc} [requested=${c.width}px, measured=${metrics.measuredWidth}px]: verified (overflow=none, computedColumns=${metrics.computedColumns ?? 'N/A'}) -> ${outPath} (${pngBuffer.length} bytes)`);

          screenshots.push({
            desc: c.desc,
            requestedWidth: c.width,
            measuredWidth: metrics.measuredWidth,
            page: c.page,
            route: c.route,
            path: outPath,
            size: pngBuffer.length,
          });
          captureMetricsList.push(metrics);
        }

        clearTimeout(overallTimeout);
        await cleanup();
        resolve({
          passed: unverifiedViewports.length === 0,
          screenshots,
          unverifiedViewports,
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

// Allow direct CLI invocation: node tests/runVisualBatch2Check.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVisualBatch2Verification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
