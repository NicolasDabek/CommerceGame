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

/** Multiplicateur des frais d'annonce (formule historique de Player.getFeeMultiplier). */
export function feeMultiplierFor(reputation = 0) {
  return Math.max(0.62, Math.min(1.28, 1 - (Number(reputation) || 0) * 0.008));
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
    table: RANKS.map(r => ({
      ...r,
      reached: rep >= r.minRep,
      current: r.id === rank.id,
      feeMultiplier: feeMultiplierFor(r.minRep)
    }))
  };
}
