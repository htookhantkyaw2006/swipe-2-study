import { createTtsHttpHandler } from '../../../src/server/ttsProxy.js';

export const VERIFIED_STAGING_ORIGIN = 'https://s2-s-anti-gravity-3739ky7ll-htookhantkyaw2006-9042s-projects.vercel.app';

const getEnv = () => {
  if (typeof Deno !== 'undefined' && Deno?.env?.get) {
    return {
      SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
      ALLOWED_ORIGINS: Deno.env.get('ALLOWED_ORIGINS') || Deno.env.get('ALLOWED_ORIGIN') || VERIFIED_STAGING_ORIGIN,
      TTS_PROVIDER: Deno.env.get('TTS_PROVIDER'),
      TTS_API_KEY: Deno.env.get('TTS_API_KEY'),
    };
  }
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || VERIFIED_STAGING_ORIGIN,
    TTS_PROVIDER: process.env.TTS_PROVIDER,
    TTS_API_KEY: process.env.TTS_API_KEY,
  };
};

/**
 * Server-side TTS Edge Function handler.
 *
 * Current Status: Scaffolding and secure proxy contract in place.
 * Pending Operator Decision: Selection of provider (Google Cloud TTS / OpenAI TTS / Azure Speech)
 * and server-side secret configuration (TTS_API_KEY / GCP Service Account).
 * Unconfigured requests return 503 TTS_SERVICE_UNCONFIGURED.
 */
export const handler = createTtsHttpHandler({
  getEnv,
  ttsAdapter: null,
});

export default handler;

if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function' && import.meta?.main) {
  Deno.serve(handler);
}

