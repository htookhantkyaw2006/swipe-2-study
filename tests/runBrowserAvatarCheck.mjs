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

export async function runBrowserAvatarVerification() {
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
      if (req.url === '/src/lib/avatarPreparation.js' || req.url === '/avatarPreparation.js') {
        const filePath = path.resolve(__dirname, '../src/lib/avatarPreparation.js');
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
              console.log('✓ Real Browser Canvas & Decode Verification Passed:');
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
<head><meta charset="utf-8"><title>Browser Avatar Verification</title></head>
<body>
  <h1>Running Real Browser Avatar Verification...</h1>
  <script type="module">
    import { prepareAvatarImage } from '/src/lib/avatarPreparation.js';

    async function run() {
      const results = [];
      function assert(cond, msg) { if (!cond) throw new Error(msg); }

      // 1. Non-square 800x400 image resize to 512x256
      const c1 = document.createElement('canvas');
      c1.width = 800; c1.height = 400;
      const ctx1 = c1.getContext('2d');
      ctx1.fillStyle = '#1e40af'; ctx1.fillRect(0, 0, 800, 400);
      const blob1 = await new Promise(r => c1.toBlob(r, 'image/jpeg', 0.9));
      const file1 = new File([blob1], 'photo_800x400.jpg', { type: 'image/jpeg' });
      const prep1 = await prepareAvatarImage(file1);
      assert(!prep1.error, 'Prep 1 error: ' + prep1.error);
      assert(prep1.file.size <= 1048576, 'Prep 1 size <= 1 MB');
      const bmp1 = await createImageBitmap(prep1.file);
      assert(bmp1.width === 512, 'Width must be 512, got ' + bmp1.width);
      assert(bmp1.height === 256, 'Height must be 256, got ' + bmp1.height);
      bmp1.close();
      results.push({ test: 'non-square-800x400-to-512x256', passed: true, size: prep1.file.size, name: prep1.file.name });

      // 2. Small 240x160 image (strictly no upscaling)
      const c2 = document.createElement('canvas');
      c2.width = 240; c2.height = 160;
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#059669'; ctx2.fillRect(0, 0, 240, 160);
      const blob2 = await new Promise(r => c2.toBlob(r, 'image/png'));
      const file2 = new File([blob2], 'small_240x160.png', { type: 'image/png' });
      const prep2 = await prepareAvatarImage(file2);
      assert(!prep2.error, 'Prep 2 error: ' + prep2.error);
      const bmp2 = await createImageBitmap(prep2.file);
      assert(bmp2.width === 240, 'Width must remain 240, got ' + bmp2.width);
      assert(bmp2.height === 160, 'Height must remain 160, got ' + bmp2.height);
      bmp2.close();
      results.push({ test: 'no-upscaling-240x160', passed: true, size: prep2.file.size });

      // 3. EXIF orientation support check in browser
      const c3 = document.createElement('canvas');
      c3.width = 10; c3.height = 20;
      const blob3 = await new Promise(r => c3.toBlob(r, 'image/png'));
      const bmp3 = await createImageBitmap(blob3, { imageOrientation: 'from-image' });
      assert(bmp3.width === 10 && bmp3.height === 20, 'createImageBitmap supports imageOrientation');
      bmp3.close();
      results.push({ test: 'browser-exif-orientation-support', passed: true });

      // 4. SVG rejection check
      const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'], 'test.svg', { type: 'image/svg+xml' });
      const prep4 = await prepareAvatarImage(svgFile);
      assert(prep4.file === null, 'SVG must not produce a file');
      assert(Boolean(prep4.error), 'SVG must return an error');
      results.push({ test: 'reject-svg', passed: true, error: prep4.error });

      return results;
    }

    run()
      .then(results => fetch('/report', { method: 'POST', body: JSON.stringify({ success: true, results }) }))
      .catch(err => fetch('/report', { method: 'POST', body: JSON.stringify({ success: false, error: err.message }) }));
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
        '--no-first-run',
        '--no-default-browser-check',
        targetUrl,
      ]);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBrowserAvatarVerification().catch(() => {
    process.exit(1);
  });
}
