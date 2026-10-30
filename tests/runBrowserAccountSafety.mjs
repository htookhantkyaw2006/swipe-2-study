import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

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

export async function runBrowserAccountSafetyVerification() {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  if (!browserPath) {
    console.warn('[BROWSER_CHECK_SKIPPED] No real browser executable (Chrome/Edge) found on host.');
    return { skipped: true, reason: 'No browser installed on host' };
  }

  // Start Vite dev server to transform JSX and resolve ES modules in real browser
  const viteServer = await createViteServer({
    server: { port: 0, hmr: false, ws: false, host: '127.0.0.1' },
    appType: 'custom',
    root: path.resolve(__dirname, '..'),
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
      reject(new Error('Browser account safety verification timed out after 15 seconds.'));
    }, 15000);

    // Attach reporting middleware
    viteServer.middlewares.use((req, res, next) => {
      if (req.url === '/report' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          clearTimeout(timeout);
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          await cleanup();

          try {
            const report = JSON.parse(body);
            if (report.success) {
              console.log('✓ Real Browser Account Safety Verification Passed:');
              for (const r of report.results) {
                console.log(`    - ${r.test}: ${JSON.stringify(r)}`);
              }
              resolve({ passed: true, results: report.results });
            } else {
              console.error('✗ Real Browser Account Safety Verification Failed:', report.error);
              if (report.logs) {
                console.error('--- BROWSER LOGS ---');
                for (const l of report.logs) console.error(l);
                console.error('--------------------');
              }
              reject(new Error(report.error));
            }
          } catch (e) {
            reject(new Error(`Failed to parse browser report: ${e.message}`));
          }
        });
        return;
      }

      // Serve HTML test runner through Vite HTML transformation
      if (req.url === '/tests/helpers/accountSafety/browserRunner.html' || req.url === '/') {
        const filePath = path.resolve(__dirname, 'helpers/accountSafety/browserRunner.html');
        fs.readFile(filePath, 'utf8', async (err, content) => {
          if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(err.message);
            return;
          }
          try {
            const transformed = await viteServer.transformIndexHtml(req.url, content);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(transformed);
          } catch (transformErr) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(transformErr.message);
          }
        });
        return;
      }

      next();
    });

    viteServer.listen().then(() => {
      const address = viteServer.httpServer.address();
      const port = address.port;
      const targetUrl = `http://127.0.0.1:${port}/tests/helpers/accountSafety/browserRunner.html`;

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
          cleanup().finally(() => {
            reject(new Error(`Browser launch error: ${err.message}`));
          });
        }
      });

      chromeProc.stdout?.on('data', (d) => process.stdout.write('[CHROME] ' + d));
      chromeProc.stderr?.on('data', (d) => process.stderr.write('[CHROME ERR] ' + d));
    }).catch(async (listenErr) => {
      clearTimeout(timeout);
      await cleanup();
      reject(listenErr);
    });
  });
}

// Allow direct CLI invocation: node tests/runBrowserAccountSafety.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserAccountSafetyVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
