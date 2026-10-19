/* ---------------------------------------------------------------
   ENTRY ACCESSORS
   ---------------------------------------------------------------
   Course content uses language-neutral field names:

     reading — romanisation (pinyin for Chinese, romaji for Japanese)
     kana    — Japanese kana reading, when the written form has kanji
     text    — an example sentence in the target language

   Rows saved before the Japanese course existed still carry the
   Chinese-only names (`pinyin`, `chinese`). These accessors read
   either shape, so no stored row ever needs rewriting.
   --------------------------------------------------------------- */

/** Romanisation: pinyin or romaji. */
export const readingOf = (x) => x?.reading ?? x?.pinyin ?? '';

/** The target-language text of an example sentence. */
export const textOf = (ex) => ex?.text ?? ex?.chinese ?? '';

/** The written form of any entry, whatever its dataset calls it. */
export const wordOf = (x) => x?.character ?? x?.phrase ?? x?.char ?? '';

/**
 * What text-to-speech should read. Kana when there is one: a voice
 * reading 家 alone may say いえ or うち, but reading いえ cannot go wrong.
 */
export const sayOf = (x) => x?.kana || x?.text || x?.chinese || wordOf(x);

/** Kana only when it adds something — not when the word is already kana. */
export const kanaOf = (x) => (x?.kana && x.kana !== wordOf(x) ? x.kana : '');

/**
 * Lower-case, accent-free form for search. Without this, typing "ni"
 * never matched "nǐ" and "kyo" never matched "kyō". Long vowels are
 * folded too, so "kyou", "kyoo" and "kyō" all find the same word.
 */
export const fold = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ou/g, 'o')
    .replace(/oo/g, 'o')
    .replace(/uu/g, 'u')
    .replace(/[\s'’-]/g, '');

/** True when an entry matches a free-text query in any of its scripts. */
export function matchesQuery(entry, query) {
  const q = query.trim();
  if (!q) return false;
  const lower = q.toLowerCase();
  return (
    wordOf(entry).includes(q) ||
    (entry.kana || '').includes(q) ||
    fold(readingOf(entry)).includes(fold(q)) ||
    (entry.english || '').toLowerCase().includes(lower) ||
    (entry.burmese || '').includes(q)
  );
}

/**
 * One pronunciation line where there is room for only one: kana for
 * Japanese (how Japanese materials teach a kanji's reading), otherwise
 * the romanisation.
 */
export const pronunciationOf = (x) => x?.kana || readingOf(x);
