import React from 'react';

/* ---------------------------------------------------------------
   AVATAR — anonymous placeholder profile picture.
   ---------------------------------------------------------------
   Drawn inline as SVG rather than loaded from /public, so it cannot
   404, needs no network, and stays crisp at any size.

   Swap for a real photo later by passing `src`; the silhouette is
   used whenever there is no src, or when that image fails to load.
   --------------------------------------------------------------- */
export default function Avatar({ src, alt = 'Profile', size = 48, style = {} }) {
  const [failed, setFailed] = React.useState(false);
  // Unique gradient id so multiple avatars on a page never collide.
  // Both hooks must run before any early return, or hook order changes
  // when a photo fails and this falls back to the silhouette.
  const uid = React.useId();
  const showPhoto = src && !failed;

  const frame = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    objectFit: 'cover',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    ...style
  };

  if (showPhoto) {
    return <img src={src} alt={alt} style={frame} onError={() => setFailed(true)} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={alt}
      style={frame}
    >
      <defs>
        <linearGradient id={`av-bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#BAE6FD" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>

      <circle cx="24" cy="24" r="24" fill={`url(#av-bg-${uid})`} />

      {/* Head */}
      <circle cx="24" cy="19" r="7.5" fill="#FFFFFF" fillOpacity="0.95" />

      {/* Shoulders — clipped by the circle for a clean bust silhouette */}
      <path
        d="M24 29c-7.2 0-13 4.6-13 10.3V48h26v-8.7C37 33.6 31.2 29 24 29z"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />
    </svg>
  );
}
