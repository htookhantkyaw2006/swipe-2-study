import { Link } from 'react-router-dom';
import { Bookmark, BookmarkMinus, RotateCw, Play, Volume2 } from 'lucide-react';
import { speak } from '../../lib/speech';
import { playWordAudio } from '../../lib/wordAudio';
import { kanaOf } from '../../lib/entry';
import { filterStudyWords, wordDetails } from '../../lib/studyWords';
import { StudyHeader, StudySearch } from './StudyPage';
import { useState } from 'react';

export default function WordCollection({ kind, words, error = null, onRetry = null, onUnsave, courseName, notice = '' }) {
  const [query, setQuery] = useState('');
  const isSaved = kind === 'saved';
  const title = isSaved ? 'Saved Words' : 'Review Words';
  const Icon = isSaved ? Bookmark : RotateCw;
  const isUnavailable = Boolean(error || words === null);
  const safeWords = Array.isArray(words) ? words : [];
  const visibleWords = filterStudyWords(safeWords, query);
  const empty = !isUnavailable && safeWords.length === 0;
  const countLabel = `${safeWords.length} ${isSaved ? (safeWords.length === 1 ? 'saved word' : 'saved words') : (safeWords.length === 1 ? 'word to review' : 'words to review')}`;

  return (
    <div className={`study-page collection-page collection-page--${kind}`}>
      <StudyHeader title={title} subtitle={`${courseName} · Your collection`} backTo={isSaved ? '/library' : '/learn'} backLabel={isSaved ? 'Back to library' : 'Back to courses'} />
      <section className={`collection-hero collection-hero--${kind} ${isUnavailable ? 'collection-hero--unavailable' : ''}`} aria-label={isUnavailable ? (isSaved ? 'Saved words unavailable' : 'Review words unavailable') : (isSaved ? 'Saved word summary' : 'Review summary')}>
        <div className="collection-hero__icon"><Icon size={24} aria-hidden="true" /></div>
        <div className="collection-hero__copy">
          <p className="study-eyebrow">{isSaved ? 'SAVED WORDS' : 'REVIEW QUEUE'}</p>
          <h2>{isUnavailable ? 'Collection unavailable' : countLabel}</h2>
          <p>{isUnavailable ? (error || 'Unable to load your words.') : (isSaved ? 'Your bookmarked words, ready for practice.' : 'Revisit words you marked for review.')}</p>
        </div>
        {isUnavailable ? (
          onRetry && (
            <button type="button" className="collection-hero__action" onClick={onRetry}>
              <RotateCw size={18} aria-hidden="true" />
              Retry
            </button>
          )
        ) : (
          <Link className="collection-hero__action" to={empty ? '/learn' : (isSaved ? '/saved/session' : '/learn/review/session')}>
            <Play size={18} aria-hidden="true" />
            {empty ? 'Start learning' : (isSaved ? 'Study saved words' : 'Start review')}
          </Link>
        )}
      </section>

      <section className="collection-words" aria-labelledby="collection-list-title">
        <div className="study-section-heading">
          <div><h2 id="collection-list-title">Word list</h2><p role="status">{isUnavailable ? 'Status unavailable' : `${visibleWords.length} of ${safeWords.length} words`}</p></div>
          {!isUnavailable && !empty && <StudySearch value={query} onChange={setQuery} label={isSaved ? 'Search saved words' : 'Search review words'} />}
        </div>
        {notice && <p className="study-notice" role="status" aria-live="polite">{notice}</p>}
        {isUnavailable ? (
          <div className="study-error" role="alert">
            <RotateCw size={30} aria-hidden="true" />
            <h3>{isSaved ? 'Unable to load saved words' : 'Unable to load review words'}</h3>
            <p>{error || 'An error occurred while loading this collection. Please try again.'}</p>
            {onRetry && (
              <button type="button" className="study-text-link" onClick={onRetry}>
                Try again
              </button>
            )}
          </div>
        ) : empty ? (
          <div className="study-empty">
            <Icon size={30} aria-hidden="true" />
            <h3>{isSaved ? 'Build your word collection' : 'All caught up!'}</h3>
            <p>{isSaved ? 'Bookmark words during study sessions or in the dictionary to find them here.' : 'Swipe left during flashcard practice to add a word here.'}</p>
            {isSaved ? (
              <div className="study-empty__actions" style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link className="study-text-link" to="/learn">Start learning</Link>
                <Link className="study-text-link study-text-link--secondary" to="/dictionary">Open dictionary</Link>
              </div>
            ) : (
              <Link className="study-text-link" to="/learn">Explore courses</Link>
            )}
          </div>
        ) : visibleWords.length === 0 ? (
          <div className="study-empty"><h3>No matching words</h3><p>Try another word, reading or meaning.</p><button className="btn-secondary" onClick={() => setQuery('')}>Clear search</button></div>
        ) : (
          <ul className="collection-list" aria-label={title}>
            {visibleWords.map(stored => {
              const word = wordDetails(stored);
              return (
                <li className="collection-word" key={word.id}>
                  <div className="collection-word__main">
                    <div className="collection-word__head">
                      <h3 className="collection-word__character">{word.phrase}</h3>
                      {kanaOf(word) && <span className="collection-word__kana" lang="ja">{kanaOf(word)}</span>}
                      {word.reading && <span className="collection-word__reading">{word.reading}</span>}
                    </div>
                    <div className="collection-word__copy">
                      {word.english && <p className="collection-word__meaning" lang="en">{word.english}</p>}
                      {word.burmese && <p className="collection-word__burmese" lang="my">{word.burmese}</p>}
                    </div>
                  </div>
                  <div className="collection-word__actions">
                    <button className="study-icon-button" onClick={() => playWordAudio(stored, { speakFn: speak })} aria-label={`Play word: ${word.phrase}`}><Volume2 size={20} aria-hidden="true" /></button>
                    {isSaved && <button className="study-icon-button study-icon-button--remove" onClick={() => onUnsave(word.id, word.phrase)} aria-label={`Unsave ${word.phrase}`}><BookmarkMinus size={20} aria-hidden="true" /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
