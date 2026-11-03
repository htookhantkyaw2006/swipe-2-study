import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Bookmark, BookmarkMinus, Clock, Volume2 } from 'lucide-react';
import { db } from '../lib/db';
import { speak } from '../lib/speech';
import { playWordAudio } from '../lib/wordAudio';
import { useCourse } from '../lib/language';
import { readingOf, kanaOf, matchesQuery, wordOf } from '../lib/entry';
import { storageOwner } from '../lib/storageOwner';
import { buildSavedWordRecord, findSavedWord } from '../lib/studyWords.js';
import { safeNavigateBack } from '../lib/navigation.js';

export default function Dictionary() {
  const navigate = useNavigate();
  const course = useCourse();
  const dictionaryDatabase = course.dictionary || [];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState(() => db.get('search_history') || []);
  const [savedWords, setSavedWords] = useState(() => db.get('saved_words') || []);

  const refreshSavedWords = () => {
    setSavedWords(db.get('saved_words') || []);
  };

  useEffect(() => {
    setHistory(db.get('search_history') || []);
    refreshSavedWords();

    const unsubChange = storageOwner.subscribeChange(() => {
      setHistory(db.get('search_history') || []);
      refreshSavedWords();
    });
    const unsubOwner = storageOwner.subscribe(() => {
      setHistory(db.get('search_history') || []);
      refreshSavedWords();
    });
    return () => {
      unsubChange?.();
      unsubOwner?.();
    };
  }, []);

  const handleSearch = (text) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setResults(dictionaryDatabase.filter((word) => matchesQuery(word, text)));
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      const newHistoryItem = { term: query.trim(), id: Date.now().toString() };
      const currentHistory = db.get('search_history') || [];
      const filteredHistory = currentHistory.filter(h => h.term.toLowerCase() !== query.trim().toLowerCase());
      filteredHistory.unshift(newHistoryItem);
      const limitedHistory = filteredHistory.slice(0, 10);
      db.set('search_history', limitedHistory);
      setHistory(limitedHistory);
    }
  };

  const handleHistoryClick = (term) => {
    handleSearch(term);
  };

  const clearHistory = () => {
    db.set('search_history', []);
    setHistory([]);
  };

  const toggleSave = (word, e) => {
    e?.stopPropagation();
    const currentSaved = db.get('saved_words') || [];
    const existing = findSavedWord(currentSaved, word);
    if (existing) {
      db.remove('saved_words', existing.id);
    } else {
      const record = buildSavedWordRecord(word);
      db.insert('saved_words', record);
    }
    refreshSavedWords();
  };

  const handlePlayWord = (e, word) => {
    e.stopPropagation();
    playWordAudio(word, { speakFn: speak });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => safeNavigateBack(navigate, '/library')} aria-label="Back" style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Dictionary</h1>
      </header>

      <div style={{ padding: '0 24px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Search Bar */}
        <div style={{
          backgroundColor: '#FFFFFF', borderRadius: '16px', padding: '16px',
          display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', marginBottom: '24px',
          border: '1px solid #E0F2FE'
        }}>
          <Search size={20} color="var(--color-primary-blue)" strokeWidth={2.5} />
          <input
            type="text"
            placeholder={course.copy?.searchPlaceholder || 'Search words, pinyin, meaning...'}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchSubmit}
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: '1rem',
              color: 'var(--color-text-navy)', background: 'transparent'
            }}
          />
        </div>

        {/* Results or History */}
        {query.trim() === '' ? (
          /* History View */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>
                Recent Searches
              </h3>
              {history.length > 0 && (
                <button onClick={clearHistory} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                  Clear All
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: '40px' }}>
                <Search size={48} strokeWidth={1.5} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <p>No recent searches.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {history.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleHistoryClick(item.term)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                      backgroundColor: '#FFFFFF', borderRadius: '16px', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(12, 74, 110, 0.03)'
                    }}
                  >
                    <Clock size={16} color="#94A3B8" />
                    <span style={{ fontSize: '1rem', color: 'var(--color-text-navy)', fontWeight: 500 }}>{item.term}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Results View */
          <div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: '0 0 16px 0' }}>
              Search Results
            </h3>

            {results.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', marginTop: '40px' }}>
                <p>No words found for "{query}".</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.map((word) => {
                  const phrase = word.phrase || word.character || wordOf(word) || '';
                  const isSaved = Boolean(findSavedWord(savedWords, word));
                  const reading = readingOf(word) || word.pronunciation || '';
                  const english = word.english || word.definition || word.meaning_english || '';
                  const burmese = word.burmese || word.burmese_definition || word.meaning_burmese || '';
                  const kana = kanaOf(word);

                  return (
                    <div
                      key={word.id || phrase}
                      style={{
                        backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>{phrase}</h4>
                            {kana && <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>{kana}</span>}
                            {reading && <span style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', fontFamily: 'var(--font-reading)' }}>{reading}</span>}
                          </div>
                          <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0, overflowWrap: 'break-word' }}>
                            {english} {english && burmese && <span style={{ opacity: 0.5 }}>•</span>} {burmese}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                        <button
                          onClick={(e) => toggleSave(word, e)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            backgroundColor: isSaved ? '#D1FAE5' : 'var(--color-page-bg)',
                            color: isSaved ? '#059669' : '#94A3B8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                            flexShrink: 0
                          }}
                          title={isSaved ? "Unsave" : "Save Word"}
                          aria-label={isSaved ? `Unsave ${phrase}` : `Save ${phrase}`}
                        >
                          {isSaved ? <BookmarkMinus size={18} strokeWidth={2.5} /> : <Bookmark size={18} strokeWidth={2.5} />}
                        </button>

                        <button
                          onClick={(e) => handlePlayWord(e, word)}
                          style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            backgroundColor: 'var(--color-page-bg)', color: 'var(--color-primary-blue)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                            flexShrink: 0
                          }}
                          title="Play audio"
                          aria-label={`Play audio for ${phrase}`}
                        >
                          <Volume2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
