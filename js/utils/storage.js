const STORAGE_KEY = 'commerce_tycoon_save';
const MAX_TRANSACTIONS = 300;

export const Storage = {
  save(state) {
    try {
      const data = {
        ...state,
        transactions: (state.transactions || []).slice(0, MAX_TRANSACTIONS),
        lastSaved: Date.now()
      };
      if (data.economy?.priceHistory) {
        const history = {};
        for (const [id, points] of Object.entries(data.economy.priceHistory)) {
          history[id] = (points || []).slice(-80);
        }
        data.economy = { ...data.economy, priceHistory: history };
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('Erreur de sauvegarde :', err);
      try {
        const slim = {
          ...state,
          transactions: (state.transactions || []).slice(0, 80),
          lastSaved: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        return true;
      } catch (err2) {
        console.error('Sauvegarde compacte impossible :', err2);
        return false;
      }
    }
  },
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('Erreur de chargement :', err);
      return null;
    }
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
  exists() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
};
