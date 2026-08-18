import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  const isSessionActive = location.pathname.includes('/session') || location.pathname.includes('/review');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%' }}>
      <main ref={mainRef} className="slim-scrollbar" style={{ flex: 1, overflowY: 'auto', paddingBottom: isSessionActive ? '0' : '70px' }}>
        <Outlet />
      </main>
      {!isSessionActive && <BottomNav />}
    </div>
  );
}
