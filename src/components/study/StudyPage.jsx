import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Search, X } from 'lucide-react';
import './StudyPage.css';

export function StudyHeader({ title, subtitle, backTo, backLabel }) {
  return (
    <header className="study-header">
      <Link className="study-icon-button" to={backTo} aria-label={backLabel}>
        <ChevronLeft size={22} aria-hidden="true" />
      </Link>
      <div className="study-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}

export function StudySearch({ value, onChange, label }) {
  const inputRef = useRef(null);
  const clearSearch = () => { onChange(''); inputRef.current?.focus(); };
  return (
    <div className="study-search" role="search" aria-label={label}>
      <Search size={19} aria-hidden="true" />
      <input ref={inputRef} type="search" aria-label={label} placeholder={label} value={value} onChange={event => onChange(event.target.value)} />
      {value && <button className="study-icon-button" onClick={clearSearch} aria-label="Clear search"><X size={18} aria-hidden="true" /></button>}
    </div>
  );
}
