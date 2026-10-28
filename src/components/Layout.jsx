import { Outlet, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import BottomNav from './BottomNav';
import { readCollapsedPreference, writeCollapsedPreference } from '../lib/sidebarStorage';
import { useDesktopLayout } from '../lib/useDesktopLayout';

const readScrollCache = () => {
  try {
    const cache = JSON.parse(sessionStorage.getItem('scrollCache') || '{}');
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
  } catch { return {}; }
};

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const scrollTimer = useRef(null);
  const pendingScroll = useRef(null);
  const isDesktop = useDesktopLayout();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPreference);
  const isSessionActive = location.pathname.endsWith('/session');

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    writeCollapsedPreference(next);
    // One persistent button keeps focus without scrolling the study content.
  };
  const flushScroll = useCallback(() => {
    clearTimeout(scrollTimer.current);
    const pending = pendingScroll.current;
    pendingScroll.current = null;
    if (!pending) return;
    try {
      const cache = readScrollCache();
      cache[pending.path] = pending.top;
      sessionStorage.setItem('scrollCache', JSON.stringify(cache));
    } catch { /* Scrolling still works when storage is unavailable. */ }
  }, []);

  useLayoutEffect(() => {
    flushScroll();
    if (mainRef.current) mainRef.current.scrollTop = Number(readScrollCache()[location.pathname]) || 0;
  }, [location.pathname, flushScroll]);
  useEffect(() => {
    window.addEventListener('pagehide', flushScroll);
    return () => { window.removeEventListener('pagehide', flushScroll); flushScroll(); };
  }, [flushScroll]);
  const handleScroll = () => {
    pendingScroll.current = { path: location.pathname, top: mainRef.current.scrollTop };
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(flushScroll, 150);
  };

  return (
    <div className={`app-shell${isSessionActive ? ' app-shell--session' : ''}${isCollapsed ? ' app-shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!isSessionActive && <BottomNav isCollapsed={isCollapsed} isDesktop={isDesktop} />}
      <main id="main-content" tabIndex={-1} ref={mainRef} onScroll={handleScroll} className="app-main slim-scrollbar">
        {!isSessionActive && <div className="desktop-sidebar-toolbar">
          <button type="button" className="sidebar-toggle" onClick={toggleSidebar}
            aria-expanded={!isCollapsed} aria-controls="app-navigation" aria-label={isCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
            {isCollapsed ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
            <span>{isCollapsed ? 'Show sidebar' : 'Hide sidebar'}</span>
          </button>
        </div>}
        <Outlet />
      </main>
    </div>
  );
}
