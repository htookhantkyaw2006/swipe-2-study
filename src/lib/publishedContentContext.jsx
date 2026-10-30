import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { isPublishedContentEnabled } from './publishedContentGate.js';
import {
  fetchPublishedCourseContent,
  resolvePublishedCourseId,
  SUPPORTED_PUBLISHED_COURSES,
} from './publishedContentService.js';
import { useLanguage } from './language.jsx';

const PublishedContentContext = createContext(null);

const DEFAULT_STATE = Object.freeze({
  status: 'idle', // 'idle' | 'loading' | 'loaded' | 'unpublished' | 'error'
  items: [],
  version: null,
  error: null,
  isPublished: false,
});

export function PublishedContentProvider({ children, client = null, enabledOverride = null }) {
  const { languageId } = useLanguage();
  const enabled = enabledOverride !== null ? enabledOverride : isPublishedContentEnabled();

  // In-memory cache of published courses: { [courseId]: { status, items, version, error, isPublished } }
  const [cache, setCache] = useState({});
  const cacheRef = useRef({});
  const inFlightRef = useRef(new Map());
  const requestTokensRef = useRef(new Map());

  const getCourseState = useCallback((courseId) => {
    return cacheRef.current[courseId] || cache[courseId] || DEFAULT_STATE;
  }, [cache]);

  const updateCourseState = useCallback((courseId, statePatch) => {
    setCache((prev) => {
      const current = prev[courseId] || DEFAULT_STATE;
      const next = typeof statePatch === 'function' ? statePatch(current) : { ...current, ...statePatch };
      const nextCache = { ...prev, [courseId]: next };
      cacheRef.current = nextCache;
      return nextCache;
    });
  }, []);

  const loadCourse = useCallback(async (courseId, { force = false } = {}) => {
    if (!enabled) {
      return { ...DEFAULT_STATE, status: 'disabled' };
    }

    if (!SUPPORTED_PUBLISHED_COURSES[courseId]) {
      return { ...DEFAULT_STATE, status: 'unpublished' };
    }

    const current = cacheRef.current[courseId];
    if (!force && current && (current.status === 'loaded' || current.status === 'unpublished' || current.status === 'error')) {
      return current;
    }

    // Deduplicate concurrent in-flight requests for same courseId
    if (!force && inFlightRef.current.has(courseId)) {
      return inFlightRef.current.get(courseId);
    }

    // Update token to guard against stale responses on course switches
    const nextToken = (requestTokensRef.current.get(courseId) || 0) + 1;
    requestTokensRef.current.set(courseId, nextToken);

    updateCourseState(courseId, {
      status: 'loading',
      error: null,
    });

    let fetchPromise;
    fetchPromise = (async () => {
      try {
        const result = await fetchPublishedCourseContent(courseId, { client });

        // Guard against stale response
        if (requestTokensRef.current.get(courseId) !== nextToken) {
          return cacheRef.current[courseId] || DEFAULT_STATE;
        }

        const nextState = {
          status: result.isPublished ? 'loaded' : 'unpublished',
          items: result.items,
          version: result.version,
          error: null,
          isPublished: result.isPublished,
        };

        updateCourseState(courseId, nextState);
        return nextState;
      } catch (err) {
        // Guard against stale error
        if (requestTokensRef.current.get(courseId) !== nextToken) {
          return cacheRef.current[courseId] || DEFAULT_STATE;
        }

        const errorState = {
          status: 'error',
          items: [],
          version: null,
          error: err,
          isPublished: false,
        };

        updateCourseState(courseId, errorState);
        return errorState;
      } finally {
        if (inFlightRef.current.get(courseId) === fetchPromise) {
          inFlightRef.current.delete(courseId);
        }
      }
    })();

    inFlightRef.current.set(courseId, fetchPromise);
    return fetchPromise;
  }, [enabled, client, updateCourseState]);

  const retry = useCallback((courseId) => {
    return loadCourse(courseId, { force: true });
  }, [loadCourse]);

  // When active language switches and gate is on, proactively load that language's in-scope course
  useEffect(() => {
    if (!enabled) return;
    const activeCourseId = languageId === 'zh' ? 'zh-hsk1' : languageId === 'ja' ? 'ja-n5' : null;
    if (activeCourseId) {
      loadCourse(activeCourseId).catch(() => {});
    }
  }, [enabled, languageId, loadCourse]);

  const contextValue = useMemo(() => ({
    enabled,
    getCourseState,
    loadCourse,
    retry,
  }), [enabled, getCourseState, loadCourse, retry]);

  return (
    <PublishedContentContext.Provider value={contextValue}>
      {children}
    </PublishedContentContext.Provider>
  );
}

/**
 * Main hook to access published content service and state.
 */
export function usePublishedContent() {
  const ctx = useContext(PublishedContentContext);
  if (!ctx) {
    // Return graceful disabled fallback if used outside provider
    return {
      enabled: false,
      getCourseState: () => DEFAULT_STATE,
      loadCourse: async () => DEFAULT_STATE,
      retry: async () => DEFAULT_STATE,
    };
  }
  return ctx;
}

/**
 * Convenient hook to consume a specific level's published content.
 * Accepts courseId ('zh-hsk1', 'ja-n5') or levelId ('HSK1', 'N5') with current language.
 */
export function usePublishedCourse(courseIdOrLevelId) {
  const { languageId } = useLanguage();
  const { enabled, getCourseState, loadCourse, retry } = usePublishedContent();

  const courseId = SUPPORTED_PUBLISHED_COURSES[courseIdOrLevelId]
    ? courseIdOrLevelId
    : resolvePublishedCourseId(languageId, courseIdOrLevelId);

  const isInScope = Boolean(courseId);
  const state = courseId ? getCourseState(courseId) : DEFAULT_STATE;

  useEffect(() => {
    if (enabled && courseId && state.status === 'idle') {
      loadCourse(courseId).catch(() => {});
    }
  }, [enabled, courseId, state.status, loadCourse]);

  const handleRetry = useCallback(() => {
    if (courseId) {
      return retry(courseId);
    }
    return Promise.resolve();
  }, [courseId, retry]);

  return {
    enabled,
    isInScope,
    courseId,
    status: enabled ? state.status : 'disabled',
    items: state.items,
    version: state.version,
    error: state.error,
    isPublished: state.isPublished,
    isLoading: enabled && state.status === 'loading',
    isLoaded: enabled && state.status === 'loaded',
    isUnpublished: enabled && state.status === 'unpublished',
    isError: enabled && state.status === 'error',
    retry: handleRetry,
  };
}
