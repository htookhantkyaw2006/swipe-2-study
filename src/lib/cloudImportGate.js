/**
 * Staging Cloud-Import Feature Gate
 *
 * When VITE_CLOUD_IMPORT_STAGING === 'true', cloud guest import and snapshot restoration
 * are activated for staging testing.
 * When disabled (default), the app continues using the established device-only guest import flow.
 */
export function isCloudImportStagingEnabled(env = typeof import.meta !== 'undefined' ? import.meta.env : process.env) {
  return env?.VITE_CLOUD_IMPORT_STAGING === 'true';
}
