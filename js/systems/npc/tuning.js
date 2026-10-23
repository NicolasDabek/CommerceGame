/**
 * Réglages des PNJ (profils de personnalité, constantes) et petites fonctions partagées.
 * (extraits de systems/NPCController.js ; ré-exportés par NPCController.js)
 */

/** Profils de stratégie par personnalité (ratios exprimés par rapport au prix de référence). */
export const PERSONALITY_PROFILES = {
  prudent: {
    label: 'Marges sûres', reserve: 0.28, stockTarget: 6,
    sellMarkup: [1.04, 1.14], buyMarkdown: [0.84, 0.93], maxBuy: 0.95, maxBuyPref: 1.0, minSell: 0.98,
    text: 'Achète sous la valeur normale et revend avec une petite marge.'
  },
  agressif: {
    label: 'Volume et vitesse', reserve: 0.08, stockTarget: 9,
    sellMarkup: [0.95, 1.06], buyMarkdown: [0.9, 1.0], maxBuy: 1.02, maxBuyPref: 1.1, minSell: 0.86,
    text: 'Fait tourner beaucoup de marchandise, quitte à rogner sa marge.'
  },
  opportuniste: {
    label: 'Chasseur de bonnes affaires', reserve: 0.14, stockTarget: 7,
    sellMarkup: [1.0, 1.14], buyMarkdown: [0.84, 0.95], maxBuy: 0.96, maxBuyPref: 1.04, minSell: 0.92,
    text: 'Rachète ce qui est bradé, revend quand le prix remonte.'
  },
  collectionneur: {
    label: 'Garde le rare', reserve: 0.2, stockTarget: 6,
    sellMarkup: [1.0, 1.08], buyMarkdown: [0.92, 1.04], maxBuy: 0.9, maxBuyPref: 1.15, minSell: 1.0,
    prefSellMarkup: [1.12, 1.28],
    text: 'Paie plus cher ses catégories favorites et les revend rarement.'
  },
  'épicier': {
    label: 'Rotation rapide', reserve: 0.1, stockTarget: 10,
    sellMarkup: [0.96, 1.05], buyMarkdown: [0.88, 0.96], maxBuy: 0.96, maxBuyPref: 1.02, minSell: 0.88,
    producer: true,
    text: 'Produit des denrées et les écoule vite à petit prix.'
  },
  artisan: {
    label: 'Fabrique et revend', reserve: 0.16, stockTarget: 8,
    sellMarkup: [1.02, 1.12], buyMarkdown: [0.88, 0.97], maxBuy: 0.97, maxBuyPref: 1.04, minSell: 0.95,
    producer: true,
    text: 'Fabrique outils et matériaux, achète ses matières premières.'
  }
};

export const NPC_TUNING = {
  listMin: 0.78,             // jamais d'annonce sous 78 % du prix de référence…
  listMax: 1.45,             // … ni au-dessus de 145 %
  buyCapMax: 1.15,           // plafond absolu d'achat (sauf collectionneur sur ses favoris : 1.25)
  collectorCap: 1.25,
  refAverageWeight: 0.6,     // prix de référence = 60 % moyenne du marché + 40 % valeur normale
  productionCost: 0.55,      // coût de fabrication (× valeur normale), payé au Comptoir
  producerCost: 0.45,
  listingFeeRate: 1,         // les PNJ paient les mêmes frais que le joueur (analyse GD, P1)
  actionBase: 4,             // budget d'actions par jour : 4 + agressivité × 6
  actionAggr: 6,
  cooldownDays: 0.5,         // délai avant de remettre en vente un objet retiré
  arbitrageMargin: 0.10,     // marge minimale d'un arbitrage après taxe : 10 % (analyse GD, P1 — laisse de la marge au joueur)
  repairCostRatio: 0.12,     // coût matériaux d'une remise en état (× valeur normale)
  repairsPerDay: 2,
  damagedQuality: 35         // sous cet état, un objet est « abîmé »
};

export function round2(n) {
  return Math.round(n * 100) / 100;
}
export function eur(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function rand(min, max) {
  return min + Math.random() * (max - min);
}
