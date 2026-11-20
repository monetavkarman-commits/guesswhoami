// localStorage wrapper; the game never depends on it working.
export const store = {
  get(k, def = null) { try { const v = localStorage.getItem('gwai:' + k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem('gwai:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
