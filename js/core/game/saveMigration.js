/**
 * Migration des sauvegardes (format versionné depuis la 1.0.0).
 *
 * Format 0 = toute sauvegarde antérieure à la 1.0.0 (aucun champ `saveVersion`) : prototype 0.x, joueur « plat » avec
 * inventaire séparé, sous-systèmes absents (métiers, suivi, marchandage, crédit, parcours, demandes des marchands).
 * Ces cas étaient déjà tolérés au chargement ; la migration 0 → 1 les normalise une fois pour toutes.
 * Format 1 = 1.0.0.
 */
import { SAVE_VERSION, GAME_VERSION } from '../../version.js';

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** MIGRATIONS[n] transforme une sauvegarde du format n en format n + 1 (fonction pure sur une copie). */
export const MIGRATIONS = {
  0: (d) => {
    // joueur plat + inventaire séparé (toutes premières versions) → joueur avec inventaire
    if (isObj(d.player) && !isObj(d.player.inventory)) d.player = { ...d.player, inventory: isObj(d.inventory) ? d.inventory : { size: 10, items: [] } };
    if (!isObj(d.player)) d.player = { inventory: isObj(d.inventory) ? d.inventory : { size: 10, items: [] } };
    delete d.inventory;
    for (const k of ['offers', 'transactions', 'completedGoals']) if (!Array.isArray(d[k])) d[k] = [];
    if (!Number.isFinite(d.currentDay) || d.currentDay < 1) d.currentDay = 1;
    for (const k of ['jobs', 'trading', 'negotiation', 'credit', 'career', 'npcRequests']) if (d[k] != null && !isObj(d[k])) delete d[k];
    return d;
  }
};

/**
 * Met une sauvegarde au format courant. Ne lève jamais : renvoie { data, from, to, migrated, newer }.
 * Une sauvegarde d'une version FUTURE (format > SAVE_VERSION) est chargée telle quelle, signalée par `newer`.
 */
export function migrateSave(raw) {
  if (!isObj(raw)) return { data: null, from: null, to: SAVE_VERSION, migrated: false, newer: false };
  let data = JSON.parse(JSON.stringify(raw));
  const from = Number.isInteger(data.saveVersion) && data.saveVersion >= 0 ? data.saveVersion : 0;
  if (from > SAVE_VERSION) return { data, from, to: from, migrated: false, newer: true };
  for (let v = from; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) data = step(data) || data;
  }
  data.saveVersion = SAVE_VERSION;
  data.gameVersion = data.gameVersion && from === SAVE_VERSION ? data.gameVersion : GAME_VERSION;
  return { data, from, to: SAVE_VERSION, migrated: from !== SAVE_VERSION, newer: false };
}
