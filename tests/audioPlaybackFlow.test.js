import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudioUrl, playWordAudio, resolvePlaybackRate } from '../src/lib/wordAudio.js';
import { speechLang } from '../src/lib/speech.js';
import { setActiveLanguageId } from '../src/lib/activeLanguage.js';

test('1. Audio URL resolution: resolves origin root and absolute URLs cleanly', () => {
  // Relative paths
  assert.equal(
    resolveAudioUrl('audio/zh/hsk1/001.mp3', 'https://swipe2study.com'),
    'https://swipe2study.com/audio/zh/hsk1/001.mp3'
  );
  assert.equal(
    resolveAudioUrl('/audio/zh/hsk1/001.mp3', 'https://swipe2study.com'),
    'https://swipe2study.com/audio/zh/hsk1/001.mp3'
  );

  // Absolute URLs
  assert.equal(
    resolveAudioUrl('https://cdn.swipe2study.com/audio/ja/n5/001.mp3'),
    'https://cdn.swipe2study.com/audio/ja/n5/001.mp3'
  );

  // Null, empty, and whitespace
  assert.equal(resolveAudioUrl(null), null);
  assert.equal(resolveAudioUrl(''), null);
  assert.equal(resolveAudioUrl('   '), null);
});

test('2. Speech language: follows active course correctly for Chinese and Japanese', () => {
  setActiveLanguageId('zh');
  assert.match(speechLang(), /^zh-(CN|TW)$/);

  setActiveLanguageId('ja');
  assert.equal(speechLang(), 'ja-JP');

  // Reset back to zh
  setActiveLanguageId('zh');
});

test('3. Audio playback flow: handles word objects and example sentences with callbacks', async () => {
  class MockAudio {
    constructor(src) {
      this.src = src;
      this.listeners = {};
      this.playCallCount = 0;
      this.pauseCallCount = 0;
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
      }
    }
    dispatchEvent(event) {
      const fns = this.listeners[event.type] || [];
      for (const fn of fns) fn(event);
    }
    play() {
      this.playCallCount++;
      return Promise.resolve();
    }
    pause() {
      this.pauseCallCount++;
    }
  }

  let started = false;
  let ended = false;
  let spoken = null;

  const wordWithAudio = {
    character: '爱',
    pronunciation: 'ài',
    audio_path: 'audio/zh/hsk1/ai.mp3',
  };

  const playback = playWordAudio(wordWithAudio, {
    audioCtor: MockAudio,
    baseOrigin: 'https://swipe2study.com',
    speakFn: (t) => { spoken = t; },
    onStart: () => { started = true; },
    onEnded: () => { ended = true; },
  });

  assert.equal(playback.hasAudio, true);
  assert.equal(playback.url, 'https://swipe2study.com/audio/zh/hsk1/ai.mp3');

  // Trigger play event
  playback.audio.dispatchEvent({ type: 'play' });
  assert.equal(started, true, 'onStart called on play event');

  // Trigger ended event
  playback.audio.dispatchEvent({ type: 'ended' });
  assert.equal(ended, true, 'onEnded called on ended event');
  assert.equal(spoken, null, 'No speech fallback when audio succeeds');
});

test('4. Audio fallback: falls back to speech synthesis when audio errors or is missing', () => {
  class FailingAudio {
    constructor(src) {
      this.src = src;
      this.listeners = {};
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener() {}
    dispatchEvent(event) {
      const fns = this.listeners[event.type] || [];
      for (const fn of fns) fn(event);
    }
    play() {
      return Promise.reject(new Error('Audio decode error'));
    }
    pause() {}
  }

  let spoken = [];
  const word = {
    character: '你好',
    pronunciation: 'nǐ hǎo',
    audio_path: 'audio/zh/hsk1/nihao.mp3',
  };

  playWordAudio(word, {
    audioCtor: FailingAudio,
    baseOrigin: 'https://swipe2study.com',
    speakFn: (t) => spoken.push(t),
  });

  // Since play() rejects, fallback runs
  return Promise.resolve().then(() => {
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0], '你好');
  });
});

test('5. Audio across views: vocabulary list, flashcards, Saved/Review, dictionary, and examples', () => {
  const playedUrls = [];
  class TrackingAudio {
    constructor(src) {
      this.src = src;
      playedUrls.push(src);
      this.listeners = {};
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener() {}
    play() {
      return Promise.resolve();
    }
    pause() {}
  }

  const baseOrigin = 'https://swipe2study.com';

  // 1. Vocabulary list / Flashcard word
  const vocabCard = {
    character: '中国',
    reading: 'zhōng guó',
    audio_path: 'audio/zh/hsk1/001.mp3',
  };
  const p1 = playWordAudio(vocabCard, { audioCtor: TrackingAudio, baseOrigin });
  assert.equal(p1.hasAudio, true);
  assert.equal(p1.url, 'https://swipe2study.com/audio/zh/hsk1/001.mp3');

  // 2. Saved / Review word format (stored record with phrase)
  const savedRecord = {
    phrase: '谢谢',
    reading: 'xièxie',
    audio_path: 'audio/zh/hsk1/003.mp3',
  };
  const p2 = playWordAudio(savedRecord, { audioCtor: TrackingAudio, baseOrigin });
  assert.equal(p2.hasAudio, true);
  assert.equal(p2.url, 'https://swipe2study.com/audio/zh/hsk1/003.mp3');

  // 3. Dictionary entry format
  const dictWord = {
    phrase: '再见',
    reading: 'zàijiàn',
    audio_path: 'audio/zh/hsk1/004.mp3',
  };
  const p3 = playWordAudio(dictWord, { audioCtor: TrackingAudio, baseOrigin });
  assert.equal(p3.hasAudio, true);
  assert.equal(p3.url, 'https://swipe2study.com/audio/zh/hsk1/004.mp3');

  // 4. Example sentence object with client-supplied audio_path
  const exampleWithAudio = {
    text: '我是中国人。',
    reading: 'Wǒ shì Zhōngguó rén.',
    audio_path: 'audio/zh/hsk1/ex_001.mp3',
  };
  const p4 = playWordAudio(exampleWithAudio, { audioCtor: TrackingAudio, baseOrigin });
  assert.equal(p4.hasAudio, true);
  assert.equal(p4.url, 'https://swipe2study.com/audio/zh/hsk1/ex_001.mp3');

  // 5. Example sentence without audio_path: falls back to speech synthesis reading the sentence text
  let spokenExample = null;
  const exampleWithoutAudio = {
    text: '你好吗？',
    reading: 'Nǐ hǎo ma?',
  };
  const p5 = playWordAudio(exampleWithoutAudio, {
    audioCtor: TrackingAudio,
    baseOrigin,
    speakFn: (t) => { spokenExample = t; },
  });
  assert.equal(p5.hasAudio, false);
  assert.equal(spokenExample, '你好吗？');

  assert.equal(playedUrls.length, 4);
});

test('6. Playback cancellation: halts active audio and prevents delayed fallback', () => {
  let paused = false;
  let emptied = false;
  class CancellableAudio {
    constructor(src) {
      this.src = src;
      this.listeners = {};
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener(event, fn) {
      if (this.listeners[event]) {
        this.listeners[event] = this.listeners[event].filter((f) => f !== fn);
      }
    }
    play() {
      return new Promise((resolve) => setTimeout(resolve, 100));
    }
    pause() {
      paused = true;
    }
    set src(v) {
      this._src = v;
      if (v === '') emptied = true;
    }
    get src() {
      return this._src;
    }
  }

  let spoken = false;
  const word = { character: '水', audio_path: 'audio/zh/hsk1/shui.mp3' };
  const playback = playWordAudio(word, {
    audioCtor: CancellableAudio,
    speakFn: () => { spoken = true; },
  });

  // Cancel immediately before play finishes
  playback.cancel();
  assert.equal(paused, true, 'Must pause audio on cancel');
  assert.equal(emptied, true, 'Must reset src on cancel');
  assert.equal(spoken, false, 'Cancel must not trigger fallback');
});

test('7. Recorded audio playback rate: applies user speed preference (slow: 0.6, normal: 1.0, fast: 1.4) without compounding', () => {
  // Test resolvePlaybackRate helper
  assert.equal(resolvePlaybackRate('slow'), 0.6);
  assert.equal(resolvePlaybackRate('normal'), 1.0);
  assert.equal(resolvePlaybackRate('fast'), 1.4);
  assert.equal(resolvePlaybackRate(0.85), 0.85);

  let assignedPlaybackRate = null;
  let assignedDefaultRate = null;

  class RateTrackingAudio {
    constructor(src) {
      this.src = src;
      this.playbackRate = 1.0;
      this.defaultPlaybackRate = 1.0;
      this.listeners = {};
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener() {}
    play() {
      assignedPlaybackRate = this.playbackRate;
      assignedDefaultRate = this.defaultPlaybackRate;
      return Promise.resolve();
    }
  }

  const word = { character: '书', audio_path: 'audio/zh/hsk1/shu.mp3' };

  // Slow speed
  playWordAudio(word, { audioCtor: RateTrackingAudio, speed: 'slow' });
  assert.equal(assignedPlaybackRate, 0.6, 'playbackRate must be 0.6 for slow');
  assert.equal(assignedDefaultRate, 0.6);

  // Fast speed
  playWordAudio(word, { audioCtor: RateTrackingAudio, speed: 'fast' });
  assert.equal(assignedPlaybackRate, 1.4, 'playbackRate must be 1.4 for fast');

  // Normal speed
  playWordAudio(word, { audioCtor: RateTrackingAudio, speed: 'normal' });
  assert.equal(assignedPlaybackRate, 1.0, 'playbackRate must be 1.0 for normal');

  // Fallback rate forwarding without compounding
  let fallbackOptions = null;
  class FailingRateAudio {
    constructor(src) {
      this.src = src;
      this.playbackRate = 1.0;
      this.listeners = {};
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    removeEventListener() {}
    play() {
      return Promise.reject(new Error('Audio load failure'));
    }
  }

  playWordAudio(word, {
    audioCtor: FailingRateAudio,
    speed: 'slow',
    speakFn: (text, opts) => {
      fallbackOptions = opts;
    },
  });

  return Promise.resolve().then(() => {
    assert.ok(fallbackOptions);
    assert.equal(fallbackOptions.rate, 0.6, 'Fallback must receive target rate 0.6 without squaring or re-multiplying');
  });
});
