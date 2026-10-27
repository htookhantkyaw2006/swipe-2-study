import { useAuth } from './auth.jsx';
import { getSupabaseClient } from './supabase.js';
import { useState, useEffect } from 'react';

/* ---------------------------------------------------------------
   PROFILE HOOK
   ---------------------------------------------------------------
   Fetches the current user's public.profiles row under normal
   learner credentials. Never fabricates a profile when the fetch
   fails — surfaces the error so the UI can show retry.
   --------------------------------------------------------------- */

export function useProfile() {
  const { user, isGuest, captureGeneration, isCurrent } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isGuest || !user) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    const gen = captureGeneration();
    setLoading(true);
    setError(null);

    getSupabaseClient()
      .from('profiles')
      .select('id, display_name, avatar_path, created_at, updated_at')
      .eq('id', user.id)
      .single()
      .then(({ data, error: err }) => {
        if (!isCurrent(gen)) return; // Stale — user switched/logged out.
        if (err) {
          setError(err.message);
          setProfile(null);
        } else {
          setProfile(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent(gen)) return;
        setError(err.message || 'Failed to load profile.');
        setProfile(null);
        setLoading(false);
      });
  }, [user, isGuest, captureGeneration, isCurrent]);

  const retry = () => {
    if (isGuest || !user) return;
    setError(null);
    setLoading(true);

    const gen = captureGeneration();
    getSupabaseClient()
      .from('profiles')
      .select('id, display_name, avatar_path, created_at, updated_at')
      .eq('id', user.id)
      .single()
      .then(({ data, error: err }) => {
        if (!isCurrent(gen)) return;
        if (err) {
          setError(err.message);
          setProfile(null);
        } else {
          setProfile(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isCurrent(gen)) return;
        setError(err.message || 'Failed to load profile.');
        setProfile(null);
        setLoading(false);
      });
  };

  return { profile, loading, error, retry };
}

/**
 * Display name: prefer the profile row, fall back to Auth metadata,
 * then to the email prefix. Never returns an empty string for a
 * logged-in user.
 */
export function displayName(profile, user) {
  if (profile?.display_name) return profile.display_name;
  if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
  if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user?.email) return user.email.split('@')[0];
  return 'Learner';
}

/** Two-letter initials from a display name. */
export function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
