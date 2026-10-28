import { NavLink } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight, Home, Layers, Library, MessageCircle, User, Settings } from 'lucide-react';

const items = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/learn', icon: Layers, label: 'Flashcards' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/flashcards', icon: MessageCircle, label: 'Phrases' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  const navRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const shell = nav.parentElement;
    const measure = () => shell.style.setProperty('--navigation-height', `${nav.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(nav);
    return () => { observer.disconnect(); shell.style.removeProperty('--navigation-height'); };
  }, []);
  return (
    <nav ref={navRef} className="app-navigation" aria-label="Main navigation">
      <NavLink to="/" className="app-brand" aria-label="Swipe 2 Study home">
        <span className="app-brand-mark" aria-hidden="true"><Layers size={25} /></span>
        <span>Swipe <span className="brand-two">2</span> Study<span className="app-brand-caption">Your language companion.</span></span>
      </NavLink>
      <div className="navigation-links">
        {items.map(({ path, icon: Icon, label }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `navigation-link${path === '/library' ? ' navigation-link--library' : ''}${isActive ? ' is-active' : ''}`}>
            <span className="navigation-symbol" aria-hidden="true"><Icon size={22} strokeWidth={2} /></span><span>{label === 'Flashcards' ? <>Flash<wbr />cards</> : label}</span>
          </NavLink>
        ))}
      </div>
      <div className="navigation-footer">
        <div className="navigation-note">
          <span className="navigation-note-icon" aria-hidden="true"><Layers size={20} /></span>
          <p>One word at a time.</p><span>Keep your curiosity going.</span>
          <NavLink to="/learn">Explore flashcards <ArrowUpRight size={16} aria-hidden="true" /></NavLink>
        </div>
        <NavLink to="/settings" className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}>
          <span className="navigation-symbol" aria-hidden="true"><Settings size={22} /></span><span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
