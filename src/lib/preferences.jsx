import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { storageOwner } from './storageOwner.js';
import { AuthContext } from './authContext.js';
import { getActiveLanguageId, setActiveLanguageId, subscribeActiveLanguage } from './activeLanguage.js';
import { preferencesSyncService } from './preferencesSyncService.js';
import { createPreferencesSyncController } from './preferencesSyncController.js';
import { isPreferencesSyncEnabled } from './preferencesSyncGate.js';
import { DEFAULTS, OPTIONS, SPEECH_RATES, readPreferences } from './preferencesDefaults.js';

/* ---------------------------------------------------------------
   PREFERENCES
   ---------------------------------------------------------------
   One persisted store behind both the Profile quick rows and the
   full Settings page, so the two can never disagree.

   Stored as a single JSON blob so adding a key needs no migration —
   unknown keys fall back to DEFAULTS on read.
   --------------------------------------------------------------- */

export { DEFAULTS, OPTIONS, SPEECH_RATES, readPreferences };

// Same reasoning as LanguageContext in language.jsx: keep one context
// object across development hot swaps.
const PreferencesContext = import.meta.hot?.data.PreferencesContext ?? createContext(null);
if (import.meta.hot) import.meta.hot.data.PreferencesContext = PreferencesContext;

export function PreferencesProvider({
  children,
  syncService = preferencesSyncService,
  allowOnline = isPreferencesSyncEnabled(),
  controller: injectedController = null,
}) {
  const [prefs, setPrefs] = useState(readPreferences);
  // Pin delayed callbacks to the owner whose provider created them.
  const [scope] = useState(() => storageOwner.scope());

  // Read optional auth context safely without throwing if unprovided
  const auth = useContext(AuthContext);

  const ready = Boolean(
    auth?.user?.id && !auth?.loading && !auth?.isTransitioning && !auth?.error
    && !auth?.passwordRecoveryUserId && Number.isSafeInteger(auth?.generation)
  );
  const ownerId = ready ? auth.user.id : null;
  const generation = ready ? auth.generation : null;

  const [controller] = useState(() => {
    if (injectedController) return injectedController;
    return createPreferencesSyncController({
      service: syncService,
      allowOnline,
      onRestoreApplied: ({ settings, activeLanguage }) => {
        if (settings) {
          setPrefs({ ...DEFAULTS, ...settings });
        }
        if (activeLanguage) {
          setActiveLanguageId(activeLanguage);
        }
      },
    });
  });

  const syncState = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => () => controller.cancel(), [controller]);

  // Connect active account to controller
  useEffect(() => {
    controller.setAccount(ownerId ? { id: ownerId, generation } : null);
  }, [controller, ownerId, generation]);

  // Subscribe to external language switcher updates to sync activeLanguage change
  useEffect(() => {
    return subscribeActiveLanguage((langId) => {
      if (ownerId && allowOnline) {
        controller.onLocalChange({
          settings: prefs,
          activeLanguage: langId,
          changedKey: 'activeLanguage',
        });
      }
    });
  }, [controller, ownerId, allowOnline, prefs]);

  const persist = useCallback((next) => {
    try {
      scope.setItem('preferences', JSON.stringify(next));
    } catch {
      // Persisting is best-effort; the in-memory value still applies.
    }
  }, [scope]);

  const setPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      if (ownerId && allowOnline) {
        controller.onLocalChange({
          settings: next,
          activeLanguage: getActiveLanguageId(),
          changedKey: key,
        });
      }
      return next;
    });
  }, [persist, controller, ownerId, allowOnline]);

  const resetPrefs = useCallback(() => {
    const next = { ...DEFAULTS };
    setPrefs(next);
    persist(next);
    if (ownerId && allowOnline) {
      controller.onLocalChange({
        settings: next,
        activeLanguage: getActiveLanguageId(),
        changedKey: 'reset',
      });
    }
  }, [persist, controller, ownerId, allowOnline]);

  const retrySync = useCallback(() => {
    return controller.retry();
  }, [controller]);

  const value = {
    prefs,
    setPref,
    resetPrefs,
    syncStatus: syncState.status,
    syncError: syncState.error,
    lastSyncedAt: syncState.lastSyncedAt,
    retrySync,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
