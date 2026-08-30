import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useLayoutEffect, useRef } from 'react';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);

  // Restore scroll position when route changes (synchronously before paint to prevent flicker)
  useLayoutEffect(() => {
    if (mainRef.current) {
      const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
      const savedPos = cache[location.pathname] || 0;
      mainRef.current.scrollTo(0, savedPos);
    }
  }, [location.pathname]);

  // Track scroll position
  const handleScroll = () => {
    if (mainRef.current) {
      const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
      cache[location.pathname] = mainRef.current.scrollTop;
      sessionStorage.setItem('scrollCache', JSON.stringify(cache));
    }
  };

  const isSessionActive = location.pathname.endsWith('/session');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <main 
        ref={mainRef} 
        onScroll={handleScroll}
        className="slim-scrollbar" 
        style={{ flex: 1, overflowY: 'auto', paddingBottom: isSessionActive ? '0' : '70px' }}
      >
        <Outlet />
      </main>
      {!isSessionActive && <BottomNav />}
    </div>
  );
}
