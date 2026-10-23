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
