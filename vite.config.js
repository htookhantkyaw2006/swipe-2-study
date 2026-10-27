import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { assertSafeFrontendEnv, readSupabaseConfig } from './src/lib/supabaseConfig.js'

// https://vite.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env, DEV: command === 'serve' }
  assertSafeFrontendEnv(env)
  const config = readSupabaseConfig(env)
  if (config.status === 'invalid') throw new Error(config.issues.join(' '))
  return { plugins: [react()] }
})
