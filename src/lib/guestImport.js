import { defaultAuthCoordinator } from './authCoordinator.js';
import { storageOwner } from './storageOwner.js';
import { getSupabaseClient } from './supabase.js';
import { createGuestImportService, verifyGuestImportAccount } from './guestImportService.js';
import { createCloudGuestImportService } from './cloudGuestImportService.js';
import { isCloudImportStagingEnabled } from './cloudImportGate.js';

export function getActiveGuestImportService(isStaging = isCloudImportStagingEnabled()) {
  if (isStaging) {
    return createCloudGuestImportService({
      storageOwner,
      getAuthState: defaultAuthCoordinator.getState,
      getClient: getSupabaseClient,
    });
  }
  return createGuestImportService({
    storageOwner,
    getAuthState: defaultAuthCoordinator.getState,
    verifyUser: (expectedId, guard) => verifyGuestImportAccount(getSupabaseClient(), expectedId, guard),
  });
}

// When staging gate is enabled, cloud guest import is activated.
// When disabled (default), the established device-only import service is used.
export const guestImportService = getActiveGuestImportService();
