/* ---------------------------------------------------------------
   SOUNDS OF ENGLISH
   ---------------------------------------------------------------
   The 44 sounds of British English in IPA — the symbols used for the
   pronunciation on every English card. This is to the English course
   what kana is to Japanese: until these symbols are readable, every
   /ˈwɔːtə/ on a card is just decoration.

   British (RP) because the course follows CEFR and the CEFR exams most
   taken in Myanmar are Cambridge's, which use British English.

   Each sound has one example word, and `hl` — the letters in it that
   make the sound — so the chart can point at them: th in "think".
   Example words are unique across all 44, because the quiz uses them
   as answer options.

   `tricky` marks sounds Burmese does not have, the ones Burmese
   speakers most need to practise:
     f, v, ʒ — absent from Burmese: ဖ is an aspirated p, not f
     r       — Burmese ရ is usually said like the y in "yes"
   Sounds Burmese does share are not marked: θ and ð (သ), ʃ (ရှ),
   z (ဇ), tʃ (ချ), ŋ (င).
   --------------------------------------------------------------- */

const s = (ipa, word, hl, tricky = null) => ({ ipa, word, hl, tricky });

export const SOUND_GROUPS = [
  {
    key: 'vowels',
    label: 'Vowels',
    note: 'A long vowel is marked ː — see vs sit',
    sounds: [
      s('iː', 'see', 'ee'), s('ɪ', 'sit', 'i'), s('e', 'bed', 'e'), s('æ', 'cat', 'a'),
      s('ɑː', 'car', 'ar'), s('ɒ', 'hot', 'o'), s('ɔː', 'door', 'oor'), s('ʊ', 'put', 'u'),
      s('uː', 'blue', 'ue'), s('ʌ', 'cup', 'u'), s('ɜː', 'bird', 'ir'), s('ə', 'about', 'a')
    ]
  },
  {
    key: 'diphthongs',
    label: 'Diphthongs',
    note: 'Two vowels gliding into one',
    sounds: [
      s('eɪ', 'day', 'ay'), s('aɪ', 'my', 'y'), s('ɔɪ', 'boy', 'oy'), s('əʊ', 'go', 'o'),
      s('aʊ', 'now', 'ow'), s('ɪə', 'near', 'ear'), s('eə', 'hair', 'air'), s('ʊə', 'tour', 'our')
    ]
  },
  {
    key: 'consonants',
    label: 'Consonants',
    note: 'Dashed tiles are sounds Burmese does not have',
    sounds: [
      s('p', 'pen', 'p'), s('b', 'bag', 'b'), s('t', 'tea', 't'), s('d', 'dog', 'd'),
      s('k', 'key', 'k'), s('ɡ', 'get', 'g'), s('f', 'fish', 'f', 'Not a Burmese sound — ဖ is an aspirated p'),
      s('v', 'van', 'v', 'Not a Burmese sound — touch your top teeth to your lip'),
      s('θ', 'think', 'th'), s('ð', 'this', 'th'), s('s', 'sun', 's'), s('z', 'zoo', 'z'),
      s('ʃ', 'she', 'sh'), s('ʒ', 'vision', 's', 'Not a Burmese sound — like ʃ, but voiced'),
      s('h', 'hat', 'h'), s('tʃ', 'chair', 'ch'), s('dʒ', 'jam', 'j'), s('m', 'man', 'm'),
      s('n', 'nose', 'n'), s('ŋ', 'sing', 'ng'), s('l', 'leg', 'l'),
      s('r', 'red', 'r', 'Burmese ရ is usually said like y — curl your tongue back'),
      s('j', 'yes', 'y'), s('w', 'wet', 'w')
    ]
  }
];

/** Pairs and groups learners mix up — used to pick quiz distractors. */
export const SOUND_LOOK_ALIKES = [
  ['iː', 'ɪ'], ['uː', 'ʊ'], ['æ', 'e', 'ʌ'], ['ɑː', 'ʌ'], ['ɒ', 'ɔː'], ['ɜː', 'ə'],
  ['eɪ', 'e'], ['əʊ', 'ɔː'], ['ɪə', 'eə'],
  ['f', 'p', 'v'], ['v', 'w', 'b'], ['θ', 's', 't'], ['ð', 'd', 'z'],
  ['ʃ', 's', 'tʃ'], ['ʒ', 'ʃ', 'dʒ'], ['r', 'l', 'j'], ['n', 'ŋ']
];

/** Flat list of every sound with its group. */
export const soundList = () =>
  SOUND_GROUPS.flatMap((g) => g.sounds.map((snd) => ({ ...snd, group: g.key })));
