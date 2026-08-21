const generateId = () => Math.random().toString(36).substring(2, 15);

// Simple mock DB over localStorage
export const db = {
  get(table) {
    const data = localStorage.getItem(`s2s_${table}`);
    return data ? JSON.parse(data) : [];
  },
  
  set(table, data) {
    localStorage.setItem(`s2s_${table}`, JSON.stringify(data));
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
