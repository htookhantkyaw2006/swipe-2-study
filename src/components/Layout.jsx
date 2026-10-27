import { Outlet, useLocation } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);

  const readScrollCache = () => {
    try {
      const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
      return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
    } catch {
      return {};
    }
  };

  // Restore scroll position when route changes (synchronously before paint to prevent flicker)
  useLayoutEffect(() => {
    if (mainRef.current) {
      const cache = readScrollCache();
      const savedPos = cache[location.pathname] || 0;
      mainRef.current.scrollTo(0, savedPos);
    }
  }, [location.pathname]);

  // Track scroll position
  const handleScroll = () => {
    if (mainRef.current) {
      const cache = readScrollCache();
      cache[location.pathname] = mainRef.current.scrollTop;
      try {
        sessionStorage.setItem('scrollCache', JSON.stringify(cache));
      } catch {
        // Scrolling still works when browser storage is unavailable.
      }
    }
  };

  const isSessionActive = location.pathname.endsWith('/session');

  return (
    <div className={`app-shell${isSessionActive ? ' app-shell--session' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!isSessionActive && <BottomNav />}
      <main 
        id="main-content"
        tabIndex={-1}
        ref={mainRef} 
        onScroll={handleScroll}
        className="app-main slim-scrollbar"
      >
        <Outlet />
      </main>
    </div>
  );
}
