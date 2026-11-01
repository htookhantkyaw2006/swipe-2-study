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

export const OUTPUT_DIR =
  process.env.SCREENSHOT_DIR ||
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

export async function runVisualBatch3Verification() {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!browserPath) {
    console.warn('[BROWSER_CHECK_SKIPPED] No real browser executable (Chrome/Edge) found on host.');
    return { skipped: true, reason: 'No browser installed on host' };
  }

  const csvPath = path.resolve(ROOT_DIR, 'tools/content-csv/data/HSK1_Swipe2Study_import.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCsv(csvContent);
  const rawItems = mapCsvRowsToItems(parsed.rows);
  const hsk1Items = rawItems.map((item, index) =>
    mapVocabularyToCard(item, { language: 'zh', level_id: 'HSK1' }, index)
  );

  const viteServer = await createViteServer({
    define: {
      'import.meta.env.VITE_GOOGLE_AUTH_ENABLED': JSON.stringify('true'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://staging-project.supabase.co'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_staging_key_1234567890'),
    },
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
      try {
        await viteServer.close();
      } catch {}
    };

    const overallTimeout = setTimeout(async () => {
      await cleanup();
      reject(new Error('Batch 3 visual verification runner timed out after 90 seconds.'));
    }, 90000);

    viteServer.middlewares.use((req, res, next) => {
      const url = req.url || '';

      if (url === '/api/hsk1-items') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hsk1Items));
        return;
      }

      if (url === '/capture-metrics' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
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
        const CAPTURES = [
          {
            width: 375,
            height: 667,
            route: '/',
            page: 'home',
            name: 'home-course-hero-375w.png',
            desc: 'Home and Course Hero (Mobile 375w)',
            mobile: true,
          },
          {
            width: 375,
            height: 667,
            route: '/learn',
            page: 'levels',
            name: 'hsk-grid-375w.png',
            desc: 'HSK Grid Selection Cards (Mobile 375w)',
            mobile: true,
          },
          {
            width: 1024,
            height: 800,
            route: '/learn',
            page: 'levels',
            name: 'hsk-grid-1024w.png',
            desc: 'HSK Grid 3x3 Selection Cards (Desktop 1024w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/learn/level/HSK1',
            page: 'course-overview',
            name: 'course-overview-375w.png',
            desc: 'HSK 1 Course Overview (Mobile 375w)',
            mobile: true,
          },
          {
            width: 1024,
            height: 800,
            route: '/library',
            page: 'library',
            name: 'library-desktop-1024w.png',
            desc: 'Library Overview & Tools (Desktop 1024w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/library',
            page: 'library',
            name: 'library-mobile-375w.png',
            desc: 'Library Overview & Tools (Mobile 375w)',
            mobile: true,
          },
          {
            width: 320,
            height: 640,
            route: '/library',
            page: 'library',
            name: 'library-mobile-320w.png',
            desc: 'Library Narrow Check (Mobile 320w)',
            mobile: true,
          },
          {
            width: 375,
            height: 667,
            route: '/library',
            page: 'library-scrolled-writing',
            name: 'library-scrolled-writing-375w.png',
            desc: 'Scrolled Library Showing Writing Entry (Mobile 375w)',
            mobile: true,
          },
          {
            width: 375,
            height: 667,
            route: '/library',
            page: 'bottom-clearance',
            name: 'bottom-clearance-375w.png',
            desc: 'Mobile Bottom Clearance above Navigation (Mobile 375w)',
            mobile: true,
          },
          {
            width: 1024,
            height: 800,
            route: '/login',
            page: 'login',
            name: 'login-desktop-1024w.png',
            desc: 'Login Card Desktop Outside Layout (Desktop 1024w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/login',
            page: 'login',
            name: 'login-mobile-375w.png',
            desc: 'Login Card on Mobile Outside Layout (Mobile 375w)',
            mobile: true,
          },
          {
            width: 1024,
            height: 800,
            route: '/profile',
            page: 'profile',
            name: 'profile-desktop-1024w.png',
            desc: 'Profile & Danger Session Group (Desktop 1024w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/profile',
            page: 'profile',
            name: 'profile-mobile-375w.png',
            desc: 'Profile & Danger Session Group (Mobile 375w)',
            mobile: true,
          },
          {
            width: 1440,
            height: 900,
            route: '/profile',
            page: 'profile',
            name: 'profile-desktop-1440w.png',
            desc: 'Profile Layout Wide (Desktop 1440w)',
            mobile: false,
          },
          {
            width: 1024,
            height: 800,
            route: '/settings',
            page: 'settings',
            name: 'settings-desktop-1024w.png',
            desc: 'Settings Subpage & Groups (Desktop 1024w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/settings',
            page: 'settings',
            name: 'settings-mobile-375w.png',
            desc: 'Settings Subpage (Mobile 375w)',
            mobile: true,
          },
          {
            width: 768,
            height: 900,
            route: '/learn/session?level=HSK1',
            page: 'flashcard-back',
            name: 'flashcard-back-readability-768w.png',
            desc: 'Flashcard Back Readability & Examples (Tablet 768w)',
            mobile: false,
          },
          {
            width: 375,
            height: 667,
            route: '/saved',
            page: 'saved-collection',
            name: 'collection-mobile-readability-375w.png',
            desc: 'Mobile Collection Rows Side-by-Side Actions (Mobile 375w)',
            mobile: true,
          },
        ];

        const screenshots = [];
        const captureMetricsList = [];

        console.log('\n✓ Executing Batch 3 Deterministic Visual Captures with Exact Viewport Emulation:');
        for (const c of CAPTURES) {
          const outPath = path.join(OUTPUT_DIR, c.name);
          const captureUrl = `http://127.0.0.1:${port}/capture?mode=capture&route=${encodeURIComponent(
            c.route
          )}&page=${c.page}&width=${c.width}`;

          let captureMetricPromise = new Promise((resMetric, rejMetric) => {
            const metricTimeout = setTimeout(() => {
              rejMetric(new Error(`Timeout waiting for pre-capture metrics on ${c.desc} (${c.width}px)`));
            }, 12000);

            onMetrics = (data) => {
              clearTimeout(metricTimeout);
              resMetric(data);
            };
          });

          let metrics = null;
          let screenshotBase64 = null;

          const cdpPort = await getFreePort();
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-cdp-b3-'));
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
              let evalHoverId = null;
              let evalHoverStylesId = null;
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
                  if (data.id === setMetricsId) {
                    if (data.error) {
                      clearTimeout(wsTimeout);
                      ws.close();
                      return rejWs(
                        new Error(`Emulation.setDeviceMetricsOverride failed: ${data.error.message}`)
                      );
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

                    evalHoverId = send('Runtime.evaluate', {
                      expression: `(() => {
                        const el = document.querySelector('.collection-hero__action') || document.querySelector('.auth-submit') || document.querySelector('.btn-primary') || document.querySelector('.course-study-button');
                        if (!el) return null;
                        const r = el.getBoundingClientRect();
                        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                      })()`,
                      returnByValue: true,
                    });
                  } else if (data.id === evalHoverId) {
                    const coords = data.result?.result?.value;
                    if (coords && coords.x && coords.y) {
                      send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved',
                        x: Math.round(coords.x),
                        y: Math.round(coords.y),
                      });
                      await new Promise((r) => setTimeout(r, 80));
                      evalHoverStylesId = send('Runtime.evaluate', {
                        expression: `(() => {
                          const el = document.querySelector('.collection-hero__action') || document.querySelector('.auth-submit') || document.querySelector('.btn-primary') || document.querySelector('.course-study-button');
                          if (!el) return null;
                          const s = window.getComputedStyle(el);
                          return {
                            color: s.color,
                            backgroundColor: s.backgroundColor,
                            backgroundImage: s.backgroundImage,
                          };
                        })()`,
                        returnByValue: true,
                      });
                    } else {
                      await new Promise((r) => setTimeout(r, 120));
                      screenshotId = send('Page.captureScreenshot', { format: 'png' });
                    }
                  } else if (data.id === evalHoverStylesId) {
                    if (metrics && data.result?.result?.value) {
                      metrics.cdpHoverStyles = data.result.result.value;
                    }
                    await new Promise((r) => setTimeout(r, 120));
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
                } catch (e) {
                  clearTimeout(wsTimeout);
                  ws.close();
                  rejWs(e);
                }
              };

              ws.onerror = (e) => {
                clearTimeout(wsTimeout);
                rejWs(e);
              };
            });
          } finally {
            if (chromeProc) {
              try {
                chromeProc.kill();
              } catch {}
            }
            try {
              fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}
          }

          if (metrics && screenshotBase64) {
            const widthDiff = Math.abs(metrics.measuredWidth - c.width);
            if (widthDiff > 1) {
              throw new Error(
                `Exact viewport requirement violated for ${c.desc}: requested=${c.width}px, measured=${metrics.measuredWidth}px`
              );
            }
            if (metrics.hasHorizontalOverflow) {
              throw new Error(
                `Horizontal overflow detected on ${c.desc}: scrollWidth=${metrics.scrollWidth}px > measuredWidth=${metrics.measuredWidth}px. Overflowing elements: ${JSON.stringify(metrics.overflowElements)}`
              );
            }

            fs.writeFileSync(outPath, Buffer.from(screenshotBase64, 'base64'));
            const fileSize = fs.statSync(outPath).size;

            console.log(
              `    - ${c.desc} [requested=${c.width}px, measured=${metrics.measuredWidth}px]: verified (overflow=none) -> ${outPath} (${fileSize} bytes)`
            );
            if (metrics.navClearance) {
              console.log(
                `      nav clearance: hasFixedNav=${metrics.navClearance.hasFixedNav}, paddingBottom=${metrics.navClearance.paddingBottom}px, clearsNav=${metrics.navClearance.clearsNav}`
              );
            }
            if (metrics.interactiveHover) {
              console.log(
                `      interactive hover: normal=${metrics.interactiveHover.normalBg}, hover=${metrics.interactiveHover.hoverBg}`
              );
            }

            screenshots.push(outPath);
            captureMetricsList.push(metrics);
          } else {
            throw new Error(`Failed to capture screenshot or retrieve metrics for ${c.desc}`);
          }
        }

        clearTimeout(overallTimeout);
        await cleanup();
        resolve({
          passed: true,
          captures: screenshots,
          metrics: captureMetricsList,
        });
      } catch (err) {
        clearTimeout(overallTimeout);
        await cleanup();
        reject(err);
      }
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runVisualBatch3Verification()
    .then(() => {
      console.log('\n✓ All Batch 3 Visual Captures Completed Successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n✗ Batch 3 Visual Captures Failed:', err);
      process.exit(1);
    });
}
