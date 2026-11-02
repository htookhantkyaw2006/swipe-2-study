/**
 * Text-to-Speech (TTS) client scaffold (INACTIVE).
 *
 * Current Status: INACTIVE and OUTSIDE current delivery scope.
 * VITE_TTS_API_URL is unset. Audio playback uses client-supplied recordings
 * and device speech synthesis fallback.
 * Provider credentials must never be exposed to the client bundle.
 */

let endpointOverride = null;

/**
 * Override the TTS endpoint for testing or runtime configuration.
 * Pass null to restore default environment-based resolution.
 */
export function setTtsEndpointForTesting(url) {
  endpointOverride = url;
}

/**
 * Returns the configured server-side TTS endpoint URL, or null if not configured.
 */
export function getTtsEndpoint() {
  if (endpointOverride !== null) return endpointOverride;
  if (typeof process !== 'undefined' && process.env?.VITE_TTS_API_URL) {
    const val = process.env.VITE_TTS_API_URL.trim();
    return val.length > 0 ? val : null;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TTS_API_URL) {
    const val = String(import.meta.env.VITE_TTS_API_URL).trim();
    return val.length > 0 ? val : null;
  }
  return null;
}

/**
 * Returns true only when a server-side TTS endpoint is explicitly configured.
 */
export function isTtsApiConfigured() {
  const endpoint = getTtsEndpoint();
  return typeof endpoint === 'string' && endpoint.length > 0;
}

/** Session-level in-memory cache for audio URLs: `${lang}:${speed}:${text}` -> URL string */
const ttsAudioCache = new Map();

/**
 * Generates a normalized cache key for synthesized audio.
 */
export function getTtsCacheKey(text, language = 'zh', speed = 1.0) {
  const cleanText = typeof text === 'string' ? text.trim() : '';
  const cleanLang = typeof language === 'string' ? language.trim().toLowerCase() : 'zh';
  const cleanSpeed = Number(speed) || 1.0;
  return `${cleanLang}:${cleanSpeed}:${cleanText}`;
}

/**
 * Clears the in-memory TTS audio cache and revokes any created blob URLs to prevent memory leaks.
 */
export function clearTtsAudioCache() {
  for (const url of ttsAudioCache.values()) {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // Ignore revocation errors during teardown
        }
      }
    }
  }
  ttsAudioCache.clear();
}

/**
 * Requests synthesized audio from the configured server-side TTS endpoint.
 *
 * @param {Object} options
 * @param {string} options.text The word or phrase to synthesize
 * @param {string} [options.language='zh'] Language code ('zh' or 'ja')
 * @param {number} [options.speed=1.0] Playback speed (0.5 to 2.0)
 * @param {Function} [options.fetchFn=fetch] Custom fetch implementation (for testing)
 * @param {number} [options.timeoutMs=6000] Network timeout in milliseconds
 * @returns {Promise<string|null>} Resolves to a playable audio URL, or null on failure / unconfigured
 */
export async function requestTtsAudio({
  text,
  language = 'zh',
  speed = 1.0,
  fetchFn = typeof fetch !== 'undefined' ? fetch : null,
  timeoutMs = 6000,
} = {}) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }
  if (!isTtsApiConfigured() || !fetchFn) {
    return null;
  }

  const endpoint = getTtsEndpoint();
  const cacheKey = getTtsCacheKey(text, language, speed);

  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey);
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const res = await fetchFn(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        language,
        speed,
      }),
      signal: controller ? controller.signal : undefined,
    });

    if (!res || !res.ok) {
      return null;
    }

    const contentType = res.headers?.get?.('content-type') || '';
    let audioUrl = null;

    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data?.audio_url && typeof data.audio_url === 'string') {
        audioUrl = data.audio_url;
      }
    } else if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
      if (typeof res.blob === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = await res.blob();
        audioUrl = URL.createObjectURL(blob);
      }
    }

    if (audioUrl) {
      ttsAudioCache.set(cacheKey, audioUrl);
      return audioUrl;
    }

    return null;
  } catch {
    return null;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

