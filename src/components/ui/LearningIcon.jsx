import { useId } from 'react';
import './LearningIcon.css';

// Small illustrations built from the same stacked cards as the featured course.
// Navigation labels provide the accessible name; these illustrations are decorative.
export default function LearningIcon({ kind = 'cards', className = '', glyph = 'Aa' }) {
  const id = useId();
  const blue = `url(#${id}-blue)`;
  let artwork;
  switch (kind) {
    case 'home':
      artwork = <>
        <path d="M18 42 34 28 50 42" fill="none" stroke="#0C4A6E" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M22 40v18h24V40L34 30Z" fill={blue} />
        <path d="M30 58V46h8v12" fill="#FFFFFF" />
        <path d="M41 30v7" stroke="#0C4A6E" strokeWidth="3" strokeLinecap="round" />
      </>;
      break;
    case 'phrases':
      artwork = <>
        <path d="M31 38h14a7 7 0 0 1 7 7v5a7 7 0 0 1-7 7h-2l-6 5v-5h-6a7 7 0 0 1-7-7v-5a7 7 0 0 1 7-7" fill="#BAE6FD" />
        <path d="M23 29h17a7 7 0 0 1 7 7v6a7 7 0 0 1-7 7h-9l-8 6v-6a7 7 0 0 1-7-7v-6a7 7 0 0 1 7-7" fill={blue} />
        <path d="M24 37h15m-15 6h9" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </>;
      break;
    case 'dictionary':
    case 'scriptDictionary':
      artwork = <>
        <rect x="21" y="27" width="27" height="34" rx="5" fill={blue} />
        <path d="M26 27v28m0 2h20" stroke="#7DD3FC" strokeWidth="2" />
        <path d="m30 46 5-12 5 12m-8-4h6" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M28 57h17" stroke="white" strokeWidth="2" strokeLinecap="round" />
      </>;
      break;
    case 'library':
      artwork = <>
        <rect x="19" y="32" width="8" height="27" rx="2" fill="#0C4A6E" />
        <rect x="29" y="27" width="9" height="32" rx="2" fill={blue} />
        <rect x="41" y="30" width="8" height="29" rx="2" transform="rotate(-12 41 59)" fill="#38BDF8" />
        <path d="M22 39h2m8-4h3m-13 18h2m8-1h3" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </>;
      break;
    case 'review':
      artwork = <>
        <path d="M46 41a13 13 0 1 0-2 12" fill="none" stroke={blue} strokeWidth="4.5" strokeLinecap="round" />
        <path d="m47 30 1 14-14-1Z" fill="#0369A1" />
        <path d="M34 36v9l6 3" fill="none" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
      </>;
      break;
    case 'saved':
      artwork = <>
        <path d="M25 28h19a3 3 0 0 1 3 3v31L35 54 22 62V31a3 3 0 0 1 3-3" fill={blue} />
        <path d="M29 35h11m-11 6h8" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      </>;
      break;
    case 'profile':
      artwork = <>
        <circle cx="34" cy="35" r="8" fill={blue} />
        <path d="M19 60v-5c0-6 6-10 15-10s15 4 15 10v5Z" fill={blue} />
        <path d="M29 48q5 6 10 0" fill="none" stroke="#BAE6FD" strokeWidth="2" />
      </>;
      break;
    case 'settings':
      artwork = <>
        <g stroke="#0369A1" strokeWidth="6" strokeLinecap="round">
          <path d="M34 29v30M19 44h30M23 33l22 22M23 55l22-22" />
        </g>
        <circle cx="34" cy="44" r="12" fill={blue} />
        <circle cx="34" cy="44" r="5" fill="white" />
      </>;
      break;
    case 'writing':
      artwork = <>
        <path d="m23 51-3 11 11-3 20-23-8-8Z" fill={blue} />
        <path d="m43 28 8 8 3-4a3 3 0 0 0 0-4l-3-3a3 3 0 0 0-4 0Z" fill="#0C4A6E" />
        <path d="m24 51 7 7m-7-2 3 3" stroke="white" strokeWidth="2" />
      </>;
      break;
    case 'sounds':
      artwork = <g stroke={blue} strokeWidth="5" strokeLinecap="round"><path d="M20 40v9m7-17v25m7-30v34m7-28v23m7-16v9" /></g>;
      break;
    case 'twisters':
      artwork = <>
        <rect x="28" y="27" width="13" height="23" rx="6.5" fill={blue} />
        <path d="M23 43v3a11.5 11.5 0 0 0 23 0v-3M34 58v5m-6 0h12" fill="none" stroke="#0369A1" strokeWidth="3" strokeLinecap="round" />
      </>;
      break;
    case 'interest':
      artwork = <>
        <circle cx="34" cy="44" r="16" fill={blue} />
        <path d="m42 35-4 14-12 4 4-14Z" fill="white" />
        <path d="m30 39 8 10-12 4Z" fill="#7DD3FC" />
        <circle cx="34" cy="44" r="2" fill="#0369A1" />
      </>;
      break;
    case 'kana':
    case 'radicals':
      artwork = <text x="34" y="54" textAnchor="middle" fill="#0369A1" fontSize="30" fontWeight="700" fontFamily="var(--font-sans)">{kind === 'kana' ? 'あ' : '木'}</text>;
      break;
    default:
      artwork = <>
        <text x="34" y="49" textAnchor="middle" fill="#0369A1" fontSize="23" fontWeight="750" fontFamily="var(--font-sans)">{glyph}</text>
        <path d="M25 56h18" stroke="#38BDF8" strokeWidth="2.5" strokeLinecap="round" />
      </>;
  }

  return (
    <svg className={`learning-icon ${className}`} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#38BDF8" /><stop offset="1" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#BAE6FD" /><stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <rect x="22" y="12" width="45" height="55" rx="11" transform="rotate(12 44 39)" fill={`url(#${id}-back)`} stroke="#7DD3FC" />
      <g transform="rotate(-8 34 42)">
        <rect className="learning-icon__front" x="10" y="16" width="48" height="55" rx="11" fill="white" stroke="#BAE6FD" />
        {artwork}
      </g>
      <path d="m12 8 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#38BDF8" />
    </svg>
  );
}
