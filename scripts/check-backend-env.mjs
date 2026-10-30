import { loadEnv } from 'vite';
import { evaluateDeploymentConfig, formatDeploymentReport } from '../src/lib/deploymentConfig.js';

const mode = process.argv[2] || 'development';
const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env, DEV: mode === 'development' };

try {
  const report = evaluateDeploymentConfig(env);
  console.log(formatDeploymentReport(report));

  if (!report.isOverallValid) {
    if (report.supabaseStatus !== 'configured') {
      const issuesText = report.capabilities.supabase.issues?.join('\n');
      console.error(issuesText || 'Backend not configured: copy .env.example to .env.local and fill the staging values.');
    }
    if (report.issues.length > 0) {
      console.error('\nActionable configuration issues:');
      for (const issue of report.issues) {
        console.error(`- ${issue}`);
      }
    }
    process.exitCode = 1;
  } else {
    console.log('\nBackend configuration is valid. Credentials were not printed.');
    console.log('This checks configuration only, not connectivity or deployed policies.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
