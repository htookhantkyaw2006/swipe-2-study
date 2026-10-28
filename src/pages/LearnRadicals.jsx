import './LearnRadicals.css';
import AppDialog from '../components/ui/AppDialog';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Lightbulb, PenLine, Zap, RotateCcw } from 'lucide-react';
import { useCourse } from '../lib/language';
import { pronunciationOf, fitFontPx } from '../lib/entry';
import PartWord from '../components/ui/PartWord';

/* "shuǐ · 3 strokes", "さんずい · 3 strokes", or just "prefix" for an
   English word part, which has neither a reading nor strokes. */
const RadicalMeta = ({ radical }) => {
  const reading = pronunciationOf(radical);
  const detail = radical.strokes ? `${radical.strokes} strokes` : radical.kind;
  return (
    <>
      {reading && <span className="radicals-label-1" >{reading}</span>}
      {reading && detail && ' · '}
      {detail}
    </>
  );
};
import RadicalDrill from '../components/RadicalDrill';
import { readProgress, resetProgress, levelFor, countKnown, LEVELS } from '../lib/radicalProgress';

const RADICAL_GRADIENT = 'linear-gradient(135deg, #A5B4FC 0%, #4338CA 100%)';
const RADICAL_SHADOW = 'rgba(67, 56, 202, 0.3)';

/* The form you would actually practise writing: 氵 is written 水 on its own.
   Null when the course has no writing practice (Japanese, for now). */
const practisableChar = (radical, writing) => {
  if (!writing) return null;
  const candidate = radical.standalone || radical.radical;
  return writing.chars.some((w) => w.character === candidate) ? candidate : null;
};

/* ---------------------------------------------------------------
   RADICAL DETAIL — shown when a radical card is tapped.
   --------------------------------------------------------------- */
function RadicalDetail({ radical, onClose, onPractise }) {
  const course = useCourse();
  const practiseChar = practisableChar(radical, course.writing);

  return (
    <AppDialog label={radical.meaning} onClose={onClose}>
      <div>
        <div className="radicals-layout-1" >
          <div className="radicals-layout-2" >
            <div className="radicals-panel-1" style={{ background: RADICAL_GRADIENT, boxShadow: `0 8px 16px ${RADICAL_SHADOW}`, fontSize: `${fitFontPx(radical.radical, 32, 52)}px` }}>
              {radical.radical}
            </div>
            <div>
              <h3 className="radicals-heading-1" >
                {radical.meaning}
              </h3>
              <p className="radicals-copy-1" >
                <RadicalMeta radical={radical} />
              </p>
              <p className="radicals-copy-2" >
                {radical.burmese}
              </p>
            </div>
          </div>
          <button aria-label="Close" className="radicals-button-1"
            onClick={onClose}

          >
            <X size={22} color="var(--color-secondary-blue)" />
          </button>
        </div>

        {radical.standalone && (
          <div className="radicals-panel-2" >
            <Lightbulb size={16} color="var(--color-primary-blue)" strokeWidth={2.5} />
            <span className="radicals-label-2" >
              Written {radical.radical} inside a character, {radical.standalone} on its own.
            </span>
          </div>
        )}

        <h4 className="radicals-heading-2" >
          {course.radicals.copy.examplesTitle}
        </h4>

        <div className="radicals-layout-3" >
          {radical.examples.map((ex) => (
            <div className="radicals-panel-3" key={ex.char} >
              <span className="radicals-label-3" style={{ fontSize: `${fitFontPx(ex.char, 28, 150)}px` }}>
                <PartWord word={ex.char} radical={radical} />
              </span>
              <div>
                {pronunciationOf(ex) && (
                <p className="radicals-copy-3" >
                  {pronunciationOf(ex)}
                </p>
                )}
                <p className="radicals-copy-4" >
                  {ex.english}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Only offered when the radical is itself in the writing set. */}
        {practiseChar && (
          <button className="radicals-button-2"
            onClick={() => onPractise(practiseChar)}

          >
            <PenLine size={18} strokeWidth={2.5} /> Practise writing {practiseChar}
          </button>
        )}
      </div>
    </AppDialog>
  );
}

/* ---------------------------------------------------------------
   PAGE
   --------------------------------------------------------------- */
export default function LearnRadicals() {
  const navigate = useNavigate();
  const course = useCourse();
  const { list: radicals, categories: radicalCategories, copy } = course.radicals;
  const [category, setCategory] = useState('All');
  const [openRadical, setOpenRadical] = useState(null);
  const [drillOpen, setDrillOpen] = useState(false);
  const [progress, setProgress] = useState({});

  useEffect(() => { setProgress(readProgress()); }, []);

  const refreshProgress = useCallback(() => setProgress(readProgress()), []);

  const clearProgress = () => {
    if (!window.confirm(`Reset ${copy.unit} progress? Your drill history will be erased.`)) return;
    resetProgress();
    refreshProgress();
  };

  const known = countKnown(progress);
  const started = Object.keys(progress).length > 0;

  const visibleRadicals = category === 'All'
    ? radicals
    : radicals.filter((r) => r.category === category);

  return (
    <div className="ui-tool-page radicals-layout-4" >
      <div className="radicals-layout-5" >
        <div className="radicals-layout-6" >

          <header data-tool-header="true" className="flex items-center justify-center relative radicals-layout-7" >
            <button aria-label="Back" className="radicals-button-3"
              onClick={() => navigate('/library')}

            >
              <ChevronLeft size={24} color="var(--color-text-navy)" />
            </button>
            <h1 className="radicals-heading-3" >
              {copy.title}
            </h1>
          </header>

          <div className="radicals-layout-8" >
            <h2 className="radicals-heading-4" >
              {copy.headline[0]}<br />{copy.headline[1]}
            </h2>
            <p className="radicals-copy-5" >
              {copy.intro}
            </p>
          </div>

          {/* The drill is the primary action — reading the grid teaches
              recognition, but only recall proves you can decode. */}
          <button className="radicals-button-4"
            onClick={() => setDrillOpen(true)}
            style={{ background: RADICAL_GRADIENT, boxShadow: `0 10px 20px ${RADICAL_SHADOW}` }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = `0 14px 26px ${RADICAL_SHADOW}`;
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 10px 20px ${RADICAL_SHADOW}`;
            }}
          >
            <div className="radicals-panel-4" >
              <Zap size={24} color="#FFFFFF" strokeWidth={2.5} />
            </div>
            <div className="radicals-layout-9" >
              <h3 className="radicals-heading-5" >
                {copy.drillTitle}
              </h3>
              <p className="radicals-copy-6" >
                {copy.drillSubtitle}
              </p>
            </div>
            <ChevronRight size={22} color="#FFFFFF" strokeWidth={2.5} />
          </button>

          {/* Progress */}
          <div className="radicals-layout-10" >
            <div className="radicals-layout-11" >
              <span className="radicals-label-4" >
                {known} of {radicals.length} {copy.units} known
              </span>
              {started && (
                <button className="radicals-button-5"
                  onClick={clearProgress}

                >
                  <RotateCcw size={14} strokeWidth={2.5} /> Reset
                </button>
              )}
            </div>
            <div className="radicals-panel-5" >
              <div className="radicals-panel-6" style={{ width: `${(known / radicals.length) * 100}%`, background: RADICAL_GRADIENT }} />
            </div>
          </div>

          {/* Category filter */}
          <div className="radicals-layout-12" >
            {['All', ...radicalCategories].map((c) => {
              const active = c === category;
              return (
                <button className="radicals-button-6"
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{ border: '1px solid ' + (active ? 'var(--color-primary-blue)' : 'var(--color-border)'), backgroundColor: active ? 'var(--color-primary-blue)' : 'var(--color-card-surface)', color: active ? '#FFFFFF' : 'var(--color-secondary-blue)' }}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div className="radicals-grid-1" >
            {visibleRadicals.map((r) => {
              const level = levelFor(progress[r.radical]);
              return (
              <button type="button" aria-haspopup="dialog"
                key={r.radical}
                className="surface-card radicals-panel-7"
                onClick={() => setOpenRadical(r)}

                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.06)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.03)';
                }}
              >
                <div className="radicals-panel-8" style={{ background: RADICAL_GRADIENT, boxShadow: `0 6px 12px ${RADICAL_SHADOW}`, fontSize: `${fitFontPx(r.radical, 22.4, 38)}px` }}>
                  {r.radical}
                </div>
                <div className="radicals-layout-13" >
                  <h3 className="radicals-heading-6" >
                    {r.meaning}
                  </h3>
                  <p className="radicals-copy-7" >
                    <RadicalMeta radical={r} />
                  </p>
                </div>

                {/* Only learning/known get a dot — a marker on all 32 would
                    just be noise on a fresh install. */}
                {level !== 'new' && (
                  <span className="radicals-label-5"
                    title={LEVELS[level].label}
                    style={{ backgroundColor: LEVELS[level].color }}
                  />
                )}
              </button>
              );
            })}
          </div>

        </div>
      </div>

      {openRadical && (
        <RadicalDetail
          radical={openRadical}
          onClose={() => setOpenRadical(null)}
          onPractise={(char) => navigate(`/writing?char=${encodeURIComponent(char)}`)}
        />
      )}

      {drillOpen && (
        <RadicalDrill
          radicals={radicals}
          progress={progress}
          onRecorded={refreshProgress}
          onClose={() => { setDrillOpen(false); refreshProgress(); }}
        />
      )}
    </div>
  );
}
