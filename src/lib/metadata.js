import { useEffect } from 'react';

/**
 * Checks whether a hostname corresponds to a local or development environment.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
function isLocalOrDevHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const h = hostname.toLowerCase().trim();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '127.0.0.1' || h.startsWith('127.')) return true;
  if (h === '0.0.0.0' || h === '[::1]' || h === '::1' || h === '::') return true;
  if (h.endsWith('.local') || h.endsWith('.test') || h.endsWith('.example') || h.endsWith('.invalid')) return true;
  return false;
}

/**
 * Parses and returns a clean origin from a candidate URL string.
 * Strictly rejects invalid schemes, embedded credentials, and local/development origins.
 * Drops any pathname, search query, or hash.
 *
 * @param {string} candidate
 * @returns {string|null}
 */
export function parseCleanOrigin(candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    // Web schemes only
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    // Reject embedded credentials
    if (url.username || url.password) {
      return null;
    }
    // Reject empty/null origins
    if (!url.origin || url.origin === 'null') {
      return null;
    }
    // Reject local/development hosts
    if (isLocalOrDevHostname(url.hostname)) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Resolves the trusted deployment origin if known.
 * Never hard-codes a guessed domain or accepts localhost as canonical production metadata.
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
    return parseCleanOrigin(env.VITE_PUBLIC_URL);
  }

  if (location) {
    const candidate = location.origin && location.origin !== 'null' ? location.origin : location.href;
    return parseCleanOrigin(candidate);
  }

  return null;
}

/**
 * Manages dynamic document title, description, OpenGraph, and canonical link elements.
 * Accurately restores pre-existing values on cleanup and removes only elements
 * introduced by the page.
 */
export function setPageMetadata({
  title,
  description,
  canonicalPath,
  env,
} = {}) {
  if (typeof document === 'undefined') return () => {};

  // 1. Document Title
  const previousTitle = document.title;
  const newTitle = title ? `${title} · Swipe 2 Study` : 'Swipe 2 Study';
  document.title = newTitle;

  // 2. Meta Description
  const existingDescMeta = document.querySelector('meta[name="description"]');
  let createdDescMeta = null;
  const previousDescContent = existingDescMeta ? existingDescMeta.getAttribute('content') : null;

  if (description) {
    if (existingDescMeta) {
      existingDescMeta.setAttribute('content', description);
    } else {
      createdDescMeta = document.createElement('meta');
      createdDescMeta.setAttribute('name', 'description');
      createdDescMeta.setAttribute('content', description);
      document.head.appendChild(createdDescMeta);
    }
  }

  // 3. OpenGraph Title
  const existingOgTitle = document.querySelector('meta[property="og:title"]');
  let createdOgTitle = null;
  const previousOgTitleContent = existingOgTitle ? existingOgTitle.getAttribute('content') : null;

  if (existingOgTitle) {
    existingOgTitle.setAttribute('content', newTitle);
  } else {
    createdOgTitle = document.createElement('meta');
    createdOgTitle.setAttribute('property', 'og:title');
    createdOgTitle.setAttribute('content', newTitle);
    document.head.appendChild(createdOgTitle);
  }

  // 4. OpenGraph Description
  const existingOgDesc = document.querySelector('meta[property="og:description"]');
  let createdOgDesc = null;
  const previousOgDescContent = existingOgDesc ? existingOgDesc.getAttribute('content') : null;

  if (description) {
    if (existingOgDesc) {
      existingOgDesc.setAttribute('content', description);
    } else {
      createdOgDesc = document.createElement('meta');
      createdOgDesc.setAttribute('property', 'og:description');
      createdOgDesc.setAttribute('content', description);
      document.head.appendChild(createdOgDesc);
    }
  }

  // 5. Canonical Link & OpenGraph URL (only when deployment origin is verified)
  const origin = getDeploymentOrigin(env);
  const existingCanonical = document.querySelector('link[rel="canonical"]');
  let createdCanonical = null;
  const previousCanonicalHref = existingCanonical ? existingCanonical.getAttribute('href') : null;

  const existingOgUrl = document.querySelector('meta[property="og:url"]');
  let createdOgUrl = null;
  const previousOgUrlContent = existingOgUrl ? existingOgUrl.getAttribute('content') : null;

  if (origin && canonicalPath) {
    const cleanPath = canonicalPath.startsWith('/') ? canonicalPath : '/' + canonicalPath;
    const fullUrl = `${origin}${cleanPath}`;

    if (existingCanonical) {
      existingCanonical.setAttribute('href', fullUrl);
    } else {
      createdCanonical = document.createElement('link');
      createdCanonical.setAttribute('rel', 'canonical');
      createdCanonical.setAttribute('href', fullUrl);
      document.head.appendChild(createdCanonical);
    }

    if (existingOgUrl) {
      existingOgUrl.setAttribute('content', fullUrl);
    } else {
      createdOgUrl = document.createElement('meta');
      createdOgUrl.setAttribute('property', 'og:url');
      createdOgUrl.setAttribute('content', fullUrl);
      document.head.appendChild(createdOgUrl);
    }
  }

  // Cleanup handler: restore previous values accurately and remove only introduced elements
  return () => {
    // Title restoration
    document.title = previousTitle;

    // Description restoration
    if (createdDescMeta) {
      createdDescMeta.remove();
    } else if (existingDescMeta) {
      if (previousDescContent !== null) {
        existingDescMeta.setAttribute('content', previousDescContent);
      } else {
        existingDescMeta.removeAttribute('content');
      }
    }

    // OpenGraph Title restoration
    if (createdOgTitle) {
      createdOgTitle.remove();
    } else if (existingOgTitle) {
      if (previousOgTitleContent !== null) {
        existingOgTitle.setAttribute('content', previousOgTitleContent);
      } else {
        existingOgTitle.removeAttribute('content');
      }
    }

    // OpenGraph Description restoration
    if (createdOgDesc) {
      createdOgDesc.remove();
    } else if (existingOgDesc) {
      if (previousOgDescContent !== null) {
        existingOgDesc.setAttribute('content', previousOgDescContent);
      } else {
        existingOgDesc.removeAttribute('content');
      }
    }

    // Canonical Link restoration
    if (createdCanonical) {
      createdCanonical.remove();
    } else if (existingCanonical) {
      if (previousCanonicalHref !== null) {
        existingCanonical.setAttribute('href', previousCanonicalHref);
      } else {
        existingCanonical.removeAttribute('href');
      }
    }

    // OpenGraph URL restoration
    if (createdOgUrl) {
      createdOgUrl.remove();
    } else if (existingOgUrl) {
      if (previousOgUrlContent !== null) {
        existingOgUrl.setAttribute('content', previousOgUrlContent);
      } else {
        existingOgUrl.removeAttribute('content');
      }
    }
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
