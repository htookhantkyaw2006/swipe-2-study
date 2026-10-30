import { useState } from 'react';
import { Bookmark, BookmarkMinus, Clock, Search, Volume2 } from 'lucide-react';
import { db } from '../lib/db';
import { speak } from '../lib/speech';
import { useCourse } from '../lib/language';
import { trackEvent } from '../lib/analytics';
import { readingOf, sayOf, kanaOf, matchesQuery } from '../lib/entry';
import { StudyHeader, StudySearch } from '../components/study/StudyPage';
import './Dictionary.css';

export default function Dictionary() {
  const course = useCourse();
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState(() => db.get('search_history'));
  const [saved, setSaved] = useState(() => db.get('saved_words'));
  const results = query.trim() ? course.dictionary.filter(word => matchesQuery(word, query)) : [];
  const remember = event => {
    if (event.key !== 'Enter' || !query.trim()) return;
    const remaining = db.get('search_history').filter(item => item.term.toLowerCase() !== query.trim().toLowerCase());
    const next = [{ term: query.trim(), id: Date.now().toString() }, ...remaining].slice(0, 10);
    db.set('search_history', next); setHistory(next);
  };
  const toggleSave = word => {
    const existing = db.get('saved_words').find(item => item.phrase === word.phrase);
    if (existing) db.remove('saved_words', existing.id);
    else {
      db.insert('saved_words', { phrase: word.phrase, ...(word.kana ? { kana: word.kana } : {}), reading: readingOf(word), english: word.english, burmese: word.burmese });
      trackEvent('study:word_saved', { courseId: course.id });
    }
    setSaved(db.get('saved_words'));
  };
  return <div className="study-page dictionary-page">
    <StudyHeader title="Dictionary" subtitle={course.copy.dictionarySubtitle} backTo="/library" backLabel="Back to Library" />
    <StudySearch value={query} onChange={setQuery} onKeyDown={remember} label="Search dictionary" placeholder={course.copy.searchPlaceholder} />
    {!query.trim() ? <section className="dictionary-section" aria-label="Recent searches">
      <div className="study-section-heading"><h2>Recent searches</h2>{history.length > 0 && <button className="dictionary-clear" onClick={() => { db.set('search_history', []); setHistory([]); }}>Clear all</button>}</div>
      {!history.length ? <div className="study-empty"><Search size={32} aria-hidden="true" /><h3>Find your next word</h3><p>Search a word, reading or meaning. Press Enter to keep it in your recent searches.</p></div> : <div className="dictionary-history">{history.map(item => <button className="dictionary-history__item" key={item.id} onClick={() => setQuery(item.term)}><Clock size={18} aria-hidden="true" /><span>{item.term}</span></button>)}</div>}
    </section> : <section className="dictionary-section" aria-label="Dictionary results">
      <div className="study-section-heading"><h2>Search results</h2><p role="status">{results.length} {results.length === 1 ? 'word' : 'words'} found</p></div>
      {!results.length ? <div className="study-empty"><h3>No matching words</h3><p>No words found for “{query}”. Try another word or meaning.</p></div> : <div className="dictionary-results">{results.map(word => {
        const isSaved = saved.some(item => item.phrase === word.phrase);
        return <article className="dictionary-word" key={word.id}>
          <div className="dictionary-word__copy"><h3>{word.phrase}</h3>{kanaOf(word) && <p className="dictionary-word__kana" lang="ja">{kanaOf(word)}</p>}<p className="dictionary-word__reading">{readingOf(word)}</p><p className="dictionary-word__english" lang="en">{word.english}</p><p className="dictionary-word__burmese" lang="my">{word.burmese}</p></div>
          <div className="dictionary-word__actions"><button className="study-icon-button" onClick={() => toggleSave(word)} aria-label={`${isSaved ? 'Unsave' : 'Save'} ${word.phrase}`} aria-pressed={isSaved}>{isSaved ? <BookmarkMinus size={19} aria-hidden="true" /> : <Bookmark size={19} aria-hidden="true" />}</button><button className="study-icon-button" onClick={() => speak(sayOf(word))} aria-label={`Play ${word.phrase}`}><Volume2 size={19} aria-hidden="true" /></button></div>
        </article>;
      })}</div>}
    </section>}
  </div>;
}
