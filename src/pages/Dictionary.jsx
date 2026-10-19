import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, Bookmark, BookmarkMinus, Clock, Volume2 } from 'lucide-react';
import { db } from '../lib/db';
import { speak } from '../lib/speech';
import { useCourse } from '../lib/language';
import { readingOf, sayOf, kanaOf, matchesQuery } from '../lib/entry';

/* Dictionary entries come from the active course (src/courses). */

export default function Dictionary() {
  const navigate = useNavigate();
  const course = useCourse();
  const dictionaryDatabase = course.dictionary;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [savedWordsMap, setSavedWordsMap] = useState({});

  // Load history and saved words
  useEffect(() => {
    setHistory(db.get('search_history'));
    
    // Create a lookup map for saved words
    const saved = db.get('saved_words');
    const map = {};
    saved.forEach(word => {
      // Use phrase as the key to check if saved since IDs might differ
      map[word.phrase] = word;
    });
    setSavedWordsMap(map);
  }, []);

  const handleSearch = (text) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }

    // Matches the word, its kana, its romanisation ignoring tone marks
    // and macrons ("ni" finds "Nǐ", "kyou" finds "kyō"), English or Burmese.
    setResults(dictionaryDatabase.filter((word) => matchesQuery(word, text)));
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && query.trim()) {
      const newHistoryItem = { term: query.trim(), id: Date.now().toString() };
      const currentHistory = db.get('search_history');
      
      // Prevent duplicates
      const filteredHistory = currentHistory.filter(h => h.term.toLowerCase() !== query.trim().toLowerCase());
      filteredHistory.unshift(newHistoryItem);
      
      // Keep only last 10
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
    e.stopPropagation();
    
    if (savedWordsMap[word.phrase]) {
      // Unsave
      const savedId = savedWordsMap[word.phrase].id;
      db.remove('saved_words', savedId);
      
      const newMap = { ...savedWordsMap };
      delete newMap[word.phrase];
      setSavedWordsMap(newMap);
    } else {
      // Save
      const savedWord = db.insert('saved_words', {
        phrase: word.phrase,
        ...(word.kana ? { kana: word.kana } : {}),
        reading: readingOf(word),
        english: word.english,
        burmese: word.burmese
      });
      
      setSavedWordsMap({
        ...savedWordsMap,
        [word.phrase]: savedWord
      });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', paddingBottom: '100px', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '24px' }}>
        <button onClick={() => navigate(-1)} style={{ position: 'absolute', left: '24px', background: 'transparent', padding: 0, border: 'none', cursor: 'pointer' }}>
          <ChevronLeft size={24} color="var(--color-text-navy)" strokeWidth={2.5} />
        </button>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>Dictionary</h1>
      </header>

      <div style={{ padding: '0 24px' }}>
        
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
            placeholder={course.copy.searchPlaceholder}
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
                  const isSaved = !!savedWordsMap[word.phrase];
                  
                  return (
                    <div 
                      key={word.id}
                      style={{ 
                        backgroundColor: '#FFFFFF', borderRadius: '20px', padding: '16px', 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        boxShadow: '0 4px 12px rgba(12, 74, 110, 0.05)', position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-navy)', margin: 0 }}>{word.phrase}</h4>
                            {kanaOf(word) && <span style={{ fontSize: '0.875rem', color: 'var(--color-secondary-blue)', fontWeight: 600 }}>{kanaOf(word)}</span>}
                            <span style={{ fontSize: '0.875rem', color: 'var(--color-primary-blue)', fontFamily: 'JetBrains Mono, monospace' }}>{readingOf(word)}</span>
                          </div>
                          <p style={{ fontSize: '0.875rem', color: '#64748B', margin: 0 }}>
                            {word.english} <span style={{ opacity: 0.5 }}>•</span> {word.burmese}
                          </p>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        >
                          {isSaved ? <BookmarkMinus size={18} strokeWidth={2.5} /> : <Bookmark size={18} strokeWidth={2.5} />}
                        </button>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(sayOf(word));
                          }}
                          style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            backgroundColor: 'var(--color-page-bg)', color: 'var(--color-primary-blue)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: 'none', cursor: 'pointer', transition: 'background-color 0.2s',
                            flexShrink: 0
                          }}
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
