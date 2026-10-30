/**
 * Deployment Configuration & Preflight Evaluator
 *
 * Inspects all frontend environment variables, capability gates, public URL metadata,
 * and observability endpoints. Distinguishes configured, disabled, invalid, and
 * externally-unverified capabilities.
 *
 * Rules:
 * - Never prints or leaks keys, tokens, passwords, or secret credentials.
 * - Never implies a database migration or external provider is deployed merely because env values exist.
 * - Uses existing canonical validators (assertSafeFrontendEnv, readSupabaseConfig, parseCleanOrigin).
 */

import { assertSafeFrontendEnv, readSupabaseConfig } from './supabaseConfig.js';
import { parseCleanOrigin } from './metadata.js';

export const CAPABILITY_PREREQUISITES = Object.freeze({
  supabase: {
    label: 'Core Supabase Backend',
    envVars: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    prerequisite: 'Supabase project, Auth schema, and base connection.',
  },
  publicUrl: {
    label: 'Canonical Public URL',
    envVars: ['VITE_PUBLIC_URL'],
    prerequisite: 'Production domain/origin for metadata and OpenGraph tags.',
  },
  publishedContent: {
    label: 'Published HSK1/N5 Content',
    envVars: ['VITE_PUBLISHED_CONTENT_ENABLED'],
    prerequisite: 'Migrations 20261030000100, 20261030000200, 20261030000300, and published course content rows.',
  },
  onlineSync: {
    label: 'Online Progress Sync',
    envVars: ['VITE_ONLINE_SYNC_ENABLED'],
    prerequisite: 'Migrations 20261029000300, 20261029000400, 20261029000500, 20261029000600 (learned_words, study_streaks).',
  },
  accountDeletion: {
    label: 'Self-Service Account Deletion',
    envVars: ['VITE_ACCOUNT_DELETION_ENABLED'],
    prerequisite: 'Migrations 20261029000100, 20261029000200, and delete-account Edge Function deployed with service-role key.',
  },
  learningExportReset: {
    label: 'Learning Data Export & Reset',
    envVars: ['VITE_ACCOUNT_EXPORT_RESET_ENABLED'],
    prerequisite: 'Migration 20261027000100 (profiles/preferences) and online sync reset support.',
  },
  preferencesSync: {
    label: 'Account Preferences Cloud Sync',
    envVars: ['VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED'],
    prerequisite: 'Migration 20261027000100 (user_preferences table and RLS policies).',
  },
  googleAuth: {
    label: 'Google OAuth Sign-in',
    envVars: ['VITE_GOOGLE_AUTH_ENABLED'],
    prerequisite: 'Google Cloud OAuth client configured in Supabase Auth dashboard and redirect URLs allowlisted.',
  },
  cloudImportStaging: {
    label: 'Cloud Guest Import Staging',
    envVars: ['VITE_CLOUD_IMPORT_STAGING'],
    prerequisite: 'Migration 20261028000100 (import_guest_records RPC).',
  },
  errorReporting: {
    label: 'Frontend Error Monitoring',
    envVars: ['VITE_ERROR_REPORTING_ENABLED', 'VITE_ERROR_REPORTING_URL'],
    prerequisite: 'Remote sanitized error telemetry collector endpoint.',
  },
  analytics: {
    label: 'Privacy-Conscious Analytics',
    envVars: ['VITE_ANALYTICS_ENABLED', 'VITE_ANALYTICS_URL'],
    prerequisite: 'Remote allowlisted event analytics collector endpoint.',
  },
});

export const EXTERNAL_VERIFICATION_DISCLAIMER =
  'This preflight checks frontend environment variables and syntax only. ' +
  'Database migrations, Edge Functions, OAuth providers, and telemetry collector endpoints ' +
  'are externally-unverified and require separate hosted verification.';

/**
 * Validates whether a candidate string is a well-formed HTTP/HTTPS URL.
 */
function isValidHttpUrl(candidate) {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Evaluates the full deployment configuration for a given environment object.
 *
 * @param {object} env
 * @returns {object} Structured evaluation report
 */
export function evaluateDeploymentConfig(env = {}) {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const issues = [];
  let securityError = null;

  // 1. Enforce frontend safety (reject database passwords, service-role keys, sb_secret_*)
  try {
    assertSafeFrontendEnv(safeEnv);
  } catch (err) {
    securityError = err.message;
    issues.push(err.message);
  }

  // 2. Evaluate Core Supabase
  let supabaseResult;
  try {
    supabaseResult = readSupabaseConfig(safeEnv);
  } catch (err) {
    supabaseResult = { status: 'invalid', issues: [err.message] };
  }

  const supabaseConfigured = supabaseResult.status === 'configured';

  const capabilities = {};

  // Core Supabase
  capabilities.supabase = {
    label: CAPABILITY_PREREQUISITES.supabase.label,
    status: supabaseResult.status,
    issues: supabaseResult.issues || [],
    externallyUnverified: supabaseConfigured,
    prerequisite: CAPABILITY_PREREQUISITES.supabase.prerequisite,
  };

  // Public URL
  const rawPublicUrl = safeEnv.VITE_PUBLIC_URL;
  if (typeof rawPublicUrl === 'string' && rawPublicUrl.trim().length > 0) {
    const cleanOrigin = parseCleanOrigin(rawPublicUrl);
    if (cleanOrigin) {
      capabilities.publicUrl = {
        label: CAPABILITY_PREREQUISITES.publicUrl.label,
        status: 'configured',
        origin: cleanOrigin,
        externallyUnverified: false,
      };
    } else {
      capabilities.publicUrl = {
        label: CAPABILITY_PREREQUISITES.publicUrl.label,
        status: 'invalid',
        issues: ['VITE_PUBLIC_URL must be a valid public HTTP or HTTPS origin without user credentials or localhost.'],
        externallyUnverified: false,
      };
      issues.push('Invalid VITE_PUBLIC_URL configuration.');
    }
  } else {
    capabilities.publicUrl = {
      label: CAPABILITY_PREREQUISITES.publicUrl.label,
      status: 'disabled',
      note: 'Dynamic browser origin will be used for metadata.',
      externallyUnverified: false,
    };
  }

  // Helper to evaluate feature gates requiring Supabase backend
  const evaluateSupabaseGate = (key, flagName, gatePrereq) => {
    const isEnabled = safeEnv[flagName] === 'true';
    if (!isEnabled) {
      capabilities[key] = {
        label: gatePrereq.label,
        status: 'disabled',
        externallyUnverified: false,
      };
      return;
    }

    if (!supabaseConfigured) {
      const issue = `${flagName} is enabled ('true') but the Supabase backend is not configured.`;
      capabilities[key] = {
        label: gatePrereq.label,
        status: 'invalid',
        issues: [issue],
        externallyUnverified: false,
      };
      issues.push(issue);
    } else {
      capabilities[key] = {
        label: gatePrereq.label,
        status: 'configured',
        externallyUnverified: true,
        prerequisite: gatePrereq.prerequisite,
      };
    }
  };

  evaluateSupabaseGate('publishedContent', 'VITE_PUBLISHED_CONTENT_ENABLED', CAPABILITY_PREREQUISITES.publishedContent);
  evaluateSupabaseGate('onlineSync', 'VITE_ONLINE_SYNC_ENABLED', CAPABILITY_PREREQUISITES.onlineSync);
  evaluateSupabaseGate('accountDeletion', 'VITE_ACCOUNT_DELETION_ENABLED', CAPABILITY_PREREQUISITES.accountDeletion);
  evaluateSupabaseGate('learningExportReset', 'VITE_ACCOUNT_EXPORT_RESET_ENABLED', CAPABILITY_PREREQUISITES.learningExportReset);
  evaluateSupabaseGate('preferencesSync', 'VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED', CAPABILITY_PREREQUISITES.preferencesSync);
  evaluateSupabaseGate('googleAuth', 'VITE_GOOGLE_AUTH_ENABLED', CAPABILITY_PREREQUISITES.googleAuth);
  evaluateSupabaseGate('cloudImportStaging', 'VITE_CLOUD_IMPORT_STAGING', CAPABILITY_PREREQUISITES.cloudImportStaging);

  // Evaluate Error Reporting
  const errorReportingEnabled = safeEnv.VITE_ERROR_REPORTING_ENABLED === 'true';
  if (!errorReportingEnabled) {
    capabilities.errorReporting = {
      label: CAPABILITY_PREREQUISITES.errorReporting.label,
      status: 'disabled',
      externallyUnverified: false,
    };
  } else {
    const rawUrl = safeEnv.VITE_ERROR_REPORTING_URL;
    if (isValidHttpUrl(rawUrl)) {
      capabilities.errorReporting = {
        label: CAPABILITY_PREREQUISITES.errorReporting.label,
        status: 'configured',
        externallyUnverified: true,
        prerequisite: CAPABILITY_PREREQUISITES.errorReporting.prerequisite,
      };
    } else {
      const issue = 'VITE_ERROR_REPORTING_ENABLED is true but VITE_ERROR_REPORTING_URL is missing or not a valid HTTP/HTTPS URL.';
      capabilities.errorReporting = {
        label: CAPABILITY_PREREQUISITES.errorReporting.label,
        status: 'invalid',
        issues: [issue],
        externallyUnverified: false,
      };
      issues.push(issue);
    }
  }

  // Evaluate Analytics
  const analyticsEnabled = safeEnv.VITE_ANALYTICS_ENABLED === 'true';
  if (!analyticsEnabled) {
    capabilities.analytics = {
      label: CAPABILITY_PREREQUISITES.analytics.label,
      status: 'disabled',
      externallyUnverified: false,
    };
  } else {
    const rawUrl = safeEnv.VITE_ANALYTICS_URL;
    if (isValidHttpUrl(rawUrl)) {
      capabilities.analytics = {
        label: CAPABILITY_PREREQUISITES.analytics.label,
        status: 'configured',
        externallyUnverified: true,
        prerequisite: CAPABILITY_PREREQUISITES.analytics.prerequisite,
      };
    } else {
      const issue = 'VITE_ANALYTICS_ENABLED is true but VITE_ANALYTICS_URL is missing or not a valid HTTP/HTTPS URL.';
      capabilities.analytics = {
        label: CAPABILITY_PREREQUISITES.analytics.label,
        status: 'invalid',
        issues: [issue],
        externallyUnverified: false,
      };
      issues.push(issue);
    }
  }

  // Status counts
  const statusCounts = { configured: 0, disabled: 0, invalid: 0, unconfigured: 0 };
  for (const cap of Object.values(capabilities)) {
    if (cap.status in statusCounts) {
      statusCounts[cap.status]++;
    }
  }

  const isGuestUsable = !securityError && statusCounts.invalid === 0;
  const isOverallValid = !securityError && statusCounts.invalid === 0 && supabaseConfigured;

  return {
    isOverallValid,
    isGuestUsable,
    supabaseStatus: supabaseResult.status,
    securityError,
    statusCounts,
    capabilities,
    issues,
    disclaimer: EXTERNAL_VERIFICATION_DISCLAIMER,
  };
}

/**
 * Formats a clean, text-based preflight report without revealing sensitive tokens.
 */
export function formatDeploymentReport(evaluation) {
  const lines = [];
  lines.push('================================================================');
  lines.push('               SWIPE 2 STUDY PREFLIGHT REPORT                   ');
  lines.push('================================================================');

  for (const cap of Object.values(evaluation.capabilities)) {
    const statusPill = `[${cap.status.toUpperCase()}]`.padEnd(16);
    let line = `${statusPill} ${cap.label}`;
    if (cap.status === 'configured' && cap.externallyUnverified) {
      line += ' (externally-unverified)';
    }
    lines.push(line);

    if (cap.prerequisite && cap.status === 'configured') {
      lines.push(`                 Prerequisite: ${cap.prerequisite}`);
    }
    if (cap.origin) {
      lines.push(`                 Origin: ${cap.origin}`);
    }
    if (cap.issues && cap.issues.length > 0) {
      for (const iss of cap.issues) {
        lines.push(`                 Error: ${iss}`);
      }
    }
  }

  lines.push('----------------------------------------------------------------');
  lines.push(`Summary: ${evaluation.statusCounts.configured} configured, ` +
    `${evaluation.statusCounts.disabled} disabled, ` +
    `${evaluation.statusCounts.invalid} invalid, ` +
    `${evaluation.statusCounts.unconfigured} unconfigured.`);
  lines.push('');
  lines.push(`Notice: ${evaluation.disclaimer}`);
  lines.push('================================================================');

  return lines.join('\n');
}
