import { NavLink, Link, useLocation } from 'react-router-dom';
import { Home, Layers, Library as LibraryIcon, MessageCircle, User } from 'lucide-react';

export default function BottomNav() {
  const location = useLocation();
  const pathname = location.pathname;
  const isLibraryChild =
    pathname === '/saved' ||
    pathname.startsWith('/saved/') ||
    pathname === '/dictionary' ||
    pathname.startsWith('/dictionary/');
  const isLibraryActive =
    pathname === '/library' || pathname.startsWith('/library/') || isLibraryChild;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/learn', icon: Layers, label: 'Flashcards' },
    { path: '/library', icon: LibraryIcon, label: 'Library', isProminent: true },
    { path: '/flashcards', icon: MessageCircle, label: 'Phrases' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav
      aria-label="Main navigation"
      className="app-bottom-nav"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.1)',
        borderRadius: '100px',
        padding: '8px 16px',
        position: 'fixed',
        bottom: 'max(24px, calc(16px + env(safe-area-inset-bottom, 0px)))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)',
        maxWidth: '400px',
        zIndex: 50
      }}
    >
      {navItems.map((item) => {
        if (item.path === '/library') {
          const ariaCurrent = isLibraryActive
            ? (pathname === '/library' ? 'page' : 'true')
            : undefined;

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={ariaCurrent}
              className={`navigation-link navigation-link--library${isLibraryActive ? ' is-active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                position: 'relative'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)',
                  color: '#FFFFFF',
                  boxShadow: '0 4px 12px rgba(2, 132, 199, 0.25)',
                  transition: 'transform 0.2s',
                  position: 'absolute',
                  top: '-12px'
                }}>
                  <item.icon size={22} strokeWidth={2.5} />
                </div>
                <span style={{ position: 'absolute', bottom: '6px', fontSize: '10px', fontWeight: 700, color: isLibraryActive ? 'var(--color-primary-blue)' : '#9CA3AF' }}>{item.label}</span>
              </div>
            </Link>
          );
        }

        return (
          <NavLink
            key={item.path}
            to={item.path}
            style={{ textDecoration: 'none' }}
            end={item.path === '/'}
            className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}
          >
            {({ isActive }) => (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                color: isActive ? 'var(--color-primary-blue)' : '#9CA3AF',
                transition: 'all 0.3s ease',
                position: 'relative'
              }}>
                {/* Active Background Circle */}
                {isActive && (
                  <div style={{ position: 'absolute', top: '2px', width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'var(--color-ghost-blue)', zIndex: 0 }}></div>
                )}
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '24px', marginBottom: '4px' }}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, zIndex: 1, letterSpacing: '0.2px' }}>{item.label}</span>
              </div>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
