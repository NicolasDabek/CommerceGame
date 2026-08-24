/**
 * Système de sauvegarde / chargement
 * Utilise localStorage pour le prototype (facilement remplaçable par un backend)
 */

const STORAGE_KEY = 'commerce_tycoon_save';

export const Storage = {
  /**
   * Sauvegarde l'état complet du jeu
   * @param {Object} state - GameState
   */
  save(state) {
    try {
      const data = {
        ...state,
        lastSaved: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('Erreur de sauvegarde :', err);
      return false;
    }
  },

  /**
   * Charge la sauvegarde
   * @returns {Object|null}
   */
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

  /**
   * Supprime la sauvegarde
   */
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  /**
   * Vérifie si une sauvegarde existe
   */
  exists() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
};
