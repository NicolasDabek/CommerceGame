/**
 * UI/UX passe 5 : vocabulaire selon le pointeur — « Touchez » sur écran tactile (pointer: coarse), « Cliquez » à la souris.
 * Un seul point d'entrée pour tous les textes d'aide.
 */
export function isCoarsePointer() {
  try { return !!(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches); } catch { return false; }
}

/** « Cliquez » / « Touchez » (ou en minuscule avec capital = false). */
export function tapWord(capital = true) {
  const w = isCoarsePointer() ? 'touchez' : 'cliquez';
  return capital ? w[0].toUpperCase() + w.slice(1) : w;
}

/** Remplace « cliquez / Cliquez » (et « touchez ») d'un texte par le verbe adapté au pointeur. */
export function tapify(text) {
  if (text == null) return text;
  return String(text).replace(/\b(C|c|T|t)(liquez|ouchez)\b/g, (m, first) => tapWord(first === first.toUpperCase()));
}

/** Libellé unique de la liste de suivi vide (Halle des prix et Suivi). */
export const WATCH_ICON = '☆';
export function emptyWatchText() {
  return `Aucun objet suivi : ${tapWord(false)} ${WATCH_ICON} sur un objet pour le suivre.`;
}

/** Textes statiques du HTML marqués data-tap : réécrits au démarrage et quand le pointeur change. */
export function applyPointerWords(root = typeof document !== 'undefined' ? document : null) {
  if (!root) return;
  root.querySelectorAll('[data-tap]').forEach(el => { el.textContent = tapify(el.textContent); });
}

export function watchPointerWords(onChange) {
  try {
    const mq = window.matchMedia?.('(pointer: coarse)');
    mq?.addEventListener?.('change', () => { applyPointerWords(); onChange?.(); });
  } catch { /* navigateur ancien */ }
}
