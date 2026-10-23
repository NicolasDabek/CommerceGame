/** Petites fonctions partagées par JobBoard et ses sous-modules. */
import { getItemById } from '../../data/items.js';

export function pickWeighted(table) {
  const total = table.reduce((s, r) => s + r.w, 0);
  let n = Math.random() * total;
  for (const row of table) {
    n -= row.w;
    if (n <= 0) return row.itemId;
  }
  return table[0].itemId;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function canSalvage(itemId) {
  const item = getItemById(itemId);
  if (!item) return false;
  return item.category === 'Électronique' || item.category === 'Outils';
}

export function salvageOutputs(itemId, quality = 50) {
  const item = getItemById(itemId);
  if (!item || !canSalvage(itemId)) return [];
  const bonus = Number(quality) >= 70 ? 1 : 0;
  if (item.category === 'Électronique') {
    return [{ itemId: 'item_011', qty: 1 + bonus, name: 'Composants électroniques', icon: '🔌' }];
  }
  const out = [{ itemId: 'item_010', qty: 1, name: 'Cuivre recyclé (lingot)', icon: '🟠' }];
  if (bonus) out.push({ itemId: 'item_012', qty: 1, name: 'Bois de palette traité', icon: '🪵' });
  return out;
}

export function moneyRound(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
