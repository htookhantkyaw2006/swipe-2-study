import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, User, LayoutGrid, List } from 'lucide-react';
import { db } from '../lib/db';
import { storageOwner } from '../lib/storageOwner.js';
import { getCourseProgress } from '../lib/vocabularyProgress.js';
import { useCourse } from '../lib/language';
import { usePublishedContent } from '../lib/publishedContentContext.jsx';
import { resolvePublishedCourseId } from '../lib/publishedContentService.js';
import { StudySearch } from '../components/study/StudyPage';
import LearningIcon from '../components/ui/LearningIcon';
import './Library.css';

function ToolCard({ tool }) {
  const available = Boolean(tool.path && tool.path !== '#');
  const content = (
    <>
      <LearningIcon kind={tool.key} className="library-tool__art" />
      <span className="library-tool__copy">
        <span className="library-tool__title">{tool.title}</span>
        <span className="library-tool__subtitle">{tool.subtitle}</span>
      </span>
      {available ? (
        <ChevronRight className="library-tool__arrow" size={20} aria-hidden="true" />
      ) : (
        <span className="library-tool__soon">Soon</span>
      )}
    </>
  );
  return available ? (
    <Link className="library-tool" to={tool.path}>
      {content}
    </Link>
  ) : (
    <div className="library-tool library-tool--soon" aria-label={`${tool.title}, coming soon`}>
      {content}
    </div>
  );
}

export default function Library() {
  const course = useCourse();
  const { enabled: publishedEnabled, getCourseState, loadCourse } = usePublishedContent();
  const [isGrid, setIsGrid] = useState(true);
  const [query, setQuery] = useState('');
  const [, setDataVersion] = useState(0);

  useEffect(() => {
    const unsubChange = storageOwner.subscribeChange(() => setDataVersion((v) => v + 1));
    const unsubOwner = storageOwner.subscribe(() => setDataVersion((v) => v + 1));
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const supportedCourseIds = (course.levels || [])
    .map((level) => resolvePublishedCourseId(course.id, level.id))
    .filter(Boolean);

  useEffect(() => {
    if (publishedEnabled && supportedCourseIds.length > 0) {
      for (const id of supportedCourseIds) {
        const state = getCourseState(id);
        if (state.status === 'idle') {
          loadCourse(id).catch(() => {});
        }
      }
    }
  }, [publishedEnabled, supportedCourseIds, getCourseState, loadCourse]);

  const [storageError, setStorageError] = useState(null);
  let savedCount = 0;
  let reviewCount = 0;
  let learnedCount = 0;
  let isStorageUnavailable = Boolean(storageError);

  try {
    const saved = db.get('saved_words');
    const review = db.get('review_cards');
    const progress = getCourseProgress(db, course);
    savedCount = saved ? saved.length : 0;
    reviewCount = review ? review.length : 0;
    learnedCount = progress.uniqueLearned ?? 0;
  } catch {
    isStorageUnavailable = true;
  }

  const handleRetryStorage = () => {
    try {
      db.get('saved_words');
      db.get('review_cards');
      getCourseProgress(db, course);
      setStorageError(null);
      setDataVersion((v) => v + 1);
    } catch {
      setStorageError('Unable to read local collections. Please try again.');
    }
  };

  let cardStatus = 'disabled';
  let cardCountDisplay = '—';
  let cardCountLabel = 'Catalog disabled';

  if (!publishedEnabled) {
    cardStatus = 'disabled';
    cardCountDisplay = '—';
    cardCountLabel = 'Catalog disabled';
  } else if (supportedCourseIds.length === 0) {
    cardStatus = 'unpublished';
    cardCountDisplay = '—';
    cardCountLabel = 'In preparation';
  } else {
    const states = supportedCourseIds.map((id) => getCourseState(id));
    const isLoading = states.some((s) => s.status === 'loading' || s.status === 'idle');
    const hasError = states.some((s) => s.status === 'error') && !states.some((s) => s.status === 'loaded');

    if (isLoading) {
      cardStatus = 'loading';
      cardCountDisplay = '…';
      cardCountLabel = 'Loading cards…';
    } else if (hasError) {
      cardStatus = 'error';
      cardCountDisplay = '!';
      cardCountLabel = 'Unable to load';
    } else {
      const loadedStates = states.filter((s) => s.status === 'loaded');
      if (loadedStates.length > 0) {
        const totalCards = loadedStates.reduce((acc, s) => acc + (s.items?.length || 0), 0);
        if (totalCards > 0) {
          cardStatus = 'ready';
          cardCountDisplay = String(totalCards);
          cardCountLabel = `${totalCards} ${totalCards === 1 ? 'card' : 'cards'} available`;
        } else {
          cardStatus = 'empty';
          cardCountDisplay = '0';
          cardCountLabel = 'No cards available';
        }
      } else {
        cardStatus = 'unpublished';
        cardCountDisplay = '—';
        cardCountLabel = 'In preparation';
      }
    }
  }

  const coreTools = [
    {
      key: 'cards',
      title: 'Flashcards',
      subtitle:
        learnedCount > 0
          ? `${learnedCount} ${learnedCount === 1 ? 'word' : 'words'} learned`
          : 'Build your vocabulary',
      path: '/learn',
    },
    {
      key: 'review',
      title: 'Review',
      subtitle: isStorageUnavailable ? 'Collection unavailable' : `${reviewCount} ${reviewCount === 1 ? 'word' : 'words'} to revisit`,
      path: '/learn/review',
    },
    {
      key: 'saved',
      title: 'Saved Words',
      subtitle: isStorageUnavailable ? 'Collection unavailable' : `${savedCount} bookmarked ${savedCount === 1 ? 'word' : 'words'}`,
      path: '/saved',
    },
    {
      key: 'dictionary',
      title: 'Dictionary',
      subtitle: course.copy.dictionarySubtitle,
      path: '/dictionary',
    },
    {
      key: 'phrases',
      title: 'Learn Phrases',
      subtitle: 'Everyday expressions',
      path: '/flashcards',
    },
  ];

  const sections = [
    { title: 'Learn & Review', tools: coreTools },
    {
      title: 'Explore & Practise',
      tools: course.exploreTools.map((tool) => ({
        ...tool,
        subtitle:
          tool.key === 'writing' && !tool.path
            ? 'Character writing practice'
            : tool.subtitle,
      })),
    },
  ].map((section) => ({
    ...section,
    tools: section.tools.filter((tool) =>
      `${tool.title} ${tool.subtitle}`.toLowerCase().includes(query.trim().toLowerCase())
    ),
  }));

  const matchCount = sections.reduce((total, section) => total + section.tools.length, 0);

  return (
    <div
      className={`study-page library-page${
        isGrid ? ' library-page--grid' : ' library-page--list'
      }`}
    >
      <header className="library-header">
        <div>
          <p>{course.name} · Learning tools</p>
          <h1>Your library</h1>
        </div>
        <Link className="study-icon-button" to="/profile" aria-label="Open profile">
          <User size={21} aria-hidden="true" />
        </Link>
      </header>

      <section className="library-intro" aria-label="Library overview">
        <div>
          <p className="study-eyebrow">One word at a time</p>
          <h2>Make room for a little practice.</h2>
          <p>Learn something new or revisit your favourites.</p>
        </div>
        <LearningIcon kind="library" className="library-intro__art" />
      </section>

      {isStorageUnavailable && (
        <div className="library-storage-error" role="alert" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '14px',
          color: '#991B1B',
          fontSize: '0.875rem',
          marginBottom: '16px',
        }}>
          <span>Device collections unavailable. Could not read study records.</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRetryStorage}
            style={{ padding: '6px 12px', fontSize: '0.8125rem', minHeight: '36px' }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="library-counts" aria-label="Current course collections">
        <Link
          to="/learn"
          className={`library-count-card library-count-card--${cardStatus}`}
          aria-label={`Flashcards: ${cardCountLabel}`}
        >
          <LearningIcon kind="cards" className="library-counts__art" />
          <strong>{cardCountDisplay}</strong>
          <span>{cardCountLabel}</span>
        </Link>
        <Link
          to="/learn"
          className="library-count-card"
          aria-label={isStorageUnavailable ? 'Learned words: unavailable' : `Learned words: ${learnedCount}`}
        >
          <LearningIcon kind="cards" className="library-counts__art" />
          <strong>{isStorageUnavailable ? '—' : learnedCount}</strong>
          <span>{isStorageUnavailable ? 'Unavailable' : 'Learned words'}</span>
        </Link>
        <Link
          to="/saved"
          className="library-count-card"
          aria-label={isStorageUnavailable ? 'Saved words: unavailable' : `Saved words: ${savedCount}`}
        >
          <LearningIcon kind="saved" className="library-counts__art" />
          <strong>{isStorageUnavailable ? '—' : savedCount}</strong>
          <span>{isStorageUnavailable ? 'Unavailable' : 'Saved words'}</span>
        </Link>
        <Link
          to="/learn/review"
          className="library-count-card"
          aria-label={isStorageUnavailable ? 'Review queue: unavailable' : `Review queue: ${reviewCount}`}
        >
          <LearningIcon kind="review" className="library-counts__art" />
          <strong>{isStorageUnavailable ? '—' : reviewCount}</strong>
          <span>{isStorageUnavailable ? 'Unavailable' : 'To review'}</span>
        </Link>
      </div>

      <div className="library-toolbar">
        <StudySearch label="Find a learning tool" value={query} onChange={setQuery} />
        <div className="library-view" role="group" aria-label="Tool layout">
          <button
            className="study-icon-button"
            aria-label="Grid view"
            aria-pressed={isGrid}
            onClick={() => setIsGrid(true)}
          >
            <LayoutGrid size={20} aria-hidden="true" />
          </button>
          <button
            className="study-icon-button"
            aria-label="List view"
            aria-pressed={!isGrid}
            onClick={() => setIsGrid(false)}
          >
            <List size={21} aria-hidden="true" />
          </button>
        </div>
      </div>

      {query.trim() && (
        <p className="library-results" role="status">
          {matchCount} {matchCount === 1 ? 'tool' : 'tools'} found
        </p>
      )}

      {matchCount === 0 ? (
        <div className="study-empty">
          <h2>No matching tools</h2>
          <p>Try a tool name such as flashcards, writing or dictionary.</p>
          <button className="btn-secondary" onClick={() => setQuery('')}>
            Clear search
          </button>
        </div>
      ) : (
        sections
          .filter((section) => section.tools.length > 0)
          .map((section) => (
            <section
              className="library-section"
              key={section.title}
              aria-label={section.title}
            >
              <h2>{section.title}</h2>
              <div className="library-tools">
                {section.tools.map((tool) => (
                  <ToolCard key={tool.key} tool={tool} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
