import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

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

  // Start Vite dev server to transform JSX, React, and CSS for real Chrome browser
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
      reject(new Error('Browser published content verification timed out after 15 seconds.'));
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
              console.log('✓ Real Browser Published Content & Route Verification Passed:');
              for (const r of report.results) {
                console.log(`    - ${r.test}: ${JSON.stringify(r)}`);
              }
              resolve({ passed: true, results: report.results });
            } else {
              console.error('✗ Real Browser Published Content Verification Failed:', report.error);
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

      // Serve HTML runner transformed by Vite
      if (req.url === '/tests/helpers/publishedContent/browserRunner.html' || req.url === '/') {
        const filePath = path.resolve(__dirname, 'helpers/publishedContent/browserRunner.html');
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
      const targetUrl = `http://127.0.0.1:${port}/tests/helpers/publishedContent/browserRunner.html`;

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
