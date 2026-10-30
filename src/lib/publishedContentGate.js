import { readSupabaseConfig } from './supabaseConfig.js';

/**
 * Published HSK1/N5 Content Capability Gate
 *
 * When VITE_PUBLISHED_CONTENT_ENABLED === 'true' and Supabase backend is configured,
 * published course content (zh-hsk1 and ja-n5) is fetched from the database using public read RLS.
 * When disabled (default: false), content loading remains strictly local/demo-based.
 * Completely independent of other feature gates (sync, preferences, account deletion).
 */
export function isPublishedContentEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env || env.VITE_PUBLISHED_CONTENT_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}

