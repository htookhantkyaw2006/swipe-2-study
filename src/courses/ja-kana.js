/* ---------------------------------------------------------------
   KANA
   ---------------------------------------------------------------
   Hiragana and katakana laid out as the gojūon grid every Japanese
   textbook uses: five vowel columns (a i u e o), one row per
   consonant. Gaps are `null` so や/ゆ/よ and わ/を sit in their real
   columns instead of collapsing left.

   Romaji is Hepburn — shi, chi, tsu, fu, ji — because that is what
   signs, stations and dictionaries use. を is given as "wo" to keep
   it distinguishable from お in a quiz, even though it is said "o".
   --------------------------------------------------------------- */

const row = (key, cells) => ({ key, cells });

// [hiragana, katakana, romaji]
export const BASIC = [
  row('a',  [['あ','ア','a'],  ['い','イ','i'],   ['う','ウ','u'],   ['え','エ','e'],  ['お','オ','o']]),
  row('k',  [['か','カ','ka'], ['き','キ','ki'],  ['く','ク','ku'],  ['け','ケ','ke'], ['こ','コ','ko']]),
  row('s',  [['さ','サ','sa'], ['し','シ','shi'], ['す','ス','su'],  ['せ','セ','se'], ['そ','ソ','so']]),
  row('t',  [['た','タ','ta'], ['ち','チ','chi'], ['つ','ツ','tsu'], ['て','テ','te'], ['と','ト','to']]),
  row('n',  [['な','ナ','na'], ['に','ニ','ni'],  ['ぬ','ヌ','nu'],  ['ね','ネ','ne'], ['の','ノ','no']]),
  row('h',  [['は','ハ','ha'], ['ひ','ヒ','hi'],  ['ふ','フ','fu'],  ['へ','ヘ','he'], ['ほ','ホ','ho']]),
  row('m',  [['ま','マ','ma'], ['み','ミ','mi'],  ['む','ム','mu'],  ['め','メ','me'], ['も','モ','mo']]),
  row('y',  [['や','ヤ','ya'], null,              ['ゆ','ユ','yu'],  null,             ['よ','ヨ','yo']]),
  row('r',  [['ら','ラ','ra'], ['り','リ','ri'],  ['る','ル','ru'],  ['れ','レ','re'], ['ろ','ロ','ro']]),
  row('w',  [['わ','ワ','wa'], null,              null,              null,             ['を','ヲ','wo']]),
  row('nn', [['ん','ン','n'],  null,              null,              null,             null])
];

// Voiced (dakuten ゛) and half-voiced (handakuten ゜) sounds.
export const VOICED = [
  row('g', [['が','ガ','ga'], ['ぎ','ギ','gi'], ['ぐ','グ','gu'], ['げ','ゲ','ge'], ['ご','ゴ','go']]),
  row('z', [['ざ','ザ','za'], ['じ','ジ','ji'], ['ず','ズ','zu'], ['ぜ','ゼ','ze'], ['ぞ','ゾ','zo']]),
  row('d', [['だ','ダ','da'], ['ぢ','ヂ','ji'], ['づ','ヅ','zu'], ['で','デ','de'], ['ど','ド','do']]),
  row('b', [['ば','バ','ba'], ['び','ビ','bi'], ['ぶ','ブ','bu'], ['べ','ベ','be'], ['ぼ','ボ','bo']]),
  row('p', [['ぱ','パ','pa'], ['ぴ','ピ','pi'], ['ぷ','プ','pu'], ['ぺ','ペ','pe'], ['ぽ','ポ','po']])
];

export const SCRIPTS = {
  hiragana: { label: 'Hiragana', index: 0, sample: 'あ', note: 'Native Japanese words and grammar endings' },
  katakana: { label: 'Katakana', index: 1, sample: 'ア', note: 'Foreign loanwords, names and emphasis' }
};

/** Flat list of { kana, romaji, row, voiced } for one script. */
export function kanaList(script) {
  const i = SCRIPTS[script].index;
  const flatten = (rows, voiced) =>
    rows.flatMap((r) => r.cells.filter(Boolean).map((c) => ({ kana: c[i], romaji: c[2], row: r.key, voiced })));
  return [...flatten(BASIC, false), ...flatten(VOICED, true)];
}
