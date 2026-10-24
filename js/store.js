// Single source of truth for customer data, persisted to localStorage.

const Store = (() => {
  const KEY = 'miniCrm.v1';
  let data = load();

  function isValid(d) {
    return d && d.version === 1 && Array.isArray(d.customers);
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY));
      if (isValid(parsed)) return parsed;
    } catch (e) {
      console.warn('Could not read saved data, using sample data.', e);
    }
    const fresh = buildSampleData();
    persist(fresh);
    return fresh;
  }

  function persist(d) {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) {
      console.error('Could not save data.', e);
    }
  }

  function save() {
    persist(data);
  }

  function find(id) {
    return data.customers.find((c) => c.id === id);
  }

  return {
    all() {
      return data.customers;
    },

    find,

    create(fields) {
      const now = new Date().toISOString();
      const customer = {
        id: uid(),
        ...fields,
        status: 'new',
        createdAt: now,
        history: [{ type: 'created', to: 'new', at: now }],
      };
      data.customers.push(customer);
      save();
      return customer;
    },

    update(id, fields) {
      const c = find(id);
      if (!c) return;
      Object.assign(c, fields);
      save();
    },

    remove(id) {
      data.customers = data.customers.filter((c) => c.id !== id);
      save();
    },

    // Returns false when nothing changed (unknown id or same column).
    move(id, to) {
      const c = find(id);
      if (!c || c.status === to) return false;
      c.history.push({ type: 'moved', from: c.status, to, at: new Date().toISOString() });
      c.status = to;
      save();
      return true;
    },

    resetSample() {
      data = buildSampleData();
      save();
    },
  };
})();
