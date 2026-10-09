/**
 * Career — « Parcours du marchand » : progression guidée en 5 chapitres.
 * Chaque chapitre propose 4 étapes concrètes (dans n'importe quel ordre) avec un « comment faire »
 * et un bouton pour ouvrir le bon lieu. Les récompenses sont de la réputation, de l'XP et des
 * cases d'inventaire : jamais d'argent créé.
 */

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export const CHAPTERS = [
  {
    id: 'debuts', title: 'Premiers pas', icon: '🌱',
    intro: 'Découvrez la place : lisez les prix, achetez, vendez, suivez un objet.',
    reward: { reputation: 3, xp: 40, label: '+3 réputation · +40 XP' },
    steps: [
      { id: 'visit_market', title: 'Ouvrir la Halle des prix', metric: 'visitedMarket', target: 1, panel: 'market',
        how: 'Entrez dans la Halle des prix (touche 4) : prix moyen, offre / demande et bonnes affaires y sont résumés.' },
      { id: 'first_sale', title: 'Vendre un objet', metric: 'sales', target: 1, panel: 'inventory',
        how: 'Sac (touche 1) → cliquez un objet → « Vendre » à la meilleure offre d\'achat, ou « Mettre en vente ».' },
      { id: 'first_buy', title: 'Acheter un objet', metric: 'purchases', target: 1, panel: 'auction',
        how: 'Hôtel de vente (touche 2) → « Acheter » sur une annonce avec achat immédiat, ou « Négocier ».' },
      { id: 'first_watch', title: 'Suivre un objet ★', metric: 'watched', target: 1, panel: 'market',
        how: 'Dans la Halle des prix, cliquez l\'étoile ☆ d\'un objet : il apparaît dans « Suivi » avec des alertes.' }
    ]
  },
  {
    id: 'marche', title: 'Lire le marché', icon: '📈',
    intro: 'Achetez sous la moyenne, revendez avec marge, discutez les prix.',
    reward: { reputation: 4, xp: 80, inventory: 2, label: '+4 réputation · +80 XP · +2 cases' },
    steps: [
      { id: 'buy_below', title: 'Acheter 2 fois à −8 % sous la moyenne', metric: 'buysBelow', target: 2, panel: 'auction',
        how: 'Repérez les badges « Bonne affaire » à l\'Hôtel de vente, ou négociez un rabais avec un marchand qui vous fait confiance.' },
      { id: 'sell_margin', title: 'Vendre 2 fois avec 15 % de marge', metric: 'sellsMargin', target: 2, panel: 'buyhouse',
        how: 'Votre coût d\'achat est mémorisé : l\'Hôtel d\'achat affiche la marge de chaque offre pour votre stock.' },
      { id: 'haggle_1', title: 'Réussir un marchandage', metric: 'haggles', target: 1, panel: 'auction',
        how: 'Bouton « Négocier » sur l\'annonce ou l\'offre d\'achat d\'un marchand. Plus il vous fait confiance, plus il lâche.' },
      { id: 'deliver_1', title: 'Livrer un contrat ou une commande', metric: 'deliveries', target: 1, panel: 'jobs',
        how: 'Atelier (touche 5) → contrats du Comptoir et commandes des marchands : livrez les objets demandés.' }
    ]
  },
  {
    id: 'fiable', title: 'Commerçant fiable', icon: '🤝',
    intro: 'Gagnez la confiance de la ville : approvisionnez les pénuries et soignez votre réputation.',
    reward: { reputation: 5, xp: 150, inventory: 1, label: '+5 réputation · +150 XP · +1 case' },
    steps: [
      { id: 'rep_18', title: 'Atteindre le rang « Commerçant fiable »', metric: 'reputation', target: 18, panel: 'goals',
        how: 'Chaque vente rapporte +1 réputation ; les chapitres du parcours et un crédit remboursé à temps aussi.' },
      { id: 'shortage_3', title: 'Approvisionner 3 pénuries', metric: 'shortageSales', target: 3, panel: 'market',
        how: 'Triez la Halle des prix par « Pénurie » : vendez (offre d\'achat, annonce ou contrat) un objet en pénurie ou tendu.' },
      { id: 'repair_1', title: 'Réparer un objet à l\'établi', metric: 'repairs', target: 1, panel: 'jobs',
        how: 'Atelier → onglet « Établi de réparation » : un objet usé revendu en bon état rapporte plus.' },
      { id: 'worth_3000', title: 'Patrimoine de 3 000 €', metric: 'netWorth', target: 3000, panel: 'trading',
        how: 'Patrimoine = argent + stock au prix du marché + offres en cours − crédit. Détail dans Objectifs.' }
    ]
  },
  {
    id: 'maison', title: 'Maison de commerce', icon: '🏪',
    intro: 'Utilisez le crédit comme un levier, multipliez les partenaires.',
    reward: { reputation: 8, xp: 260, inventory: 2, label: '+8 réputation · +260 XP · +2 cases' },
    steps: [
      { id: 'credit_ok', title: 'Rembourser un crédit à temps', metric: 'creditsOnTime', target: 1, panel: 'trading',
        how: 'Suivi (touche 7) → onglet « Crédit » : empruntez pour saisir une affaire, remboursez avant l\'échéance (+2 réputation).' },
      { id: 'haggle_5', title: 'Réussir 5 marchandages', metric: 'haggles', target: 5, panel: 'auction',
        how: 'Négociez à l\'achat comme à la vente. Une proposition trop basse vexe le marchand (confiance en baisse).' },
      { id: 'partners_10', title: 'Commercer avec 10 marchands', metric: 'partners', target: 10, panel: 'npcs',
        how: 'Achetez ou vendez à des marchands différents : la confiance de chacun ouvre de meilleurs prix.' },
      { id: 'worth_8000', title: 'Patrimoine de 8 000 €', metric: 'netWorth', target: 8000, panel: 'trading',
        how: 'Faites tourner votre stock : achetez en surplus, revendez en pénurie.' }
    ]
  },
  {
    id: 'grand', title: 'Grand négociant', icon: '🏛️',
    intro: 'Le défi de fin de partie : devenez la maison de référence de la place.',
    reward: { reputation: 10, xp: 500, inventory: 2, label: '+10 réputation · +500 XP · +2 cases · titre « Grand négociant »' },
    steps: [
      { id: 'worth_20000', title: 'Patrimoine de 20 000 €', metric: 'netWorth', target: 20000, panel: 'trading',
        how: 'Combinez ordres permanents, crédit et marchandage sur les objets chers (électronique, épiques).' },
      { id: 'rep_60', title: 'Rang « Maison reconnue »', metric: 'reputation', target: 60, panel: 'goals',
        how: 'Frais d\'annonce réduits, crédit à 0,8 %/jour, 5 essais de marchandage par jour.' },
      { id: 'shortage_15', title: 'Approvisionner 15 pénuries', metric: 'shortageSales', target: 15, panel: 'market',
        how: 'Gardez un œil sur les alertes de pénurie (Suivi) et sur les contrats du Comptoir.' },
      { id: 'net_3000', title: 'Bénéfice net de 3 000 € (Bilan)', metric: 'netProfit', target: 3000, panel: 'trading',
        how: 'Bilan = marges réalisées + contrats − atelier − frais. Suivi → onglet « Bilan ».' }
    ]
  }
];

/** Astuces contextuelles affichées à la première visite de chaque lieu. */
export const PANEL_TIPS = {
  inventory: 'Cliquez un objet : prix du marché, meilleure offre, « Vendre » en un clic ou « Tout vendre » aux offres d\'achat.',
  auction: '« Acheter » = achat immédiat (choisissez la quantité). « Négocier » propose votre prix au marchand. Touche N : mettre en vente.',
  buyhouse: 'Les marchands achètent ici. « Vendre » cède votre stock à leur prix ; « Négocier » demande un peu plus. Touche N : offre d\'achat.',
  market: 'Pastille Offre / demande = jours de stock face à la consommation de la ville. Triez par « Pénurie » pour trouver où vendre.',
  jobs: 'Contrats et commandes paient au-dessus du marché ; l\'établi remet en état les objets usés.',
  npcs: 'Chaque marchand a un métier, une personnalité et une confiance envers vous : elle décide de sa marge de marchandage.',
  trading: 'Suivi : alertes de prix · ordres d\'achat automatiques · bilan · crédit du Comptoir.',
  goals: 'Le Parcours vous guide étape par étape ; votre rang de réputation débloque des avantages.',
  history: 'Toutes vos transactions, avec l\'écart au prix moyen. Filtre « Marchandage » pour vos négociations.'
};

export class Career {
  constructor(game, saved = {}) {
    this.game = game;
    this.claimed = saved.claimed || [];
    this.visited = saved.visited || [];
    const c = saved.counters || {};
    this.counters = {
      buysBelow: c.buysBelow || 0,
      sellsMargin: c.sellsMargin || 0,
      shortageSales: c.shortageSales || 0,
      partners: Array.isArray(c.partners) ? c.partners : []
    };
    this.title = saved.title || null;
    this.lastCompleted = saved.lastCompleted || null;
    if (!saved.counters) this._backfill();
    if (game && Array.isArray(game.tradeListeners)) {
      game.tradeListeners.push((tx) => this.onTransaction(tx));
    }
  }

  /** Anciennes sauvegardes : reconstitue les compteurs depuis l'historique conservé. */
  _backfill() {
    (this.game.transactions || []).forEach(tx => this._count(tx, false));
  }

  notePanel(panel) {
    if (panel && !this.visited.includes(panel)) {
      this.visited.push(panel);
      this.check();
    }
  }

  _count(tx, live = true) {
    const isBuy = tx.buyerId === 'player';
    const isSell = tx.sellerId === 'player';
    if (!isBuy && !isSell) return;
    const other = isBuy ? tx.sellerId : tx.buyerId;
    if (other && other !== 'player' && other !== 'city' && !this.counters.partners.includes(other)) this.counters.partners.push(other);
    if (isBuy && (tx.priceDeltaPct ?? 0) <= -8) this.counters.buysBelow += 1;
    if (isSell && (tx.playerMarginPct ?? -Infinity) >= 15) this.counters.sellsMargin += 1;
    if (isSell && live) {
      const status = this.game.getSupplyView?.(tx.itemId)?.status;
      if (status === 'shortage' || status === 'tight') this.counters.shortageSales += 1;
    }
  }

  onTransaction(tx) {
    this._count(tx, true);
  }

  /** Livraison d'un contrat ou d'une commande sur un objet en pénurie : compte aussi. */
  noteShortageDelivery(itemId) {
    const status = this.game.getSupplyView?.(itemId)?.status;
    if (status === 'shortage' || status === 'tight') this.counters.shortageSales += 1;
  }

  metrics() {
    const g = this.game;
    const stats = g.player?.stats || {};
    const jobs = g.jobBoard?.stats || {};
    const j = g.tradingDesk?.journal;
    let netProfit = 0;
    if (j) {
      const realized = Object.values(j.items || {}).reduce((t, r) => t + (r.realized || 0), 0);
      netProfit = r2(realized + (j.jobRealized || 0) - (j.workshop || 0) - (j.fees || 0));
    }
    return {
      visitedMarket: this.visited.includes('market') ? 1 : 0,
      sales: stats.totalSales || 0,
      purchases: stats.totalPurchases || 0,
      watched: g.tradingDesk?.watchlist?.length || 0,
      buysBelow: this.counters.buysBelow,
      sellsMargin: this.counters.sellsMargin,
      haggles: g.negotiation?.stats?.deals || 0,
      deliveries: (jobs.contracts || 0) + (jobs.npcOrders || 0),
      reputation: g.player?.reputation || 0,
      shortageSales: this.counters.shortageSales,
      repairs: jobs.repairs || 0,
      netWorth: g.getNetWorth ? g.getNetWorth().total : (g.player?.money || 0),
      creditsOnTime: g.credit?.stats?.onTime || 0,
      partners: this.counters.partners.length,
      netProfit
    };
  }

  /** Chapitre courant = premier chapitre non récompensé. */
  currentIndex() {
    const idx = CHAPTERS.findIndex(ch => !this.claimed.includes(ch.id));
    return idx === -1 ? CHAPTERS.length : idx;
  }

  /** Vérifie les étapes et verse les récompenses des chapitres terminés (dans l'ordre). */
  check(metrics = this.metrics()) {
    const done = [];
    for (let guard = 0; guard < CHAPTERS.length; guard++) {
      const idx = this.currentIndex();
      if (idx >= CHAPTERS.length) break;
      const ch = CHAPTERS[idx];
      const complete = ch.steps.every(s => (metrics[s.metric] || 0) >= s.target);
      if (!complete) break;
      this._reward(ch);
      done.push(ch);
      metrics = this.metrics();
    }
    return done;
  }

  _reward(ch) {
    const p = this.game.player;
    this.claimed.push(ch.id);
    if (ch.reward.reputation) p.addReputation(ch.reward.reputation);
    if (ch.reward.xp) p.addXp(ch.reward.xp);
    if (ch.reward.inventory) p.inventory.expand(ch.reward.inventory);
    if (ch.id === 'grand') this.title = 'Grand négociant';
    this.lastCompleted = { id: ch.id, title: ch.title, day: this.game.timeManager?.getCurrentDay?.() ?? 1 };
    this.game.uiCallbacks?.onStatus?.(`Chapitre terminé : ${ch.icon} ${ch.title} — ${ch.reward.label}`);
  }

  getView() {
    const m = this.metrics();
    const current = this.currentIndex();
    const chapters = CHAPTERS.map((ch, i) => {
      const steps = ch.steps.map(s => {
        const value = m[s.metric] || 0;
        return {
          ...s,
          value: s.metric === 'netWorth' || s.metric === 'netProfit' ? r2(value) : value,
          done: value >= s.target,
          pct: Math.max(0, Math.min(100, Math.round((value / s.target) * 100)))
        };
      });
      const doneCount = steps.filter(s => s.done).length;
      return {
        ...ch, steps, doneCount,
        status: this.claimed.includes(ch.id) ? 'done' : i === current ? 'current' : 'locked'
      };
    });
    const cur = chapters[current] || null;
    const nextStep = cur ? cur.steps.find(s => !s.done) || null : null;
    return {
      chapters,
      current,
      currentChapter: cur,
      nextStep,
      finished: current >= CHAPTERS.length,
      title: this.title,
      metrics: m
    };
  }

  toJSON() {
    return {
      claimed: [...this.claimed],
      visited: [...this.visited],
      counters: { ...this.counters, partners: [...this.counters.partners] },
      title: this.title,
      lastCompleted: this.lastCompleted
    };
  }
}
