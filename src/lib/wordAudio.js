import { sayOf } from './entry.js';
import { speak } from './speech.js';
import { requestTtsAudio, isTtsApiConfigured } from './ttsClient.js';
import { getActiveLanguageId } from './activeLanguage.js';
import { readPreferences, SPEECH_RATES } from './preferencesDefaults.js';

/**
 * Resolves a vocabulary audio path against the application origin root,
 * ensuring nested routes (e.g. /learn/level/HSK1 or /learn/session) resolve
 * to the same static asset URL.
 *
 * Serving convention:
 * Static recordings live in public/audio/zh/hsk1/<id>.mp3 or public/audio/ja/n5/<id>.mp3
 * and are served at root /audio/...
 * Relative CSV paths like "audio/zh/hsk1/..." resolve to "/audio/zh/hsk1/..." or full origin URL.
 * Absolute URLs (http/https) are preserved as-is.
 * Blank or whitespace strings return null.
 */
export function resolveAudioUrl(audioPath, baseOrigin = null) {
  if (typeof audioPath !== 'string') return null;
  const trimmed = audioPath.trim();
  if (trimmed.length === 0) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const origin = baseOrigin || (typeof window !== 'undefined' && (window.location?.origin || window.location?.href) ? (window.location.origin || window.location.href) : 'http://localhost');
  const cleanPath = trimmed.replace(/^\/+/, '');
  try {
    return new URL('/' + cleanPath, origin).href;
  } catch {
    return '/' + cleanPath;
  }
}

/**
 * Resolves the numeric playback rate (0.6, 1.0, 1.4, etc.) for recorded audio and speech fallback.
 * By default, reads the user's stored speechRate preference ('slow' -> 0.6, 'normal' -> 1.0, 'fast' -> 1.4).
 */
export function resolvePlaybackRate(speedOption = null) {
  if (typeof speedOption === 'number' && Number.isFinite(speedOption) && speedOption > 0) {
    return speedOption;
  }
  if (typeof speedOption === 'string' && speedOption in SPEECH_RATES) {
    return SPEECH_RATES[speedOption];
  }
  try {
    const pref = readPreferences()?.speechRate;
    if (pref && pref in SPEECH_RATES) {
      return SPEECH_RATES[pref];
    }
  } catch {
    // Ignore preferences read errors in mock environments
  }
  return SPEECH_RATES.normal ?? 1.0;
}

/**
 * Default speech fallback for browser environments, honoring active course language and user speech rate.
 */
function defaultBrowserSpeak(text, options = {}) {
  if (!text) return;
  speak(text, options);
}

/**
 * Centralized word audio playback helper with playback cancellation, state tracking, and speech fallback.
 *
 * Used by:
 * - LessonPicker word list playback
 * - Flashcard manual button playback
 * - Flashcard session autoplay
 * - Flashcard example sentence playback
 * - WordCollection (Saved & Review) playback
 * - Dictionary word playback
 *
 * Guarantees:
 * - Null, blank, or whitespace audio_path never instantiates Audio; immediately triggers speech fallback.
 * - Relative audio paths resolve to application origin root regardless of active route.
 * - Applies user speech rate preference (slow: 0.6, normal: 1.0, fast: 1.4) to recorded audio and fallback speech.
 * - On media loading error or play() rejection, falls back to speech synthesis exactly once without compounding rate.
 * - Cancelling/disposing playback prevents stale/delayed fallback speech if the card changes or session ends.
 * - Preserves Chinese/Japanese language selection and speech speed settings.
 */
export function playWordAudio(word, {
  speakFn = null,
  sayFn = sayOf,
  audioCtor = typeof Audio !== 'undefined' ? Audio : null,
  baseOrigin = null,
  onStart = null,
  onEnded = null,
  onError = null,
  ttsFn = requestTtsAudio,
  language = null,
  speed = null,
} = {}) {
  const fallbackText = typeof word === 'string' ? word : sayFn(word);
  const resolvedUrl = typeof word === 'string' ? null : resolveAudioUrl(word?.audio_path, baseOrigin);
  const targetRate = resolvePlaybackRate(speed);

  let cancelled = false;
  let hasFallenBack = false;
  let audio = null;

  const fallback = (_err) => {
    if (cancelled || hasFallenBack) return;
    hasFallenBack = true;
    const speaker = typeof speakFn === 'function' ? speakFn : defaultBrowserSpeak;
    try {
      speaker(fallbackText, { onStart, onEnd: onEnded, onError, rate: targetRate });
    } catch (e) {
      if (onError && typeof onError === 'function') onError(e);
    }
  };

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (audio) {
      if (typeof audio.removeEventListener === 'function') {
        audio.removeEventListener('error', fallback);
      }
      try {
        if (typeof audio.pause === 'function') audio.pause();
        audio.src = '';
      } catch {
        // Ignore cleanup errors on paused/detached audio
      }
    }
  };

  const playWithAudioCtor = (url) => {
    try {
      audio = new audioCtor(url);
      try {
        audio.playbackRate = targetRate;
        audio.defaultPlaybackRate = targetRate;
      } catch {
        // Mock or restricted environment
      }
      audio.addEventListener('error', fallback, { once: true });
      if (onStart && typeof onStart === 'function') {
        audio.addEventListener('play', () => { if (!cancelled) onStart(); }, { once: true });
      }
      if (onEnded && typeof onEnded === 'function') {
        audio.addEventListener('ended', () => { if (!cancelled) onEnded(); }, { once: true });
      }

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(fallback);
      }
    } catch (e) {
      fallback(e);
    }
  };

  // 1. Static audio file playback
  if (resolvedUrl && audioCtor) {
    playWithAudioCtor(resolvedUrl);
    return {
      cancel,
      hasAudio: true,
      url: resolvedUrl,
      playbackRate: targetRate,
      get audio() {
        return audio;
      },
    };
  }

  // 2. External API / TTS endpoint if configured (inactive by default)
  if (isTtsApiConfigured() && audioCtor && fallbackText) {
    const lang = language || (typeof getActiveLanguageId === 'function' ? getActiveLanguageId() : 'zh');
    ttsFn({ text: fallbackText, language: lang, speed: targetRate })
      .then((ttsUrl) => {
        if (cancelled) return;
        if (!ttsUrl) {
          fallback();
          return;
        }
        playWithAudioCtor(ttsUrl);
      })
      .catch(fallback);

    return {
      cancel,
      hasAudio: true,
      url: null,
      playbackRate: targetRate,
      get audio() {
        return audio;
      },
    };
  }

  // 3. Fallback: Browser speech synthesis
  fallback();
  return {
    cancel,
    hasAudio: false,
    url: null,
    playbackRate: targetRate,
    audio: null,
  };
}
