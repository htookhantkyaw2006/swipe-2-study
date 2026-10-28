import './SymbolDrill.css';
import AppDialog from './ui/AppDialog';
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
    <AppDialog label={`${label} quiz`} onClose={onClose} className="app-dialog--quiz">
      <div className="symbol-quiz-layout-1" >

        {/* Progress segments + close */}
        <div className="symbol-quiz-layout-2" >
          <div className="symbol-quiz-layout-3" >
            {questions.map((q, i) => {
              const answered = i < results.length;
              return (
                <div className="symbol-quiz-panel-1"
                  key={q.id}
                  style={{ backgroundColor: answered
                      ? (results[i].wasCorrect ? '#16A34A' : '#EF4444')
                      : (i === index && !done ? accent : 'var(--color-border)') }}
                />
              );
            })}
          </div>
          <button className="symbol-quiz-button-1" onClick={onClose} aria-label="Close quiz" >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {done ? (
          <div className="symbol-quiz-layout-4" >
            <div className="surface-card symbol-quiz-panel-2" >
              <div className="symbol-quiz-panel-3" style={{ background: gradient, boxShadow: `0 10px 20px ${shadow}` }}>
                {score}/{results.length}
              </div>
              <h2 className="symbol-quiz-heading-1" >
                {score === results.length ? 'Every one right' : score >= results.length - 2 ? 'Almost there' : 'Good practice'}
              </h2>
              <p className="symbol-quiz-copy-1" >
                Three clean answers in a row marks a {unit} as known.
              </p>
            </div>

            <div className="symbol-quiz-grid-1" >
              {results.map((r, i) => (
                <div className="symbol-quiz-panel-4"
                  key={`${r.key}-${i}`}
                  style={{ border: `2px solid ${r.wasCorrect ? '#BBF7D0' : '#FECACA'}` }}
                >
                  <div className="symbol-quiz-layout-5" >{r.glyph}</div>
                  <div className="symbol-quiz-layout-6" style={{ color: r.wasCorrect ? '#16A34A' : '#DC2626' }}>{r.answer}</div>
                </div>
              ))}
            </div>

            <div className="symbol-quiz-layout-7" >
              <button className="symbol-quiz-button-2"
                onClick={again}
                style={{ background: gradient, boxShadow: `0 8px 16px ${shadow}` }}
              >
                <RotateCcw size={18} strokeWidth={2.5} /> Again
              </button>
              <button className="symbol-quiz-button-3"
                onClick={onClose}

              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="symbol-quiz-layout-4" >
            <p className="symbol-quiz-copy-2" >
              {label} · {index + 1} of {questions.length}
            </p>
            <h2 className="symbol-quiz-heading-2" >
              {prompt}
            </h2>

            <div className="surface-card symbol-quiz-panel-5" >
              <div className="symbol-quiz-layout-8" >
                {question.glyph}
              </div>
              {picked && renderReveal && (
                <div className="symbol-quiz-layout-9" >
                  {renderReveal(question)}
                </div>
              )}
              {picked && (
                <button className="symbol-quiz-button-4"
                  onClick={() => speak(question.say)}
                  aria-label={`Play ${question.say}`}
                  style={{ backgroundColor: accentSoft }}
                >
                  <Volume2 size={17} color={accent} strokeWidth={2.5} />
                </button>
              )}
            </div>

            <div className="symbol-quiz-grid-2" >
              {question.options.map((option) => {
                const isAnswer = option === question.answer;
                const isPicked = picked === option;
                let borderColor = 'var(--color-border)';
                let background = 'var(--color-card-surface)';
                if (picked && isAnswer) { borderColor = '#16A34A'; background = '#F0FDF4'; }
                else if (isPicked) { borderColor = '#DC2626'; background = '#FEF2F2'; }
                return (
                  <button className="symbol-quiz-button-5"
                    key={option}
                    onClick={() => choose(option)}
                    disabled={Boolean(picked)}
                    style={{ border: `2px solid ${borderColor}`, backgroundColor: background, cursor: picked ? 'default' : 'pointer', fontFamily: optionMono ? 'JetBrains Mono, monospace' : 'inherit' }}
                  >
                    {option}
                    {picked && isAnswer && <Check size={18} color="#16A34A" strokeWidth={3} />}
                    {isPicked && !isAnswer && <X size={18} color="#DC2626" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>

            <div className="symbol-quiz-layout-10" >
              <button className="symbol-quiz-button-6"
                onClick={next}
                disabled={!picked}
                style={{ background: picked ? gradient : 'var(--color-border)', boxShadow: picked ? `0 8px 16px ${shadow}` : 'none', cursor: picked ? 'pointer' : 'not-allowed', opacity: picked ? 1 : 0.6 }}
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
