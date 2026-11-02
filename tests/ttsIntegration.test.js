import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTtsApiConfigured,
  setTtsEndpointForTesting,
  getTtsEndpoint,
  requestTtsAudio,
  clearTtsAudioCache,
} from '../src/lib/ttsClient.js';
import { createTtsHttpHandler, resolveCorsHeaders } from '../src/server/ttsProxy.js';
import { playWordAudio } from '../src/lib/wordAudio.js';

test('1. TTS Client Configuration: disabled by default and requires server endpoint', () => {
  setTtsEndpointForTesting(null);
  assert.equal(isTtsApiConfigured(), false, 'TTS must be unconfigured by default');
  assert.equal(getTtsEndpoint(), null);

  setTtsEndpointForTesting('https://api.swipe2study.com/v1/tts');
  assert.equal(isTtsApiConfigured(), true);
  assert.equal(getTtsEndpoint(), 'https://api.swipe2study.com/v1/tts');

  // Reset
  setTtsEndpointForTesting(null);
  assert.equal(isTtsApiConfigured(), false);
});

test('2. TTS Client: request returns null when unconfigured without making requests', async () => {
  setTtsEndpointForTesting(null);
  let fetchCalled = false;
  const result = await requestTtsAudio({
    text: '你好',
    fetchFn: async () => {
      fetchCalled = true;
      return new Response('audio');
    },
  });
  assert.equal(result, null);
  assert.equal(fetchCalled, false, 'Must not call fetch when unconfigured');
});

test('3. TTS Client: in-memory caching eliminates duplicate network calls and expenses', async () => {
  clearTtsAudioCache();
  setTtsEndpointForTesting('https://api.swipe2study.com/v1/tts');

  let callCount = 0;
  const mockFetch = async (url, opts) => {
    callCount++;
    const body = JSON.parse(opts.body);
    assert.equal(body.text, '学生');
    assert.equal(body.language, 'zh');
    return new Response(JSON.stringify({ audio_url: 'https://cdn.swipe2study.com/tts/xuesheng.mp3' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const url1 = await requestTtsAudio({ text: '学生', language: 'zh', fetchFn: mockFetch });
  assert.equal(url1, 'https://cdn.swipe2study.com/tts/xuesheng.mp3');
  assert.equal(callCount, 1);

  // Second call with same text should hit cache
  const url2 = await requestTtsAudio({ text: '学生', language: 'zh', fetchFn: mockFetch });
  assert.equal(url2, 'https://cdn.swipe2study.com/tts/xuesheng.mp3');
  assert.equal(callCount, 1, 'Cache hit must not invoke network');

  // Clear cache and verify refetch
  clearTtsAudioCache();
  const url3 = await requestTtsAudio({ text: '学生', language: 'zh', fetchFn: mockFetch });
  assert.equal(url3, 'https://cdn.swipe2study.com/tts/xuesheng.mp3');
  assert.equal(callCount, 2);

  // Teardown
  clearTtsAudioCache();
  setTtsEndpointForTesting(null);
});

test('4. TTS Server Proxy: CORS preflight and allowlist enforcement', async () => {
  const allowed = resolveCorsHeaders('https://swipe2study.com', 'https://swipe2study.com, https://staging.swipe2study.com');
  assert.equal(allowed.isAllowed, true);
  assert.equal(allowed.headers['Access-Control-Allow-Origin'], 'https://swipe2study.com');

  const disallowed = resolveCorsHeaders('https://malicious-site.com', 'https://swipe2study.com');
  assert.equal(disallowed.isAllowed, false);
  assert.equal(disallowed.headers['Access-Control-Allow-Origin'], '');

  const handler = createTtsHttpHandler({
    getEnv: () => ({ ALLOWED_ORIGINS: 'https://swipe2study.com' }),
  });

  // Disallowed origin preflight receives 403
  const badReq = new Request('https://api.swipe2study.com/tts', {
    method: 'OPTIONS',
    headers: { Origin: 'https://malicious-site.com' },
  });
  const badRes = await handler(badReq);
  assert.equal(badRes.status, 403);

  // Disallowed origin POST is rejected with 403 before processing body or calling adapter
  const badPost = new Request('https://api.swipe2study.com/tts', {
    method: 'POST',
    headers: { Origin: 'https://malicious-site.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '你好', language: 'zh' }),
  });
  const badPostRes = await handler(badPost);
  assert.equal(badPostRes.status, 403);
  const badPostData = await badPostRes.json();
  assert.equal(badPostData.error, 'CORS_ORIGIN_DENIED');
});

test('5. TTS Server Proxy: Input validation enforces bounded string lengths and valid language', async () => {
  const handler = createTtsHttpHandler({
    getEnv: () => ({ ALLOWED_ORIGINS: 'https://swipe2study.com' }),
  });

  const send = async (body) => {
    const req = new Request('https://api.swipe2study.com/tts', {
      method: 'POST',
      headers: { Origin: 'https://swipe2study.com', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return handler(req);
  };

  // Missing text
  const res1 = await send({ language: 'zh' });
  assert.equal(res1.status, 400);
  const data1 = await res1.json();
  assert.equal(data1.error, 'MISSING_TEXT');

  // Unsupported language
  const res2 = await send({ text: 'Hello', language: 'fr' });
  assert.equal(res2.status, 400);
  const data2 = await res2.json();
  assert.equal(data2.error, 'UNSUPPORTED_LANGUAGE');

  // Unconfigured provider returns 503
  const res3 = await send({ text: '你好', language: 'zh' });
  assert.equal(res3.status, 503);
  const data3 = await res3.json();
  assert.equal(data3.error, 'TTS_SERVICE_UNCONFIGURED');
});

test('6. TTS Server Proxy: Passes sanitized request to provider adapter and streams response', async () => {
  let adapterCalledWith = null;
  const mockAdapter = async ({ text, language, speed }) => {
    adapterCalledWith = { text, language, speed };
    return {
      audioBuffer: Buffer.from('mock-audio-bytes'),
      contentType: 'audio/mpeg',
    };
  };

  const handler = createTtsHttpHandler({
    getEnv: () => ({ ALLOWED_ORIGINS: 'https://swipe2study.com' }),
    ttsAdapter: mockAdapter,
  });

  const req = new Request('https://api.swipe2study.com/tts', {
    method: 'POST',
    headers: { Origin: 'https://swipe2study.com', 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'ありがとう', language: 'ja', speed: 1.0 }),
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(adapterCalledWith.text, 'ありがとう');
  assert.equal(adapterCalledWith.language, 'ja');
});

test('7. playWordAudio integration with TTS: fallback order is static audio -> TTS -> speech', async () => {
  class MockAudio {
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
      return Promise.resolve();
    }
    pause() {}
  }

  let spoken = [];
  setTtsEndpointForTesting('https://api.swipe2study.com/v1/tts');

  // Word without audio_path requests TTS
  let ttsCalled = false;
  const word = { character: '猫', pronunciation: 'māo' };

  const playback = playWordAudio(word, {
    audioCtor: MockAudio,
    speakFn: (t) => spoken.push(t),
    ttsFn: async ({ text }) => {
      ttsCalled = true;
      assert.equal(text, '猫');
      return 'https://cdn.swipe2study.com/tts/mao.mp3';
    },
  });

  assert.equal(playback.hasAudio, true);

  // Wait for async TTS resolution
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(ttsCalled, true);
  assert.equal(spoken.length, 0, 'No speech fallback when TTS succeeds');

  // If TTS fails, falls back cleanly to speech synthesis
  spoken = [];
  playWordAudio(word, {
    audioCtor: MockAudio,
    speakFn: (t) => spoken.push(t),
    ttsFn: async () => null, // TTS unavailable
  });

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0], '猫');

  // Teardown
  setTtsEndpointForTesting(null);
  clearTtsAudioCache();
});
