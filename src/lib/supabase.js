import { createClient } from '@supabase/supabase-js';
import { assertSafeFrontendEnv, readSupabaseConfig } from './supabaseConfig.js';

let client;

// Lazy until the account flows are wired. The existing guest app can still run
// without a configured backend; it must never claim its local data is synced.
export function getSupabaseClient() {
  if (client) return client;
  const env = import.meta.env ?? {};
  assertSafeFrontendEnv(env);
  const config = readSupabaseConfig(env);
  if (config.status !== 'configured') {
    throw new Error(config.issues.join(' ') || 'Supabase is not configured for this environment.');
  }

  client = createClient(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 's2s_auth_session',
    },
  });
  return client;
}
