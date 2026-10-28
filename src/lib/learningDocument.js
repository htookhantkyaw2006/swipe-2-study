// One localStorage value commits imported tables and their decision together.
// This is a device cache, not a cloud transaction or an authorization boundary.
const TABLE = /^(?:zh|ja|en)_[a-z][a-z0-9_]*$/;
const HASH = /^[a-f0-9]{64}$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = () => new Error('Stored learning data has an unsupported format. It has been kept for recovery.');

export function parseLearningDocument(raw) {
  if (raw === null) return null;
  let value;
  try { value = JSON.parse(raw); } catch { throw invalid(); }
  if (!isObject(value) || value.version !== 1 || !Number.isSafeInteger(value.revision)
    || value.revision < 1 || !isObject(value.tables)) throw invalid();
  for (const [key, rows] of Object.entries(value.tables)) {
    if (!TABLE.test(key) || typeof rows !== 'string') throw invalid();
    parseLearningRows(rows);
  }
  const receipt = value.guestImport;
  if (!isObject(receipt) || !HASH.test(receipt.fingerprint)
    || !['merge', 'account-only'].includes(receipt.choice)
    || typeof receipt.decidedAt !== 'string' || !Number.isFinite(Date.parse(receipt.decidedAt))
    || !isObject(receipt.handled)) throw invalid();
  for (const [key, identities] of Object.entries(receipt.handled)) {
    if (!TABLE.test(key) || !Array.isArray(identities)
      || identities.some(identity => typeof identity !== 'string' || !identity)) throw invalid();
  }
  return value;
}

export function parseLearningRows(raw) {
  let rows;
  try { rows = JSON.parse(raw); } catch { throw invalid(); }
  if (!Array.isArray(rows) || rows.some(row => !isObject(row))) throw invalid();
  return rows;
}
