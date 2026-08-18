import { NavLink } from 'react-router-dom';
import { Home, BookOpen, Library as LibraryIcon, Layers, User, MessageCircle } from 'lucide-react';

export default function BottomNav() {
  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/learn', icon: Layers, label: 'Flashcards' },
    { path: '/library', icon: LibraryIcon, label: 'Library', isProminent: true },
    { path: '/flashcards', icon: MessageCircle, label: 'Phrases' },
    { path: '/profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.1)', 
      borderRadius: '100px',
      padding: '8px 16px', 
      position: 'fixed', 
      bottom: '24px', 
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'calc(100% - 48px)', 
      maxWidth: '400px', 
      zIndex: 50 
    }}>
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          style={{ textDecoration: 'none' }}
          end={item.path === '/'}
        >
          {({ isActive }) => {
            if (item.isProminent) {
              return (
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
                  <span style={{ position: 'absolute', bottom: '6px', fontSize: '10px', fontWeight: 700, color: isActive ? 'var(--color-primary-blue)' : '#9CA3AF' }}>{item.label}</span>
                </div>
              );
            }

            return (
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
            );
          }}
        </NavLink>
      ))}
    </nav>
  );
}
