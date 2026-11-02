import { readPreferences, SPEECH_RATES } from './preferencesDefaults.js';
import { getCourse } from '../courses/index.js';
import { getActiveLanguageId } from './activeLanguage.js';

/* ---------------------------------------------------------------
   SPEECH
   ---------------------------------------------------------------
   Single entry point for reading the target language aloud, so the
   Audio settings (speech rate, accent) apply everywhere.

   The voice follows the active course: zh-CN or zh-TW for Chinese,
   ja-JP for Japanese. A stored accent that does not belong to the
   current course is ignored rather than used — a Chinese voice
   reading Japanese would be worse than silence.

   Reads preferences from storage rather than context because this
   runs from plain event handlers outside the React tree.
   --------------------------------------------------------------- */

/** The speech-synthesis language code for the active course. */
export function speechLang() {
  const course = getCourse(getActiveLanguageId());
  const chosen = readPreferences().accentByLanguage?.[course.id];
  const valid = course.speech.accents.some((a) => a.value === chosen);
  return valid ? chosen : course.speech.defaultAccent;
}

export function speak(text, { onStart = null, onEnd = null, onError = null, rate = null } = {}) {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onError && typeof onError === 'function') {
      onError(new Error('Speech synthesis is unavailable in this environment.'));
    }
    return;
  }

  // Cancel anything still playing so rapid taps do not queue up.
  try {
    window.speechSynthesis.cancel();
  } catch {}

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang();

  // If a numeric rate was explicitly provided, use it directly. Otherwise resolve from preference.
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    utterance.rate = rate;
  } else {
    const { speechRate } = readPreferences();
    utterance.rate = SPEECH_RATES[speechRate] ?? 1;
  }

  if (onStart && typeof onStart === 'function') {
    utterance.onstart = () => onStart();
  }
  if (onEnd && typeof onEnd === 'function') {
    utterance.onend = () => onEnd();
  }
  if (onError && typeof onError === 'function') {
    utterance.onerror = (e) => onError(e);
  }

  window.speechSynthesis.speak(utterance);
}

/** True when the user has asked for pronunciation to play automatically. */
export function shouldAutoPlay() {
  return readPreferences().autoPlayAudio === true;
}
