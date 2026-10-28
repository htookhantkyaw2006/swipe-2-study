import { Outlet, useLocation } from 'react-router-dom';
import { useLayoutEffect, useRef, useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import BottomNav from './BottomNav';
import { readCollapsedPreference, writeCollapsedPreference } from '../lib/sidebarStorage';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);
  const showButtonRef = useRef(null);
  const hideButtonRef = useRef(null);
  const focusTargetRef = useRef(null);

  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPreference);

  const handleCollapse = () => {
    focusTargetRef.current = 'show';
    setIsCollapsed(true);
    writeCollapsedPreference(true);
  };

  const handleExpand = () => {
    focusTargetRef.current = 'hide';
    setIsCollapsed(false);
    writeCollapsedPreference(false);
  };

  useLayoutEffect(() => {
    if (focusTargetRef.current === 'show') {
      focusTargetRef.current = null;
      showButtonRef.current?.focus();
    } else if (focusTargetRef.current === 'hide') {
      focusTargetRef.current = null;
      hideButtonRef.current?.focus();
    }
  }, [isCollapsed]);

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
    <div className={`app-shell${isSessionActive ? ' app-shell--session' : ''}${isCollapsed ? ' app-shell--collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      {!isSessionActive && (
        <BottomNav
          isCollapsed={isCollapsed}
          onToggleCollapse={handleCollapse}
          hideButtonRef={hideButtonRef}
        />
      )}
      <main 
        id="main-content"
        tabIndex={-1}
        ref={mainRef} 
        onScroll={handleScroll}
        className="app-main slim-scrollbar"
      >
        {!isSessionActive && isCollapsed && (
          <div className="desktop-sidebar-toggle-bar">
            <button
              type="button"
              ref={showButtonRef}
              className="sidebar-toggle sidebar-toggle--show"
              onClick={handleExpand}
              aria-expanded={false}
              aria-controls="app-navigation"
              aria-label="Show sidebar"
              title="Show sidebar"
            >
              <PanelLeftOpen size={18} aria-hidden="true" />
              <span>Show sidebar</span>
            </button>
          </div>
        )}
        <Outlet />
      </main>
    </div>
  );
}
