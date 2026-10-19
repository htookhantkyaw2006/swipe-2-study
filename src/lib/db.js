import { getActiveLanguageId } from './activeLanguage';

const generateId = () => Math.random().toString(36).substring(2, 15);

/* ---------------------------------------------------------------
   MOCK DB over localStorage
   ---------------------------------------------------------------
   Every table is per language: `s2s_<lang>_<table>`. Saved words,
   review queue, search history and progress for Japanese can never
   leak into Chinese, and switching back finds everything as it was.

   `db.get/set/...` act on the active language. `getFor/setFor` reach
   a specific one — used by "Reset everything", which has to clear
   every language, not just the one on screen.

   Global settings (s2s_language, s2s_preferences) do not go through
   here and are not scoped.
   --------------------------------------------------------------- */

const keyFor = (lang, table) => `s2s_${lang}_${table}`;

export const db = {
  getFor(lang, table) {
    const data = localStorage.getItem(keyFor(lang, table));
    return data ? JSON.parse(data) : [];
  },

  setFor(lang, table, data) {
    localStorage.setItem(keyFor(lang, table), JSON.stringify(data));
  },

  get(table) {
    return this.getFor(getActiveLanguageId(), table);
  },

  set(table, data) {
    this.setFor(getActiveLanguageId(), table, data);
  },

  insert(table, record) {
    const data = this.get(table);
    const newRecord = { ...record, id: record.id || generateId(), created_at: new Date().toISOString() };
    data.push(newRecord);
    this.set(table, data);
    return newRecord;
  },

  update(table, id, updates) {
    const data = this.get(table);
    const index = data.findIndex(r => r.id === id);
    if (index > -1) {
      data[index] = { ...data[index], ...updates, updated_at: new Date().toISOString() };
      this.set(table, data);
      return data[index];
    }
    return null;
  },

  remove(table, id) {
    const data = this.get(table);
    const filteredData = data.filter(r => r.id !== id);
    this.set(table, filteredData);
    return filteredData.length !== data.length;
  },

  find(table, query) {
    const data = this.get(table);
    return data.filter(record => {
      return Object.entries(query).every(([key, val]) => record[key] === val);
    });
  },

  findOne(table, query) {
    return this.find(table, query)[0] || null;
  }
};
