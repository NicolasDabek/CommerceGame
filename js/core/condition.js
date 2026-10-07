/**
 * État des objets (qualité = usure / état, perfection = finition).
 * Partagé par l'économie, l'IA des PNJ, l'atelier et l'interface.
 *
 * Multiplicateur normalisé : un objet Q50 / P50 vaut exactement le prix moyen (×1).
 *   Q10 ≈ ×0,64 · Q30 ≈ ×0,82 · Q50 = ×1 · Q90 ≈ ×1,2   (× finition 0,88 → 1,12)
 * Un objet abîmé vaut donc nettement moins : le racheter, le réparer puis le revendre rapporte.
 */

import { getItemById } from '../data/items.js';

export function qualityFactor(quality = 50) {
  const q = Math.max(0, Math.min(100, Number(quality)));
  if (q < 50) return 0.55 + (q / 50) * 0.45;
  return 1 + ((q - 50) / 50) * 0.25;
}

export function perfectionFactor(perfection = 50) {
  const p = Math.max(0, Math.min(100, Number(perfection)));
  return (0.9 + (p / 100) * 0.25) / 1.025;
}

export function conditionMultiplier(quality = 50, perfection = 50) {
  return qualityFactor(quality) * perfectionFactor(perfection);
}

/** Libellé d'état lisible. */
export function conditionLabel(quality = 50) {
  const q = Number(quality);
  if (q < 35) return { id: 'damaged', label: 'Abîmé', short: 'Abîmé' };
  if (q < 60) return { id: 'worn', label: 'Usé', short: 'Usé' };
  if (q < 80) return { id: 'good', label: 'Bon état', short: 'Bon' };
  return { id: 'mint', label: 'Excellent état', short: 'Excellent' };
}

const COPPER = { itemId: 'item_010', name: 'Cuivre recyclé (lingot)', icon: '🟠' };
const COMPONENTS = { itemId: 'item_011', name: 'Composants électroniques', icon: '🔌' };
const WOOD = { itemId: 'item_012', name: 'Bois de palette traité', icon: '🪵' };

/**
 * Catégories réparables à l'établi et matériaux utilisés.
 *  - quick : petite réparation (1 matériau bon marché) ;
 *  - refurbish : remise à neuf (matériau principal, 1 unité tous les `per` points d'état).
 * Les vêtements ne demandent que des fournitures (fil, tissu).
 */
const REPAIR_MATERIALS = {
  'Électronique': { quick: COPPER, refurbish: COMPONENTS, per: 75, cheapRefurbish: COPPER, cheapPer: 35 },
  'Outils': { quick: WOOD, refurbish: COPPER, per: 30 },
  'Vêtements': null
};

export function isRepairable(itemId) {
  const item = getItemById(itemId);
  return !!item && Object.prototype.hasOwnProperty.call(REPAIR_MATERIALS, item.category);
}

/**
 * Matériaux nécessaires pour remonter l'état de `restore` points.
 * @param {'quick'|'refurbish'} mode
 * @returns {{itemId:string, qty:number, name:string, icon:string}|null}
 */
export function repairMaterials(itemId, restore, mode = 'refurbish') {
  const item = getItemById(itemId);
  const def = item ? REPAIR_MATERIALS[item.category] : null;
  if (!def || restore <= 0) return null;
  if (mode === 'quick') return { ...def.quick, qty: 1 };
  // Petite électronique (< 100 €) : du cuivre suffit, les composants coûteraient plus que l'objet
  const cheap = def.cheapRefurbish && item.basePrice < 100;
  const mat = cheap ? def.cheapRefurbish : def.refurbish;
  const per = cheap ? def.cheapPer : def.per;
  return { ...mat, qty: Math.max(1, Math.ceil(restore / per)) };
}
