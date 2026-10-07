/**
 * TradingDesk — outils du négociant :
 *  - liste de suivi avec alertes de prix (sous un prix d'achat, au-dessus d'un prix de vente, pénurie) ;
 *  - ordres d'achat permanents (renouvelés chaque jour à l'hôtel d'achat) ;
 *  - journal de résultats (P&L) : achats, ventes, marge réalisée, atelier, contrats, stock latent.
 */

import { getItemById } from '../data/items.js';
import { Offer } from '../models/Offer.js';

const MAX_WATCH = 10;
const MAX_ALERTS = 30;
const MAX_DAYS = 30;

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export class TradingDesk {
  constructor(game, saved = {}) {
    this.game = game;
    this.watchlist = saved.watchlist || [];
    this.alerts = saved.alerts || [];
    this.alertState = saved.alertState || {};
    this.standingOrders = saved.standingOrders || [];
    const j = saved.journal || {};
    this.journal = {
      items: j.items || {},
      daily: j.daily || [],
      workshop: j.workshop || 0,
      jobIncome: j.jobIncome || 0,
      jobRealized: j.jobRealized || 0,
      fees: j.fees || 0
    };
    this._seq = saved.seq || 1;
    if (game && Array.isArray(game.tradeListeners)) {
      game.tradeListeners.push((tx) => this.onTransaction(tx));
    }
  }

  _day() {
    return this.game.timeManager?.getCurrentDay?.() ?? this.game.currentDay ?? 1;
  }

  _bucket() {
    const day = this._day();
    let b = this.journal.daily[this.journal.daily.length - 1];
    if (!b || b.day !== day) {
      b = { day, spent: 0, earned: 0, realized: 0, workshop: 0, jobs: 0, fees: 0 };
      this.journal.daily.push(b);
      if (this.journal.daily.length > MAX_DAYS) this.journal.daily.splice(0, this.journal.daily.length - MAX_DAYS);
    }
    return b;
  }

  _itemRow(itemId) {
    if (!this.journal.items[itemId]) this.journal.items[itemId] = { bought: 0, spent: 0, sold: 0, earned: 0, realized: 0 };
    return this.journal.items[itemId];
  }

  // ============================================
  // Journal
  // ============================================
  onTransaction(tx) {
    if (tx.buyerId === 'player') {
      const row = this._itemRow(tx.itemId);
      row.bought += tx.quantity;
      row.spent = r2(row.spent + tx.total);
      const b = this._bucket();
      b.spent = r2(b.spent + tx.total);
      const order = tx.buyOfferId ? this.standingOrders.find(o => o.offerIds?.includes(tx.buyOfferId) || o.lastOfferId === tx.buyOfferId) : null;
      if (order) {
        order.filledTotal += tx.quantity;
        order.spentTotal = r2(order.spentTotal + tx.total);
      }
    } else if (tx.sellerId === 'player') {
      const row = this._itemRow(tx.itemId);
      row.sold += tx.quantity;
      row.earned = r2(row.earned + tx.total);
      const margin = tx.playerMargin ?? 0;
      row.realized = r2(row.realized + margin);
      const b = this._bucket();
      b.earned = r2(b.earned + tx.total);
      b.realized = r2(b.realized + margin);
    }
  }

  recordWorkshopCost(amount) {
    const n = r2(amount);
    if (n <= 0) return;
    this.journal.workshop = r2(this.journal.workshop + n);
    const b = this._bucket();
    b.workshop = r2(b.workshop + n);
  }

  recordFee(amount) {
    const n = r2(amount);
    if (n <= 0) return;
    this.journal.fees = r2(this.journal.fees + n);
    const b = this._bucket();
    b.fees = r2(b.fees + n);
  }

  /** Revenus des contrats, commandes et services (marge = paiement − coût d'achat des objets livrés). */
  recordJob({ kind, itemId, quantity, amount, costBasis }) {
    const n = r2(amount);
    this.journal.jobIncome = r2(this.journal.jobIncome + n);
    const realized = r2(n - (costBasis || 0));
    this.journal.jobRealized = r2(this.journal.jobRealized + realized);
    const b = this._bucket();
    b.jobs = r2(b.jobs + realized);
    if (itemId && (kind === 'contract' || kind === 'npcOrder')) {
      const row = this._itemRow(itemId);
      row.sold += quantity || 0;
      row.earned = r2(row.earned + n);
    }
  }

  // ============================================
  // Liste de suivi & alertes
  // ============================================
  isWatched(itemId) {
    return this.watchlist.some(w => w.itemId === itemId);
  }

  toggleWatch(itemId) {
    const idx = this.watchlist.findIndex(w => w.itemId === itemId);
    if (idx >= 0) {
      this.watchlist.splice(idx, 1);
      delete this.alertState[itemId];
      this.game.save();
      return { success: true, watched: false };
    }
    if (!getItemById(itemId)) return { success: false, error: 'Objet inconnu' };
    if (this.watchlist.length >= MAX_WATCH) return { success: false, error: `Liste de suivi pleine (${MAX_WATCH} objets)` };
    const fair = this.game.economy.getFairValue(itemId);
    this.watchlist.push({ itemId, alertBelow: null, alertAbove: null, refPrice: fair, addedDay: this._day() });
    this.game.save();
    return { success: true, watched: true };
  }

  setAlert(itemId, alertBelow, alertAbove) {
    const w = this.watchlist.find(x => x.itemId === itemId);
    if (!w) return { success: false, error: 'Objet non suivi' };
    const parse = (v) => {
      const n = Number(String(v ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? r2(n) : null;
    };
    w.alertBelow = parse(alertBelow);
    w.alertAbove = parse(alertAbove);
    this.alertState[itemId] = {};
    this.checkAlerts();
    this.game.save();
    return { success: true };
  }

  _book(itemId) {
    let bestSell = null;
    let bestBuy = null;
    (this.game.offers || []).forEach(o => {
      if (o.status !== 'active' || o.itemId !== itemId || o.ownerId === 'player') return;
      if (o.type === 'sell') {
        const ask = o.buyoutPrice != null ? o.buyoutPrice : (o.currentBid ?? o.price);
        if (bestSell == null || ask < bestSell) bestSell = ask;
      } else if (o.type === 'buy') {
        if (bestBuy == null || o.price > bestBuy) bestBuy = o.price;
      }
    });
    return { bestSell, bestBuy };
  }

  _pushAlert(itemId, kind, text, price = null) {
    this.alerts.unshift({ id: `al_${this._seq++}`, itemId, kind, text, price, day: this._day(), read: false });
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
    this.game.uiCallbacks?.onStatus?.(`🔔 ${text}`);
  }

  /** Alertes déclenchées au franchissement (une seule fois tant que la condition reste vraie). */
  checkAlerts() {
    let fired = 0;
    const fmt = (n) => Number(n).toFixed(2).replace('.', ',');
    this.watchlist.forEach(w => {
      const item = getItemById(w.itemId);
      if (!item) return;
      const st = this.alertState[w.itemId] || (this.alertState[w.itemId] = {});
      const { bestSell, bestBuy } = this._book(w.itemId);
      const below = w.alertBelow != null && bestSell != null && bestSell <= w.alertBelow;
      if (below && !st.below) { this._pushAlert(w.itemId, 'below', `${item.icon} ${item.name} à ${fmt(bestSell)} € (seuil d'achat ${fmt(w.alertBelow)} €)`, bestSell); fired++; }
      st.below = below;
      const above = w.alertAbove != null && bestBuy != null && bestBuy >= w.alertAbove;
      if (above && !st.above) { this._pushAlert(w.itemId, 'above', `${item.icon} Offre d'achat ${item.name} à ${fmt(bestBuy)} € (seuil de vente ${fmt(w.alertAbove)} €)`, bestBuy); fired++; }
      st.above = above;
      const view = this.game.getSupplyView?.(w.itemId);
      const short = view?.status === 'shortage';
      if (short && !st.short) { this._pushAlert(w.itemId, 'shortage', `${item.icon} Pénurie de ${item.name} : les prix vont monter`); fired++; }
      st.short = short;
    });
    return fired;
  }

  markAlertsRead() {
    this.alerts.forEach(a => { a.read = true; });
    this.game.save();
  }

  unreadCount() {
    return this.alerts.filter(a => !a.read).length;
  }

  // ============================================
  // Ordres d'achat permanents
  // ============================================
  slots() {
    return this.game.jobBoard?.standingOrderSlots?.() ?? 2;
  }

  addStandingOrder({ itemId, price, quantity, minQuality = 0 }) {
    const item = getItemById(itemId);
    const p = r2(Number(String(price).replace(',', '.')));
    const q = Math.floor(Number(quantity));
    if (!item) return { success: false, error: 'Objet inconnu' };
    if (!(p > 0) || !(q > 0)) return { success: false, error: 'Prix et quantité requis' };
    if (q > 10) return { success: false, error: '10 unités par jour maximum' };
    const active = this.standingOrders.filter(o => o.active).length;
    if (active >= this.slots()) return { success: false, error: `Tous vos ordres permanents sont utilisés (${this.slots()}) — montez le métier Négociant` };
    const order = {
      id: `so_${this._seq++}`,
      itemId, price: p, quantity: q, minQuality: Math.max(0, Math.min(90, Number(minQuality) || 0)),
      active: true, filledTotal: 0, spentTotal: 0,
      lastOfferId: null, offerIds: [], lastRenewDay: 0, lastError: null, createdDay: this._day()
    };
    this.standingOrders.push(order);
    this.renewOrders();
    this.game.save();
    return { success: true, order };
  }

  toggleStandingOrder(id) {
    const o = this.standingOrders.find(x => x.id === id);
    if (!o) return { success: false, error: 'Ordre introuvable' };
    if (!o.active && this.standingOrders.filter(x => x.active).length >= this.slots()) {
      return { success: false, error: 'Plus de place pour un ordre actif' };
    }
    o.active = !o.active;
    if (!o.active) this._cancelLive(o);
    else { o.lastRenewDay = 0; this.renewOrders(); }
    this.game.save();
    return { success: true, active: o.active };
  }

  removeStandingOrder(id) {
    const idx = this.standingOrders.findIndex(x => x.id === id);
    if (idx < 0) return { success: false, error: 'Ordre introuvable' };
    this._cancelLive(this.standingOrders[idx]);
    this.standingOrders.splice(idx, 1);
    this.game.save();
    return { success: true };
  }

  _liveOffer(o) {
    return o.lastOfferId ? (this.game.offers || []).find(x => x.id === o.lastOfferId && x.status === 'active') : null;
  }

  _cancelLive(o) {
    const live = this._liveOffer(o);
    if (live) this.game.cancelOffer(live.id);
  }

  /** Place l'offre du jour pour chaque ordre actif sans offre en cours. */
  renewOrders() {
    const day = this._day();
    let placed = 0;
    this.standingOrders.forEach(o => {
      if (!o.active || this._liveOffer(o) || o.lastRenewDay === day) return;
      const res = this.game.createBuyOffer({ itemId: o.itemId, quantity: o.quantity, price: o.price, minQuality: o.minQuality, durationDays: 1, autoMatch: true });
      o.lastRenewDay = day;
      if (!res.success) { o.lastError = res.error; return; }
      o.lastError = null;
      o.lastOfferId = res.offer.id;
      o.offerIds = [...(o.offerIds || []).slice(-5), res.offer.id];
      // Transactions immédiates (autoMatch) déjà passées avant l'enregistrement de l'id
      (this.game.transactions || []).forEach(tx => {
        if (tx.buyOfferId === res.offer.id && tx.buyerId === 'player' && !tx.__so) {
          tx.__so = true;
          o.filledTotal += tx.quantity;
          o.spentTotal = r2(o.spentTotal + tx.total);
        }
      });
      placed++;
    });
    return placed;
  }

  tick() {
    this.renewOrders();
    this.checkAlerts();
  }

  // ============================================
  // Vue
  // ============================================
  getView() {
    const game = this.game;
    const watch = this.watchlist.map(w => {
      const item = getItemById(w.itemId);
      const { bestSell, bestBuy } = this._book(w.itemId);
      const fair = game.economy.getFairValue(w.itemId);
      const supply = game.getSupplyView?.(w.itemId) || null;
      return {
        ...w, item, bestSell, bestBuy, fair,
        changePct: w.refPrice ? Math.round((fair - w.refPrice) / w.refPrice * 1000) / 10 : 0,
        trend: game.economy.getTrend?.(w.itemId) || 'stable',
        supply,
        dealPct: bestSell != null && fair > 0 ? Math.round((fair - bestSell) / fair * 100) : null
      };
    });
    const orders = this.standingOrders.map(o => {
      const item = getItemById(o.itemId);
      const live = this._liveOffer(o);
      const fair = game.economy.getFairValue(o.itemId);
      return {
        ...o, item, fair,
        live: live ? { quantity: live.quantity, expiresAt: live.expiresAt } : null,
        avgPrice: o.filledTotal ? r2(o.spentTotal / o.filledTotal) : null,
        vsFairPct: fair > 0 ? Math.round((o.price - fair) / fair * 100) : 0,
        dailyFee: Offer.calculateListingFee(o.price, o.quantity, 1),
        locked: r2(o.price * o.quantity)
      };
    });
    // Journal : lignes par objet + stock latent (valeur de marché − coût d'achat)
    const inv = game.player.inventory;
    const itemIds = new Set([...Object.keys(this.journal.items), ...inv.items.map(s => s.itemId)]);
    let unrealized = 0;
    const rows = [...itemIds].map(itemId => {
      const j = this.journal.items[itemId] || { bought: 0, spent: 0, sold: 0, earned: 0, realized: 0 };
      const stacks = inv.getStacks(itemId);
      const held = stacks.reduce((t, s) => t + s.quantity, 0);
      let latent = 0;
      let known = false;
      stacks.forEach(s => {
        if (s.avgBuyPrice == null) return;
        known = true;
        latent += (game.getAdjustedMarketPrice(itemId, s.quality, s.perfection) - s.avgBuyPrice) * s.quantity;
      });
      unrealized += latent;
      return { itemId, item: getItemById(itemId), ...j, held, unrealized: known ? r2(latent) : null };
    }).filter(r => r.item && (r.bought || r.sold || r.held))
      .sort((a, b) => Math.abs(b.realized) + Math.abs(b.unrealized || 0) - Math.abs(a.realized) - Math.abs(a.unrealized || 0));
    const realized = r2(Object.values(this.journal.items).reduce((t, r) => t + r.realized, 0));
    const net = r2(realized + this.journal.jobRealized - this.journal.workshop - this.journal.fees);
    return {
      watch,
      watchMax: MAX_WATCH,
      alerts: this.alerts.slice(0, 12).map(a => ({ ...a, item: getItemById(a.itemId) })),
      unread: this.unreadCount(),
      orders,
      orderSlots: this.slots(),
      activeOrders: this.standingOrders.filter(o => o.active).length,
      journal: {
        rows,
        realized,
        unrealized: r2(unrealized),
        jobIncome: this.journal.jobIncome,
        jobRealized: this.journal.jobRealized,
        workshop: this.journal.workshop,
        fees: this.journal.fees,
        net,
        daily: this.journal.daily.slice(-14).map(d => ({ ...d, net: r2(d.realized + d.jobs - d.workshop - d.fees) }))
      }
    };
  }

  toJSON() {
    return {
      watchlist: this.watchlist,
      alerts: this.alerts,
      alertState: this.alertState,
      standingOrders: this.standingOrders,
      journal: this.journal,
      seq: this._seq
    };
  }
}
