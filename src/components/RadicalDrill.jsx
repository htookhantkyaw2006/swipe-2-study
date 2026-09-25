import React, { useState, useCallback } from 'react';
import { X, Check, Volume2, RotateCcw, ArrowRight } from 'lucide-react';
import { recordAnswer, levelFor } from '../lib/radicalProgress';
import { speak } from '../lib/speech';

/* ---------------------------------------------------------------
   RADICAL DRILL — "Spot the Radical"
   ---------------------------------------------------------------
   Five questions, two kinds:

     decode   — shows a character the learner has NOT been taught and
                asks what it is about. This is the whole point of
                radicals: meeting something unfamiliar and not being
                helpless. Questions are drawn from `quizChars`, which
                is deliberately held back from the detail sheet.

     identify — shows the radical itself and asks what it means.
                Used for radicals with no safe decode characters, and
                mixed in for variety.

   Questions favour radicals the learner has not mastered yet.
   --------------------------------------------------------------- */

const GRADIENT = 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)';
const SHADOW = 'rgba(67, 56, 202, 0.3)';
const ROUND_SIZE = 5;

const shuffle = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const LEVEL_RANK = { new: 0, learning: 1, known: 2 };

/** Three wrong meanings, preferring other categories so no option is arguable. */
const pickDistractors = (target, all) => {
  const otherCategory = shuffle(all.filter((r) => r.category !== target.category));
  const sameCategory = shuffle(all.filter((r) => r.category === target.category && r.radical !== target.radical));
  return [...otherCategory, ...sameCategory].slice(0, 3);
};

function buildRound(all, progress) {
  // Weakest first, shuffled within each band, so a round targets gaps.
  const ordered = shuffle(all).sort(
    (a, b) => LEVEL_RANK[levelFor(progress[a.radical])] - LEVEL_RANK[levelFor(progress[b.radical])]
  );

  return ordered.slice(0, ROUND_SIZE).map((radical, i) => {
    const canDecode = radical.quizChars && radical.quizChars.length > 0;
    const type = canDecode && Math.random() < 0.7 ? 'decode' : 'identify';

    return {
      id: `${radical.radical}-${i}`,
      type,
      radical,
      char: type === 'decode' ? shuffle(radical.quizChars)[0] : null,
      options: shuffle([radical, ...pickDistractors(radical, all)])
    };
  });
}

export default function RadicalDrill({ radicals, progress, onClose, onRecorded }) {
  const [questions, setQuestions] = useState(() => buildRound(radicals, progress));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const [done, setDone] = useState(false);

  const question = questions[index];

  const choose = useCallback((option) => {
    if (picked) return;
    const wasCorrect = option.radical === question.radical.radical;
    setPicked(option);
    recordAnswer(question.radical.radical, wasCorrect);
    setResults((prev) => [...prev, { radical: question.radical, wasCorrect }]);
    onRecorded?.();
  }, [picked, question, onRecorded]);

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      setDone(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }, [index, questions.length]);

  const again = useCallback(() => {
    setQuestions(buildRound(radicals, progress));
    setIndex(0);
    setPicked(null);
    setResults([]);
    setDone(false);
  }, [radicals, progress]);

  const score = results.filter((r) => r.wasCorrect).length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg-gradient)', overflowY: 'auto'
    }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', padding: '24px', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Top bar — progress segments + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
            {questions.map((q, i) => {
              const answered = i < results.length;
              const correct = answered && results[i].wasCorrect;
              return (
                <div
                  key={q.id}
                  style={{
                    flex: 1, height: '6px', borderRadius: '999px',
                    backgroundColor: answered
                      ? (correct ? '#16A34A' : '#EF4444')
                      : (i === index ? 'var(--color-primary-blue)' : 'var(--color-border)'),
                    transition: 'background-color 0.3s'
                  }}
                />
              );
            })}
          </div>
          <button
            onClick={onClose}
            aria-label="Close drill"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {done ? (
          /* ---------------- Summary ---------------- */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="surface-card" style={{ borderRadius: '24px', padding: '32px 24px', textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '88px', height: '88px', borderRadius: '50%', margin: '0 auto 16px auto',
                background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#FFFFFF', fontSize: '2rem', fontWeight: 800
              }}>
                {score}/{results.length}
              </div>
              <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-navy)' }}>
                {score === results.length ? 'Every one right' : score >= results.length - 1 ? 'Almost perfect' : 'Good practice'}
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-secondary-blue)', fontWeight: 500 }}>
                Three clean answers in a row marks a radical as known.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {results.map((r, i) => (
                <div
                  key={`${r.radical.radical}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '12px 16px', borderRadius: '14px',
                    backgroundColor: 'var(--color-card-surface)',
                    border: `1px solid ${r.wasCorrect ? '#BBF7D0' : '#FECACA'}`
                  }}
                >
                  <span style={{
                    width: '38px', height: '38px', flexShrink: 0, borderRadius: '12px',
                    background: GRADIENT, color: '#FFFFFF', fontSize: '1.2rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {r.radical.radical}
                  </span>
                  <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-navy)' }}>
                    {r.radical.meaning}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: r.wasCorrect ? '#16A34A' : '#DC2626' }}>
                    {r.wasCorrect ? 'Correct' : 'Missed'}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
              <button
                onClick={again}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '16px', borderRadius: '16px', border: 'none', cursor: 'pointer',
                  background: GRADIENT, boxShadow: `0 8px 16px ${SHADOW}`,
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
          /* ---------------- Question ---------------- */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <p style={{
              margin: '0 0 16px 0', fontSize: '0.75rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-secondary-blue)'
            }}>
              {question.type === 'decode' ? 'You have not studied this character' : 'Name the radical'}
            </p>

            <h2 style={{
              margin: '0 0 20px 0', fontSize: '1.5rem', fontWeight: 800,
              color: 'var(--color-text-navy)', lineHeight: 1.25
            }}>
              {question.type === 'decode'
                ? 'What is this character about?'
                : 'What does this radical mean?'}
            </h2>

            {/* The glyph */}
            <div className="surface-card" style={{
              borderRadius: '24px', padding: '32px 24px', textAlign: 'center', marginBottom: '20px'
            }}>
              <div style={{
                fontSize: '5rem', lineHeight: 1, fontWeight: 800,
                color: 'var(--color-text-navy)'
              }}>
                {question.type === 'decode' ? question.char.char : question.radical.radical}
              </div>

              {/* Pinyin is only revealed after answering — it would give
                  a decode question away for anyone who knows the word. */}
              {picked && question.type === 'decode' && (
                <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-secondary-blue)' }}>
                    {question.char.pinyin} · {question.char.english}
                  </span>
                  <button
                    onClick={() => speak(question.char.char)}
                    aria-label={`Play ${question.char.char}`}
                    style={{
                      width: '34px', height: '34px', borderRadius: '50%', cursor: 'pointer',
                      border: 'none', backgroundColor: 'var(--color-ghost-blue)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Volume2 size={16} color="var(--color-primary-blue)" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>

            {/* Options */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {question.options.map((option) => {
                const isAnswer = option.radical === question.radical.radical;
                const isPicked = picked && option.radical === picked.radical;

                let borderColor = 'var(--color-border)';
                let background = 'var(--color-card-surface)';
                if (picked && isAnswer) { borderColor = '#16A34A'; background = '#F0FDF4'; }
                else if (isPicked) { borderColor = '#DC2626'; background = '#FEF2F2'; }

                return (
                  <button
                    key={option.radical}
                    onClick={() => choose(option)}
                    disabled={Boolean(picked)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      width: '100%', textAlign: 'left', padding: '16px 18px',
                      borderRadius: '16px', border: `2px solid ${borderColor}`,
                      backgroundColor: background, cursor: picked ? 'default' : 'pointer',
                      fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-navy)',
                      transition: 'border-color 0.2s, background-color 0.2s'
                    }}
                  >
                    <span style={{ flex: 1 }}>{option.meaning}</span>
                    {picked && isAnswer && <Check size={20} color="#16A34A" strokeWidth={3} />}
                    {isPicked && !isAnswer && <X size={20} color="#DC2626" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>

            {/* Reveal */}
            {picked && (
              <div style={{
                marginTop: '20px', padding: '16px 18px', borderRadius: '16px',
                backgroundColor: 'var(--color-ghost-blue)', border: '1px solid var(--color-border)'
              }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-navy)', lineHeight: 1.5 }}>
                  {question.type === 'decode' ? (
                    <>
                      <strong>{question.char.char}</strong> {question.char.pinyin} — {question.char.english}.
                      {/* Quoting the meaning keeps this readable for verbs:
                          the “to see” radical, not the to see radical. */}
                      {' '}It carries <strong>{question.radical.radical}</strong> — the “{question.radical.meaning}” radical.
                    </>
                  ) : (
                    <>
                      <strong>{question.radical.radical}</strong> {question.radical.pinyin} — {question.radical.meaning}.
                      {' '}Look for it in {question.radical.examples.map((e) => e.char).join('、')}.
                    </>
                  )}
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--color-secondary-blue)', fontWeight: 500 }}>
                  {question.radical.burmese}
                </p>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
              <button
                onClick={next}
                disabled={!picked}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '16px', borderRadius: '16px', border: 'none',
                  background: picked ? GRADIENT : 'var(--color-border)',
                  boxShadow: picked ? `0 8px 16px ${SHADOW}` : 'none',
                  color: '#FFFFFF', fontWeight: 700, fontSize: '0.95rem',
                  cursor: picked ? 'pointer' : 'not-allowed',
                  opacity: picked ? 1 : 0.6, transition: 'opacity 0.2s'
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
