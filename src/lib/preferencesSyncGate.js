import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Account Preferences Sync Capability Gate
 *
 * When VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED === 'true' and Supabase backend is configured,
 * account preferences and active language synchronization is activated for verified accounts.
 * When disabled (default: false), preferences remain strictly local/device-only.
 * Independent of learning sync and account deletion gates.
 */
export function isPreferencesSyncEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env || env.VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}
