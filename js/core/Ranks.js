/**
 * Rangs de réputation et avantages associés.
 * Les paliers reprennent les titres existants (Player.getReputationTitle) et les rendent utiles :
 * frais réduits, marge de marchandage, plafond de crédit, ordres permanents.
 */

export const RANKS = [
  {
    id: 0, minRep: 0, title: 'Nouveau venu', icon: '🌱',
    haggleTries: 3, haggleBonus: 0, creditLimit: 300, creditRate: 0.015, orderSlots: 0,
    text: 'On vous découvre : les marchands discutent, mais avec prudence.'
  },
  {
    id: 1, minRep: 8, title: 'Connu sur la place', icon: '🙂',
    haggleTries: 3, haggleBonus: 0.01, creditLimit: 600, creditRate: 0.014, orderSlots: 0,
    text: 'Votre nom circule : marges de discussion un peu plus larges.'
  },
  {
    id: 2, minRep: 18, title: 'Commerçant fiable', icon: '🤝',
    haggleTries: 4, haggleBonus: 0.02, creditLimit: 1000, creditRate: 0.012, orderSlots: 1,
    text: 'Les marchands vous écoutent : un essai de plus par jour et un ordre permanent supplémentaire.'
  },
  {
    id: 3, minRep: 35, title: 'Marchand estimé', icon: '⭐',
    haggleTries: 4, haggleBonus: 0.03, creditLimit: 1600, creditRate: 0.01, orderSlots: 1,
    text: 'Le Comptoir vous fait crédit à meilleur taux.'
  },
  {
    id: 4, minRep: 60, title: 'Maison reconnue', icon: '🏛️',
    haggleTries: 5, haggleBonus: 0.04, creditLimit: 2500, creditRate: 0.008, orderSlots: 2,
    text: 'Une maison de commerce établie : meilleures conditions partout.'
  }
];

/** Réputation négative : pas de crédit, marchands méfiants. */
export const DISTRUSTED_RANK = {
  id: -1, minRep: -40, title: 'Peu fiable', icon: '⚠️',
  haggleTries: 2, haggleBonus: -0.02, creditLimit: 0, creditRate: 0.02, orderSlots: 0,
  text: 'Réputation négative : pas de crédit et des marchands sur leurs gardes.'
};

export function rankFor(reputation = 0) {
  const rep = Number(reputation) || 0;
  if (rep < 0) return DISTRUSTED_RANK;
  let current = RANKS[0];
  for (const r of RANKS) if (rep >= r.minRep) current = r;
  return current;
}

export function nextRank(reputation = 0) {
  const rep = Number(reputation) || 0;
  return RANKS.find(r => r.minRep > rep) || null;
}

/** Réduction des frais d'annonce dès le rang 1 (analyse GD passe 2 : −20 %). */
export const RANK1_FEE_MULT = 0.8;

/** Multiplicateur des frais d'annonce : formule historique, plafonnée à 80 % dès le rang 1. */
export function feeMultiplierFor(reputation = 0) {
  const rep = Number(reputation) || 0;
  const linear = Math.max(0.62, Math.min(1.28, 1 - rep * 0.008));
  return rep >= RANKS[1].minRep ? Math.min(linear, RANK1_FEE_MULT) : linear;
}

/**
 * Déblocage progressif des systèmes par rang (analyse GD passe 2, §4.5).
 * Rang 0 : hôtel de vente, atelier, commandes ; rang 1 : marchandage ; rang 2 : crédit ;
 * rang 3 : ordres permanents et comparateur de marchands.
 */
export const FEATURE_RANK = { haggle: 1, credit: 2, standingOrders: 3, compare: 3 };
export const FEATURE_LABEL = { haggle: 'Marchandage', credit: 'Crédit du Comptoir', standingOrders: 'Ordres permanents', compare: 'Comparateur de marchands' };

/** Rang minimum d'un système (0 si toujours ouvert). */
export function featureRank(feature) {
  return FEATURE_RANK[feature] ?? 0;
}

export function isFeatureUnlocked(feature, reputation = 0) {
  const need = featureRank(feature);
  if (!need) return true;
  return rankFor(reputation).id >= need;
}

/** Message lisible : « débloqué au rang N (titre, R réputation) ». */
export function lockedMessage(feature) {
  const r = RANKS[featureRank(feature)];
  return `${FEATURE_LABEL[feature] || feature} : débloqué au rang ${r.id} (${r.title}, ${r.minRep} de réputation)`;
}

/** Systèmes débloqués / verrouillés pour une réputation donnée. */
export function featureView(reputation = 0) {
  return Object.keys(FEATURE_RANK).map(id => ({ id, label: FEATURE_LABEL[id], rank: FEATURE_RANK[id], title: RANKS[FEATURE_RANK[id]].title, minRep: RANKS[FEATURE_RANK[id]].minRep, unlocked: isFeatureUnlocked(id, reputation) }));
}

/** Vue complète pour l'interface : rang actuel, suivant, progression et tableau des avantages. */
export function getRankView(reputation = 0) {
  const rep = Number(reputation) || 0;
  const rank = rankFor(rep);
  const next = nextRank(rep);
  const base = rank.id >= 0 ? rank.minRep : -40;
  const pct = next ? Math.max(0, Math.min(100, Math.round(((rep - base) / Math.max(1, next.minRep - base)) * 100))) : 100;
  return {
    reputation: rep,
    rank,
    next,
    pct,
    toNext: next ? next.minRep - rep : 0,
    feeMultiplier: feeMultiplierFor(rep),
    features: featureView(rep),
    table: RANKS.map(r => ({
      ...r,
      unlocks: Object.keys(FEATURE_RANK).filter(f => FEATURE_RANK[f] === r.id).map(f => FEATURE_LABEL[f]),
      reached: rep >= r.minRep,
      current: r.id === rank.id,
      feeMultiplier: feeMultiplierFor(r.minRep)
    }))
  };
}
