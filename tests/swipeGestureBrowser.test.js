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
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
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

  async function dispatchTouchDrag(startX, startY, deltaX, deltaY = 0, steps = 5, stepDelay = 20) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(startX), y: Math.round(startY), id: 0 }]
    });
    for (let i = 1; i <= steps; i++) {
      await new Promise((r) => setTimeout(r, stepDelay));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: Math.round(startX + (deltaX * i) / steps),
          y: Math.round(startY + (deltaY * i) / steps),
          id: 0
        }]
      });
    }
    await new Promise((r) => setTimeout(r, stepDelay));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });
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
    // Wait for 3D flip transition to finish so back face is fully upright
    await new Promise((r) => setTimeout(r, 500));
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
    await new Promise((r) => setTimeout(r, 2));
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

  it('7. Touch scrolling through overflowing examples container on back face scrolls vertically without flipping card or committing horizontal swipe', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount card with multiple examples so that content vertically overflows the card
    await cdp.eval(`(() => {
      const cardWithManyExamples = {
        id: 'card-overflow',
        card_id: 'zh-hsk1-overflow',
        course_id: 'zh-hsk1',
        written_form: '爱',
        character: '爱',
        reading: 'ài',
        pronunciation: 'ài',
        meaning_english: 'to love',
        definition: 'to love',
        meaning_burmese: 'ချစ်သည်',
        burmese_definition: 'ချစ်သည်',
        level: 'HSK1',
        sort_order: 1,
        is_active: true,
        examples: [
          { text: '我爱我的家人。', reading: 'Wǒ ài wǒ de jiārén.', english: 'I love my family.', burmese: 'ကျွန်တော် ကျွန်တော့် မိသားစုကို ချစ်တယ်။' },
          { text: '她非常喜欢学中文。', reading: 'Tā fēicháng xǐhuan xué zhōngwén.', english: 'She really loves learning Chinese.', burmese: 'သူမ တရုတ်စာ လေ့လာရတာ အရမ်းကြိုက်တယ်။' },
          { text: '我们大家都爱和平。', reading: 'Wǒmen dàjiā dōu ài hépíng.', english: 'We all love peace.', burmese: 'ကျွန်တော်တို့အားလုံး ငြိမ်းချမ်းရေးကို ချစ်ကြတယ်။' },
          { text: '猫很可爱，我想要一只。', reading: 'Māo hěn kě\\'ài, wǒ xiǎng yào yī zhī.', english: 'Cats are lovely, I want one.', burmese: 'ကြောင်လေးတွေ အရမ်းချစ်စရာကောင်းတယ်၊ ကျွန်တော် တစ်ကောင် လိုချင်တယ်။' },
        ],
        audio_path: 'audio/zh/hsk1/ai.mp3'
      };
      window.mountSession({
        courseId: 'zh-hsk1',
        cards: [cardWithManyExamples]
      });
    })()`);

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
    // Wait for 3D flip transition to finish so back face is fully upright
    await new Promise((r) => setTimeout(r, 500));

    // Verify container is overflowing
    const scrollMetricsBefore = await cdp.eval(`(() => {
      const scrollEl = document.querySelector('.swipe-card--active .swipe-card__answer');
      return {
        scrollHeight: scrollEl.scrollHeight,
        clientHeight: scrollEl.clientHeight,
        scrollTop: scrollEl.scrollTop,
        isOverflowing: scrollEl.scrollHeight > scrollEl.clientHeight
      };
    })()`);
    assert.ok(scrollMetricsBefore.isOverflowing, 'Examples container overflows vertically (scrollHeight > clientHeight)');
    assert.strictEqual(scrollMetricsBefore.scrollTop, 0, 'Initial scrollTop is 0');

    const answerCenter = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left };
    })()`);

    // Dispatch actual touch scrolling events: touchStart inside answer container, vertical drag up, touchEnd
    const touchStartY = Math.round(answerCenter.y + 100);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(answerCenter.x), y: touchStartY, id: 0 }]
    });

    for (let step = 1; step <= 6; step++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(answerCenter.x), y: touchStartY - step * 30, id: 0 }]
      });
    }

    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });

    await new Promise((r) => setTimeout(r, 500));

    // Verify: scrolled vertically, card remained on back face, no horizontal swipe committed
    const scrollMetricsAfter = await cdp.eval(`(() => {
      const scrollEl = document.querySelector('.swipe-card--active .swipe-card__answer');
      const cardEl = document.querySelector('.swipe-card--active');
      const r = cardEl.getBoundingClientRect();
      return {
        scrollTop: scrollEl.scrollTop,
        cardLeft: r.left,
        ariaLabel: cardEl.getAttribute('aria-label'),
        learned: window.db.get('learned_words') || []
      };
    })()`);

    assert.ok(scrollMetricsAfter.scrollTop > 0, `Container scrolled vertically (scrollTop=${scrollMetricsAfter.scrollTop})`);
    assert.strictEqual(scrollMetricsAfter.cardLeft, answerCenter.left, 'Card horizontal position remained at rest');
    assert.ok(scrollMetricsAfter.ariaLabel.includes('showing back face'), 'Card face preserved on back face');
    assert.strictEqual(scrollMetricsAfter.learned.length, 0, 'No progress writes committed during vertical scroll');
  });

  it('8. Keyboard activation on child controls (bookmark and audio with Enter and Space) toggles state safely without flipping card or recording progress', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    await getCardCenter();

    // 1. Focus front-face bookmark button and activate via Enter key
    await cdp.eval(`document.querySelector('.swipe-card--active .swipe-bookmark').focus()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitForCondition(`(window.db.get('saved_words') || []).length === 1`);

    let saved = await cdp.eval(`window.db.get('saved_words') || []`);
    assert.strictEqual(saved.length, 1, 'Bookmark Enter saved word to saved_words');
    assert.strictEqual(saved[0].character || saved[0].phrase, '爱', 'Saved word is 爱');

    let state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face after bookmark Enter');
    assert.ok(state.ariaLabel.includes('showing front face'), 'Aria label remains showing front face');
    let learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 0, 'No progress recorded in learned_words');

    // 2. Activate front-face bookmark button via Space key (unsaves the word)
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await waitForCondition(`(window.db.get('saved_words') || []).length === 0`);

    saved = await cdp.eval(`window.db.get('saved_words') || []`);
    assert.strictEqual(saved.length, 0, 'Bookmark Space unsaved word');
    state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face after bookmark Space');

    // 3. Focus audio button and activate via Enter and Space
    await cdp.eval(`document.querySelector('.swipe-card--active .swipe-audio').focus()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await new Promise((r) => setTimeout(r, 150));

    state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face after audio Enter');

    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await new Promise((r) => setTimeout(r, 150));

    state = await getCardCenter();
    assert.ok(state.hasBackInert, 'Card remains on front face after audio Space');
    learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 0, 'No progress recorded in learned_words');
  });

  it('9. Keyboard Enter and Space on card container flips card without double-triggering', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    await cdp.eval(`document.querySelector('.swipe-card--active').focus()`);

    // Dispatch Enter key targeted at card container
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    // Wait for 3D flip transition to finish so back face is fully upright
    await new Promise((r) => setTimeout(r, 500));

    let state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, false, 'Enter key flipped card to back face');

    // Wait for flip animation to settle
    await new Promise((r) => setTimeout(r, 500));

    // Dispatch Space key targeted at card container
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing front face')`);

    state = await getCardCenter();
    assert.strictEqual(state.hasBackInert, true, 'Space key flipped card back to front face');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learned.length, 0, 'No progress written during card flipping');
  });

  it('10. Touch cancellation (+120px drag -> touchCancel) returns card to rest with zero progress writes and keeps session usable afterwards', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession({ courseId: "zh-hsk1" })');
    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts with card 1 (爱)');
    assert.ok(init.hasBackInert, 'Starts on front face');

    // touchStart
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(init.cx), y: Math.round(init.cy), id: 0 }]
    });

    // 6 horizontal touchMove events totalling +120px
    for (let i = 1; i <= 6; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(init.cx + i * 20), y: Math.round(init.cy), id: 0 }]
      });
    }

    // touchCancel
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: []
    });

    await new Promise((r) => setTimeout(r, 600));

    // Expected: card returns to rest, front face preserved, zero progress writes
    const afterCancel = await getCardCenter();
    assert.strictEqual(afterCancel.char, '爱', 'Active card remains 爱, not advanced');
    assert.ok(afterCancel.hasBackInert, 'Front face preserved (back face inert)');
    assert.ok(afterCancel.ariaLabel.includes('showing front face'), 'Aria label confirms front face');

    const learned = await cdp.eval(`window.db.get('learned_words') || []`);
    const review = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(learned.length, 0, 'Zero progress writes in learned_words');
    assert.strictEqual(review.length, 0, 'Zero entries in review_cards');

    // Verify session remains fully usable: a subsequent committed swipe right advances card and writes progress
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(afterCancel.cx), y: Math.round(afterCancel.cy), id: 0 }]
    });
    for (let i = 1; i <= 6; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(afterCancel.cx + i * 20), y: Math.round(afterCancel.cy), id: 0 }]
      });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });

    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const card2 = await getCardCenter();
    assert.strictEqual(card2.char, '八', 'Session advanced to card 2 (八)');
    const learnedAfter = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedAfter.length, 1, 'Card 1 recorded as learned');
    assert.strictEqual(learnedAfter[0].status, 'known', 'Status is known');
  });

  it('11. Release continuity: committed swipes do not snap toward center before exit animation', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession({ courseId: "zh-hsk1" })');
    const card = await getCardCenter();

    // Install frame position recorder on the active card element
    await cdp.eval(`(() => {
      window.__positions = [];
      window.__recording = false;
      window.__targetCard = document.querySelector('.swipe-card--active');
      function track() {
        const el = window.__targetCard;
        if (el && window.__recording && document.body.contains(el)) {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            window.__positions.push({ time: performance.now(), left: r.left });
          }
        }
        requestAnimationFrame(track);
      }
      requestAnimationFrame(track);
    })()`);

    // Drag right +100px with touch
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(card.cx), y: Math.round(card.cy), id: 0 }]
    });
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 16));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(card.cx + i * 20), y: Math.round(card.cy), id: 0 }]
      });
    }

    // Start recording positions across release and exit
    await cdp.eval('window.__recording = true');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });

    await new Promise((r) => setTimeout(r, 450));
    await cdp.eval('window.__recording = false');

    const positions = await cdp.eval('window.__positions');
    assert.ok(positions.length >= 5, `Recorded ${positions.length} animation frames during exit`);

    // Verify left position moved outward without dipping backward toward resting center
    const releaseLeft = positions[0].left;
    let didSnapTowardCenter = false;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i].left < releaseLeft - 5) {
        didSnapTowardCenter = true;
        break;
      }
    }
    assert.strictEqual(didSnapTowardCenter, false, 'Committed swipe continues outward and does not snap toward center');
  });

  it('12. Japanese JLPT N5 curriculum functions identically', async (t) => {
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
    // Wait for 3D flip transition to finish so back face is fully upright
    await new Promise((r) => setTimeout(r, 500));

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

  it('13. Review and Saved session modes navigate back to their respective screens on completion', async (t) => {
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

  it('14. Storage write failure on committed drag halts outward exit, springs card back to rest, preserves face and shows error; retry after recovery succeeds', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession({ courseId: "zh-hsk1" })');
    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    assert.ok(init.hasBackInert, 'Starts on front face');

    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // Intercept localStorage.setItem to throw QuotaExceededError when writing learned_words
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      localStorage.setItem = function(key, val) {
        if (key && key.includes('learned_words')) {
          const err = new Error('QuotaExceededError: The quota has been exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Perform committed drag right (+120px)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: Math.round(init.cx), y: Math.round(init.cy), id: 0 }]
      });
      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: Math.round(init.cx + i * 20), y: Math.round(init.cy), id: 0 }]
        });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: []
      });

      // Wait for spring back to rest and notice display
      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      // 1. Error notice must be displayed with accurate message
      const noticeText = await cdp.eval(`document.querySelector('.swipe-session__notice')?.textContent`);
      assert.ok(noticeText.includes('Unable to save progress. Try again.'), 'Notice displays save failure message');

      // 2. Active card must still be in viewport and spring back to rest
      const failedState = await getCardCenter();
      assert.strictEqual(failedState.char, '爱', 'Active card character remains 爱, did not advance');
      assert.ok(failedState.hasBackInert, 'Card face preserved on front face');
      assert.ok(failedState.ariaLabel.includes('showing front face'), 'Aria label confirms front face');

      const failedLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft - restingLeft) < 15, `Card returned to rest position (left=${failedLeft}, restingLeft=${restingLeft})`);

      // 3. Zero progress writes
      const learnedFailed = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedFailed.length, 0, 'No progress saved to learned_words during failure');
    } finally {
      // Restore storage
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      })()`);
    }

    // 4. Retry committed drag right after storage restored
    const retryInit = await getCardCenter();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: Math.round(retryInit.cx), y: Math.round(retryInit.cy), id: 0 }]
    });
    for (let i = 1; i <= 6; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(retryInit.cx + i * 20), y: Math.round(retryInit.cy), id: 0 }]
      });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    });

    // Wait for deck to advance to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const finalState = await getCardCenter();
    assert.strictEqual(finalState.char, '八', 'Retry successfully advances to card 2 (八)');

    const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(finalLearned.length, 1, 'Progress saved exactly once after retry');
    assert.strictEqual(finalLearned[0].character, '爱', 'Saved word is 爱');
    assert.strictEqual(finalLearned[0].status, 'known', 'Status is known');
  });

  it('15. Left-swipe partial persistence failure (review_cards throws) halts exit, preserves card/face at rest; retry after storage recovery records exactly once and updates review queue', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount fresh session on HSK1
    await cdp.eval('window.mountSession({ courseId: "zh-hsk1" })');
    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    assert.ok(init.hasBackInert, 'Starts on front face');

    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // Intercept localStorage.setItem to throw QuotaExceededError ONLY for review_cards
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      localStorage.setItem = function(key, val) {
        if (key && key.includes('review_cards')) {
          const err = new Error('QuotaExceededError: review_cards write quota exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Commit a LEFT swipe using actual mouse input drag (-120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx - i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx - 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      // Wait for spring back to rest and notice display
      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      // 1. Error notice displayed
      const noticeText = await cdp.eval(`document.querySelector('.swipe-session__notice')?.textContent`);
      assert.ok(noticeText.includes('Unable to save progress. Try again.'), 'Notice displays save failure message');

      // 2. Active card returned to rest, face preserved
      const failedState = await getCardCenter();
      assert.strictEqual(failedState.char, '爱', 'Active card character remains 爱');
      assert.ok(failedState.hasBackInert, 'Card face preserved on front face');
      const failedLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft - restingLeft) < 15, `Card returned to rest position (left=${failedLeft}, restingLeft=${restingLeft})`);

      // 3. Partial persistence state: learned_words has 爱 with seen: 1, last_action: review; review_cards is empty
      const learnedPartial = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedPartial.length, 1, 'learned_words has partial entry');
      assert.strictEqual(learnedPartial[0].character, '爱');
      assert.strictEqual(learnedPartial[0].seen, 1, 'seen is 1 on partial entry');
      assert.strictEqual(learnedPartial[0].last_action, 'review');
      assert.strictEqual(learnedPartial[0].status, 'learning');

      const reviewPartial = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(reviewPartial.length, 0, 'review_cards remains empty because its write failed');
    } finally {
      // Restore storage
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      })()`);
    }

    // 4. Retry left swipe with storage restored
    const retryInit = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit.cx, y: retryInit.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit.cx - i * 35, y: retryInit.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit.cx - 140, y: retryInit.cy, button: 'left', buttons: 0, clickCount: 1 });

    // Wait for deck to advance to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const finalState = await getCardCenter();
    assert.strictEqual(finalState.char, '八', 'Retry successfully advances to card 2 (八)');

    // 5. Assert idempotent progress: seen remains 1 (not 2!), and review_cards contains card 爱
    const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(finalLearned.length, 1, 'One record in learned_words');
    assert.strictEqual(finalLearned[0].seen, 1, 'Seen counter remains exactly 1, no double-counting on retry');
    assert.strictEqual(finalLearned[0].last_action, 'review');
    assert.strictEqual(finalLearned[0].status, 'learning');

    const finalReview = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(finalReview.length, 1, 'Review queue now contains card 爱');
    assert.strictEqual(finalReview[0].character, '爱');
  });

  it('16. Right-swipe out of Review partial persistence failure (review_cards removal throws) halts exit, preserves card/face at rest; retry after storage recovery records exactly once and clears review queue', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount session in Review mode with cards in review queue and learned_words
    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/review/session',
      sessionProps: { isReview: true },
      reviewCards: [{
        id: 'zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1'
      }, {
        id: 'zh-hsk1-ba',
        character: '八',
        pronunciation: 'bā',
        level: 'HSK1'
      }],
      learnedWords: [{
        id: 'pw_zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1',
        seen: 1,
        last_action: 'review',
        status: 'learning'
      }]
    })`);
    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    assert.ok(init.hasBackInert, 'Starts on front face');

    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // Intercept localStorage.setItem to throw QuotaExceededError ONLY for review_cards
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      localStorage.setItem = function(key, val) {
        if (key && key.includes('review_cards')) {
          const err = new Error('QuotaExceededError: review_cards write quota exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Commit a RIGHT swipe (+120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx + i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx + 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      // Wait for spring back to rest and notice display
      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      // 1. Error notice displayed
      const noticeText = await cdp.eval(`document.querySelector('.swipe-session__notice')?.textContent`);
      assert.ok(noticeText.includes('Unable to save progress. Try again.'), 'Notice displays save failure message');

      // 2. Active card returned to rest, face preserved
      const failedState = await getCardCenter();
      assert.strictEqual(failedState.char, '爱', 'Active card character remains 爱');
      assert.ok(failedState.hasBackInert, 'Card face preserved on front face');
      const failedLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft - restingLeft) < 15, `Card returned to rest position (left=${failedLeft}, restingLeft=${restingLeft})`);

      // 3. Partial persistence state: learned_words was updated with seen: 2, last_action: learned; review_cards still has card because removal failed
      const learnedPartial = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedPartial[0].seen, 2, 'seen updated to 2 during attempt');
      assert.strictEqual(learnedPartial[0].last_action, 'learned');
      assert.strictEqual(learnedPartial[0].status, 'known');

      const reviewPartial = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(reviewPartial.length, 2, 'review_cards still contains both cards because removal failed');
      assert.ok(reviewPartial.some(c => c.character === '爱'), 'Card 爱 is still in review_cards');
    } finally {
      // Restore storage
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      })()`);
    }

    // 4. Retry right swipe with storage restored
    const retryInit = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit.cx, y: retryInit.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit.cx + i * 35, y: retryInit.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit.cx + 140, y: retryInit.cy, button: 'left', buttons: 0, clickCount: 1 });

    // Wait for deck to advance to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const finalState = await getCardCenter();
    assert.strictEqual(finalState.char, '八', 'Retry successfully advances to card 2 (八)');

    // 5. Assert idempotent progress: seen remains 2 (NOT 3!), and review_cards has been cleared
    const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(finalLearned[0].seen, 2, 'Seen counter remains exactly 2, no double-counting on retry');
    assert.strictEqual(finalLearned[0].last_action, 'learned');
    assert.strictEqual(finalLearned[0].status, 'known');

    const finalReview = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(finalReview.length, 1, 'Card 爱 was cleanly removed from review queue');
    assert.strictEqual(finalReview[0].character, '八', 'Card 八 remains in review queue');
  });

  it('17. Real-browser reproduction: failure before progress write on existing card (seen: 5) keeps card at rest; retry after recovery increments seen to 6', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount session in Review mode with card 爱 having seen: 5, last_action: 'learned'
    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/review/session',
      sessionProps: { isReview: true },
      reviewCards: [{
        id: 'zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1'
      }, {
        id: 'zh-hsk1-ba',
        character: '八',
        pronunciation: 'bā',
        level: 'HSK1'
      }, {
        id: 'zh-hsk1-baba',
        character: '爸爸',
        pronunciation: 'bàba',
        level: 'HSK1'
      }],
      learnedWords: [{
        id: 'pw_zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1',
        seen: 5,
        last_action: 'learned',
        status: 'known'
      }]
    })`);

    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // Intercept localStorage.setItem to throw QuotaExceededError ONLY for learned_words
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      localStorage.setItem = function(key, val) {
        if (key && key.includes('learned_words')) {
          const err = new Error('QuotaExceededError: learned_words write quota exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // 1. Commit a right swipe (+120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx + i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx + 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      // Wait for spring back to rest and notice display
      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      // Error notice displayed, card returns to rest, seen remains 5
      const noticeText = await cdp.eval(`document.querySelector('.swipe-session__notice')?.textContent`);
      assert.ok(noticeText.includes('Unable to save progress. Try again.'), 'Notice displays save failure message');

      const failedState = await getCardCenter();
      assert.strictEqual(failedState.char, '爱', 'Card remains 爱');
      const failedLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft - restingLeft) < 15, 'Card returned to rest position');

      const learnedAfterFail = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedAfterFail[0].seen, 5, 'seen remains 5 after failed write');

      // 2. Repeated failed retry while storage is still failing
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx + i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx + 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      await new Promise((r) => setTimeout(r, 500));
      const learnedAfterRepeatFail = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedAfterRepeatFail[0].seen, 5, 'seen still remains 5 after repeated failed retry');
    } finally {
      // Restore storage
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      })()`);
    }

    // 3. Retry right swipe after storage restored
    const retryInit = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit.cx, y: retryInit.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit.cx + i * 35, y: retryInit.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit.cx + 140, y: retryInit.cy, button: 'left', buttons: 0, clickCount: 1 });

    // Wait for deck to advance to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const finalState = await getCardCenter();
    assert.strictEqual(finalState.char, '八', 'Advances to card 2 (八)');

    // 4. Assert seen increments to 6!
    const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    const aiEntry = finalLearned.find(w => w.character === '爱');
    assert.strictEqual(aiEntry.seen, 6, 'seen successfully increments from 5 to 6 on retry');
    assert.strictEqual(aiEntry.last_action, 'learned');
    assert.strictEqual(aiEntry.status, 'known');

    // 5. Subsequent deliberate swipe on card 2 (八) succeeds as a new action
    const c2 = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c2.cx, y: c2.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c2.cx + i * 35, y: c2.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c2.cx + 140, y: c2.cy, button: 'left', buttons: 0, clickCount: 1 });

    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '爸爸';
    })()`);

    const afterC2Learned = await cdp.eval(`window.db.get('learned_words') || []`);
    const baEntry = afterC2Learned.find(w => w.character === '八');
    assert.ok(baEntry, 'Card 2 (八) recorded as new action');
    assert.strictEqual(baEntry.seen, 1, 'Card 2 has seen: 1');
  });

  it('18. Left-swipe failure before progress write on existing card (seen: 3, last_action: review) keeps card at rest; retry after recovery increments seen to 4', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Pre-seed card with seen: 3, last_action: 'review', status: 'learning'
    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/review/session',
      sessionProps: { isReview: true },
      reviewCards: [{
        id: 'zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1'
      }, {
        id: 'zh-hsk1-ba',
        character: '八',
        pronunciation: 'bā',
        level: 'HSK1'
      }],
      learnedWords: [{
        id: 'pw_zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1',
        seen: 3,
        last_action: 'review',
        status: 'learning'
      }]
    })`);

    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');

    // Intercept localStorage.setItem to throw QuotaExceededError ONLY for learned_words
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      localStorage.setItem = function(key, val) {
        if (key && key.includes('learned_words')) {
          const err = new Error('QuotaExceededError: learned_words write quota exceeded.');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Commit left swipe (-120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx - i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx - 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      const failedState = await getCardCenter();
      assert.strictEqual(failedState.char, '爱', 'Card remains 爱 at rest');

      const learnedAfterFail = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learnedAfterFail[0].seen, 3, 'seen remains 3 after failed write');
    } finally {
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
        }
      })()`);
    }

    // Retry left swipe after storage restored
    const retryInit = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit.cx, y: retryInit.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit.cx - i * 35, y: retryInit.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit.cx - 140, y: retryInit.cy, button: 'left', buttons: 0, clickCount: 1 });

    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    const aiEntry = finalLearned.find(w => w.character === '爱');
    assert.strictEqual(aiEntry.seen, 4, 'seen increments from 3 to 4 on retry');
    assert.strictEqual(aiEntry.last_action, 'review');

    const finalReview = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.ok(finalReview.some(c => c.character === '爱'), 'Card 爱 is in review queue');
  });

  it('19. Left swipe: learned_words succeeds but review_cards fails (seen: 1); retry where learned_words fails keeps card at rest (seen: 1); recovery retry advances card, completes review queue and seen remains 1', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval(`window.mountSession({
      courseId: "zh-hsk1",
      cards: window.testCardsZh
    })`);

    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // 1. First left swipe: review_cards throws, learned_words succeeds
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      window.__failMode = 'review_cards';
      localStorage.setItem = function(key, val) {
        if (key && window.__failMode && key.includes(window.__failMode)) {
          const err = new Error('QuotaExceededError: ' + window.__failMode + ' quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Swipe left (-120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx - i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx - 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      const failedState1 = await getCardCenter();
      assert.strictEqual(failedState1.char, '爱', 'Card remains 爱 at rest');
      const failedLeft1 = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft1 - restingLeft) < 15, 'Card returned to resting position');

      const learned1 = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learned1.length, 1);
      assert.strictEqual(learned1[0].character, '爱');
      assert.strictEqual(learned1[0].seen, 1, 'learned_words succeeded with seen: 1');
      assert.strictEqual(learned1[0].last_action, 'review');

      const review1 = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(review1.length, 0, 'review queue write failed');

      // 2. Retry: switch failure mode to learned_words
      await cdp.eval(`window.__failMode = 'learned_words'`);

      const retryInit1 = await getCardCenter();
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit1.cx, y: retryInit1.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit1.cx - i * 35, y: retryInit1.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit1.cx - 140, y: retryInit1.cy, button: 'left', buttons: 0, clickCount: 1 });

      await new Promise((r) => setTimeout(r, 500));

      const failedState2 = await getCardCenter();
      assert.strictEqual(failedState2.char, '爱', 'Card remains 爱 at rest after second failed attempt');
      const learned2 = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learned2[0].seen, 1, 'seen stays 1 after failed retry on learned_words');

      // 3. Restore storage and retry
      await cdp.eval(`window.__failMode = null`);

      const retryInit2 = await getCardCenter();
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit2.cx, y: retryInit2.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit2.cx - i * 35, y: retryInit2.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit2.cx - 140, y: retryInit2.cy, button: 'left', buttons: 0, clickCount: 1 });

      // Deck advances to card 2 (八)
      await waitForCondition(`(() => {
        const c = document.querySelector('.swipe-card--active .swipe-card__character');
        return c && c.textContent.trim() === '八';
      })()`);

      const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(finalLearned[0].seen, 1, 'seen remains exactly 1 on successful recovery (no double-count)');
      assert.strictEqual(finalLearned[0].last_action, 'review');

      const finalReview = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(finalReview.length, 1, 'review queue completed with card 爱');
      assert.strictEqual(finalReview[0].character, '爱');
    } finally {
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
          delete window.__failMode;
        }
      })()`);
    }
  });

  it('20. Right swipe out of review: learned_words succeeds but review_cards removal fails (seen: 2); retry where learned_words fails keeps card at rest (seen: 2); recovery retry advances card, completes review queue removal and seen remains 2', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount in Review mode with card 爱 in review queue and learned_words (seen: 1)
    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/review/session',
      sessionProps: { isReview: true },
      reviewCards: [{
        id: 'zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1'
      }, {
        id: 'zh-hsk1-ba',
        character: '八',
        pronunciation: 'bā',
        level: 'HSK1'
      }],
      learnedWords: [{
        id: 'pw_zh-hsk1-ai',
        character: '爱',
        pronunciation: 'ài',
        level: 'HSK1',
        seen: 1,
        last_action: 'review',
        status: 'learning'
      }]
    })`);

    const init = await getCardCenter();
    assert.strictEqual(init.char, '爱', 'Starts on card 1 (爱)');
    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // 1. First right swipe: review_cards throws, learned_words succeeds
    await cdp.eval(`(() => {
      window.__origSetItem = localStorage.setItem;
      window.__failMode = 'review_cards';
      localStorage.setItem = function(key, val) {
        if (key && window.__failMode && key.includes(window.__failMode)) {
          const err = new Error('QuotaExceededError: ' + window.__failMode + ' quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return window.__origSetItem.apply(this, arguments);
      };
    })()`);

    try {
      // Swipe right (+120px)
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: init.cx, y: init.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: init.cx + i * 35, y: init.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: init.cx + 140, y: init.cy, button: 'left', buttons: 0, clickCount: 1 });

      await waitForCondition(`document.querySelector('.swipe-session__notice') !== null`);
      await new Promise((r) => setTimeout(r, 500));

      const failedState1 = await getCardCenter();
      assert.strictEqual(failedState1.char, '爱', 'Card remains 爱 at rest');
      const failedLeft1 = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);
      assert.ok(Math.abs(failedLeft1 - restingLeft) < 15, 'Card returned to resting position');

      const learned1 = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learned1[0].seen, 2, 'learned_words updated with seen: 2');
      assert.strictEqual(learned1[0].last_action, 'learned');

      const review1 = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(review1.length, 2, 'removal failed, review queue still has 2 cards');

      // 2. Retry: switch failure mode to learned_words
      await cdp.eval(`window.__failMode = 'learned_words'`);

      const retryInit1 = await getCardCenter();
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit1.cx, y: retryInit1.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit1.cx + i * 35, y: retryInit1.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit1.cx + 140, y: retryInit1.cy, button: 'left', buttons: 0, clickCount: 1 });

      await new Promise((r) => setTimeout(r, 500));

      const failedState2 = await getCardCenter();
      assert.strictEqual(failedState2.char, '爱', 'Card remains 爱 at rest after second failed attempt');
      const learned2 = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learned2[0].seen, 2, 'seen stays 2 after failed retry on learned_words');

      // 3. Restore storage and retry
      await cdp.eval(`window.__failMode = null`);

      const retryInit2 = await getCardCenter();
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryInit2.cx, y: retryInit2.cy, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 20));
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryInit2.cx + i * 35, y: retryInit2.cy, button: 'left', buttons: 1 });
      }
      await new Promise((r) => setTimeout(r, 20));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: retryInit2.cx + 140, y: retryInit2.cy, button: 'left', buttons: 0, clickCount: 1 });

      // Deck advances to card 2 (八)
      await waitForCondition(`(() => {
        const c = document.querySelector('.swipe-card--active .swipe-card__character');
        return c && c.textContent.trim() === '八';
      })()`);

      const finalLearned = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(finalLearned[0].seen, 2, 'seen remains exactly 2 on successful recovery (no double-count)');
      assert.strictEqual(finalLearned[0].last_action, 'learned');

      const finalReview = await cdp.eval(`window.db.get('review_cards') || []`);
      assert.strictEqual(finalReview.length, 1, 'Card 爱 cleanly removed from review queue');
      assert.strictEqual(finalReview[0].character, '八');
    } finally {
      await cdp.eval(`(() => {
        if (window.__origSetItem) {
          localStorage.setItem = window.__origSetItem;
          delete window.__origSetItem;
          delete window.__failMode;
        }
      })()`);
    }
  });

  it('21. Computed gesture styling: rendered .swipe-card__answer scroller computes touch-action: pan-y pinch-zoom', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const computedTouchAction = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      return el ? window.getComputedStyle(el).touchAction : null;
    })()`);

    assert.strictEqual(computedTouchAction, 'pan-y pinch-zoom', 'Scroller computes touch-action: pan-y pinch-zoom');
  });

  it('22. Revealed back-face horizontal touch swipes succeed in both directions (Learned right and Review left) on short content', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Part A: Right swipe -> Learned
    await cdp.eval('window.mountSession()');
    const card1 = await getCardCenter();

    // Tap to reveal
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card1.cx, y: card1.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card1.cx, y: card1.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    // Get back face scroller center
    const answerPosA = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);

    // Perform horizontal touch swipe right (+140px) starting on .swipe-card__answer
    await dispatchTouchDrag(answerPosA.x, answerPosA.y, 140, 0, 5, 20);

    // Deck advances to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const learnedA = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedA.length, 1);
    assert.strictEqual(learnedA[0].character, '爱');
    assert.strictEqual(learnedA[0].last_action, 'learned');
    assert.strictEqual(learnedA[0].seen, 1);

    // Part B: Left swipe -> Review
    await cdp.eval('window.mountSession()');
    const card1B = await getCardCenter();

    // Tap to reveal
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card1B.cx, y: card1B.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card1B.cx, y: card1B.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    const answerPosB = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);

    // Perform horizontal touch swipe left (-140px) starting on .swipe-card__answer
    await dispatchTouchDrag(answerPosB.x, answerPosB.y, -140, 0, 5, 20);

    // Deck advances to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const learnedB = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedB.length, 1);
    assert.strictEqual(learnedB[0].character, '爱');
    assert.strictEqual(learnedB[0].last_action, 'review');

    const reviewB = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(reviewB.length, 1);
    assert.strictEqual(reviewB[0].character, '爱');
  });

  it('23. Revealed back-face touch swipes succeed across various reveal timings (0ms, 120ms, 250ms, 450ms)', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    const testDelays = [0, 120, 250, 450];
    for (const delayMs of testDelays) {
      await cdp.eval('window.mountSession()');
      const card = await getCardCenter();

      // Tap card
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      // Touch drag right (+140px)
      await dispatchTouchDrag(card.cx, card.cy, 140, 0, 5, 20);

      // Verify deck advances to card 2 (八)
      await waitForCondition(`(() => {
        const c = document.querySelector('.swipe-card--active .swipe-card__character');
        return c && c.textContent.trim() === '八';
      })()`);

      const learned = await cdp.eval(`window.db.get('learned_words') || []`);
      assert.strictEqual(learned.length, 1, `Advances cleanly with delay ${delayMs}ms`);
      assert.strictEqual(learned[0].character, '爱');
    }
  });

  it('24. Revealed back-face with overflowing content: vertical touch scroll preserves face and writes zero progress, then horizontal touch swipe succeeds', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Mount card with overflowing content and a second card
    await cdp.eval(`(() => {
      const cardWithManyExamples = {
        id: 'card-overflow-1',
        card_id: 'zh-hsk1-overflow-1',
        course_id: 'zh-hsk1',
        written_form: '爱',
        character: '爱',
        reading: 'ài',
        pronunciation: 'ài',
        meaning_english: 'to love',
        definition: 'to love',
        meaning_burmese: 'ချစ်သည်',
        burmese_definition: 'ချစ်သည်',
        level: 'HSK1',
        sort_order: 1,
        is_active: true,
        examples: [
          { text: '我爱我的家人。', reading: 'Wǒ ài wǒ de jiārén.', english: 'I love my family.', burmese: 'ကျွန်တော် ကျွန်တော့် မိသားစုကို ချစ်တယ်။' },
          { text: '她非常喜欢学中文。', reading: 'Tā fēicháng xǐhuan xué zhōngwén.', english: 'She really loves learning Chinese.', burmese: 'သူမ တရုတ်စာ လေ့လာရတာ အရမ်းကြိုက်တယ်။' },
          { text: '我们大家都爱和平。', reading: 'Wǒmen dàjiā dōu ài hépíng.', english: 'We all love peace.', burmese: 'ကျွန်တော်တို့အားလုံး ငြိမ်းချမ်းရေးကို ချစ်ကြတယ်။' },
          { text: '猫很可爱，我想要一只。', reading: 'Māo hěn kě\\'ài, wǒ xiǎng yào yī zhī.', english: 'Cats are lovely, I want one.', burmese: 'ကြောင်လေးတွေ အရမ်းချစ်စရာကောင်းတယ်၊ ကျွန်တော် တစ်ကောင် လိုချင်တယ်။' },
        ],
        audio_path: 'audio/zh/hsk1/ai.mp3'
      };
      window.mountSession({
        courseId: 'zh-hsk1',
        cards: [cardWithManyExamples, window.testCardsZh[1]]
      });
    })()`);

    const card = await getCardCenter();

    // Reveal back face
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 400));

    const answerMetrics = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      const r = el.getBoundingClientRect();
      return {
        isOverflowing: el.scrollHeight > el.clientHeight,
        cx: Math.round(r.left + r.width / 2),
        cy: Math.round(r.top + r.height / 2),
        left: r.left
      };
    })()`);
    assert.ok(answerMetrics.isOverflowing, 'Answer scroller has overflowing content');

    // 1. Dispatch vertical touch scroll (drag up 120px)
    await dispatchTouchDrag(answerMetrics.cx, answerMetrics.cy + 60, 0, -120, 6, 20);
    await new Promise((r) => setTimeout(r, 400));

    const scrollState = await cdp.eval(`(() => {
      const el = document.querySelector('.swipe-card--active .swipe-card__answer');
      const cardEl = document.querySelector('.swipe-card--active');
      return {
        scrollTop: el.scrollTop,
        ariaLabel: cardEl.getAttribute('aria-label'),
        learned: window.db.get('learned_words') || []
      };
    })()`);
    assert.ok(scrollState.scrollTop > 0, `Scrolled vertically (scrollTop=${scrollState.scrollTop})`);
    assert.ok(scrollState.ariaLabel.includes('showing back face'), 'Card remains on back face');
    assert.strictEqual(scrollState.learned.length, 0, 'No progress written during vertical scroll');

    // 2. Dispatch horizontal touch swipe right (+140px) after scrolling
    await dispatchTouchDrag(answerMetrics.cx, answerMetrics.cy, 140, 0, 5, 20);

    // Advances to card 2 (八)
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);

    const learnedAfter = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedAfter.length, 1);
    assert.strictEqual(learnedAfter[0].character, '爱');
    assert.strictEqual(learnedAfter[0].last_action, 'learned');
  });

  it('25. Curricula and Session Modes: Japanese JLPT N5, Review mode, and Saved mode cleanly support revealed back-face touch swiping', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // A. Japanese JLPT N5 Learn mode
    await cdp.eval(`window.mountSession({
      courseId: "ja-n5",
      cards: window.testCardsJa
    })`);
    const jaCard = await getCardCenter();
    assert.strictEqual(jaCard.char, 'あそこ', 'Starts on Japanese N5 card 1');

    // Reveal back face
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: jaCard.cx, y: jaCard.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: jaCard.cx, y: jaCard.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    // Touch swipe right (+140px)
    await dispatchTouchDrag(jaCard.cx, jaCard.cy, 140, 0, 5, 20);
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === 'あちら';
    })()`);
    const jaLearned = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(jaLearned.length, 1);
    assert.strictEqual(jaLearned[0].character, 'あそこ');

    // B. Review mode (/learn/review/session)
    await cdp.eval(`window.mountSession({
      initialEntry: '/learn/review/session',
      sessionProps: { isReview: true },
      reviewCards: window.testCardsZh
    })`);
    const revCard = await getCardCenter();
    assert.strictEqual(revCard.char, '爱', 'Starts on review card 1');

    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: revCard.cx, y: revCard.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: revCard.cx, y: revCard.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    await dispatchTouchDrag(revCard.cx, revCard.cy, 140, 0, 5, 20);
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);
    const revQueue = await cdp.eval(`window.db.get('review_cards') || []`);
    assert.strictEqual(revQueue.length, 1, 'Card 爱 removed from review queue');
    assert.strictEqual(revQueue[0].character, '八');

    // C. Saved mode (/saved/session)
    await cdp.eval(`window.mountSession({
      initialEntry: '/saved/session',
      sessionProps: { isSaved: true },
      savedWords: window.testCardsZh
    })`);
    const savedCard = await getCardCenter();
    assert.strictEqual(savedCard.char, '爱', 'Starts on saved card 1');

    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: savedCard.cx, y: savedCard.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: savedCard.cx, y: savedCard.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    await dispatchTouchDrag(savedCard.cx, savedCard.cy, 140, 0, 5, 20);
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);
    const nextSavedCard = await getCardCenter();
    assert.strictEqual(nextSavedCard.char, '八', 'Advances to next saved card');
  });

  it('26. Interaction isolation preserved: child controls (audio, bookmark) on revealed face isolate touch without triggering card flip or horizontal drag', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    const card = await getCardCenter();

    // Tap to reveal
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('showing back face')`);
    await new Promise((r) => setTimeout(r, 350));

    // Get bookmark button position on back face
    const bmPos = await cdp.eval(`(() => {
      const btn = document.querySelector('.swipe-card--active .swipe-card__back .swipe-bookmark');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);

    // Touch tap on bookmark button
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bmPos.x, y: bmPos.y, id: 0 }] });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await new Promise((r) => setTimeout(r, 300));

    // Verify: saved words has 1 word, card is STILL on back face, active card is STILL 爱
    const savedAfter = await cdp.eval(`window.db.get('saved_words') || []`);
    assert.strictEqual(savedAfter.length, 1, 'Bookmark toggled to saved');
    const stateAfterBm = await getCardCenter();
    assert.strictEqual(stateAfterBm.char, '爱', 'Card character remains 爱');
    assert.ok(stateAfterBm.ariaLabel.includes('showing back face'), 'Card face preserved on back face');

    // Get audio button position on back face
    const audioPos = await cdp.eval(`(() => {
      const btn = document.querySelector('.swipe-card--active .swipe-card__back .swipe-audio');
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);

    // Touch tap on audio button
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: audioPos.x, y: audioPos.y, id: 0 }] });
    await new Promise((r) => setTimeout(r, 50));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await new Promise((r) => setTimeout(r, 300));

    const stateAfterAudio = await getCardCenter();
    assert.strictEqual(stateAfterAudio.char, '爱', 'Card character still remains 爱');
    assert.ok(stateAfterAudio.ariaLabel.includes('showing back face'), 'Card face preserved on back face');
    const learnedAfter = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedAfter.length, 0, 'No progress written during child control activation');
  });

  it('31. A touch during the flip is captured by the stable outer card and commits exactly once', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');
    await cdp.eval(`window.mountSession({ courseId: 'ja-n5' })`);
    const card = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 120));
    await cdp.eval(`(() => {
      window.__captureChecks = [];
      window.__checkCapture = (event) => {
        if (event.pointerType !== 'touch') return;
        const el = document.querySelector('.swipe-card--active');
        window.__captureChecks.push(el?.hasPointerCapture(event.pointerId) === true);
      };
      window.addEventListener('pointermove', window.__checkCapture, true);
    })()`);
    try {
      await dispatchTouchDrag(card.cx, card.cy, 120, 0, 6, 25);
      await waitForCondition(`document.querySelector('.swipe-card--active .swipe-card__character')?.textContent === 'あちら'`);
      const captures = await cdp.eval('window.__captureChecks');
      assert.ok(captures.length > 0 && captures.every(Boolean), 'Capture must remain on the stable card while its faces rotate');
      assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 1);
    } finally {
      await cdp.eval('window.removeEventListener("pointermove", window.__checkCapture, true)');
    }
  });

  it('29. Horizontal touch ownership survives vertical drift on revealed HSK1/N5 cards while vertical-first gestures keep native scrolling', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');
    await cdp.eval(`(() => {
      window.__guardMoves = [];
      window.__observeGuardMove = (event) => window.__guardMoves.push(event.defaultPrevented);
      window.addEventListener('touchmove', window.__observeGuardMove, { passive: true });
    })()`);
    try {
      for (const courseId of ['zh-hsk1', 'ja-n5']) {
        const japanese = courseId === 'ja-n5';
        await cdp.eval(`window.mountSession({ courseId: '${courseId}', cards:
          window.${japanese ? 'testCardsJa' : 'testCardsZh'}.map(card => ({
            ...card, examples: Array.from({ length: 12 }, () => card.examples[0])
          })) })`);
        const card = await getCardCenter();
        await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
        await new Promise((r) => setTimeout(r, 450));
        await cdp.eval('window.__guardMoves = []');
        await dispatchTouchDrag(card.cx, card.cy, 0, -120, 6, 25);
        await new Promise((r) => setTimeout(r, 350));
        assert.ok(await cdp.eval(`document.querySelector('.swipe-card--active .swipe-card__answer').scrollTop > 0`));
        assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 0);
        assert.ok((await cdp.eval('window.__guardMoves')).every(value => value === false));
        assert.ok((await getCardCenter()).ariaLabel.includes('back face'));
        await cdp.eval('window.__guardMoves = []');
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card.cx, y: card.cy, id: 0 }] });
        for (const [dx, dy] of [[20, 2], [40, 8], [60, 24], [80, 45], [100, 70], [120, 100]]) {
          await new Promise((r) => setTimeout(r, 25));
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: card.cx + dx, y: card.cy + dy, id: 0 }] });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await waitForCondition(`document.querySelector('.swipe-card--active .swipe-card__character')?.textContent === '${japanese ? 'あちら' : '八'}'`);
        const prevented = await cdp.eval('window.__guardMoves');
        assert.ok(prevented.length > 0 && prevented.every(Boolean), 'Horizontal gesture must retain ownership through vertical drift');
        assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 1);
      }
    } finally {
      await cdp.eval(`window.removeEventListener('touchmove', window.__observeGuardMove)`);
    }
  });

  it('30. Touch ownership excludes controls and multi-touch, resets after cancellation, and leaves taps and vertical-first drags alone', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');
    await cdp.eval(`window.mountSession({ courseId: 'ja-n5' })`);
    const card = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 450));
    const result = await cdp.eval(`(() => {
      const back = document.querySelector('.swipe-card--active .swipe-card__back');
      const answer = back.querySelector('.swipe-card__answer');
      const emit = (target, type, coords) => {
        const touches = coords.map(([clientX, clientY], identifier) => new Touch({ identifier, target, clientX, clientY }));
        const event = new TouchEvent(type, { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const values = {};
      emit(answer, 'touchstart', [[100, 100]]);
      values.tap = emit(answer, 'touchmove', [[102, 101]]);
      emit(answer, 'touchend', []);
      emit(answer, 'touchstart', [[100, 100]]);
      values.vertical = emit(answer, 'touchmove', [[101, 120]]);
      values.verticalThenHorizontal = emit(answer, 'touchmove', [[200, 120]]);
      emit(answer, 'touchend', []);
      emit(answer, 'touchstart', [[100, 100]]);
      values.horizontal = emit(answer, 'touchmove', [[120, 101]]);
      values.horizontalThenVertical = emit(answer, 'touchmove', [[125, 180]]);
      emit(answer, 'touchcancel', []);
      values.afterCancel = emit(answer, 'touchmove', [[200, 101]]);
      emit(answer, 'touchstart', [[100, 100], [150, 100]]);
      values.pinch = emit(answer, 'touchmove', [[70, 100], [180, 100]]);
      values.remainingFinger = emit(answer, 'touchmove', [[200, 100]]);
      emit(answer, 'touchend', []);
      for (const [name, target] of [['bookmark', back.querySelector('.swipe-bookmark svg')], ['audio', back.querySelector('button[aria-label^="Play"] svg')]]) {
        emit(target, 'touchstart', [[100, 100]]);
        values[name] = emit(target, 'touchmove', [[220, 100]]);
        emit(target, 'touchend', []);
      }
      return values;
    })()`);
    assert.deepEqual(result, { tap: false, vertical: false, verticalThenHorizontal: false,
      horizontal: true, horizontalThenVertical: true, afterCancel: false,
      pinch: false, remainingFinger: false, bookmark: false, audio: false });
    assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 0);
    assert.ok((await getCardCenter()).ariaLabel.includes('back face'));
  });

  it('32. Vertical-first touches cannot drift or commit a card even without browser pointercancel; delayed clicks cannot flip it', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');
    for (const courseId of ['zh-hsk1', 'ja-n5']) {
      await cdp.eval(`window.mountSession({ courseId: '${courseId}' })`);
      const card = await getCardCenter();
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
      await new Promise(r => setTimeout(r, 450));
      // Synthetic streams deliberately omit native pointercancel, to cover engines
      // that keep delivering pointers while a nested answer is being scrolled.
      const samples = await cdp.eval(`(async () => {
        const outer = document.querySelector('.swipe-card--active');
        const answer = outer.querySelector('.swipe-card__answer');
        const pointer = (type, dx, dy) => answer.dispatchEvent(new PointerEvent(type, {
          bubbles: true, pointerId: 71, pointerType: 'touch', isPrimary: true,
          clientX: ${card.cx} + dx, clientY: ${card.cy} + dy, button: 0, buttons: type === 'pointerup' ? 0 : 1
        }));
        const touch = (type, dx, dy) => {
          const points = type === 'touchend' ? [] : [new Touch({ identifier: 71, target: answer,
            clientX: ${card.cx} + dx, clientY: ${card.cy} + dy })];
          const e = new TouchEvent(type, { bubbles: true, cancelable: true, touches: points, changedTouches: points });
          answer.dispatchEvent(e);
          return e.defaultPrevented;
        };
        pointer('pointerdown', 0, 0);
        touch('touchstart', 0, 0);
        const samples = [];
        for (const [dx, dy] of [[1, -20], [8, -45], [50, -60], [100, -80]]) {
          pointer('pointermove', dx, dy);
          const prevented = touch('touchmove', dx, dy);
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          samples.push({ x: new DOMMatrixReadOnly(getComputedStyle(outer).transform).m41, prevented });
        }
        pointer('pointerup', 100, -80);
        touch('touchend', 100, -80);
        // A trailing click may arrive well after the old 150ms drag timer.
        await new Promise(r => setTimeout(r, 350));
        outer.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: ${card.cx}, clientY: ${card.cy} }));
        return samples;
      })()`);
      assert.ok(samples.every(s => Math.abs(s.x) < 0.5), 'Vertical scroll must keep the outer card centered, including later horizontal drift');
      assert.ok(samples.every(s => !s.prevented), 'Vertical ownership must leave native scrolling enabled');
      assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 0);
      assert.equal((await getCardCenter()).char, card.char);
      assert.ok((await getCardCenter()).ariaLabel.includes('back face'), 'A delayed scroll click must not flip the card');
      // A new real touch clears scroll suppression and still reveals/flips normally.
      await dispatchTouchDrag(card.cx, card.cy, 0, 0, 1, 20);
      await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('front face')`);
    }
  });

  it('28. Opt-in diagnostics distinguish a short drag, native cancellation and a successful N5 revealed swipe without altering progress rules', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    await cdp.eval('window.mountSession()');
    await getCardCenter();
    assert.equal(await cdp.eval('document.querySelector("[data-testid=swipe-diagnostic]") !== null'), false);

    await cdp.eval(`window.mountSession({ courseId: 'ja-n5', initialEntry: '/learn/session?level=N5&gestureDebug=1' })`);
    let card = await getCardCenter();
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.cx, y: card.cy, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.cx, y: card.cy, button: 'left', buttons: 0, clickCount: 1 });
    await waitForCondition(`document.querySelector('.swipe-card--active')?.getAttribute('aria-label')?.includes('back face')`);
    await new Promise((r) => setTimeout(r, 450));

    await dispatchTouchDrag(card.cx, card.cy, 30, 0, 6, 50);
    await waitForCondition(`document.querySelector('[data-testid=swipe-diagnostic]')?.textContent.includes('below-threshold')`);
    let report = await cdp.eval(`document.querySelector('[data-testid=swipe-diagnostic]').textContent`);
    assert.match(report, /back.*pointerup/);
    assert.match(report, /dx 30px/);
    assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 0);
    await new Promise((r) => setTimeout(r, 450));

    card = await getCardCenter();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: card.cx, y: card.cy, id: 0 }] });
    for (let i = 1; i <= 6; i++) {
      await new Promise((r) => setTimeout(r, 25));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: card.cx + i * 20, y: card.cy, id: 0 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await waitForCondition(`document.querySelector('[data-testid=swipe-diagnostic]')?.textContent.includes('cancelled')`);
    assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 0);
    await new Promise((r) => setTimeout(r, 450));
    assert.equal((await getCardCenter()).char, 'あそこ');

    card = await getCardCenter();
    await dispatchTouchDrag(card.cx, card.cy, 120, 0, 6, 25);
    await waitForCondition(`document.querySelector('.swipe-card--active .swipe-card__character')?.textContent === 'あちら'`);
    report = await cdp.eval(`document.querySelector('[data-testid=swipe-diagnostic]').textContent`);
    assert.match(report, /accepted-right.*back.*pointerup/);
    assert.equal((await cdp.eval(`window.db.get('learned_words') || []`)).length, 1);
    assert.equal(await cdp.eval(`getComputedStyle(document.querySelector('[data-testid=swipe-diagnostic]')).pointerEvents`), 'none');

    await cdp.eval(`window.mountSession({ initialEntry: '/learn/session?level=HSK1&gestureDebug=0' })`);
    await getCardCenter();
    assert.equal(await cdp.eval('document.querySelector("[data-testid=swipe-diagnostic]") !== null'), false);
  });

  it('27. Measured investigation of commit sensitivity vs exit animation: 36px/50ms flick commits while slow 36px/200ms drag cancels', async (t) => {
    if (!browserPath) return t.skip('No real browser executable');

    // Measure A: Slow drag (+36px over 200ms) cancels and springs back to center
    await cdp.eval('window.mountSession()');
    const initA = await getCardCenter();
    const restingLeft = await cdp.eval(`document.querySelector('.swipe-card--active').getBoundingClientRect().left`);

    // Drag +36px slowly in 4 steps of 50ms each (total 200ms, velocity = 36/0.2 = 180 px/s)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: initA.cx, y: initA.cy, button: 'left', buttons: 1, clickCount: 1 });
    for (let s = 1; s <= 4; s++) {
      await new Promise((r) => setTimeout(r, 50));
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: initA.cx + s * 9, y: initA.cy, button: 'left', buttons: 1 });
    }
    await new Promise((r) => setTimeout(r, 20));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: initA.cx + 36, y: initA.cy, button: 'left', buttons: 0, clickCount: 1 });

    // Measure spring return time
    const springStart = Date.now();
    await waitForCondition(`(() => {
      const el = document.querySelector('.swipe-card--active');
      if (!el) return false;
      const l = el.getBoundingClientRect().left;
      return Math.abs(l - ${restingLeft}) < 3;
    })()`);
    const springDurationMs = Date.now() - springStart;

    const stateAfterSlow = await getCardCenter();
    assert.strictEqual(stateAfterSlow.char, '爱', 'Slow 36px drag cancels; card remains 爱');
    const learnedSlow = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedSlow.length, 0, 'No progress written for slow 36px drag');

    // Measure B: Fast flick (+36px in ~15ms, velocity > 800) commits!
    await cdp.eval('window.mountSession()');
    const initB = await getCardCenter();

    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: initB.cx, y: initB.cy, button: 'left', buttons: 1, clickCount: 1 });
    await new Promise((r) => setTimeout(r, 10));
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: initB.cx + 36, y: initB.cy, button: 'left', buttons: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: initB.cx + 36, y: initB.cy, button: 'left', buttons: 0, clickCount: 1 });

    const exitStart = Date.now();
    await waitForCondition(`(() => {
      const c = document.querySelector('.swipe-card--active .swipe-card__character');
      return c && c.textContent.trim() === '八';
    })()`);
    const exitDurationMs = Date.now() - exitStart;

    const learnedFlick = await cdp.eval(`window.db.get('learned_words') || []`);
    assert.strictEqual(learnedFlick.length, 1, 'Fast 36px flick commits swipe');
    assert.strictEqual(learnedFlick[0].character, '爱');

    // Telemetry log for report
    console.log(`[MEASUREMENT_TELEMETRY] SlowDrag(36px/200ms): CANCELLED -> spring return = ${springDurationMs}ms; FastFlick(36px/50ms): COMMITTED -> exit transit = ${exitDurationMs}ms`);
  });
});
