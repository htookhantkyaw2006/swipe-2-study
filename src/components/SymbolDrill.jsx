import React, { useState, useCallback } from 'react';
import { X, Check, Volume2, RotateCcw, ArrowRight } from 'lucide-react';
import { levelFor } from '../lib/progress';
import { speak } from '../lib/speech';

/* ---------------------------------------------------------------
   SYMBOL QUIZ
   ---------------------------------------------------------------
   "See a symbol, pick what it stands for." Kana (あ → a) and English
   sounds (/θ/ → think) are the same drill with different data, so both
   use this component and only supply items and wording.

   Each item: { key, glyph, answer, say, rank }
     glyph  — what is shown big
     answer — the correct option, and what the options are made of
     say    — what is spoken once answered
     rank   — lower comes first among equally-mastered items (kana uses
              it to put basic kana before voiced ones)

   Ordering: weakest first (new, then learning, then known), then rank.

   Distractors favour `lookAlikes` — groups of keys that get confused.
   A random wrong answer is easy to rule out; the confusable one is
   what needs practice. No two options ever share an answer: じ and ぢ
   are both "ji", which would make a question unanswerable.
   --------------------------------------------------------------- */

const ROUND_SIZE = 10;
const LEVEL_RANK = { new: 0, learning: 1, known: 2 };

const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

function pickOptions(target, pool, lookAlikeGroups) {
  const lookAlikes = lookAlikeGroups.filter((group) => group.includes(target.key)).flat();
  const candidates = [
    ...shuffle(pool.filter((item) => lookAlikes.includes(item.key))),
    ...shuffle(pool)
  ];
  const seen = new Set([target.answer]);
  const wrong = [];
  for (const item of candidates) {
    if (wrong.length === 3) break;
    if (seen.has(item.answer)) continue;
    seen.add(item.answer);
    wrong.push(item.answer);
  }
  return shuffle([target.answer, ...wrong]);
}

function buildRound(items, progress, lookAlikes) {
  const ordered = shuffle(items).sort((a, b) =>
    LEVEL_RANK[levelFor(progress[a.key])] - LEVEL_RANK[levelFor(progress[b.key])] ||
    (a.rank || 0) - (b.rank || 0)
  );
  return ordered.slice(0, ROUND_SIZE).map((item, i) => ({
    ...item,
    id: `${item.key}-${i}`,
    options: pickOptions(item, items, lookAlikes)
  }));
}

export default function SymbolDrill({
  items, progress, lookAlikes = [], record, onClose, onRecorded,
  label, question: prompt, unit,
  gradient, shadow, accent, accentSoft,
  optionMono = false, renderReveal
}) {
  const [questions, setQuestions] = useState(() => buildRound(items, progress, lookAlikes));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);

  const question = questions[index];

  const choose = useCallback((option) => {
    if (picked) return;
    const wasCorrect = option === question.answer;
    setPicked(option);
    speak(question.say);
    record(question.key, wasCorrect);
    setResults((prev) => [...prev, { key: question.key, glyph: question.glyph, answer: question.answer, wasCorrect }]);
    onRecorded?.();
  }, [picked, question, record, onRecorded]);

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }, [index, questions.length]);

  const again = useCallback(() => {
    setQuestions(buildRound(items, progress, lookAlikes));
    setIndex(0);
    setPicked(null);
    setResults([]);
    setDone(false);
  }, [items, progress, lookAlikes]);

  const score = results.filter((r) => r.wasCorrect).length;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-gradient)', overflowY: 'auto' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Progress segments + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
            {questions.map((q, i) => {
              const answered = i < results.length;
              return (
                <div
                  key={q.id}
                  style={{
                    flex: 1, height: '6px', borderRadius: '999px',
                    backgroundColor: answered
                      ? (results[i].wasCorrect ? '#16A34A' : '#EF4444')
                      : (i === index && !done ? accent : 'var(--color-border)'),
                    transition: 'background-color 0.3s'
                  }}
                />
              );
            })}
          </div>
          <button onClick={onClose} aria-label="Close quiz" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}>
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {done ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="surface-card" style={{ borderRadius: '24px', padding: '32px 24px', textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%', margin: '0 auto 16px auto',
                background: gradient, boxShadow: `0 10px 20px ${shadow}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF', fontSize: '1.75rem', fontWeight: 800
              }}>
                {score}/{results.length}
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
                {score === results.length ? 'Every one right' : score >= results.length - 2 ? 'Almost there' : 'Good practice'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-secondary-blue)', fontWeight: 500 }}>
                Three clean answers in a row marks a {unit} as known.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {results.map((r, i) => (
                <div
                  key={`${r.key}-${i}`}
                  style={{
                    padding: '10px 4px', borderRadius: '14px', textAlign: 'center',
                    backgroundColor: 'var(--color-card-surface)',
                    border: `2px solid ${r.wasCorrect ? '#BBF7D0' : '#FECACA'}`
                  }}
                >
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1.1, whiteSpace: 'nowrap' }}>{r.glyph}</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: r.wasCorrect ? '#16A34A' : '#DC2626', overflowWrap: 'anywhere' }}>{r.answer}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <button
                onClick={again}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '16px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  background: gradient, boxShadow: `0 8px 16px ${shadow}`,
                  color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem'
                }}
              >
                <RotateCcw size={18} strokeWidth={2.5} /> Again
              </button>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '16px', borderRadius: '16px', cursor: 'pointer',
                  border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card-surface)',
                  color: 'var(--color-primary-blue)', fontWeight: 700, fontSize: '0.95rem'
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)' }}>
              {label} · {index + 1} of {questions.length}
            </p>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-text-navy)', lineHeight: 1.25 }}>
              {prompt}
            </h2>

            <div className="surface-card" style={{ borderRadius: '24px', padding: '28px 24px', textAlign: 'center', marginBottom: '20px', position: 'relative' }}>
              <div style={{ fontSize: '6rem', lineHeight: 1, fontWeight: 700, color: 'var(--color-text-navy)' }}>
                {question.glyph}
              </div>
              {picked && renderReveal && (
                <div style={{ marginTop: '12px', fontSize: '1rem', fontWeight: 600, color: 'var(--color-secondary-blue)' }}>
                  {renderReveal(question)}
                </div>
              )}
              {picked && (
                <button
                  onClick={() => speak(question.say)}
                  aria-label={`Play ${question.say}`}
                  style={{
                    position: 'absolute', top: '14px', right: '14px',
                    width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer',
                    border: 'none', backgroundColor: accentSoft,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <Volume2 size={17} color={accent} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {question.options.map((option) => {
                const isAnswer = option === question.answer;
                const isPicked = picked === option;
                let borderColor = 'var(--color-border)';
                let background = 'var(--color-card-surface)';
                if (picked && isAnswer) { borderColor = '#16A34A'; background = '#F0FDF4'; }
                else if (isPicked) { borderColor = '#DC2626'; background = '#FEF2F2'; }
                return (
                  <button
                    key={option}
                    onClick={() => choose(option)}
                    disabled={Boolean(picked)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      padding: '18px 12px', borderRadius: '16px', border: `2px solid ${borderColor}`,
                      backgroundColor: background, cursor: picked ? 'default' : 'pointer',
                      fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-navy)',
                      fontFamily: optionMono ? 'JetBrains Mono, monospace' : 'inherit',
                      transition: 'border-color 0.2s, background-color 0.2s'
                    }}
                  >
                    {option}
                    {picked && isAnswer && <Check size={18} color="#16A34A" strokeWidth={3} />}
                    {isPicked && !isAnswer && <X size={18} color="#DC2626" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
              <button
                onClick={next}
                disabled={!picked}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '16px', borderRadius: '16px', border: 'none',
                  background: picked ? gradient : 'var(--color-border)',
                  boxShadow: picked ? `0 8px 16px ${shadow}` : 'none',
                  color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem',
                  cursor: picked ? 'pointer' : 'not-allowed', opacity: picked ? 1 : 0.6
                }}
              >
                {index + 1 >= questions.length ? 'See results' : 'Next'}
                <ArrowRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
