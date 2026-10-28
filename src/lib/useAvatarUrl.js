import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './useAuth.js';
import { getSupabaseClient } from './supabase.js';
import { readAvatarUrl } from './profileService.js';

// Signed URLs live only in component memory and refresh before their 5-minute expiry.
export function useAvatarUrl(path) {
  const { user, isTransitioning, captureGeneration, isCurrent } = useAuth();
  const userId = user?.id;
  const key = userId && path ? `${userId}:${path}` : null;
  const [state, setState] = useState({ key: null, url: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    if (!key || isTransitioning) return;
    let active = true, request = 0;
    const gen = captureGeneration();
    const allowed = () => active && isCurrent(gen);
    const refresh = async () => {
      const sequence = ++request;
      try {
        const result = await readAvatarUrl(getSupabaseClient(), { userId, path, isCurrent: allowed });
        if (allowed() && sequence === request) setState({ key, ...result });
      } catch {
        if (allowed() && sequence === request) setState({ key, url: null, error: 'Could not load your photo. Please retry.' });
      }
    };
    refresh();
    const timer = setInterval(refresh, 240000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [key, userId, path, isTransitioning, captureGeneration, isCurrent, attempt]);
  return key && !isTransitioning && state.key === key ? { url: state.url, error: state.error, retry } : { url: null, error: null, retry };
}
