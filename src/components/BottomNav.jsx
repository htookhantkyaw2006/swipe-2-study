import { NavLink } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import LearningIcon from './ui/LearningIcon';

const items = [
  { path: '/', icon: 'home', label: 'Home' },
  { path: '/learn', icon: 'cards', label: 'Flashcards' },
  { path: '/library', icon: 'library', label: 'Library' },
  { path: '/flashcards', icon: 'phrases', label: 'Phrases' },
  { path: '/profile', icon: 'profile', label: 'Profile' },
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
        <LearningIcon kind="cards" className="app-brand-art" />
        <span>Swipe <span className="brand-two">2</span> Study<span className="app-brand-caption">Your language companion.</span></span>
      </NavLink>
      <div className="navigation-links">
        {items.map(({ path, icon, label }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}>
            <LearningIcon kind={icon} className="navigation-art" /><span>{label === 'Flashcards' ? <>Flash<wbr />cards</> : label}</span>
          </NavLink>
        ))}
      </div>
      <div className="navigation-footer">
        <div className="navigation-note">
          <LearningIcon kind="cards" className="navigation-note-art" />
          <p>One word at a time.</p><span>Keep your curiosity going.</span>
          <NavLink to="/learn">Explore flashcards <ArrowUpRight size={16} aria-hidden="true" /></NavLink>
        </div>
        <NavLink to="/settings" className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}>
          <LearningIcon kind="settings" className="navigation-art" /><span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
