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
});
