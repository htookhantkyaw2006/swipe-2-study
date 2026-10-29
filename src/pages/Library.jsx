import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, User, LayoutGrid, List } from 'lucide-react';
import { db } from '../lib/db';
import { storageOwner } from '../lib/storageOwner.js';
import { getCourseProgress } from '../lib/vocabularyProgress.js';
import { useCourse } from '../lib/language';
import { StudySearch } from '../components/study/StudyPage';
import LearningIcon from '../components/ui/LearningIcon';
import './Library.css';

function ToolCard({ tool }) {
  const available = Boolean(tool.path && tool.path !== '#');
  const content = <>
    <LearningIcon kind={tool.key} className="library-tool__art" />
    <span className="library-tool__copy"><span className="library-tool__title">{tool.title}</span><span className="library-tool__subtitle">{tool.subtitle}</span></span>
    {available ? <ChevronRight className="library-tool__arrow" size={20} aria-hidden="true" /> : <span className="library-tool__soon">Soon</span>}
  </>;
  return available
    ? <Link className="library-tool" to={tool.path}>{content}</Link>
    : <div className="library-tool library-tool--soon" aria-label={`${tool.title}, coming soon`}>{content}</div>;
}

export default function Library() {
  const course = useCourse();
  const [isGrid, setIsGrid] = useState(true);
  const [query, setQuery] = useState('');
  const [, setDataVersion] = useState(0);

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setDataVersion(v => v + 1));
    const unsubOwner = storageOwner.subscribe(() => setDataVersion(v => v + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  let savedCount = 0;
  let reviewCount = 0;
  let cardCount = 0;
  let learnedCount = 0;
  try {
    savedCount = db.get('saved_words').length;
    reviewCount = db.get('review_cards').length;
    cardCount = db.get('flashcards').length;
    const progress = getCourseProgress(db, course);
    learnedCount = progress.uniqueLearnedCount;
  } catch {
    // Keep safe defaults
  }

  const coreTools = [
    { key: 'cards', title: 'Flashcards', subtitle: learnedCount > 0 ? `${learnedCount} words mastered` : 'Build your vocabulary', path: '/learn' },
    { key: 'review', title: 'Review', subtitle: `${reviewCount} ${reviewCount === 1 ? 'word' : 'words'} to revisit`, path: '/learn/review' },
    { key: 'saved', title: 'Saved Words', subtitle: `${savedCount} bookmarked ${savedCount === 1 ? 'word' : 'words'}`, path: '/saved' },
    { key: 'dictionary', title: 'Dictionary', subtitle: course.copy.dictionarySubtitle, path: '/dictionary' },
    { key: 'phrases', title: 'Learn Phrases', subtitle: 'Everyday expressions', path: '/flashcards' },
  ];
  const sections = [
    { title: 'Learn & Review', tools: coreTools },
    { title: 'Explore & Practise', tools: course.exploreTools.map(tool => ({ ...tool, subtitle: tool.key === 'writing' && !tool.path ? 'Character writing practice' : tool.subtitle })) },
  ].map(section => ({ ...section, tools: section.tools.filter(tool => `${tool.title} ${tool.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())) }));
  const matchCount = sections.reduce((total, section) => total + section.tools.length, 0);

  return (
    <div className={`study-page library-page${isGrid ? ' library-page--grid' : ' library-page--list'}`}>
      <header className="library-header">
        <div><p>{course.name} · Learning tools</p><h1>Your library</h1></div>
        <Link className="study-icon-button" to="/profile" aria-label="Open profile"><User size={21} aria-hidden="true" /></Link>
      </header>
      <section className="library-intro" aria-label="Library overview">
        <div><p className="study-eyebrow">One word at a time</p><h2>Make room for a little practice.</h2><p>Learn something new or revisit your favourites.</p></div>
        <LearningIcon kind="library" className="library-intro__art" />
      </section>
      <div className="library-counts" aria-label="Current course collections">
        <Link to="/learn"><LearningIcon kind="cards" className="library-counts__art" /><strong>{cardCount}</strong><span>Cards available</span></Link>
        <Link to="/learn"><LearningIcon kind="cards" className="library-counts__art" /><strong>{learnedCount}</strong><span>Learned words</span></Link>
        <Link to="/saved"><LearningIcon kind="saved" className="library-counts__art" /><strong>{savedCount}</strong><span>Saved words</span></Link>
        <Link to="/learn/review"><LearningIcon kind="review" className="library-counts__art" /><strong>{reviewCount}</strong><span>To review</span></Link>
      </div>
      <div className="library-toolbar">
        <StudySearch label="Find a learning tool" value={query} onChange={setQuery} />
        <div className="library-view" role="group" aria-label="Tool layout">
          <button className="study-icon-button" aria-label="Grid view" aria-pressed={isGrid} onClick={() => setIsGrid(true)}><LayoutGrid size={20} aria-hidden="true" /></button>
          <button className="study-icon-button" aria-label="List view" aria-pressed={!isGrid} onClick={() => setIsGrid(false)}><List size={21} aria-hidden="true" /></button>
        </div>
      </div>
      {query.trim() && <p className="library-results" role="status">{matchCount} {matchCount === 1 ? 'tool' : 'tools'} found</p>}
      {matchCount === 0 ? <div className="study-empty"><h2>No matching tools</h2><p>Try a tool name such as flashcards, writing or dictionary.</p><button className="btn-secondary" onClick={() => setQuery('')}>Clear search</button></div> : sections.filter(section => section.tools.length > 0).map(section => (
        <section className="library-section" key={section.title} aria-label={section.title}>
          <h2>{section.title}</h2>
          <div className="library-tools">{section.tools.map(tool => <ToolCard key={tool.key} tool={tool} />)}</div>
        </section>
      ))}
    </div>
  );
}
