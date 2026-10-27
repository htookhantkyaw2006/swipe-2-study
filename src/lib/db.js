import { getActiveLanguageId } from './activeLanguage';
import { storageOwner } from './storageOwner.js';
import { createLocalDatabase } from './localDatabase.js';

// Keep the synchronous page API. Guest keys are unchanged; signed-in users
// get a separate cache. Auth and cloud sync are not wired yet.
export const db = createLocalDatabase({
  getScope: () => storageOwner.scope(),
  getLanguage: getActiveLanguageId,
});
