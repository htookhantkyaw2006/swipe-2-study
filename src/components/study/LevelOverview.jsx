import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { useCourse } from '../../lib/language';
import { db } from '../../lib/db';
import { phraseCards } from '../../lib/phraseCards';
import LearningIcon from '../ui/LearningIcon';
import { StudyHeader } from './StudyPage';
import './LevelOverview.css';

export default function LevelOverview({ phrases = false }) {
  const course = useCourse();
  const words = phrases ? [] : db.get('flashcards');
  return <div className="study-page level-overview">
    <StudyHeader title={phrases ? 'Learn phrases' : course.copy.coursesTitle} subtitle={`${course.name} · ${course.levelSystem}`} backTo="/" backLabel="Back to Home" />
    <section className="level-overview__hero">
      <div><p className="study-eyebrow">{phrases ? 'WORDS IN CONTEXT' : 'YOUR LEARNING PATH'}</p><h2>{phrases ? 'Small phrases. Real conversations.' : course.copy.pickerHeadline}</h2><p>{phrases ? 'Choose a level and practise everyday expressions.' : course.copy.pickerSubtitle}</p></div>
      <LearningIcon kind={phrases ? 'phrases' : 'cards'} glyph={course.copy.flashcardsWatermark} />
    </section>
    <div className="study-section-heading"><div><h2>{course.copy.allLevels}</h2><p>Choose a level to see its available lessons.</p></div><span className="level-overview__meta">{course.levels.length} levels <ArrowUpRight size={16} aria-hidden="true" /></span></div>
    <div className="level-overview__grid">
      {course.levels.map(level => {
        const count = phrases ? phraseCards(course, level.id).length : words.filter(word => word.level === level.id).length;
        return <Link key={level.id} className="level-tile" to={`${phrases ? '/flashcards' : '/learn'}/level/${level.id}`}>
          <LearningIcon kind={phrases ? 'phrases' : 'cards'} glyph={course.copy.flashcardsWatermark} />
          <span className="level-tile__tier">{level.tier}</span>
          <h3>{level.name}</h3><p>{count ? `${count} ${phrases ? 'phrases' : 'cards'} available` : 'Content coming soon'}</p>
          <span className="level-tile__action">Explore level <ChevronRight size={16} aria-hidden="true" /></span>
          <span className="level-tile__watermark" aria-hidden="true">{level.numeral || level.badge}</span>
        </Link>;
      })}
    </div>
  </div>;
}
