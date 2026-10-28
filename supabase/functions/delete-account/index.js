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

const env = getEnv();

// Administrative client for privileged Storage cleanup, durable throttling, and Auth user deletion
const adminClient = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

export const handler = createDeletionHttpHandler({
  adminClient,
  env,
});

// Default export / serve entry point for Deno / Supabase Edge Runtime
export default handler;
