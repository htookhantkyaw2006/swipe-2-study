import { useEffect } from 'react';

/**
 * Resolves the trusted deployment origin if known.
 * Never hard-codes a guessed domain or localhost as canonical production metadata.
 *
 * @param {object} env
 * @param {Location} [location]
 * @returns {string|null}
 */
export function getDeploymentOrigin(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {}),
  location = typeof window !== 'undefined' ? window.location : null
) {
  if (env?.VITE_PUBLIC_URL && typeof env.VITE_PUBLIC_URL === 'string') {
    const trimmed = env.VITE_PUBLIC_URL.trim().replace(/\/+$/, '');
    if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
      return trimmed;
    }
  }

  if (location?.origin) {
    const origin = location.origin.trim().replace(/\/+$/, '');
    // Ignore local development hosts
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1') && origin !== 'null') {
      return origin;
    }
  }

  return null;
}

/**
 * Manages dynamic document title, description, and canonical link elements.
 * Safely cleans up on navigation.
 */
export function setPageMetadata({
  title,
  description,
  canonicalPath,
  env,
} = {}) {
  if (typeof document === 'undefined') return () => {};

  const previousTitle = document.title;
  const newTitle = title ? `${title} · Swipe 2 Study` : 'Swipe 2 Study';
  document.title = newTitle;

  // Manage meta description
  let descMeta = document.querySelector('meta[name="description"]');
  const previousDesc = descMeta ? descMeta.getAttribute('content') : null;
  if (description) {
    if (!descMeta) {
      descMeta = document.createElement('meta');
      descMeta.setAttribute('name', 'description');
      document.head.appendChild(descMeta);
    }
    descMeta.setAttribute('content', description);
  }

  // Manage OpenGraph title and description
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.setAttribute('content', newTitle);

  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (description) {
    if (!ogDesc) {
      ogDesc = document.createElement('meta');
      ogDesc.setAttribute('property', 'og:description');
      document.head.appendChild(ogDesc);
    }
    ogDesc.setAttribute('content', description);
  }

  // Canonical and og:url (only when deployment origin is verified)
  const origin = getDeploymentOrigin(env);
  let canonicalLink = document.querySelector('link[rel="canonical"]');
  let ogUrl = document.querySelector('meta[property="og:url"]');

  if (origin && canonicalPath) {
    const fullUrl = `${origin}${canonicalPath.startsWith('/') ? canonicalPath : '/' + canonicalPath}`;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', fullUrl);

    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', fullUrl);
  } else {
    // If origin is unknown or localhost, remove any existing canonical tag to prevent wrong metadata
    if (canonicalLink) {
      canonicalLink.remove();
    }
    if (ogUrl) {
      ogUrl.remove();
    }
  }

  // Cleanup handler on navigation
  return () => {
    document.title = previousTitle;
    if (previousDesc !== null && descMeta) {
      descMeta.setAttribute('content', previousDesc);
    } else if (descMeta && !previousDesc) {
      descMeta.remove();
    }
    if (ogTitle) ogTitle.setAttribute('content', previousTitle);
    if (ogDesc && previousDesc !== null) ogDesc.setAttribute('content', previousDesc);
    else if (ogDesc) ogDesc.remove();

    const currentCanonical = document.querySelector('link[rel="canonical"]');
    if (currentCanonical) currentCanonical.remove();
    const currentOgUrl = document.querySelector('meta[property="og:url"]');
    if (currentOgUrl) currentOgUrl.remove();
  };
}

/**
 * React hook to synchronize page metadata.
 */
export function usePageMetadata({ title, description, canonicalPath, env } = {}) {
  useEffect(() => {
    const cleanup = setPageMetadata({ title, description, canonicalPath, env });
    return cleanup;
  }, [title, description, canonicalPath, env]);
}
