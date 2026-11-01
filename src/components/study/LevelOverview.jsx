import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { phraseCards } from '../../lib/phraseCards';
import { usePublishedContent } from '../../lib/publishedContentContext';
import { resolvePublishedCourseId } from '../../lib/publishedContentService';
import LearningIcon from '../ui/LearningIcon';
import { StudyHeader } from './StudyPage';
import './LevelOverview.css';

export default function LevelOverview({ phrases = false }) {
  const course = useCourse();
  const { enabled, getCourseState } = usePublishedContent();
  const localWords = phrases ? [] : db.get('flashcards');

  return (
    <div className="study-page level-overview">
      <StudyHeader
        title={phrases ? 'Learn phrases' : course.copy.coursesTitle}
        subtitle={`${course.name} · ${course.levelSystem}`}
        backTo="/"
        backLabel="Back to Home"
      />

      <section className="level-overview__hero">
        <div className="level-overview__hero-content">
          <p className="study-eyebrow">{phrases ? 'WORDS IN CONTEXT' : 'YOUR LEARNING PATH'}</p>
          <h2>{phrases ? 'Small phrases. Real conversations.' : course.copy.pickerHeadline}</h2>
          <p>{phrases ? 'Choose a level and practise everyday expressions.' : 'Build your vocabulary with short, focused practice.'}</p>
        </div>
        <LearningIcon kind={phrases ? 'phrases' : 'cards'} glyph={course.copy.flashcardsWatermark} />
      </section>

      <div className="study-section-heading">
        <div>
          <h2>{course.copy.allLevels}</h2>
          <p>Choose a level to see its available lessons.</p>
        </div>
        <span className="level-overview__meta">
          {course.levels.length} levels <ArrowUpRight size={15} aria-hidden="true" />
        </span>
      </div>

      <div className="level-overview__grid">
        {course.levels.map((level, index) => {
          let status = 'unpublished';
          const plannedCount = phrases ? level.phrases : level.words;
          const plannedText = plannedCount
            ? `${plannedCount.toLocaleString()} ${phrases ? 'phrases' : 'words'} curriculum`
            : 'Curriculum in preparation';
          let countText = plannedText;

          if (phrases) {
            const count = phraseCards(course, level.id).length;
            if (count > 0) {
              status = 'ready';
              countText = `${count} phrases available`;
            } else {
              status = 'unpublished';
              countText = plannedText;
            }
          } else if (enabled) {
            const publishedCourseId = resolvePublishedCourseId(course.id, level.id);
            if (publishedCourseId) {
              const state = getCourseState(publishedCourseId);
              if (state.status === 'loading') {
                status = 'loading';
                countText = 'Loading content...';
              } else if (state.status === 'error') {
                status = 'error';
                countText = 'Unable to load content';
              } else if (state.status === 'loaded') {
                const count = state.items.length;
                if (count > 0) {
                  status = 'ready';
                  countText = `${count} ${count === 1 ? 'card' : 'cards'} available`;
                } else {
                  status = 'empty';
                  countText = 'No cards available';
                }
              } else {
                status = 'unpublished';
                countText = plannedText;
              }
            } else {
              status = 'unpublished';
              countText = plannedText;
            }
          } else {
            const count = localWords.filter(word => word.level === level.id).length;
            if (count > 0) {
              status = 'ready';
              countText = `${count} cards available`;
            } else {
              status = 'unpublished';
              countText = plannedText;
            }
          }

          const isNowLearning = !phrases && index === 0 && status === 'ready';
          const isUnavailable = status === 'unpublished';

          let tileModifier = '';
          if (status === 'unpublished') tileModifier = ' level-tile--unavailable';
          else if (status === 'loading') tileModifier = ' level-tile--loading';
          else if (status === 'error') tileModifier = ' level-tile--error';
          else if (status === 'empty') tileModifier = ' level-tile--empty';

          return (
            <Link
              key={level.id}
              className={`level-tile${tileModifier}`}
              style={{
                '--level-accent': level.gradientEnd,
                '--level-tint': level.gradientStart,
              }}
              to={`${phrases ? '/flashcards' : '/learn'}/level/${level.id}`}
            >
              <div className="level-tile__top">
                <LearningIcon kind={phrases ? 'phrases' : 'cards'} glyph={course.copy.flashcardsWatermark} />
                {isNowLearning ? (
                  <span className="level-tile__badge level-tile__badge--learning">NOW LEARNING</span>
                ) : status === 'loading' ? (
                  <span className="level-tile__badge level-tile__badge--loading">LOADING</span>
                ) : status === 'error' ? (
                  <span className="level-tile__badge level-tile__badge--error">UNAVAILABLE</span>
                ) : status === 'unpublished' ? (
                  <span className="level-tile__badge level-tile__badge--soon">COMING SOON</span>
                ) : (
                  <span className="level-tile__tier">{level.tier}</span>
                )}
              </div>
              <h3>{level.name}</h3>
              <p>{countText}</p>
              <span className={`level-tile__action${isUnavailable ? ' level-tile__action--disabled' : status === 'loading' ? ' level-tile__action--loading' : ''}`}>
                {isUnavailable ? (
                  <>Coming soon</>
                ) : status === 'loading' ? (
                  <>Loading…</>
                ) : (
                  <>Explore level <ChevronRight size={15} aria-hidden="true" /></>
                )}
              </span>
              <span className="level-tile__watermark" aria-hidden="true">{level.numeral || level.badge}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
