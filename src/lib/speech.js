import { readPreferences, SPEECH_RATES } from './preferences.jsx';
import { getCourse } from '../courses';
import { getActiveLanguageId } from './activeLanguage';

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

export function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;

  const { speechRate } = readPreferences();

  // Cancel anything still playing so rapid taps do not queue up.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speechLang();
  utterance.rate = SPEECH_RATES[speechRate] ?? 1;
  window.speechSynthesis.speak(utterance);
}

/** True when the user has asked for pronunciation to play automatically. */
export function shouldAutoPlay() {
  return readPreferences().autoPlayAudio === true;
}
