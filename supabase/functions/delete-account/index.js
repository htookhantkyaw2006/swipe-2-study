import { createClient } from '@supabase/supabase-js';
import { createDeletionHttpHandler } from '../../../src/server/accountDeletion.js';

const getEnv = () => {
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    return {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    };
  }
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
};

let cachedAdminClient = null;
let cachedKey = null;

const getAdminClient = () => {
  const currentEnv = getEnv();
  const url = currentEnv.SUPABASE_URL;
  const key = currentEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  if (!cachedAdminClient || cachedKey !== key) {
    cachedAdminClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedKey = key;
  }
  return cachedAdminClient;
};

export const handler = createDeletionHttpHandler({
  getAdminClient,
  getEnv,
});

// Default export / serve entry point for Deno / Supabase Edge Runtime
export default handler;

// If executed directly in standalone Deno CLI
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function' && import.meta?.main) {
  Deno.serve(handler);
}
