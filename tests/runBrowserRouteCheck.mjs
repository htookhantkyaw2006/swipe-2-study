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

export async function runBrowserRouteVerification() {
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
      if (req.url === '/src/lib/safeReturnPath.js' || req.url === '/safeReturnPath.js') {
        const filePath = path.resolve(__dirname, '../src/lib/safeReturnPath.js');
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
              console.log('✓ Real Browser Route & Navigation Defense Verification Passed:');
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

      // Serve test HTML
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Browser Route Readiness Verification</title></head>
<body>
  <h1>Running Real Browser Navigation Defense Verification...</h1>
  <script type="module">
    import { safeReturnPath } from '/src/lib/safeReturnPath.js';

    async function run() {
      const results = [];
      function assert(cond, msg) { if (!cond) throw new Error(msg); }

      // 1. Safe internal paths
      assert(safeReturnPath('/') === '/', 'Root path');
      assert(safeReturnPath('/profile') === '/profile', 'Profile path');
      assert(safeReturnPath('/profile/edit') === '/profile/edit', 'Edit profile path');
      assert(safeReturnPath('/library?sort=alphabetical#cards') === '/library?sort=alphabetical#cards', 'Complex query/hash path');
      results.push({ test: 'safe-internal-paths', passed: true });

      // 2. Open redirect & protocol-relative attack rejection in real browser DOM
      const attacks = [
        'https://attacker.example.com',
        'http://attacker.example.com/steal-session',
        '//attacker.example.com',
        '///attacker.example.com',
        '/\\\\attacker.example.com',
        '/%5cattacker.example.com',
        '/%5Cattacker.example.com',
        '/%2f/attacker.example.com',
        '/%2F%2Fattacker.example.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)<\\/script>',
        '/\\t/evil.example',
        '/%00/evil.example',
      ];
      for (const atk of attacks) {
        const res = safeReturnPath(atk);
        assert(res === '/', 'Attack "' + atk + '" must resolve to "/" but got: ' + res);
      }
      results.push({ test: 'real-browser-open-redirect-defense', passed: true, attacksChecked: attacks.length });

      // 3. Auth loop prevention in real browser
      const loops = [
        '/login',
        '/LOGIN',
        '/login/',
        '/login?returnTo=%2Fprofile',
        '/signup',
        '/auth/callback',
        '/verify-email',
        '/forgot-password',
        '/reset-password',
      ];
      for (const loop of loops) {
        const res = safeReturnPath(loop);
        assert(res === '/', 'Auth loop "' + loop + '" must resolve to "/" but got: ' + res);
      }
      results.push({ test: 'real-browser-auth-loop-prevention', passed: true, loopsChecked: loops.length });

      // 4. Custom fallback in real browser
      assert(safeReturnPath('/login', '/profile') === '/profile', 'Custom fallback works');
      assert(safeReturnPath('https://evil.com', '/saved') === '/saved', 'Custom fallback on attack');
      assert(safeReturnPath('/login', '/signup') === '/', 'Auth fallback safely defaults to /');
      results.push({ test: 'custom-safe-fallback', passed: true });

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

// Allow direct CLI invocation: node tests/runBrowserRouteCheck.mjs
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserRouteVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
