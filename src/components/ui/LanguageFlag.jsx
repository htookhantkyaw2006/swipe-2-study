const star = '0,-1 0.225,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.225,-0.309';

// Vector flags stay readable on systems without flag-emoji fonts.
export default function LanguageFlag({ id, size = 24 }) {
  return (
    <svg className="language-flag" width={size} height={size * 2 / 3} viewBox="0 0 30 20" aria-hidden="true">
      {id === 'zh' ? <>
        <path fill="#DE2910" d="M0 0h30v20H0z" />
        <polygon points={star} fill="#FFDE00" transform="translate(5 5) scale(3)" />
        {[[10,2],[12,4],[12,7],[10,9]].map(([x,y]) => <polygon key={`${x}-${y}`} points={star} fill="#FFDE00" transform={`translate(${x} ${y}) rotate(${Math.atan2(5-y,5-x)*180/Math.PI+90})`} />)}
      </> : id === 'ja' ? <>
        <path fill="#FFFFFF" d="M0 0h30v20H0z" /><circle cx="15" cy="10" r="6" fill="#BC002D" />
      </> : <>
        <path fill="#012169" d="M0 0h30v20H0z" />
        <path d="M0 0l30 20M30 0L0 20" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M0 0l30 20M30 0L0 20" stroke="#C8102E" strokeWidth="2" />
        <path d="M15 0v20M0 10h30" stroke="#FFFFFF" strokeWidth="7" />
        <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="4" />
      </>}
    </svg>
  );
}
