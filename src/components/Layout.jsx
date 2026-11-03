import { Outlet, useLocation } from 'react-router-dom';
import { useLayoutEffect, useRef, useState, Suspense } from 'react';
import BottomNav from './BottomNav';
import { useGuestImport } from '../lib/useGuestImport';
import GuestImportNotice from './GuestImportNotice';
import { RouteErrorBoundary, RouteLoadingFallback } from './RouteErrorBoundary';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const isSessionActive = location.pathname.endsWith('/session');
  const { learningVersion } = useGuestImport();
  const [renderVersion, setRenderVersion] = useState(learningVersion);

  useLayoutEffect(() => {
    // A save can finish after browser Back enters a study session. Refresh its
    // lists on exit, without replacing the session's in-memory deck mid-study.
    if (!isSessionActive) setRenderVersion(learningVersion);
  }, [isSessionActive, learningVersion]);

  // Restore scroll position when route changes (synchronously before paint to prevent flicker)
  useLayoutEffect(() => {
    if (mainRef.current) {
      try {
        const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
        const savedPos = cache[location.pathname] || 0;
        mainRef.current.scrollTo(0, savedPos);
      } catch {}
    }
  }, [location.pathname]);

  // Track scroll position
  const handleScroll = () => {
    if (mainRef.current) {
      try {
        const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
        cache[location.pathname] = mainRef.current.scrollTop;
        sessionStorage.setItem('scrollCache', JSON.stringify(cache));
      } catch {}
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <main
        ref={mainRef}
        onScroll={handleScroll}
        className="slim-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingBottom: isSessionActive ? '0' : '100px'
        }}
      >
        {!isSessionActive && <GuestImportNotice />}
        <RouteErrorBoundary>
          <Suspense fallback={<RouteLoadingFallback />}>
            <Outlet key={renderVersion} />
          </Suspense>
        </RouteErrorBoundary>
      </main>
      {!isSessionActive && <BottomNav />}
    </div>
  );
}
