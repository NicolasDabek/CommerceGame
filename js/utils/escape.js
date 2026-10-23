/**
 * Échappement HTML partagé (texte et attributs) : & < > " '.
 * À utiliser pour tout texte interpolé dans innerHTML.
 */
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => MAP[c]);
}

/** Alias explicite pour les valeurs d'attribut (title, aria-label…). */
export const escapeAttr = esc;

/** Nom d'objet sur 2 lignes max (CSS .item-title), nom complet en infobulle. */
export function itemTitle(text, cls = '') {
  const t = esc(text);
  return `<span class="item-title${cls ? ' ' + cls : ''}" title="${t}">${t}</span>`;
}
