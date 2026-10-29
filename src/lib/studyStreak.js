import { useState, useEffect, useCallback } from 'react';
import { storageOwner } from './storageOwner.js';
import { getSupabaseClient } from './supabase.js';
import { onlineSyncService } from './onlineSyncService.js';

export function getStreakKey(ownerId) {
  if (!ownerId) return null;
  return `s2s_user_${ownerId.toLowerCase()}_study_streak_v1`;
}

export function readStreakState(storage, ownerId) {
  if (!ownerId) return null;
  const key = getStreakKey(ownerId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeStreakState(storage, ownerId, streak) {
  if (!ownerId || !streak) return;
  const key = getStreakKey(ownerId);
  try {
    storage.setItem(key, JSON.stringify(streak));
  } catch {
    // Non-fatal cache write
  }
}

export async function fetchConfirmedStreak({
  client = null,
  ownerId,
  storage = globalThis.localStorage,
  now = () => new Date().toISOString(),
} = {}) {
  if (!ownerId) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      todayStudied: false,
      timezone: 'Asia/Yangon',
      isGuest: true,
      hasPendingSync: false,
    };
  }

  try {
    const supabase = client || getSupabaseClient();
    const { data, error } = await supabase.rpc('s2s_get_study_streak', {
      p_expected_user_id: ownerId,
    });

    if (error || !data) {
      // Fallback to cached state if available
      const cached = readStreakState(storage, ownerId);
      return cached || {
        currentStreak: 0,
        longestStreak: 0,
        todayStudied: false,
        timezone: 'Asia/Yangon',
        isGuest: false,
        hasPendingSync: onlineSyncService.countPending(ownerId) > 0,
      };
    }

    const streak = {
      currentStreak: data.current_streak ?? 0,
      longestStreak: data.longest_streak ?? 0,
      todayStudied: Boolean(data.today_studied),
      lastStudyDate: data.last_study_date ?? null,
      timezone: data.timezone || 'Asia/Yangon',
      isGuest: false,
      updatedAt: now(),
    };

    writeStreakState(storage, ownerId, streak);
    return streak;
  } catch {
    const cached = readStreakState(storage, ownerId);
    return cached || {
      currentStreak: 0,
      longestStreak: 0,
      todayStudied: false,
      timezone: 'Asia/Yangon',
      isGuest: false,
      hasPendingSync: onlineSyncService.countPending(ownerId) > 0,
    };
  }
}

export function useStudyStreak() {
  const activeOwner = storageOwner.getOwner();
  const storage = storageOwner.getStorage?.() || globalThis.localStorage;

  const getInitial = () => {
    if (!activeOwner) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        todayStudied: false,
        timezone: 'Asia/Yangon',
        isGuest: true,
        hasPendingSync: false,
        loading: false,
      };
    }
    const cached = readStreakState(storage, activeOwner);
    const pending = onlineSyncService.countPending(activeOwner) > 0;
    return {
      currentStreak: cached?.currentStreak ?? 0,
      longestStreak: cached?.longestStreak ?? 0,
      todayStudied: cached?.todayStudied ?? false,
      timezone: cached?.timezone || 'Asia/Yangon',
      isGuest: false,
      hasPendingSync: pending,
      loading: false,
    };
  };

  const [streakState, setStreakState] = useState(getInitial);

  const refresh = useCallback(() => {
    const owner = storageOwner.getOwner();
    if (!owner) {
      setStreakState({
        currentStreak: 0,
        longestStreak: 0,
        todayStudied: false,
        timezone: 'Asia/Yangon',
        isGuest: true,
        hasPendingSync: false,
        loading: false,
      });
      return;
    }

    const cached = readStreakState(storage, owner);
    const pending = onlineSyncService.countPending(owner) > 0;
    setStreakState({
      currentStreak: cached?.currentStreak ?? 0,
      longestStreak: cached?.longestStreak ?? 0,
      todayStudied: cached?.todayStudied ?? false,
      timezone: cached?.timezone || 'Asia/Yangon',
      isGuest: false,
      hasPendingSync: pending,
      loading: false,
    });

    fetchConfirmedStreak({ ownerId: owner, storage })
      .then((fresh) => {
        if (storageOwner.getOwner() === owner) {
          setStreakState({
            currentStreak: fresh.currentStreak ?? 0,
            longestStreak: fresh.longestStreak ?? 0,
            todayStudied: fresh.todayStudied ?? false,
            timezone: fresh.timezone || 'Asia/Yangon',
            isGuest: false,
            hasPendingSync: onlineSyncService.countPending(owner) > 0,
            loading: false,
          });
        }
      })
      .catch(() => {});
  }, [storage]);

  useEffect(() => {
    refresh();

    const unsubOwner = storageOwner.subscribe(refresh);
    const unsubChange = storageOwner.subscribeChange(refresh);

    return () => {
      unsubOwner?.();
      unsubChange?.();
    };
  }, [refresh]);

  return {
    ...streakState,
    refresh,
  };
}
