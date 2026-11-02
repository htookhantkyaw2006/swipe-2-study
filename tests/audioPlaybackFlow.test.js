import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAudioUrl, playWordAudio } from '../src/lib/wordAudio.js';
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
