import { loadEnv } from 'vite';
import { assertSafeFrontendEnv, readSupabaseConfig } from '../src/lib/supabaseConfig.js';

const mode = process.argv[2] || 'development';
const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env, DEV: mode === 'development' };
try {
  assertSafeFrontendEnv(env);
  const config = readSupabaseConfig(env);
  if (config.status !== 'configured') {
    console.error(config.issues.join('\n')
      || 'Backend not configured: copy .env.example to .env.local and fill the staging values.');
    process.exitCode = 1;
  } else {
    console.log('Backend configuration is valid. Credentials were not printed.');
    console.log('This checks configuration only, not connectivity or deployed policies.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
