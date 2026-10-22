import React, { useMemo } from 'react';
import SymbolDrill from './SymbolDrill';
import { kanaList, SCRIPTS } from '../courses/ja-kana';
import { recordKanaAnswer } from '../lib/kanaProgress';

/* ---------------------------------------------------------------
   KANA QUIZ — a kana, four romaji, pick the sound.
   The drill itself is SymbolDrill; this supplies kana and the
   look-alikes. Basic kana come before voiced ones (rank), so a
   beginner meets か long before ぢ.
   --------------------------------------------------------------- */

// Pairs and triples learners mix up.
const LOOK_ALIKES = [
  ['さ', 'ち'], ['ぬ', 'め'], ['ね', 'れ', 'わ'], ['る', 'ろ'], ['は', 'ほ'], ['い', 'り'], ['あ', 'お'], ['き', 'さ'],
  ['シ', 'ツ'], ['ソ', 'ン'], ['ク', 'ケ', 'タ'], ['ウ', 'ワ', 'フ'], ['コ', 'ユ'], ['チ', 'テ'], ['ヌ', 'ス'], ['マ', 'ア']
];

export default function KanaDrill({ script, progress, onClose, onRecorded }) {
  const items = useMemo(
    () => kanaList(script).map((k) => ({ key: k.kana, glyph: k.kana, answer: k.romaji, say: k.kana, rank: k.voiced ? 1 : 0 })),
    [script]
  );
  return (
    <SymbolDrill
      items={items}
      progress={progress}
      lookAlikes={LOOK_ALIKES}
      record={recordKanaAnswer}
      onClose={onClose}
      onRecorded={onRecorded}
      label={SCRIPTS[script].label}
      question="How is this read?"
      unit="kana"
      gradient="linear-gradient(135deg, #F9A8D4 0%, #DB2777 100%)"
      shadow="rgba(219, 39, 119, 0.3)"
      accent="#DB2777"
      accentSoft="#FCE7F3"
      optionMono
    />
  );
}
