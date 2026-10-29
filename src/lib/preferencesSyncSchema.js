import { DEFAULTS } from './preferencesDefaults.js';

/**
 * Exact in-scope preference keys supported for account synchronization.
 * Documented in docs/account-preferences-sync.md.
 */
export const SUPPORTED_SETTINGS_KEYS = Object.freeze([
  'dailyGoal',
  'cardsPerSession',
  'cardOrder',
  'showPinyin',
  'showBurmese',
  'translationLanguage',
  'autoPlayAudio',
  'speechRate',
  'accentByLanguage',
]);

export const SUPPORTED_LANGUAGES = Object.freeze(['zh', 'ja', 'en']);

/**
 * Sanitizes and validates a settings object against the in-scope schema.
 * Drops unknown keys, validates types and ranges, and fills missing values from fallback/defaults.
 */
export function sanitizeSettings(rawSettings, fallback = DEFAULTS) {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return filterInScopePreferences(fallback || DEFAULTS);
  }

  const result = {};

  // dailyGoal: positive integer
  if (typeof rawSettings.dailyGoal === 'number' && Number.isFinite(rawSettings.dailyGoal) && rawSettings.dailyGoal > 0) {
    result.dailyGoal = Math.round(rawSettings.dailyGoal);
  } else if (typeof fallback?.dailyGoal === 'number') {
    result.dailyGoal = fallback.dailyGoal;
  } else {
    result.dailyGoal = DEFAULTS.dailyGoal;
  }

  // cardsPerSession: positive integer
  if (typeof rawSettings.cardsPerSession === 'number' && Number.isFinite(rawSettings.cardsPerSession) && rawSettings.cardsPerSession > 0) {
    result.cardsPerSession = Math.round(rawSettings.cardsPerSession);
  } else if (typeof fallback?.cardsPerSession === 'number') {
    result.cardsPerSession = fallback.cardsPerSession;
  } else {
    result.cardsPerSession = DEFAULTS.cardsPerSession;
  }

  // cardOrder: sequential | shuffle
  if (rawSettings.cardOrder === 'sequential' || rawSettings.cardOrder === 'shuffle') {
    result.cardOrder = rawSettings.cardOrder;
  } else if (fallback?.cardOrder === 'sequential' || fallback?.cardOrder === 'shuffle') {
    result.cardOrder = fallback.cardOrder;
  } else {
    result.cardOrder = DEFAULTS.cardOrder;
  }

  // showPinyin: boolean
  if (typeof rawSettings.showPinyin === 'boolean') {
    result.showPinyin = rawSettings.showPinyin;
  } else if (typeof fallback?.showPinyin === 'boolean') {
    result.showPinyin = fallback.showPinyin;
  } else {
    result.showPinyin = DEFAULTS.showPinyin;
  }

  // showBurmese: boolean
  if (typeof rawSettings.showBurmese === 'boolean') {
    result.showBurmese = rawSettings.showBurmese;
  } else if (typeof fallback?.showBurmese === 'boolean') {
    result.showBurmese = fallback.showBurmese;
  } else {
    result.showBurmese = DEFAULTS.showBurmese;
  }

  // translationLanguage: english | burmese | both
  if (['english', 'burmese', 'both'].includes(rawSettings.translationLanguage)) {
    result.translationLanguage = rawSettings.translationLanguage;
  } else if (['english', 'burmese', 'both'].includes(fallback?.translationLanguage)) {
    result.translationLanguage = fallback.translationLanguage;
  } else {
    result.translationLanguage = DEFAULTS.translationLanguage;
  }

  // autoPlayAudio: boolean
  if (typeof rawSettings.autoPlayAudio === 'boolean') {
    result.autoPlayAudio = rawSettings.autoPlayAudio;
  } else if (typeof fallback?.autoPlayAudio === 'boolean') {
    result.autoPlayAudio = fallback.autoPlayAudio;
  } else {
    result.autoPlayAudio = DEFAULTS.autoPlayAudio;
  }

  // speechRate: slow | normal | fast
  if (['slow', 'normal', 'fast'].includes(rawSettings.speechRate)) {
    result.speechRate = rawSettings.speechRate;
  } else if (['slow', 'normal', 'fast'].includes(fallback?.speechRate)) {
    result.speechRate = fallback.speechRate;
  } else {
    result.speechRate = DEFAULTS.speechRate;
  }

  // accentByLanguage: map of 2-3 char language code to accent string
  if (rawSettings.accentByLanguage && typeof rawSettings.accentByLanguage === 'object' && !Array.isArray(rawSettings.accentByLanguage)) {
    const accents = {};
    for (const [lang, accent] of Object.entries(rawSettings.accentByLanguage)) {
      if (typeof lang === 'string' && /^[a-z]{2,3}$/.test(lang) && typeof accent === 'string' && accent.length <= 32) {
        accents[lang] = accent;
      }
    }
    result.accentByLanguage = accents;
  } else if (fallback?.accentByLanguage && typeof fallback.accentByLanguage === 'object' && !Array.isArray(fallback.accentByLanguage)) {
    result.accentByLanguage = { ...fallback.accentByLanguage };
  } else {
    result.accentByLanguage = {};
  }

  return result;
}

/**
 * Validates and sanitizes the active language identifier.
 */
export function sanitizeActiveLanguage(rawLang, fallback = 'zh') {
  if (typeof rawLang === 'string' && SUPPORTED_LANGUAGES.includes(rawLang)) {
    return rawLang;
  }
  return SUPPORTED_LANGUAGES.includes(fallback) ? fallback : 'zh';
}

/**
 * Extracts only supported in-scope preference keys from a preferences object.
 */
export function filterInScopePreferences(prefs) {
  if (!prefs || typeof prefs !== 'object') return {};
  const filtered = {};
  for (const key of SUPPORTED_SETTINGS_KEYS) {
    if (Object.hasOwn(prefs, key)) {
      filtered[key] = prefs[key];
    }
  }
  return filtered;
}
