import { useId } from 'react';
import { Home, Layers, Library, MessageCircle, User, Settings, RotateCw, Bookmark, BookOpen, Search, Languages, AudioLines, Type, Blocks, PenLine, Mic } from 'lucide-react';
import './LearningIcon.css';

// Original tool symbols and color families inside the responsive card artwork.
// Labels name the destination; the illustration is decorative.
const symbols = {
  home: Home, cards: Layers, library: Library, phrases: MessageCircle,
  profile: User, settings: Settings, review: RotateCw, saved: Bookmark,
  dictionary: BookOpen, search: Search, scriptDictionary: Languages,
  sounds: AudioLines, kana: Type, radicals: Blocks, interest: Layers,
  writing: PenLine, twisters: Mic,
};

export default function LearningIcon({ kind = 'cards', className = '', glyph }) {
  const id = useId();
  const Icon = symbols[kind] || Layers;
  return (
    <svg className={`learning-icon learning-icon--${kind} ${className}`} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--icon-start)" /><stop offset="1" stopColor="var(--icon-end)" />
        </linearGradient>
      </defs>
      <rect x="22" y="12" width="46" height="58" rx="11" transform="rotate(12 45 41)" fill={`url(#${id}-back)`} />
      <g transform="rotate(-8 34 43)">
        <rect className="learning-icon__front" x="9" y="14" width="50" height="58" rx="11" fill="white" stroke="var(--icon-soft)" />
        {glyph ? <text x="34" y="43" textAnchor="middle" dominantBaseline="central" fill="var(--icon-end)" fontSize="30" fontWeight="750" fontFamily="var(--font-sans)">{glyph}</text>
          : <Icon x="15" y="24" width="38" height="38" color="var(--icon-end)" strokeWidth={2.2} />}
      </g>
      <path d="m12 8 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="var(--icon-start)" />
    </svg>
  );
}
