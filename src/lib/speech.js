import { readPreferences, SPEECH_RATES } from './preferences.jsx';

/* ---------------------------------------------------------------
   SPEECH
   ---------------------------------------------------------------
   Single entry point for reading Chinese aloud, so the Audio
   settings (speech rate, accent) apply everywhere instead of each
   call site hardcoding its own utterance.

   Reads preferences from storage rather than context because this
   runs from plain event handlers outside the React tree.
   --------------------------------------------------------------- */
export function speak(text) {
  if (!text || !('speechSynthesis' in window)) return;

  const { speechRate, accent } = readPreferences();

  // Cancel anything still playing so rapid taps do not queue up.
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = accent;
  utterance.rate = SPEECH_RATES[speechRate] ?? 1;
  window.speechSynthesis.speak(utterance);
}

/** True when the user has asked for pronunciation to play automatically. */
export function shouldAutoPlay() {
  return readPreferences().autoPlayAudio === true;
}
