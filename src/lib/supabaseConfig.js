// Shared by the browser, Vite's build guard and the setup check.
// Validation must never echo a credential into a build log or an error screen.
function readJwtRole(key) {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).role;
  } catch {
    return null;
  }
}

export function readSupabaseConfig(env = {}) {
  const url = String(env.VITE_SUPABASE_URL ?? '').trim();
  const publishableKey = String(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const issues = [];

  if (!url && !publishableKey) {
    return { status: 'unconfigured', url: null, publishableKey: null, issues };
  }

  if (!url) issues.push('Set VITE_SUPABASE_URL for the staging project.');
  if (!publishableKey) issues.push('Set VITE_SUPABASE_PUBLISHABLE_KEY for the same project.');

  if (url) {
    try {
      const parsed = new URL(url);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
      const validProtocol = parsed.protocol === 'https:'
        || (env.DEV === true && loopback && parsed.protocol === 'http:');
      if (!validProtocol || parsed.username || parsed.password || parsed.search || parsed.hash
        || parsed.pathname !== '/') {
        issues.push('Use the project HTTPS origin; local HTTP is allowed only in development.');
      }
    } catch {
      issues.push('VITE_SUPABASE_URL must be a valid project origin.');
    }
  }

  if (publishableKey && !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey)
    && readJwtRole(publishableKey) !== 'anon') {
    issues.push('Use a publishable key or legacy anon key, never a secret or service-role key.');
  }

  return issues.length
    ? { status: 'invalid', url: null, publishableKey: null, issues }
    : { status: 'configured', url: new URL(url).origin, publishableKey, issues };
}

export function assertSafeFrontendEnv(env = {}) {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    const text = String(value).trim();
    if (/SECRET|SERVICE_ROLE|DATABASE_PASSWORD|DATABASE_URL|ACCESS_TOKEN/i.test(name)
      || text.startsWith('sb_secret_') || readJwtRole(text) === 'service_role') {
      throw new Error(`Remove privileged credentials from ${name}; VITE_ values are public.`);
    }
  }
}
