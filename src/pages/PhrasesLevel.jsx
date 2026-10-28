import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useCourse } from '../lib/language';
import { phraseCards, phraseLevel } from '../lib/phraseCards';
import { StudyHeader } from '../components/study/StudyPage';
import LearningIcon from '../components/ui/LearningIcon';
import './PhrasesLevel.css';

export default function PhrasesLevel() {
  const { levelId } = useParams();
  const course = useCourse();
  const level = phraseLevel(course, levelId);
  const cards = phraseCards(course, levelId);
  return <div className="study-page phrase-level">
    <StudyHeader title={level?.name || 'Level unavailable'} subtitle={`${course.name} · Phrases`} backTo="/flashcards" backLabel="Back to phrase levels" />
    {!level ? <div className="study-empty"><h2>Choose another level</h2><p>This phrase level could not be found.</p><Link className="study-text-link" to="/flashcards">Browse levels</Link></div> : <>
      <div className="phrase-level__layout">
        <section className="phrase-level__hero"><div><p className="study-eyebrow">{level.tier}</p><h2>{level.name}</h2><p>{cards.length} practice phrases available</p></div><LearningIcon kind="phrases" /></section>
        <section className="phrase-level__modules" aria-label="Phrase modules">
          <h2>A little conversation practice</h2>
          {cards.length > 0 ? <Link className="phrase-module" to={`/flashcards/session?level=${encodeURIComponent(level.id)}`}><LearningIcon kind="cards" /><span><strong>Phrase practice</strong><small>Read, reveal and say it aloud.</small></span><ChevronRight size={20} aria-hidden="true" /></Link> : <div className="study-empty"><h3>More phrases are on the way</h3><p>Content for this level is not available yet.</p><Link className="study-text-link" to="/flashcards">Browse other levels</Link></div>}
          <div className="phrase-module phrase-module--soon"><LearningIcon kind="interest" /><span><strong>Explore by topic</strong><small>Coming soon</small></span></div>
        </section>
      </div>
      <p className="study-notice phrase-level__notice">Phrase practice is for this session. Your vocabulary review and saved words stay in their own collections.</p>
    </>}
  </div>;
}
