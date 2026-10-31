import { sayOf } from './entry.js';

/**
 * Resolves a vocabulary audio path against the application origin root,
 * ensuring nested routes (e.g. /learn/level/HSK1 or /learn/session) resolve
 * to the same static asset URL.
 *
 * Serving convention:
 * Static recordings live in public/audio/zh/hsk1/<id>.mp3 and are served at root /audio/...
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
 * Default speech fallback for browser environments without injected speaker.
 */
function defaultBrowserSpeak(text) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis errors
  }
}

/**
 * Centralized word audio playback helper with playback cancellation and speech fallback.
 *
 * Used by:
 * - LessonPicker word list playback
 * - Flashcard manual button playback
 * - Flashcard session autoplay
 *
 * Guarantees:
 * - Null, blank, or whitespace audio_path never instantiates Audio; immediately triggers speech fallback.
 * - Relative audio paths resolve to application origin root regardless of active route.
 * - On media loading error or play() rejection, falls back to speech synthesis exactly once.
 * - Cancelling/disposing playback prevents stale/delayed fallback speech if the card changes or session ends.
 */
export function playWordAudio(word, {
  speakFn = null,
  sayFn = sayOf,
  audioCtor = typeof Audio !== 'undefined' ? Audio : null,
  baseOrigin = null,
} = {}) {
  const fallbackText = sayFn(word);
  const resolvedUrl = resolveAudioUrl(word?.audio_path, baseOrigin);

  let cancelled = false;
  let hasFallenBack = false;

  const fallback = () => {
    if (cancelled || hasFallenBack) return;
    hasFallenBack = true;
    if (typeof speakFn === 'function') {
      speakFn(fallbackText);
    } else {
      defaultBrowserSpeak(fallbackText);
    }
  };

  // If no audio path or Audio constructor unavailable, immediately trigger speech fallback
  if (!resolvedUrl || !audioCtor) {
    fallback();
    return {
      cancel: () => {
        cancelled = true;
      },
      hasAudio: false,
      url: null,
      audio: null,
    };
  }

  let audio = null;
  try {
    audio = new audioCtor(resolvedUrl);
    audio.addEventListener('error', fallback, { once: true });
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(fallback);
    }
  } catch {
    fallback();
  }

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

  return {
    cancel,
    hasAudio: true,
    url: resolvedUrl,
    audio,
  };
}
