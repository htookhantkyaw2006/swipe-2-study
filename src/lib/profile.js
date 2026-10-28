import { useAuth } from './useAuth.js';
import { getSupabaseClient } from './supabase.js';
import { useState, useEffect, useCallback } from 'react';
import { readProfile } from './profileService.js';
import { subscribeProfileChanges } from './profileEvents.js';

export function useProfile({ listen = true } = {}) {
  const { user, isGuest, isTransitioning, captureGeneration, isCurrent } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState({ owner: null, profile: null, loading: false, error: null });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    if (isGuest || !userId || isTransitioning) {
      setState({ owner: null, profile: null, loading: false, error: null });
      return () => { active = false; };
    }
    const generation = captureGeneration();
    const allowed = () => active && isCurrent(generation);
    setState({ owner: userId, profile: null, loading: true, error: null });
    (async () => {
      try {
        const result = await readProfile(getSupabaseClient(), { userId, isCurrent: allowed });
        if (allowed()) setState({ owner: userId, profile: result.profile, loading: false, error: result.error });
      } catch {
        if (allowed()) setState({ owner: userId, profile: null, loading: false, error: 'Could not load your profile. Please retry.' });
      }
    })();
    const unsubscribe = listen ? subscribeProfileChanges(owner => { if (owner === userId && allowed()) retry(); }) : () => {};
    return () => { active = false; unsubscribe(); };
  }, [userId, isGuest, isTransitioning, captureGeneration, isCurrent, attempt, listen, retry]);
  if (!userId || isGuest || isTransitioning) return { profile: null, loading: false, error: null, retry };
  if (state.owner !== userId) return { profile: null, loading: true, error: null, retry };
  return { profile: state.profile, loading: state.loading, error: state.error, retry };
}

/** A profile row is authoritative; Auth metadata is a fallback for older accounts. */
export function displayName(profile, user) {
  if (profile?.display_name) return profile.display_name;
  if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
  if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user?.email) return user.email.split('@')[0];
  return 'Learner';
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return [...parts[0]].slice(0, 2).join('').toUpperCase();
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}
