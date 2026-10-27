import { NavLink } from 'react-router-dom';
import { Home, Library, Layers, User, MessageCircle, Settings, ArrowUpRight } from 'lucide-react';

const items = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/learn', icon: Layers, label: 'Flashcards' },
  { path: '/library', icon: Library, label: 'Library' },
  { path: '/flashcards', icon: MessageCircle, label: 'Phrases' },
  { path: '/profile', icon: User, label: 'Profile' },
];

export default function BottomNav() {
  return (
    <nav className="app-navigation" aria-label="Main navigation">
      <NavLink to="/" className="app-brand" aria-label="Swipe 2 Study home">
        <span className="app-brand-mark" aria-hidden="true"><Layers size={25} strokeWidth={2} /></span>
        <span>Swipe <span className="brand-two">2</span> Study<span className="app-brand-caption">Your language companion.</span></span>
      </NavLink>
      <div className="navigation-links">
        {items.map(({ path, icon: Icon, label }) => (
          <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `navigation-link${isActive ? ' is-active' : ''}`}>
            <Icon size={21} strokeWidth={1.9} aria-hidden="true" /><span>{label}</span>
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
          <Settings size={21} aria-hidden="true" /><span>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
