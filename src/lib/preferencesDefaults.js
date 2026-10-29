import { storageOwner } from './storageOwner.js';

export const DEFAULTS = Object.freeze({
  // Learning
  dailyGoal: 20,
  cardsPerSession: 10,
  cardOrder: 'sequential', // sequential | shuffle

  // Display
  showPinyin: true,
  showBurmese: true,
  translationLanguage: 'both', // english | burmese | both

  // Audio
  autoPlayAudio: false,
  speechRate: 'normal', // slow | normal | fast

  // Per language, because accents are language-specific codes: a
  // Taiwan choice for Chinese must survive a trip to Japanese.
  // Missing entries fall back to the course's default accent.
  accentByLanguage: Object.freeze({})
});

/** Option lists for the pickers, kept next to the defaults they describe. */
export const OPTIONS = Object.freeze({
  dailyGoal: [
    { value: 10, label: '10 cards' },
    { value: 20, label: '20 cards' },
    { value: 30, label: '30 cards' },
    { value: 50, label: '50 cards' }
  ],
  cardsPerSession: [
    { value: 5, label: '5 cards' },
    { value: 10, label: '10 cards' },
    { value: 20, label: '20 cards' },
    { value: 30, label: '30 cards' }
  ],
  cardOrder: [
    { value: 'sequential', label: 'Sequential' },
    { value: 'shuffle', label: 'Shuffle' }
  ],
  translationLanguage: [
    { value: 'english', label: 'English only' },
    { value: 'burmese', label: 'Burmese only' },
    { value: 'both', label: 'Both' }
  ],
  speechRate: [
    { value: 'slow', label: 'Slow' },
    { value: 'normal', label: 'Normal' },
    { value: 'fast', label: 'Fast' }
  ]
});

/** Numeric speechSynthesis rates for the three speed labels. */
export const SPEECH_RATES = Object.freeze({ slow: 0.6, normal: 1, fast: 1.4 });

/* Before languages, the accent was a single `accent` key and could only
   be Chinese. Carry it into the per-language map so nobody loses it. */
const upgrade = (stored) => {
  const { accent, ...rest } = stored;
  if (accent && !rest.accentByLanguage?.zh) {
    rest.accentByLanguage = { ...(rest.accentByLanguage || {}), zh: accent };
  }
  return rest;
};

export function readPreferences() {
  try {
    const raw = storageOwner.scope().getItem('preferences');
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...upgrade(JSON.parse(raw)) };
  } catch {
    // Blocked storage or malformed JSON — defaults keep the app usable.
    return { ...DEFAULTS };
  }
}
