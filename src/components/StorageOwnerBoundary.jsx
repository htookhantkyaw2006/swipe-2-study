import { Fragment, useSyncExternalStore } from 'react';
import { storageOwner } from '../lib/storageOwner.js';

// Remount page/settings state on an owner change. Auth belongs above this.
export default function StorageOwnerBoundary({ children }) {
  const owner = useSyncExternalStore(storageOwner.subscribe, storageOwner.getOwner, () => null);
  return <Fragment key={owner ?? 'guest'}>{children}</Fragment>;
}
