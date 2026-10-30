import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateDeploymentConfig,
  formatDeploymentReport,
  EXTERNAL_VERIFICATION_DISCLAIMER,
} from '../src/lib/deploymentConfig.js';

const VALID_SUPABASE_ENV = Object.freeze({
  VITE_SUPABASE_URL: 'https://staging.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_valid_key_1234567890',
});

test('deploymentConfig: default blank environment reports guest usable, all gates disabled, and unconfigured backend', () => {
  const result = evaluateDeploymentConfig({});

  assert.equal(result.supabaseStatus, 'unconfigured');
  assert.equal(result.isOverallValid, false, 'Overall readiness requires backend configuration');
  assert.equal(result.isGuestUsable, true, 'Default blank environment must leave guest app usable');
  assert.equal(result.securityError, null);
  assert.equal(result.statusCounts.invalid, 0);
  assert.equal(result.statusCounts.disabled, 10);
  assert.equal(result.statusCounts.unconfigured, 1);

  // Check specific capability states
  assert.equal(result.capabilities.publishedContent.status, 'disabled');
  assert.equal(result.capabilities.onlineSync.status, 'disabled');
  assert.equal(result.capabilities.accountDeletion.status, 'disabled');
  assert.equal(result.capabilities.learningExportReset.status, 'disabled');
  assert.equal(result.capabilities.preferencesSync.status, 'disabled');
  assert.equal(result.capabilities.googleAuth.status, 'disabled');
  assert.equal(result.capabilities.cloudImportStaging.status, 'disabled');
  assert.equal(result.capabilities.errorReporting.status, 'disabled');
  assert.equal(result.capabilities.analytics.status, 'disabled');
  assert.equal(result.capabilities.publicUrl.status, 'disabled');
});

test('deploymentConfig: valid core Supabase marks backend configured and externally-unverified', () => {
  const result = evaluateDeploymentConfig(VALID_SUPABASE_ENV);

  assert.equal(result.supabaseStatus, 'configured');
  assert.equal(result.capabilities.supabase.status, 'configured');
  assert.equal(result.capabilities.supabase.externallyUnverified, true, 'Migrations cannot be inferred merely from env values');
  assert.equal(result.isOverallValid, true);
  assert.equal(result.statusCounts.configured, 1);
  assert.equal(result.statusCounts.disabled, 10);
});

test('deploymentConfig: enabled capabilities without backend are reported as invalid', () => {
  const envWithOrphanedGates = {
    VITE_ONLINE_SYNC_ENABLED: 'true',
    VITE_PUBLISHED_CONTENT_ENABLED: 'true',
    VITE_ACCOUNT_DELETION_ENABLED: 'true',
    VITE_GOOGLE_AUTH_ENABLED: 'true',
  };

  const result = evaluateDeploymentConfig(envWithOrphanedGates);

  assert.equal(result.isOverallValid, false);
  assert.equal(result.capabilities.onlineSync.status, 'invalid');
  assert.equal(result.capabilities.publishedContent.status, 'invalid');
  assert.equal(result.capabilities.accountDeletion.status, 'invalid');
  assert.equal(result.capabilities.googleAuth.status, 'invalid');

  assert.ok(result.issues.some((i) => i.includes('VITE_ONLINE_SYNC_ENABLED is enabled')));
  assert.ok(result.issues.some((i) => i.includes('VITE_PUBLISHED_CONTENT_ENABLED is enabled')));
  assert.ok(result.issues.some((i) => i.includes('VITE_ACCOUNT_DELETION_ENABLED is enabled')));
  assert.ok(result.issues.some((i) => i.includes('VITE_GOOGLE_AUTH_ENABLED is enabled')));
});

test('deploymentConfig: enabled capabilities with backend report configured, prerequisite matrix, and externally-unverified', () => {
  const env = {
    ...VALID_SUPABASE_ENV,
    VITE_ONLINE_SYNC_ENABLED: 'true',
    VITE_PUBLISHED_CONTENT_ENABLED: 'true',
    VITE_ACCOUNT_DELETION_ENABLED: 'true',
    VITE_ACCOUNT_EXPORT_RESET_ENABLED: 'true',
    VITE_ACCOUNT_PREFERENCES_SYNC_ENABLED: 'true',
    VITE_GOOGLE_AUTH_ENABLED: 'true',
    VITE_CLOUD_IMPORT_STAGING: 'true',
  };

  const result = evaluateDeploymentConfig(env);

  assert.equal(result.isOverallValid, true);
  assert.equal(result.capabilities.onlineSync.status, 'configured');
  assert.equal(result.capabilities.onlineSync.externallyUnverified, true);
  assert.ok(result.capabilities.onlineSync.prerequisite.includes('20261029000300'));

  assert.equal(result.capabilities.publishedContent.status, 'configured');
  assert.equal(result.capabilities.publishedContent.externallyUnverified, true);
  assert.ok(result.capabilities.publishedContent.prerequisite.includes('20261030000100'));

  assert.equal(result.capabilities.accountDeletion.status, 'configured');
  assert.equal(result.capabilities.accountDeletion.externallyUnverified, true);
  assert.ok(result.capabilities.accountDeletion.prerequisite.includes('delete-account Edge Function'));

  assert.equal(result.capabilities.googleAuth.status, 'configured');
  assert.equal(result.capabilities.googleAuth.externallyUnverified, true);
  assert.ok(result.capabilities.googleAuth.prerequisite.includes('Google Cloud OAuth'));
});

test('deploymentConfig: telemetry validates collector URLs when enabled and distinguishes invalid states', () => {
  // 1. Error reporting enabled without URL -> invalid
  const noErrUrl = evaluateDeploymentConfig({
    ...VALID_SUPABASE_ENV,
    VITE_ERROR_REPORTING_ENABLED: 'true',
  });
  assert.equal(noErrUrl.capabilities.errorReporting.status, 'invalid');
  assert.equal(noErrUrl.isOverallValid, false);

  // 2. Error reporting enabled with malformed URL -> invalid
  const badErrUrl = evaluateDeploymentConfig({
    ...VALID_SUPABASE_ENV,
    VITE_ERROR_REPORTING_ENABLED: 'true',
    VITE_ERROR_REPORTING_URL: 'ftp://not-a-valid-collector-url',
  });
  assert.equal(badErrUrl.capabilities.errorReporting.status, 'invalid');

  // 3. Error reporting enabled with valid HTTPS URL -> configured + externallyUnverified
  const goodErrUrl = evaluateDeploymentConfig({
    ...VALID_SUPABASE_ENV,
    VITE_ERROR_REPORTING_ENABLED: 'true',
    VITE_ERROR_REPORTING_URL: 'https://telemetry.example.com/errors',
  });
  assert.equal(goodErrUrl.capabilities.errorReporting.status, 'configured');
  assert.equal(goodErrUrl.capabilities.errorReporting.externallyUnverified, true);

  // 4. Analytics enabled without URL -> invalid
  const noAnalyticsUrl = evaluateDeploymentConfig({
    ...VALID_SUPABASE_ENV,
    VITE_ANALYTICS_ENABLED: 'true',
  });
  assert.equal(noAnalyticsUrl.capabilities.analytics.status, 'invalid');
  assert.equal(noAnalyticsUrl.isOverallValid, false);

  // 5. Analytics enabled with valid HTTPS URL -> configured + externallyUnverified
  const goodAnalyticsUrl = evaluateDeploymentConfig({
    ...VALID_SUPABASE_ENV,
    VITE_ANALYTICS_ENABLED: 'true',
    VITE_ANALYTICS_URL: 'https://telemetry.example.com/events',
  });
  assert.equal(goodAnalyticsUrl.capabilities.analytics.status, 'configured');
  assert.equal(goodAnalyticsUrl.capabilities.analytics.externallyUnverified, true);
});

test('deploymentConfig: validates public URL and rejects localhost or credential-bearing origins', () => {
  // Valid public HTTPS origin
  const validUrl = evaluateDeploymentConfig({
    VITE_PUBLIC_URL: 'https://swipe2study.app',
  });
  assert.equal(validUrl.capabilities.publicUrl.status, 'configured');
  assert.equal(validUrl.capabilities.publicUrl.origin, 'https://swipe2study.app');

  // Rejects localhost / loopback in public URL metadata
  const localUrl = evaluateDeploymentConfig({
    VITE_PUBLIC_URL: 'http://localhost:5173',
  });
  assert.equal(localUrl.capabilities.publicUrl.status, 'invalid');

  // Rejects embedded credentials in public URL
  const credUrl = evaluateDeploymentConfig({
    VITE_PUBLIC_URL: 'https://user:pass@swipe2study.app',
  });
  assert.equal(credUrl.capabilities.publicUrl.status, 'invalid');
});

test('deploymentConfig: strictly redacts secret tokens and never prints credentials in formatted reports', () => {
  const secretToken = 'sb_secret_super_confidential_9999999999';
  const envWithSecret = {
    ...VALID_SUPABASE_ENV,
    VITE_SECRET_LEAK: secretToken,
  };

  const evalResult = evaluateDeploymentConfig(envWithSecret);
  assert.ok(evalResult.securityError);
  assert.equal(evalResult.isOverallValid, false);

  const formattedReport = formatDeploymentReport(evalResult);

  // Assert secret token value is NEVER present in the output
  assert.doesNotMatch(formattedReport, new RegExp(secretToken));
  // Assert publishable key is NEVER present in the output
  assert.doesNotMatch(formattedReport, new RegExp(VALID_SUPABASE_ENV.VITE_SUPABASE_PUBLISHABLE_KEY));
  // Assert explicit disclaimer is present
  assert.ok(formattedReport.includes(EXTERNAL_VERIFICATION_DISCLAIMER));
});
