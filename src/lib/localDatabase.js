// Preserve the synchronous page API. A local write is not a cloud confirmation.
export function createLocalDatabase({ getScope, getLanguage, makeId = () => crypto.randomUUID(), now = () => new Date().toISOString() }) {
  const read = (scope, language, table) => {
    const raw = scope.getTable(language, table);
    if (raw === null) return [];
    let rows;
    try {
      rows = JSON.parse(raw);
    } catch {
      throw new Error('Stored learning data could not be read. It has been kept for recovery.');
    }
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('Stored learning data has an unsupported format. It has been kept for recovery.');
    }
    return rows;
  };
  const write = (scope, language, table, rows) => {
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
      throw new TypeError('Learning tables require an array of records.');
    }
    scope.setTable(language, table, JSON.stringify(rows));
  };
  const mutate = (table, change) => {
    const scope = getScope();
    const language = getLanguage();
    const rows = read(scope, language, table);
    const { next, result } = change(rows);
    if (next) write(scope, language, table, next);
    return result;
  };
  const db = {
    getFor: (language, table) => read(getScope(), language, table),
    setFor: (language, table, rows) => write(getScope(), language, table, rows),
    get: table => read(getScope(), getLanguage(), table),
    set: (table, rows) => write(getScope(), getLanguage(), table, rows),
    insert: (table, record) => mutate(table, rows => {
      const inserted = { ...record, id: record.id ?? makeId(), created_at: now() };
      return { next: [...rows, inserted], result: inserted };
    }),
    update: (table, id, updates) => mutate(table, rows => {
      const index = rows.findIndex(row => row.id === id);
      if (index < 0) return { result: null };
      const updated = { ...rows[index], ...updates, id, updated_at: now() };
      const next = rows.slice();
      next[index] = updated;
      return { next, result: updated };
    }),
    remove: (table, id) => mutate(table, rows => {
      const next = rows.filter(row => row.id !== id);
      return next.length === rows.length ? { result: false } : { next, result: true };
    }),
    find: (table, query) => db.get(table).filter(row => Object.entries(query).every(([key, value]) => row[key] === value)),
    findOne: (table, query) => db.find(table, query)[0] ?? null,
  };
  return Object.freeze(db);
}
