import { readSupabaseConfig } from './supabaseConfig.js';
import { safeReturnPath } from './safeReturnPath.js';

/**
 * Google Auth Gate
 *
 * Explicit VITE_GOOGLE_AUTH_ENABLED flag, disabled by default.
 * Requires both VITE_GOOGLE_AUTH_ENABLED === 'true' AND Supabase backend configuration to be valid.
 * If absent, false, or if Supabase is unconfigured, Google authentication is not exposed.
 */
export function isGoogleAuthEnabled(
  env = typeof import.meta !== 'undefined' ? import.meta.env : (typeof process !== 'undefined' ? process.env : {})
) {
  if (!env || env.VITE_GOOGLE_AUTH_ENABLED !== 'true') {
    return false;
  }
  const config = readSupabaseConfig(env);
  return config.status === 'configured';
}

/**
 * Constructs the trusted application callback URL for Google OAuth redirects.
 *
 * Requirements:
 * - Uses the established trusted origin (window.location.origin in browsers or explicit origin).
 * - Never accepts an arbitrary callback origin from URL parameters.
 * - Sanitizes returnTo to guarantee internal navigation and prevent redirect loops.
 */
export function getTrustedCallbackUrl(
  returnTo = '/',
  origin = typeof window !== 'undefined' ? window.location?.origin : ''
) {
  const safePath = safeReturnPath(returnTo);
  const base = origin || (typeof window !== 'undefined' ? window.location?.origin : 'http://localhost');
  const url = new URL('/auth/callback', base);
  if (safePath && safePath !== '/') {
    url.searchParams.set('returnTo', safePath);
  }
  return url.toString();
}

/**
 * Initiates Google OAuth sign-in using the shared Supabase client.
 *
 * Requirements:
 * - Requests NO additional Google permissions beyond basic sign-in (no custom scopes).
 * - Directs callback strictly to the trusted app-origin /auth/callback with sanitized returnTo.
 * - Handles both returned SDK error objects and thrown exceptions.
 */
export async function initiateGoogleSignIn(
  client,
  {
    returnTo = '/',
    origin = typeof window !== 'undefined' ? window.location?.origin : '',
    skipBrowserRedirect = false,
  } = {}
) {
  if (!client || !client.auth) {
    return { data: null, error: new Error('Authentication client is unavailable.') };
  }

  const redirectTo = getTrustedCallbackUrl(returnTo, origin);

  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect,
      },
    });

    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err) || 'Google sign-in initiation failed.'),
    };
  }
}

