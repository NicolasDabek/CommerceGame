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
  treasuryCap: 4000,       // au-delà, l'excédent est dépensé (détruit)
  procurementPrice: 0.9,   // commandes publiques à 90 % de la valeur normale
  procurementShare: 1,   // part de l'excédent dépensée chaque jour
  procurementMaxOffers: 10,
  subsidyShare: 0.5,       // part de l'excédent restant reversée aux marchands en difficulté
  subsidyBelow: 0.6,       // … ceux sous 60 % de leur capital de départ
  ceiling: 1.3,            // revend à 130 % de la valeur normale si rupture / trop cher
  floor: 0.75,             // rachète à 75 % de la valeur normale si bradé
  lot: 2,                  // quantité par intervention
  maxStockPerItem: 6,
  startStockPerItem: 2,
  buyBudgetShare: 0.12,    // part max de la trésorerie engagée par jour en rachats
  aidThreshold: 150,       // un PNJ sous ce capital reçoit une aide…
  aidAmount: 15,           // … de ce montant, payée par la trésorerie (pas créée)
  npcSalesTax: 0.03,       // taxe sur les ventes des PNJ
  npcListingFeeRate: 0.5   // les PNJ paient 50 % des frais de mise en vente du joueur
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

export class MarketReserve {
  constructor(saved = {}) {
    this.treasury = saved.treasury ?? RESERVE_TUNING.startTreasury;
    this.stock = saved.stock || this._starterStock();
    this.stats = {
      taxes: 0, fees: 0, production: 0, sold: 0, bought: 0, aid: 0, subsidies: 0, destroyed: 0, interventions: 0, procurement: 0, used: 0,
      ...(saved.stats || {})
    };
    this.lastActions = saved.lastActions || [];
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
        if (o.quantity > 0) this.treasury = round2(this.treasury + o.price * o.quantity);
      } else {
        if (o.currentBid != null && o.currentBidderId) return; // enchère en cours : elle ira à son terme
        this.addStock(o.itemId, o.quantity);
      }
      o.status = 'cancelled';
    });
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
    let budget = round2(this.treasury * t.buyBudgetShare);

    for (const item of ITEMS) {
      const fair = game.economy.getFairValue(item.id);
      const book = this._book(game.offers, item.id);
      const stock = this.stock[item.id] || 0;

      // Plafond : rupture ou prix trop haut → le comptoir revend un lot
      const ceilingPrice = round2(fair * t.ceiling);
      if (!book.citySell && stock > 0 && (book.bestSell == null || book.bestSell > ceilingPrice)) {
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
      }

      // Plancher : objet bradé → le comptoir rachète (soutient le prix et la trésorerie des vendeurs)
      const floorPrice = round2(fair * t.floor);
      const dumped = book.bestSell != null && book.bestSell < floorPrice;
      const glut = book.sellQty >= 8 && book.bestBuy == null;
      if (!book.cityBuy && (dumped || glut) && stock < t.maxStockPerItem) {
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
        }
      }
    }

    // Commandes publiques : la trésorerie excédentaire est réinjectée en achetant des marchandises
    // (au profit des producteurs), puis la ville les consomme.
    const excess = this.treasury - t.targetTreasury;
    if (excess > 0) {
      let procurementBudget = round2(excess * t.procurementShare);
      const active = new Set(game.offers.filter(o => o.status === 'active' && o.ownerId === RESERVE_ID && o.type === 'buy').map(o => o.itemId));
      const candidates = ITEMS
        .filter(item => !active.has(item.id))
        .map(item => {
          const book = this._book(game.offers, item.id);
          const consumable = item.category === 'Nourriture' || item.category === 'Ressources' ? 0.4 : 0;
          return { item, score: Math.random() * 0.5 + consumable + (book.sellQty > 0 ? 0.3 : 0) - (book.sellQty === 0 ? 0.6 : 0) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, t.procurementMaxOffers);
      for (const { item } of candidates) {
        const price = round2(game.economy.getFairValue(item.id) * t.procurementPrice);
        const qty = Math.min(4, Math.floor(procurementBudget / price));
        if (qty < 1) continue;
        const cost = round2(price * qty);
        this.treasury = round2(this.treasury - cost);
        procurementBudget = round2(procurementBudget - cost);
        const offer = new Offer({
          type: 'buy', itemId: item.id, quantity: qty, price,
          ownerId: RESERVE_ID, durationDays: 1, createdAt: now, msPerGameDay
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
    this.lastActions = actions.slice(-8).map(a => {
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
      lastActions: this.lastActions
    };
  }

  static fromJSON(data) {
    return new MarketReserve(data || {});
  }
}
