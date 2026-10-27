/**
 * MarketReserve — « Comptoir municipal »
 * Régulateur central de l'économie :
 *  - encaisse les taxes et frais payés par les PNJ (puits d'argent) ;
 *  - revend son stock quand un objet est en rupture ou trop cher (plafond) ;
 *  - rachète quand un objet est bradé (plancher) → les prix restent dans une bande ;
 *  - aide les marchands à sec pour que les échanges ne se bloquent pas ;
 *  - détruit l'excédent de trésorerie au-delà d'un plafond (entretien de la ville).
 */

import { ITEMS, getItemById } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
import { Offer } from '../models/Offer.js';

export const RESERVE_ID = 'city';
export const RESERVE_NAME = 'Comptoir municipal';

export const RESERVE_TUNING = {
  startTreasury: 900,
  targetTreasury: 1000,    // au-dessus, le Comptoir passe des commandes publiques
  treasuryCap: 5000,       // au-delà, l'excédent est dépensé (détruit) — passe 4 : 4 000 → 5 000 (masse ≥ 0,90 avec l'exploit)
  procurementPrice: 0.92,  // commandes publiques à 92 % de la valeur normale (passe 3b : 0,95 ; passe 5 : 0,92, elles restent ouvertes 2 jours)
  procurementShare: 1,   // part de l'excédent dépensée chaque jour
  procurementMaxOffers: 6, // passe 5 : 16 → 6 nouvelles commandes par jour, plus grosses et mieux ciblées
  subsidyShare: 0.15,      // part de l'excédent reversée aux marchands en difficulté (passe 2 : 0,25 ; passe 3b : 0,15)
  subsidyBelow: 0.35,      // … ceux sous 35 % de leur capital de départ (passe 2 : 0,4 ; passe 3 : 0,35)
  maxInterventionsPerItem: 1, // passe 3 : au plus une intervention par produit et par jour
  gapPct: 0.15,            // passe 4 : n'intervient sur un prix que si l'écart à la valeur normale dépasse 15 %…
  gapDays: 2,              // … deux jours de suite (rupture = écart à la hausse)
  procurementMaxQty: 10,   // passe 5 : 4 → 10 unités par commande publique d'achat
  procurementTargeted: true, // passe 5 : choisit les produits que les marchands ont en stock (annonces + inventaires)
  procurementDays: 2,      // passe 5 : une commande reste ouverte 2 jours (le temps d'être servie)
  procurementRandom: 1,    // part d'aléa dans le choix des produits
  procurementConsumable: 0, // bonus Nourriture/Ressources (0 : la ville en a déjà besoin, ne pas les lui disputer)
  procurementMinSupply: 1, // stock marchand minimal pour lancer une commande
  procurementSupplyShare: 2, // quantité = min(10, 2 × stock marchand)
  ceiling: 1.7,            // revend à 170 % de la valeur normale si rupture / trop cher (passe 2 : 1,3 → 1,7)
  floor: 0.6,              // rachète à 60 % de la valeur normale si bradé (passe 2 : 0,75 → 0,6)
  publicOrderAfterDays: 4, // pénurie depuis plus de 4 jours (passe 4 : 7 → 4, compense le délai de 2 jours) → commande publique…
  publicOrderPrice: 1.2,   // … à 120 % du prix normal…
  publicOrderQty: 3,       // … pour 3 unités par jour au plus…
  publicOrderMax: 4,       // … et 4 objets à la fois au plus
  publicOrderKeep: 400,    // trésorerie minimale gardée hors commandes publiques
  lot: 3,                  // quantité par intervention (passe 4 : 2 → 3, interventions plus rares mais plus franches)
  maxStockPerItem: 6,
  startStockPerItem: 2,
  buyBudgetShare: 0.12,    // part max de la trésorerie engagée par jour en rachats
  aidThreshold: 150,       // un PNJ sous ce capital reçoit une aide…
  aidAmount: 15,           // … de ce montant, payée par la trésorerie (pas créée)
  npcSalesTax: 0.03,       // taxe sur les ventes des PNJ
  npcListingFeeRate: 1     // les PNJ paient les mêmes frais de mise en vente que le joueur
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

export class MarketReserve {
  constructor(saved = {}) {
    this.treasury = saved.treasury ?? RESERVE_TUNING.startTreasury;
    this.stock = saved.stock || this._starterStock();
    this.stats = {
      taxes: 0, fees: 0, production: 0, sold: 0, bought: 0, aid: 0, subsidies: 0, destroyed: 0, interventions: 0, procurement: 0, used: 0, workshop: 0, contracts: 0, loans: 0,
      ...(saved.stats || {})
    };
    this.lastActions = saved.lastActions || [];
    // Commandes publiques en cours (quêtes) : itemId → { itemId, since, day, price, qty, offerId, filled }
    this.publicOrders = saved.publicOrders || {};
    // Rupture suivie par objet : premier jour sans aucune annonce de marchand (ou pénurie de la ville)
    this.outSince = saved.outSince || {};
    // Passe 4 : jours consécutifs d'écart de prix > 15 % par objet (+n à la hausse, −n à la baisse) ; absent des anciennes sauvegardes
    this.gapStreak = saved.gapStreak || {};
    if (this.stats.publicOrders == null) this.stats.publicOrders = 0;
    if (this.stats.publicOrderUnits == null) this.stats.publicOrderUnits = 0;
    if (this.stats.regulations == null) this.stats.regulations = 0;
    if (this.stats.procureOrders == null) this.stats.procureOrders = 0;
  }

  _starterStock() {
    const stock = {};
    ITEMS.forEach(item => {
      if (item.rarity === 'Commun') stock[item.id] = RESERVE_TUNING.startStockPerItem;
    });
    return stock;
  }

  deposit(amount, reason = 'fees') {
    const n = round2(Number(amount) || 0);
    if (n <= 0) return 0;
    this.treasury = round2(this.treasury + n);
    if (this.stats[reason] != null) this.stats[reason] = round2(this.stats[reason] + n);
    return n;
  }

  withdraw(amount, reason = null) {
    const n = round2(Math.min(this.treasury, Math.max(0, Number(amount) || 0)));
    this.treasury = round2(this.treasury - n);
    if (reason && this.stats[reason] != null) this.stats[reason] = round2(this.stats[reason] + n);
    return n;
  }

  addStock(itemId, qty) {
    if (!itemId || qty <= 0) return;
    this.stock[itemId] = (this.stock[itemId] || 0) + qty;
  }

  stockTotal() {
    return Object.values(this.stock).reduce((s, q) => s + q, 0);
  }

  /** Aide à un PNJ à court d'argent, payée par la trésorerie. */
  aidNpc(npcController) {
    const states = npcController?.npcStates || {};
    let paid = 0;
    Object.keys(states).forEach(id => {
      const cap = states[id].capital ?? 0;
      if (cap >= RESERVE_TUNING.aidThreshold) return;
      const n = this.withdraw(RESERVE_TUNING.aidAmount, 'aid');
      if (n > 0) {
        npcController.creditNpc(id, n);
        paid += n;
      }
    });
    return paid;
  }

  /** Reverse une partie de l'excédent aux marchands passés sous 60 % de leur capital de départ. */
  subsidize(npcController) {
    const t = RESERVE_TUNING;
    const states = npcController?.npcStates || {};
    const excess = this.treasury - t.targetTreasury;
    if (excess <= 0) return 0;
    const needs = NPCS.map(npc => {
      const cap = states[npc.id]?.capital ?? 0;
      return { id: npc.id, gap: Math.max(0, npc.capital * t.subsidyBelow - cap) };
    }).filter(n => n.gap > 0);
    const totalGap = needs.reduce((s, n) => s + n.gap, 0);
    if (totalGap <= 0) return 0;
    const pool = Math.min(totalGap, excess * t.subsidyShare);
    let paid = 0;
    needs.forEach(n => {
      const amount = this.withdraw(pool * (n.gap / totalGap), 'subsidies');
      if (amount > 0) { npcController.creditNpc(n.id, amount); paid += amount; }
    });
    return round2(paid);
  }

  _book(offers, itemId) {
    let bestSell = null;
    let bestBuy = null;
    let sellQty = 0;
    let citySell = false;
    let cityBuy = false;
    for (const o of offers) {
      if (o.status !== 'active' || o.itemId !== itemId) continue;
      if (o.ownerId === RESERVE_ID) {
        if (o.type === 'sell') citySell = true;
        else cityBuy = true;
        continue;
      }
      if (o.type === 'sell') {
        const p = o.buyoutPrice ?? (o.currentBid ?? o.price);
        bestSell = bestSell == null ? p : Math.min(bestSell, p);
        sellQty += o.quantity;
      } else {
        bestBuy = bestBuy == null ? o.price : Math.max(bestBuy, o.price);
      }
    }
    return { bestSell, bestBuy, sellQty, citySell, cityBuy };
  }

  /** Clôt les ordres de la veille : remboursement des achats non servis, retour du stock invendu. */
  _settleOwnOffers(game) {
    game.offers.forEach(o => {
      if (o.status !== 'active' || o.ownerId !== RESERVE_ID) return;
      if (o.type === 'buy') {
        if ((o.publicOrder || o.procurement) && o.durationDays > 1 && !this._expired(game, o)) return; // commande publique : reste ouverte jusqu'à son terme
        if (o.quantity > 0) this.treasury = round2(this.treasury + o.price * o.quantity);
      } else {
        if (o.currentBid != null && o.currentBidderId) return; // enchère en cours : elle ira à son terme
        this.addStock(o.itemId, o.quantity);
      }
      o.status = 'cancelled';
    });
  }

  _expired(game, offer) {
    const now = game.timeManager?.now?.() ?? Date.now();
    return offer.expiresAt != null && now >= offer.expiresAt;
  }

  /**
   * Commandes publiques (analyse GD passe 2) : un objet en pénurie depuis plus de publicOrderAfterDays jours (4, passe 4)
   * fait l'objet d'une commande du Comptoir à 120 % du prix normal, visible comme quête.
   * L'argent est prélevé sur la trésorerie (bloqué dans l'offre d'achat) : aucune création monétaire.
   */
  publicOrdersDaily(game) {
    const t = RESERVE_TUNING;
    const sd = game.supplyDemand;
    const day = game.timeManager?.getCurrentDay?.() ?? game.currentDay ?? 1;
    const now = game.timeManager?.now?.() ?? Date.now();
    const msPerGameDay = game.timeManager?.msPerGameDay;
    const actions = [];
    // Rupture = aucune annonce de vente d'un marchand ou du joueur, ou pénurie mesurée par la ville
    const listed = new Set(game.offers.filter(o => o.status === 'active' && o.type === 'sell' && o.ownerId !== RESERVE_ID && o.quantity > 0).map(o => o.itemId));
    ITEMS.forEach(item => {
      const sdShort = sd?.items?.[item.id]?.shortSince != null;
      const out = !listed.has(item.id) || sdShort;
      if (out && this.outSince[item.id] == null) this.outSince[item.id] = day;
      if (!out) delete this.outSince[item.id];
    });
    const shortDays = (id) => (this.outSince[id] == null ? 0 : day - this.outSince[id]);
    // Clôt les commandes résolues (pénurie terminée) ou dont l'offre n'est plus active
    Object.keys(this.publicOrders).forEach(id => {
      const po = this.publicOrders[id];
      const offer = game.offers.find(o => o.id === po.offerId);
      const stillShort = shortDays(id) >= t.publicOrderAfterDays;
      if (offer && offer.status === 'active') {
        po.filled = Math.max(0, po.qty - offer.quantity);
        if (!stillShort) {
          if (offer.quantity > 0) this.treasury = round2(this.treasury + offer.price * offer.quantity);
          offer.status = 'cancelled';
        } else return;
      }
      if (!stillShort) delete this.publicOrders[id];
    });
    const candidates = ITEMS
      .filter(item => shortDays(item.id) >= t.publicOrderAfterDays)
      .sort((a, b) => this.outSince[a.id] - this.outSince[b.id]);
    for (const item of candidates) {
      const existing = this.publicOrders[item.id];
      const live = existing && game.offers.find(o => o.id === existing.offerId && o.status === 'active');
      if (live) continue;
      const open = Object.values(this.publicOrders).filter(po => game.offers.some(o => o.id === po.offerId && o.status === 'active')).length;
      if (open >= t.publicOrderMax) break;
      const price = round2(game.economy.getFairValue(item.id) * t.publicOrderPrice);
      const qty = Math.min(t.publicOrderQty, Math.floor((this.treasury - t.publicOrderKeep) / Math.max(0.01, price)));
      if (qty < 1) continue;
      this.treasury = round2(this.treasury - price * qty);
      const offer = new Offer({
        type: 'buy', itemId: item.id, quantity: qty, price,
        ownerId: RESERVE_ID, durationDays: 2, createdAt: now, msPerGameDay
      });
      offer.procurement = true;
      offer.publicOrder = true;
      game.offers.push(offer);
      this.publicOrders[item.id] = { itemId: item.id, since: this.outSince[item.id], day, price, qty, offerId: offer.id, filled: 0, delivered: existing?.delivered || 0 };
      this.stats.publicOrders += 1;
      game.matchingEngine.match(offer, game.offers);
      actions.push({ type: 'public', itemId: item.id, qty, price });
    }
    return actions;
  }

  /** Livraison sur une commande publique : la ville consomme aussitôt les objets (pénurie). */
  notePublicDelivery(offer, qty) {
    const po = offer && this.publicOrders[offer.itemId];
    this.stats.publicOrderUnits = (this.stats.publicOrderUnits || 0) + qty;
    if (po && po.offerId === offer.id) po.delivered = (po.delivered || 0) + qty;
  }

  /** Vue « quêtes » : commandes publiques ouvertes. */
  publicOrdersView(game) {
    const day = game.timeManager?.getCurrentDay?.() ?? game.currentDay ?? 1;
    return Object.values(this.publicOrders).map(po => {
      const offer = game.offers.find(o => o.id === po.offerId && o.status === 'active');
      if (!offer || offer.quantity <= 0) return null;
      const item = getItemById(po.itemId);
      const fair = game.economy.getFairValue(po.itemId);
      return {
        id: `po_${po.itemId}`, offerId: offer.id, itemId: po.itemId, itemName: item?.name || po.itemId, icon: item?.icon || '',
        price: offer.price, fair: round2(fair), premiumPct: Math.round((offer.price / Math.max(0.01, fair) - 1) * 100),
        qty: offer.quantity, total: round2(offer.price * offer.quantity), shortDays: day - po.since, delivered: po.delivered || 0
      };
    }).filter(Boolean).sort((a, b) => b.shortDays - a.shortDays);
  }

  /**
   * Intervention quotidienne sur le marché.
   * @param {object} game — instance Game (offers, economy, timeManager, matchingEngine)
   */
  dailyIntervene(game) {
    const t = RESERVE_TUNING;
    const actions = [];
    const now = game.timeManager?.now?.() ?? Date.now();
    const msPerGameDay = game.timeManager?.msPerGameDay;
    this._settleOwnOffers(game);
    actions.push(...this.publicOrdersDaily(game));
    // Passe 3 : une intervention au maximum par produit et par jour (commande publique comprise)
    const touched = new Set(actions.map(a => a.itemId));
    let budget = round2(this.treasury * t.buyBudgetShare);

    for (const item of ITEMS) {
      const fair = game.economy.getFairValue(item.id);
      const book = this._book(game.offers, item.id);
      const stock = this.stock[item.id] || 0;

      // Passe 4 : écart de prix persistant — meilleure annonce à plus de 15 % de la valeur normale (rupture = hausse),
      // compté en jours consécutifs ; le Comptoir n'agit qu'au bout de `gapDays` jours
      const dir = book.bestSell == null || book.bestSell > fair * (1 + t.gapPct) ? 1 : book.bestSell < fair * (1 - t.gapPct) ? -1 : 0;
      const prev = this.gapStreak[item.id] || 0;
      const streak = dir === 0 ? 0 : (Math.sign(prev) === dir ? prev + dir : dir);
      if (streak) this.gapStreak[item.id] = streak; else delete this.gapStreak[item.id];
      const persistent = Math.abs(streak) >= t.gapDays;

      // Plafond : rupture ou prix trop haut → le comptoir revend un lot
      const ceilingPrice = round2(fair * t.ceiling);
      if (touched.has(item.id)) continue;
      if (persistent && streak > 0 && !book.citySell && stock > 0 && (book.bestSell == null || book.bestSell > ceilingPrice)) {
        const qty = Math.min(stock, t.lot);
        const offer = new Offer({
          type: 'sell', itemId: item.id, quantity: qty, price: ceilingPrice, buyoutPrice: ceilingPrice,
          ownerId: RESERVE_ID, durationDays: 1, quality: 55, perfection: 50,
          createdAt: now, msPerGameDay
        });
        this.stock[item.id] = stock - qty;
        game.offers.push(offer);
        game.matchingEngine.match(offer, game.offers);
        actions.push({ type: 'sell', itemId: item.id, qty, price: ceilingPrice });
        touched.add(item.id);
        continue;
      }

      // Plancher : objet bradé → le comptoir rachète (soutient le prix et la trésorerie des vendeurs)
      const floorPrice = round2(fair * t.floor);
      const dumped = book.bestSell != null && book.bestSell < floorPrice;
      const glut = book.sellQty >= 8 && book.bestBuy == null;
      if (persistent && streak < 0 && !book.cityBuy && (dumped || glut) && stock < t.maxStockPerItem) {
        const qty = t.lot;
        const cost = round2(floorPrice * qty);
        if (cost <= budget && cost <= this.treasury) {
          this.treasury = round2(this.treasury - cost);
          budget = round2(budget - cost);
          const offer = new Offer({
            type: 'buy', itemId: item.id, quantity: qty, price: floorPrice,
            ownerId: RESERVE_ID, durationDays: 1, createdAt: now, msPerGameDay
          });
          game.offers.push(offer);
          game.matchingEngine.match(offer, game.offers);
          actions.push({ type: 'buy', itemId: item.id, qty, price: floorPrice });
          touched.add(item.id);
        }
      }
    }

    // Commandes publiques : la trésorerie excédentaire est réinjectée en achetant des marchandises
    // (au profit des producteurs), puis la ville les consomme.
    const excess = this.treasury - t.targetTreasury;
    if (excess > 0) {
      let procurementBudget = round2(excess * t.procurementShare);
      const active = new Set(game.offers.filter(o => o.status === 'active' && o.ownerId === RESERVE_ID && o.type === 'buy').map(o => o.itemId));
      // Passe 5 : moins de commandes mais mieux ciblées — on achète là où les marchands ont du stock
      // (annonces + inventaires), pour une quantité à la mesure de ce stock : les commandes se remplissent.
      const held = {};
      Object.values(game.npcController?.npcStates || {}).forEach(st => (st.inventory || []).forEach(sl => { held[sl.itemId] = (held[sl.itemId] || 0) + (sl.quantity || 0); }));
      const candidates = ITEMS
        .filter(item => !active.has(item.id) && !touched.has(item.id))
        .map(item => {
          const book = this._book(game.offers, item.id);
          const supply = (held[item.id] || 0) + (book.sellQty || 0);
          const consumable = item.category === 'Nourriture' || item.category === 'Ressources' ? 0.4 : 0;
          return { item, supply, score: t.procurementTargeted ? Math.min(1, supply / 20) + consumable * t.procurementConsumable + Math.random() * t.procurementRandom : Math.random() * 0.5 + consumable + (book.sellQty > 0 ? 0.3 : 0) - (book.sellQty === 0 ? 0.6 : 0) };
        })
        .filter(c => !t.procurementTargeted || c.supply >= t.procurementMinSupply)
        .sort((a, b) => b.score - a.score)
        .slice(0, t.procurementMaxOffers);
      for (const { item, supply } of candidates) {
        const price = round2(game.economy.getFairValue(item.id) * t.procurementPrice);
        const want = t.procurementTargeted ? Math.max(1, Math.ceil(supply * t.procurementSupplyShare)) : t.procurementMaxQty;
        const qty = Math.min(t.procurementMaxQty, want, Math.floor(procurementBudget / price));
        if (qty < 1) continue;
        const cost = round2(price * qty);
        this.treasury = round2(this.treasury - cost);
        procurementBudget = round2(procurementBudget - cost);
        const offer = new Offer({
          type: 'buy', itemId: item.id, quantity: qty, price,
          ownerId: RESERVE_ID, durationDays: t.procurementDays || 1, createdAt: now, msPerGameDay
        });
        offer.procurement = true;
        game.offers.push(offer);
        game.matchingEngine.match(offer, game.offers);
        actions.push({ type: 'procure', itemId: item.id, qty, price });
      }
    }

    // La ville consomme ce qui dépasse son stock de sécurité
    Object.keys(this.stock).forEach(id => {
      const extra = (this.stock[id] || 0) - t.maxStockPerItem;
      if (extra > 0) {
        this.stock[id] -= extra;
        this.stats.used += extra;
      }
    });

    this.aidNpc(game.npcController);
    this.subsidize(game.npcController);

    if (this.treasury > t.treasuryCap) {
      const excess = round2(this.treasury - t.treasuryCap);
      this.treasury = t.treasuryCap;
      this.stats.destroyed = round2(this.stats.destroyed + excess);
    }

    this.stats.interventions += actions.length;
    // Passe 4 : on distingue la régulation des prix (revente plafond, rachat plancher, commande publique)
    // des commandes d'achat qui recyclent l'excédent de trésorerie.
    const procured = actions.filter(a => a.type === 'procure').length;
    this.stats.procureOrders = (this.stats.procureOrders || 0) + procured;
    const publicToday = actions.filter(a => a.type === 'public').length;
    this.stats.procureMaxDay = Math.max(this.stats.procureMaxDay || 0, procured);
    this.stats.publicMaxDay = Math.max(this.stats.publicMaxDay || 0, procured + publicToday);
    this.stats.publicOrders = (this.stats.publicOrders || 0) + publicToday;
    this.stats.regulations = (this.stats.regulations || 0) + actions.length - procured;
    this.lastActions = [...actions.filter(a => a.type === 'public'), ...actions.filter(a => a.type !== 'public').slice(-8)].map(a => {
      const item = getItemById(a.itemId);
      return { ...a, name: item?.name || a.itemId, icon: item?.icon || '' };
    });
    return actions;
  }

  toJSON() {
    return {
      treasury: this.treasury,
      stock: { ...this.stock },
      stats: { ...this.stats },
      lastActions: this.lastActions,
      publicOrders: this.publicOrders,
      outSince: this.outSince,
      gapStreak: this.gapStreak
    };
  }

  static fromJSON(data) {
    return new MarketReserve(data || {});
  }
}
