import { useContext } from 'react';
import { GuestImportContext } from './guestImportContext.js';

export function useGuestImport() {
  const value = useContext(GuestImportContext);
  if (!value) throw new Error('useGuestImport must be used within a GuestImportProvider');
  return value;
}
