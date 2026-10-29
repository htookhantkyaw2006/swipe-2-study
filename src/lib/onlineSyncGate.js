import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Online Sync Capability Gate
 *
 * When VITE_ONLINE_SYNC_ENABLED === 'true' and Supabase backend is configured,
 * online synchronization is activated.
 * When disabled (default: false), all local learning remains strictly local/device-only.
 * Completely independent of other feature flags.
 */
export function isOnlineSyncEnabled(env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})) {
  if (!env || env.VITE_ONLINE_SYNC_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}

