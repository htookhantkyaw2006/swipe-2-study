import { useState } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { useLanguage } from '../../lib/language';
import LanguageFlag from './LanguageFlag';
import AppDialog from './AppDialog';
import './LanguageSwitcher.css';

export function LanguageSheet({ onClose }) {
  const { language, languages, setLanguage } = useLanguage();
  return <AppDialog label="Choose your learning language" onClose={onClose}>
    <div className="app-dialog__header"><h2>I'm learning…</h2><button type="button" className="study-icon-button" onClick={onClose} aria-label="Close language picker"><X size={20} aria-hidden="true" /></button></div>
    <div className="language-options">
      {languages.map(item => <button type="button" className="language-option" key={item.id} aria-pressed={item.id === language.id} disabled={item.status !== 'active'} onClick={() => { if (setLanguage(item.id)) onClose(); }}>
        <LanguageFlag id={item.id} size={32} /><span className="language-option__copy"><strong>{item.name} <span>{item.nativeName !== item.name ? item.nativeName : ''}</span></strong><small>{item.levelSystem} · {item.levels[0]}–{item.levels.at(-1)}</small></span>
        {item.status !== 'active' ? <span className="language-option__soon">Soon</span> : item.id === language.id ? <Check size={20} aria-hidden="true" /> : null}
      </button>)}
    </div>
  </AppDialog>;
}

export default function LanguageSwitcher() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  return <>
    <button className="language-trigger" type="button" onClick={() => setOpen(true)} aria-label={`Learning ${language.name}. Change language`} aria-haspopup="dialog" aria-expanded={open}><LanguageFlag id={language.id} size={22} /><span>{language.name}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && <LanguageSheet onClose={() => setOpen(false)} />}
  </>;
}
