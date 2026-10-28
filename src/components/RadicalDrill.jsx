import './RadicalDrill.css';
import AppDialog from './ui/AppDialog';
import React, { useState, useCallback } from 'react';
import { X, Check, Volume2, RotateCcw, ArrowRight } from 'lucide-react';
import { recordAnswer, levelFor } from '../lib/radicalProgress';
import { speak } from '../lib/speech';
import { pronunciationOf, sayOf, fitFontPx, fitFontCss } from '../lib/entry';
import { useCourse } from '../lib/language';
import PartWord from './ui/PartWord';

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
  const { copy } = useCourse().radicals;
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
    <AppDialog label="Practice quiz" onClose={onClose} className="app-dialog--quiz">
      <div className="radical-quiz-layout-1" >

        {/* Top bar — progress segments + close */}
        <div className="radical-quiz-layout-2" >
          <div className="radical-quiz-layout-3" >
            {questions.map((q, i) => {
              const answered = i < results.length;
              const correct = answered && results[i].wasCorrect;
              return (
                <div className="radical-quiz-panel-1"
                  key={q.id}
                  style={{ backgroundColor: answered
                      ? (correct ? '#16A34A' : '#EF4444')
                      : (i === index ? 'var(--color-primary-blue)' : 'var(--color-border)') }}
                />
              );
            })}
          </div>
          <button className="radical-quiz-button-1"
            onClick={onClose}
            aria-label="Close drill"

          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {done ? (
          /* ---------------- Summary ---------------- */
          <div className="radical-quiz-layout-4" >
            <div className="surface-card radical-quiz-panel-2" >
              <div className="radical-quiz-panel-3" style={{ background: GRADIENT, boxShadow: `0 10px 20px ${SHADOW}` }}>
                {score}/{results.length}
              </div>
              <h2 className="radical-quiz-heading-1" >
                {score === results.length ? 'Every one right' : score >= results.length - 1 ? 'Almost perfect' : 'Good practice'}
              </h2>
              <p className="radical-quiz-copy-1" >
                Three clean answers in a row marks a {copy.unit} as known.
              </p>
            </div>

            <div className="radical-quiz-layout-5" >
              {results.map((r, i) => (
                <div className="radical-quiz-panel-4"
                  key={`${r.radical.radical}-${i}`}
                  style={{ border: `1px solid ${r.wasCorrect ? '#BBF7D0' : '#FECACA'}` }}
                >
                  <span className="radical-quiz-label-1" style={{ background: GRADIENT, fontSize: `${fitFontPx(r.radical.radical, 19.2, 32)}px` }}>
                    {r.radical.radical}
                  </span>
                  <span className="radical-quiz-label-2" >
                    {r.radical.meaning}
                  </span>
                  <span className="radical-quiz-label-3" style={{ color: r.wasCorrect ? '#16A34A' : '#DC2626' }}>
                    {r.wasCorrect ? 'Correct' : 'Missed'}
                  </span>
                </div>
              ))}
            </div>

            <div className="radical-quiz-layout-6" >
              <button className="radical-quiz-button-2"
                onClick={again}
                style={{ background: GRADIENT, boxShadow: `0 8px 16px ${SHADOW}` }}
              >
                <RotateCcw size={18} strokeWidth={2.5} /> Again
              </button>
              <button className="radical-quiz-button-3"
                onClick={onClose}

              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ---------------- Question ---------------- */
          <div className="radical-quiz-layout-4" >
            <p className="radical-quiz-copy-2" >
              {question.type === 'decode' ? copy.decodeLabel : copy.identifyLabel}
            </p>

            <h2 className="radical-quiz-heading-2" >
              {question.type === 'decode'
                ? copy.decodeQuestion
                : copy.identifyQuestion}
            </h2>

            {/* The glyph */}
            <div className="surface-card radical-quiz-panel-5" >
              <div className="radical-quiz-layout-7" style={{ fontSize: fitFontCss(question.type === 'decode' ? question.char.char : question.radical.radical, 80) }}>
                {question.type === 'decode'
                  ? <PartWord word={question.char.char} radical={question.radical} />
                  : question.radical.radical}
              </div>

              {/* Pinyin is only revealed after answering — it would give
                  a decode question away for anyone who knows the word. */}
              {picked && question.type === 'decode' && (
                <div className="radical-quiz-layout-8" >
                  <span className="radical-quiz-label-4" >
                    {[pronunciationOf(question.char), question.char.english].filter(Boolean).join(' · ')}
                  </span>
                  <button className="radical-quiz-button-4"
                    onClick={() => speak(sayOf(question.char))}
                    aria-label={`Play ${question.char.char}`}

                  >
                    <Volume2 size={16} color="var(--color-primary-blue)" strokeWidth={2.5} />
                  </button>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="radical-quiz-layout-9" >
              {question.options.map((option) => {
                const isAnswer = option.radical === question.radical.radical;
                const isPicked = picked && option.radical === picked.radical;

                let borderColor = 'var(--color-border)';
                let background = 'var(--color-card-surface)';
                if (picked && isAnswer) { borderColor = '#16A34A'; background = '#F0FDF4'; }
                else if (isPicked) { borderColor = '#DC2626'; background = '#FEF2F2'; }

                return (
                  <button className="radical-quiz-button-5"
                    key={option.radical}
                    onClick={() => choose(option)}
                    disabled={Boolean(picked)}
                    style={{ border: `2px solid ${borderColor}`, backgroundColor: background, cursor: picked ? 'default' : 'pointer' }}
                  >
                    <span className="radical-quiz-label-5" >{option.meaning}</span>
                    {picked && isAnswer && <Check size={20} color="#16A34A" strokeWidth={3} />}
                    {isPicked && !isAnswer && <X size={20} color="#DC2626" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>

            {/* Reveal */}
            {picked && (
              <div className="radical-quiz-panel-6" >
                <p className="radical-quiz-copy-3" >
                  {question.type === 'decode' ? (
                    <>
                      <strong>{question.char.char}</strong>{pronunciationOf(question.char) && ` ${pronunciationOf(question.char)}`} — {question.char.english}.
                      {/* Quoting the meaning keeps this readable for verbs:
                          the “to see” radical, not the to see radical. */}
                      {' '}It carries <strong>{question.radical.radical}</strong> — the “{question.radical.meaning}” {copy.unit}.
                    </>
                  ) : (
                    <>
                      <strong>{question.radical.radical}</strong>{pronunciationOf(question.radical) && ` ${pronunciationOf(question.radical)}`} — {question.radical.meaning}.
                      {' '}Look for it in {question.radical.examples.map((e) => e.char).join(copy.joiner)}.
                    </>
                  )}
                </p>
                <p className="radical-quiz-copy-4" >
                  {question.radical.burmese}
                </p>
              </div>
            )}

            <div className="radical-quiz-layout-10" >
              <button className="radical-quiz-button-6"
                onClick={next}
                disabled={!picked}
                style={{ background: picked ? GRADIENT : 'var(--color-border)', boxShadow: picked ? `0 8px 16px ${SHADOW}` : 'none', cursor: picked ? 'pointer' : 'not-allowed', opacity: picked ? 1 : 0.6 }}
              >
                {index + 1 >= questions.length ? 'See results' : 'Next'}
                <ArrowRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

      </div>
    </AppDialog>
  );
}
