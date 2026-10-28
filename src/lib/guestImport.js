import { defaultAuthCoordinator } from './authCoordinator.js';
import { storageOwner } from './storageOwner.js';
import { getSupabaseClient } from './supabase.js';
import { createGuestImportService, verifyGuestImportAccount } from './guestImportService.js';

// Network calls verify identity only. Imported learning records remain local.
export const guestImportService = createGuestImportService({
  storageOwner,
  getAuthState: defaultAuthCoordinator.getState,
  verifyUser: (expectedId, guard) => verifyGuestImportAccount(getSupabaseClient(), expectedId, guard),
});
