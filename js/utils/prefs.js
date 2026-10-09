/**
 * Préférences d'interface (filtres, tris, onglets, astuces vues) — séparées de la sauvegarde
 * de partie : un « Reset » de la partie ne les efface pas forcément, et inversement.
 */
const PREFS_KEY = 'commerce_tycoon_ui';

function read() {
  try {
    const raw = globalThis.localStorage?.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

let cache = null;

export const UiPrefs = {
  get(key, fallback = null) {
    if (!cache) cache = read();
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
  },
  set(key, value) {
    if (!cache) cache = read();
    cache[key] = value;
    try { globalThis.localStorage?.setItem(PREFS_KEY, JSON.stringify(cache)); } catch (e) { /* stockage plein : on ignore */ }
  },
  all() {
    if (!cache) cache = read();
    return { ...cache };
  },
  reset() {
    cache = {};
    try { globalThis.localStorage?.removeItem(PREFS_KEY); } catch (e) { /* ignore */ }
  }
};
