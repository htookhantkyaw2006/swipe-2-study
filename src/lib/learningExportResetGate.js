import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Account Learning Data Export & Reset Capability Gate
 *
 * When VITE_ACCOUNT_EXPORT_RESET_ENABLED === 'true' and Supabase backend is configured,
 * account-level cloud export and atomic server learning reset are enabled.
 * When disabled (default: false), account cloud export/reset remains unavailable,
 * while guest operations remain strictly local/device-only.
 * Completely independent of other feature gates.
 */
export function isLearningExportResetEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env || env.VITE_ACCOUNT_EXPORT_RESET_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}

