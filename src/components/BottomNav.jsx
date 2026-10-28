import { NavLink } from 'react-router-dom';
import { useLayoutEffect, useRef } from 'react';
import { ArrowUpRight, Home, Layers, Library, MessageCircle, User, Settings, PanelLeftClose } from 'lucide-react';
import LearningIcon from './ui/LearningIcon';

const items = [
  { path: '/', icon: Home, kind: 'home', label: 'Home' },
  { path: '/learn', icon: Layers, kind: 'cards', label: 'Flashcards' },
  { path: '/library', icon: Library, kind: 'library', label: 'Library' },
  { path: '/flashcards', icon: MessageCircle, kind: 'phrases', label: 'Phrases' },
  { path: '/profile', icon: User, kind: 'profile', label: 'Profile' },
];

export default function BottomNav({ isCollapsed = false, onToggleCollapse, hideButtonRef }) {
  const navRef = useRef(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const shell = nav.parentElement;
    if (!shell) return;
    const measure = () => {
      const height = nav.getBoundingClientRect().height;
      if (height > 0) {
        shell.style.setProperty('--navigation-height', `${height}px`);
      }
    };
    const observer = new ResizeObserver(measure);
    measure();
    observer.observe(nav);
    return () => { observer.disconnect(); shell.style.removeProperty('--navigation-height'); };
  }, []);

  return (
    <nav id="app-navigation" ref={navRef} className={`app-navigation${isCollapsed ? ' is-collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-header">
        <NavLink to="/" className="app-brand" aria-label="Swipe 2 Study home">
          <span className="app-brand-mark" aria-hidden="true"><Layers size={25} /></span>
          <span>Swipe <span className="brand-two">2</span> Study<span className="app-brand-caption">Your language companion.</span></span>
        </NavLink>
        <button
          type="button"
          ref={hideButtonRef}
          className="sidebar-toggle sidebar-toggle--hide"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-controls="app-navigation"
          aria-label="Hide sidebar"
          title="Hide sidebar"
        >
          <PanelLeftClose size={18} aria-hidden="true" />
          <span>Hide sidebar</span>
        </button>
      </div>
      <div className="navigation-links">
        {items.map(({ path, icon: Icon, kind, label }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `navigation-link${path === '/library' ? ' navigation-link--library' : ''}${isActive ? ' is-active' : ''}`}>
            <span className="navigation-symbol" aria-hidden="true"><Icon size={22} strokeWidth={2} /></span>
            <LearningIcon kind={kind} className="navigation-art" />
            <span>{label === 'Flashcards' ? <>Flash<wbr />cards</> : label}</span>
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
          <span className="navigation-symbol" aria-hidden="true"><Settings size={22} /></span>
          <LearningIcon kind="settings" className="navigation-art" />
          <span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
