import { sayOf } from './entry.js';
import { speak } from './speech.js';
import { requestTtsAudio, isTtsApiConfigured } from './ttsClient.js';
import { getActiveLanguageId } from './activeLanguage.js';

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
 * - On media loading error or play() rejection, falls back to speech synthesis exactly once.
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
  speed = 1.0,
} = {}) {
  const fallbackText = typeof word === 'string' ? word : sayFn(word);
  const resolvedUrl = typeof word === 'string' ? null : resolveAudioUrl(word?.audio_path, baseOrigin);

  let cancelled = false;
  let hasFallenBack = false;
  let audio = null;

  const fallback = (_err) => {
    if (cancelled || hasFallenBack) return;
    hasFallenBack = true;
    const speaker = typeof speakFn === 'function' ? speakFn : defaultBrowserSpeak;
    try {
      speaker(fallbackText, { onStart, onEnd: onEnded, onError });
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
      get audio() {
        return audio;
      },
    };
  }

  // 2. External API / TTS endpoint if configured
  if (isTtsApiConfigured() && audioCtor && fallbackText) {
    const lang = language || (typeof getActiveLanguageId === 'function' ? getActiveLanguageId() : 'zh');
    ttsFn({ text: fallbackText, language: lang, speed })
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
    audio: null,
  };
}
