import { SAVE_VERSION, GAME_VERSION } from '../version.js';
import { migrateSave } from '../core/game/saveMigration.js';

const STORAGE_KEY = 'commerce_tycoon_save';
const CORRUPT_KEY = 'commerce_tycoon_save_corrupt';
const BACKUP_KEY = 'commerce_tycoon_save_backup';
const MAX_TRANSACTIONS = 300;
/** Clés locales de ce jeu (et d'aucun autre jeu servi depuis la même origine, ex. GitHub Pages). */
export const GAME_KEYS = [STORAGE_KEY, CORRUPT_KEY, BACKUP_KEY, 'commerce_tycoon_notes', 'commerce_tycoon_ui', 'ct-market-layout'];

export const Storage = {
  save(state) {
    try {
      const data = {
        ...state,
        transactions: (state.transactions || []).slice(0, MAX_TRANSACTIONS),
        saveVersion: SAVE_VERSION,
        gameVersion: GAME_VERSION,
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
          saveVersion: SAVE_VERSION,
          gameVersion: GAME_VERSION,
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
  /** Sauvegarde au format courant (migrée si besoin), ou null. Une sauvegarde illisible est mise de côté, jamais écrasée sans copie. */
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const { data, from, migrated, newer } = migrateSave(JSON.parse(raw));
      if (!data) throw new Error('format inattendu');
      // avant toute migration (ou une sauvegarde d'une version plus récente) : copie brute de secours
      if (migrated || newer) { try { localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* stockage plein */ } }
      if (migrated) Object.defineProperty(data, '__migratedFrom', { value: from, enumerable: false });
      if (newer) Object.defineProperty(data, '__newer', { value: true, enumerable: false });
      return data;
    } catch (err) {
      console.warn('Sauvegarde illisible, copiée dans « ' + CORRUPT_KEY + ' » :', err);
      try { if (raw) localStorage.setItem(CORRUPT_KEY, raw); } catch (e) { /* stockage plein */ }
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      return null;
    }
  },
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },
  /** Efface la partie et les réglages de CE jeu uniquement (pas localStorage.clear() : l'origine peut être partagée). */
  clearAll() {
    for (const k of GAME_KEYS) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  },
  exists() {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }
};
