import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, Bookmark, Mic, Layers, ChevronRight, User, MessageCircle, RotateCw, BookOpen, LayoutGrid, List, Blocks, Languages, Type, AudioLines } from 'lucide-react';
import { db } from '../lib/db';
import { useCourse } from '../lib/language';
import { StudySearch } from '../components/study/StudyPage';
import './Library.css';

const EXPLORE_ICONS = { scriptDictionary: Languages, sounds: AudioLines, kana: Type, radicals: Blocks, interest: Layers, writing: PenLine, twisters: Mic };

function ToolCard({ tool }) {
  const Icon = tool.icon || BookOpen;
  const available = Boolean(tool.path && tool.path !== '#');
  const content = <>
    <span className="library-tool__icon"><Icon size={24} aria-hidden="true" /></span>
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
  const savedCount = db.get('saved_words').length;
  const reviewCount = db.get('review_cards').length;
  const cardCount = db.get('flashcards').length;
  const coreTools = [
    { key: 'cards', title: 'Flashcards', subtitle: 'Build your vocabulary', icon: Layers, path: '/learn' },
    { key: 'review', title: 'Review', subtitle: `${reviewCount} ${reviewCount === 1 ? 'word' : 'words'} to revisit`, icon: RotateCw, path: '/learn/review' },
    { key: 'saved', title: 'Saved Words', subtitle: `${savedCount} bookmarked ${savedCount === 1 ? 'word' : 'words'}`, icon: Bookmark, path: '/saved' },
    { key: 'dictionary', title: 'Dictionary', subtitle: course.copy.dictionarySubtitle, icon: BookOpen, path: '/dictionary' },
    { key: 'phrases', title: 'Learn Phrases', subtitle: 'Everyday expressions', icon: MessageCircle, path: '/flashcards' },
  ];
  const sections = [
    { title: 'Learn & Review', tools: coreTools },
    { title: 'Explore & Practise', tools: course.exploreTools.map(tool => ({ ...tool, subtitle: tool.key === 'writing' && !tool.path ? 'Character writing practice' : tool.subtitle, icon: EXPLORE_ICONS[tool.key] })) },
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
        <BookOpen size={42} aria-hidden="true" />
      </section>
      <div className="library-counts" aria-label="Current course collections">
        <Link to="/learn"><Layers size={19} aria-hidden="true" /><strong>{cardCount}</strong><span>Cards available</span></Link>
        <Link to="/saved"><Bookmark size={19} aria-hidden="true" /><strong>{savedCount}</strong><span>Saved words</span></Link>
        <Link to="/learn/review"><RotateCw size={19} aria-hidden="true" /><strong>{reviewCount}</strong><span>To review</span></Link>
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
