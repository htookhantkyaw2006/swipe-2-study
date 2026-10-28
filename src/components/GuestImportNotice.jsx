import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useGuestImport } from '../lib/useGuestImport.js';
import './GuestImportNotice.css';

export default function GuestImportNotice() {
  const { notice, checking, openGuestImport, dismissNotice } = useGuestImport();
  const messageRef = useRef(null);
  useEffect(() => {
    if (notice) messageRef.current?.focus();
  }, [notice]);
  if (!notice && !checking) return null;
  return <div className={`guest-import-notice${notice?.kind === 'error' ? ' guest-import-notice--error' : ''}`}>
    <p ref={messageRef} tabIndex={-1} role={notice?.kind === 'error' ? 'alert' : 'status'}>{checking ? 'Checking guest learning on this device…' : notice.message}</p>
    {!checking && notice.kind !== 'success' && <button type="button" onClick={openGuestImport}>Recheck guest data</button>}
    {!checking && <button type="button" className="guest-import-notice__dismiss" onClick={dismissNotice} aria-label="Dismiss guest learning message"><X size={18} aria-hidden="true" /></button>}
  </div>;
}
