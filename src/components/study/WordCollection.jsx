import { Link } from 'react-router-dom';
import { Bookmark, BookmarkMinus, RotateCw, Play, Volume2 } from 'lucide-react';
import { speak } from '../../lib/speech';
import { kanaOf, sayOf } from '../../lib/entry';
import { filterStudyWords, wordDetails } from '../../lib/studyWords';
import { StudyHeader, StudySearch } from './StudyPage';
import { useState } from 'react';

export default function WordCollection({ kind, words, onUnsave, courseName, notice = '' }) {
  const [query, setQuery] = useState('');
  const isSaved = kind === 'saved';
  const title = isSaved ? 'Saved Words' : 'Review Words';
  const Icon = isSaved ? Bookmark : RotateCw;
  const visibleWords = filterStudyWords(words, query);
  const empty = words.length === 0;

  return (
    <div className={`study-page collection-page collection-page--${kind}`}>
      <StudyHeader title={title} subtitle={`${courseName} · Your collection`} backTo={isSaved ? '/library' : '/learn'} backLabel={isSaved ? 'Back to library' : 'Back to courses'} />
      <section className="collection-hero" aria-label={isSaved ? 'Saved word summary' : 'Review summary'}>
        <div className="collection-hero__icon"><Icon size={26} aria-hidden="true" /></div>
        <div className="collection-hero__copy">
          <p className="study-eyebrow">{isSaved ? 'Keep learning' : 'A little more practice'}</p>
          <h2>{words.length} {isSaved ? (words.length === 1 ? 'saved word' : 'saved words') : (words.length === 1 ? 'word to review' : 'words to review')}</h2>
          <p>{isSaved ? 'Your bookmarked words, all in one place.' : 'Revisit the words you swiped left on.'}</p>
        </div>
        <Link className="collection-hero__action" to={empty ? (isSaved ? '/dictionary' : '/learn') : (isSaved ? '/saved/session' : '/learn/review/session')}>
          <Play size={18} aria-hidden="true" />
          {empty ? (isSaved ? 'Find words' : 'Start learning') : (isSaved ? 'Study saved words' : 'Start review')}
        </Link>
      </section>

      <section className="collection-words" aria-labelledby="collection-list-title">
        <div className="study-section-heading">
          <div><h2 id="collection-list-title">Word list</h2><p role="status">{visibleWords.length} of {words.length} words</p></div>
          {!empty && <StudySearch value={query} onChange={setQuery} label={isSaved ? 'Search saved words' : 'Search review words'} />}
        </div>
        {notice && <p className="study-notice" role="status">{notice}</p>}
        {empty ? (
          <div className="study-empty">
            <Icon size={30} aria-hidden="true" />
            <h3>{isSaved ? 'Build your word collection' : 'All caught up!'}</h3>
            <p>{isSaved ? 'Bookmark a word in the dictionary to find it here.' : 'Swipe left during flashcard practice to add a word here.'}</p>
            <Link className="study-text-link" to={isSaved ? '/dictionary' : '/learn'}>{isSaved ? 'Open dictionary' : 'Explore courses'}</Link>
          </div>
        ) : visibleWords.length === 0 ? (
          <div className="study-empty"><h3>No matching words</h3><p>Try another word, reading or meaning.</p><button className="btn-secondary" onClick={() => setQuery('')}>Clear search</button></div>
        ) : (
          <ul className="collection-list" aria-label={title}>
            {visibleWords.map(stored => {
              const word = wordDetails(stored);
              return (
                <li className="collection-word" key={word.id}>
                  <div className="collection-word__copy">
                    <h3>{word.phrase}</h3>
                    {kanaOf(word) && <p className="collection-word__kana" lang="ja">{kanaOf(word)}</p>}
                    {word.reading && <p className="collection-word__reading">{word.reading}</p>}
                    {word.english && <p className="collection-word__meaning" lang="en">{word.english}</p>}
                    {word.burmese && <p className="collection-word__burmese" lang="my">{word.burmese}</p>}
                  </div>
                  <div className="collection-word__actions">
                    <button className="study-icon-button" onClick={() => speak(sayOf(stored))} aria-label={`Play word: ${word.phrase}`}><Volume2 size={20} aria-hidden="true" /></button>
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
