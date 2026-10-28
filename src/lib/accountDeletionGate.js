import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Account Deletion Capability Gate
 *
 * When VITE_ACCOUNT_DELETION_ENABLED === 'true' and Supabase backend is configured,
 * account deletion capability is enabled in the UI.
 * When disabled (default: false), the action remains unavailable.
 * Completely independent of the cloud-import flag.
 */
export function isAccountDeletionEnabled(env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})) {
  if (!env || env.VITE_ACCOUNT_DELETION_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}
