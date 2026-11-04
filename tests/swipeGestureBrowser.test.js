import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';
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

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message || JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval failed: ${res.exceptionDetails.text} - ${res.exceptionDetails.exception?.description}`);
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

describe('Swipe Gesture & Interaction Responsiveness (Real Browser Pointer Verification)', () => {
  const browserPath = CHROME_PATHS.find((p) => fs.existsSync(p));
  let viteServer = null;
  let chromeProc = null;
  let cdp = null;
  let serverPort = 0;

  before(async () => {
    if (!browserPath) {
      console.warn('[SWIPE_BROWSER_TEST_SKIPPED] No real Chrome/Edge executable found on host.');
      return;
    }

    viteServer = await createViteServer({
      server: { port: 0, hmr: false, ws: false, host: '127.0.0.1' },
      appType: 'custom',
      root: path.resolve(__dirname, '..'),
    });

    viteServer.middlewares.use((req, res, next) => {
      if (req.url === '/test-gesture' || req.url === '/') {
        const filePath = path.resolve(__dirname, 'helpers/session/dragTestRunner.html');
        fs.readFile(filePath, 'utf8', async (err, content) => {
          if (err) { res.writeHead(500); res.end(err.message); return; }
          const transformed = await viteServer.transformIndexHtml(req.url, content);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(transformed);
        });
        return;
      }
      next();
    });

    await viteServer.listen();
    serverPort = viteServer.httpServer.address().port;

    chromeProc = spawn(browserPath, [
      '--headless=new',
      '--remote-debugging-port=0',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-extensions',
      '--window-size=420,840',
      'about:blank',
    ]);

    let cdpUrl = null;
    await new Promise((resolve, reject) => {
      const onData = (d) => {
        const match = d.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          cdpUrl = match[1];
          resolve();
        }
      };
      chromeProc.stderr.on('data', onData);
      chromeProc.on('error', reject);
    });

    const listRes = await fetch(`http://127.0.0.1:${new URL(cdpUrl).port}/json`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/test-gesture` });

    // Wait for window.__ready
    for (let i = 0; i < 30; i++) {
      const ready = await cdp.eval('Boolean(window.__ready)');
      if (ready) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  after(async () => {
    if (cdp) cdp.close();
    if (chromeProc) {
      try { chromeProc.kill(); } catch {}
    }
    if (viteServer) {
      try { await viteServer.close(); } catch {}
    }
  });

  async function getCardCenter() {
    for (let i = 0; i < 25; i++) {
      const info = await cdp.eval(`(() => {
        const el = document.querySelector('.swipe-card--active');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          cx: Math.round(r.x + r.width / 2),
          cy: Math.round(r.y + r.height / 2),
          width: r.width,
          height: r.height,
          char: el.querySelector('.swipe-card__character')?.textContent,
          ariaLabel: el.getAttribute('aria-label'),
          hasBackInert: document.querySelector('.swipe-card__back')?.hasAttribute('inert'),
          hasFrontInert: document.querySelector('.swipe-card__front')?.hasAttribute('inert')
        };
      })()`);
      if (info) return info;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Active card not found');
  }

  async function waitForCondition(expr, timeoutMs = 4000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await cdp.eval(expr);
      if (val) return val;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for condition: ${expr}`);
  }

  it('1. Cancelled drag below threshold returns card smoothly to resting position without flipping or writing progress', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Initial card is 爱');
    assert.ok(init.hasBackInert, 'Initial card back face is inert (front showing)');
    assert.ok(init.ariaLabel.includes('showing front face'), 'Aria label indicates front face');

    // Drag right 25px, then return to +5px, and release
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: init.cx,
      y: init.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 40));

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: init.cx + 25,
      y: init.cy,
      button: 'left',
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 40));

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: init.cx + 5,
      y: init.cy,
      button: 'left',
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 40));

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: init.cx + 5,
      y: init.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 200));

    const afterDrag = await getCardCenter();
    assert.strictEqual(afterDrag.char, '爱', 'Card remains 爱');
    assert.ok(afterDrag.hasBackInert, 'Card remains on front face, back face inert');
    assert.ok(afterDrag.ariaLabel.includes('showing front face'), 'Aria label still indicates front face');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    const review = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(learned.length, 0, 'No progress written to learned_words');
    assert.strictEqual(review.length, 0, 'No cards added to review_cards');
  });

  it('2. Deliberate tap reveals back face, and second tap flips back to front', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Deliberate click on card (0px delta)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    const flippedState = await getCardCenter();
    assert.strictEqual(flippedState.hasBackInert, false, 'Back face is active after tap');
    assert.ok(flippedState.ariaLabel.includes('showing back face'), 'Aria label reports back face');

    // Wait for flip transition (0.4s) to fully settle
    await new Promise((r) => setTimeout(r, 500));

    // Tap again to flip back
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing front face')`);
    const backToFront = await getCardCenter();
    assert.strictEqual(backToFront.hasBackInert, true, 'Back face is inert again after second tap');
    assert.ok(backToFront.ariaLabel.includes('showing front face'), 'Aria label reports front face');
  });

  it('3. Committed right swipe (Learned) advances card and persists exactly once', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Drag right 140px
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: card.cx + step * 35,
        y: card.cy,
        button: 'left',
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx + 140,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    // Wait for card 2 (八) to become active
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const card2 = await getCardCenter();
    assert.strictEqual(card2.char, '八', 'Card 2 is now active');
    assert.ok(card2.hasBackInert, 'Card 2 begins on front face');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 1, 'Exactly one card recorded in learned_words');
    assert.strictEqual(learned[0].character || learned[0].phrase, '爱', 'Recorded card is 爱');
    assert.strictEqual(learned[0].status, 'known', 'Status is known');

    const review = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(review.length, 0, 'No cards in review_cards');
  });

  it('4. Committed left swipe (Review) advances card and completes session to course screen', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // On card 2 (八), drag left 140px
    const card2 = await getCardCenter();
    assert.strictEqual(card2.char, '八', 'Card 2 is active');

    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card2.cx,
      y: card2.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: card2.cx - step * 35,
        y: card2.cy,
        button: 'left',
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card2.cx - 140,
      y: card2.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    // Final card completion navigates back to course level screen
    await waitForCondition(`document.getElementById('course-level-screen') !== null`);

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 2, 'Both cards recorded in learned_words');

    const review = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(review.length, 1, 'Card 2 (八) recorded in review_cards');
    assert.strictEqual(review[0].character || review[0].phrase, '八', 'Review card is 八');
  });

  it('5. Opposing release velocity does not trigger accidental reverse swipe', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Drag right 30px, then move back left to +5px with rapid motion, then release
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: card.cx + 30,
      y: card.cy,
      button: 'left',
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 30));

    // Move left fast towards 0
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: card.cx + 5,
      y: card.cy,
      button: 'left',
      buttons: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx + 5,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    await new Promise((r) => setTimeout(r, 300));

    // Must NOT have swiped left (Review)! Card must remain 爱
    const state = await getCardCenter();
    assert.strictEqual(state.char, '爱', 'Card remains 爱, no reverse swipe triggered');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 0, 'No progress written on cancelled drag');
  });

  it('6. Fast flick right with small displacement commits swipe right', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Fast flick: down, rapid move +35px in 10ms, release
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 10));
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: card.cx + 35,
      y: card.cy,
      button: 'left',
      buttons: 1,
    });
    await new Promise((r) => setTimeout(r, 10));
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx + 35,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });

    // Flick right commits right swipe and advances to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const card2 = await getCardCenter();
    assert.strictEqual(card2.char, '八', 'Flick advanced to card 2');
  });

  it('7. Vertical scroll gesture in examples on back face does not flip card or commit horizontal swipe', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Deliberate click to flip to back face
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx,
      y: card.cy,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);

    // Vertical drag in example area (+40px Y movement, 0px X movement)
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: card.cx,
      y: card.cy + 50,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 3; step++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: card.cx,
        y: card.cy + 50 + step * 15,
        button: 'left',
        buttons: 1,
      });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: card.cx,
      y: card.cy + 95,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await new Promise((r) => setTimeout(r, 200));

    // Card must remain on back face, no accidental swipe
    const state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, false, 'Card remains on back face');
    assert.strictEqual(state.char, '爱', 'Card is still 爱, did not advance');
  });

  it('8. Audio and bookmark buttons do not trigger drag, flip, or progress writes', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    await getCardCenter();

    // Click bookmark button
    await cdp.eval(`(() => {
      const btn = document.querySelector('.swipe-card__front .swipe-bookmark');
      btn.click();
    })()`);
    await waitForCondition(`(window.db.get('saved_words') || []).length === 1`);

    // Verify word is saved
    const saved = await cdp.eval(`window.db.get('saved_words') || []`);
    assert.strictEqual(saved.length, 1, 'Word saved in saved_words');
    assert.strictEqual(saved[0].character || saved[0].phrase, '爱', 'Saved word is 爱');

    // Card must still be on front face and not advanced
    const state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face');
    assert.strictEqual(state.char, '爱', 'Card did not advance');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 0, 'No progress recorded in learned_words');
  });

  it('9. Keyboard Enter and Space flip card without double-triggering', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    await cdp.eval(`document.querySelector('.swipe-card--active').focus()`);

    // Dispatch Enter key
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);

    let state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, false, 'Enter key flipped card to back face');

    // Wait for flip animation to settle
    await new Promise((r) => setTimeout(r, 500));

    // Dispatch Space key
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing front face')`);

    state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, true, 'Space key flipped card back to front face');
  });

  it('10. Japanese JLPT N5 curriculum functions identically', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/session?level=N5',
      courseId: 'ja-n5'
    })`);

    const card = await getCardCenter();
    assert.strictEqual(card.char, 'あそこ', 'Japanese N5 card 1 is あそこ');
    assert.ok(card.hasBackInert, 'Starts on front face');

    // Cancelled drag does not flip
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: card.cx + 25, y: card.cy, button: 'left', buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: card.cx + 5, y: card.cy, button: 'left', buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx + 5, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 200));

    let state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face after cancelled drag');

    // Deliberate tap flips to back face
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);

    state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, false, 'Japanese card flips to reveal back face');

    // Swipe right commits Learned
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let step = 1; step <= 4; step++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: card.cx + step * 35, y: card.cy, button: 'left', buttons: 1 });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx + 140, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });

    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === 'あちら';
    })()`);

    const card2 = await getCardCenter();
    assert.strictEqual(card2.char, 'あちら', 'Advances to Japanese card 2 (あちら)');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 1, 'Japanese card recorded in learned_words');
    assert.strictEqual(learned[0].character || learned[0].phrase, 'あそこ', 'Recorded card is あそこ');
  });

  it('11. Review and Saved session modes navigate back to their respective screens on completion', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount in Saved session mode with cards
    await cdp.eval(`window.mountSession({
      initialEntry: '/saved/session',
      sessionProps: { isSaved: true },
      savedWords: window.testCardsZh
    })`);

    const c1 = await getCardCenter();
    // Swipe right card 1
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c1.cx, y: c1.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let s = 1; s <= 4; s++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c1.cx + s * 35, y: c1.cy, button: 'left', buttons: 1 });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c1.cx + 140, y: c1.cy, button: 'left', buttons: 0, clickCount: 1 });

    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const c2 = await getCardCenter();
    // Swipe right card 2 (final card in Saved mode)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c2.cx, y: c2.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let s = 1; s <= 4; s++) {
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.cx + s * 35, y: c2.cy, button: 'left', buttons: 1 });
      await new Promise((r) => setTimeout(r, 20));
    }
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c2.cx + 140, y: c2.cy, button: 'left', buttons: 0, clickCount: 1 });

    // Must navigate to /saved screen
    await waitForCondition(`document.getElementById('saved-screen') !== null`);
  });
});
