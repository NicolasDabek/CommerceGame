/**
 * NPCController — IA des 15 PNJ
 * Chaque PNJ raisonne à partir d'un « prix de référence » (moyenne du marché mêlée à la valeur
 * normale), de son stock cible, de sa trésorerie, de sa personnalité et de son clan.
 * Garde-fous : prix d'annonce bornés, achats plafonnés, budget d'actions quotidien, délais par objet.
 */

import { NPCS, getClanById } from '../data/npcs.js';
import { ITEMS, getItemById } from '../data/items.js';
import { Offer } from '../models/Offer.js';

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
  listingFeeRate: 0.5,       // les PNJ paient la moitié des frais du joueur
  actionBase: 4,             // budget d'actions par jour : 4 + agressivité × 6
  actionAggr: 6,
  cooldownDays: 0.5          // délai avant de remettre en vente un objet retiré
};

function round2(n) {
  return Math.round(n * 100) / 100;
}
function eur(n) {
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function rand(min, max) {
  return min + Math.random() * (max - min);
}

export class NPCController {
  constructor(options = {}) {
    this.getOffers = options.getOffers || (() => []);
    this.addOffer = options.addOffer || (() => {});
    this.runMatching = options.runMatching || (() => {});
    this.getAveragePrice = options.getAveragePrice || ((id) => {
      const item = getItemById(id);
      return item ? item.basePrice : 10;
    });
    this.getFairPrice = options.getFairPrice || ((id) => this.getAveragePrice(id));
    this.onNpcSpend = options.onNpcSpend || (() => {});
    this.executeBuyout = options.executeBuyout || (() => null);
    this.executeFulfill = options.executeFulfill || (() => null);
    this.executeBid = options.executeBid || (() => null);
    this.executeCancel = options.executeCancel || null;
    this.getNow = options.getNow || (() => Date.now());
    this.getMsPerGameDay = options.getMsPerGameDay || (() => 24 * 60 * 60 * 1000);
    this.getPlayerAlliance = options.getPlayerAlliance || (() => null);
    this._bookCache = null;
    this.npcStates = {};
    NPCS.forEach(npc => { this.npcStates[npc.id] = this._freshState(npc); });
  }

  /* ============ État ============ */

  _freshState(npc) {
    return {
      capital: npc.capital, inventory: this._generateStarterInventory(npc),
      lastActionAt: 0, lastIntent: null, lastReason: null, mood: 0, rivalry: 0,
      focusItemId: null, focusUntil: 0, lossesVsPlayer: 0, winsVsPlayer: 0, dayHint: 0,
      trust: 0, actionsToday: 0, cooldowns: {}, journal: [], produced: 0, consumed: 0
    };
  }

  _ensureState(npc) {
    const state = this.npcStates[npc.id];
    if (!state) return null;
    if (state.trust == null) state.trust = 0;
    if (state.actionsToday == null) state.actionsToday = 0;
    if (!state.cooldowns) state.cooldowns = {};
    if (!Array.isArray(state.journal)) state.journal = [];
    if (state.lastReason === undefined) state.lastReason = null;
    if (!Array.isArray(state.inventory)) state.inventory = [];
    return state;
  }

  _generateStarterInventory(npc) {
    const inv = [];
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length > 0 ? preferred : ITEMS;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      inv.push({ itemId: item.id, quantity: 1 + Math.floor(Math.random() * 5), quality: 40 + Math.floor(Math.random() * 50), perfection: 30 + Math.floor(Math.random() * 50) });
    }
    return inv;
  }

  profileOf(npc) {
    return PERSONALITY_PROFILES[npc.personality] || PERSONALITY_PROFILES.opportuniste;
  }

  _reserveRatio(npc) { return this.profileOf(npc).reserve; }
  _spendable(npc, state) { return Math.max(0, state.capital * (1 - this._reserveRatio(npc))); }
  actionBudget(npc) { return NPC_TUNING.actionBase + Math.round(npc.aggressiveness * NPC_TUNING.actionAggr); }
  stockTarget(npc) { return this.profileOf(npc).stockTarget; }
  _stockQty(state) { return state.inventory.reduce((s, sl) => s + sl.quantity, 0); }
  _qtyOf(state, itemId) { return state.inventory.filter(s => s.itemId === itemId).reduce((s, sl) => s + sl.quantity, 0); }
  _isPreferred(npc, item) { return !!item && npc.preferredCategories.includes(item.category); }

  capitalState(npc, state) {
    const r = state.capital / Math.max(1, npc.capital);
    if (r < 0.25) return { id: 'dry', label: 'À sec' };
    if (r < 0.6) return { id: 'tight', label: 'Trésorerie serrée' };
    if (r < 1.5) return { id: 'ok', label: 'Trésorerie saine' };
    return { id: 'rich', label: 'Très à l\'aise' };
  }

  _overstocked(npc, state) { return this._stockQty(state) > this.stockTarget(npc) * 1.5; }

  /* ============ Lecture du marché ============ */

  /** Prix de référence : mélange moyenne du marché / valeur normale, ajusté à l'état de l'objet. */
  refPrice(itemId, quality = 50, perfection = 50) {
    const w = NPC_TUNING.refAverageWeight;
    const avg = this.getAveragePrice(itemId);
    const fair = this.getFairPrice(itemId);
    return this._conditionPrice(avg * w + fair * (1 - w), quality, perfection);
  }

  _buildBooks() {
    const books = {};
    for (const o of this.getOffers()) {
      if (o.status !== 'active') continue;
      let b = books[o.itemId];
      if (!b) {
        b = books[o.itemId] = { bestSell: null, bestAsk: null, bestBuy: null, sellQty: 0, buyQty: 0, sellers: [], bestSellerId: null };
      }
      if (o.type === 'sell') {
        const going = o.currentBid != null ? o.currentBid : o.price;
        if (b.bestSell == null || going < b.bestSell) { b.bestSell = going; b.bestSellerId = o.ownerId; }
        const ask = o.buyoutPrice != null ? o.buyoutPrice : going;
        b.bestAsk = b.bestAsk == null ? ask : Math.min(b.bestAsk, ask);
        b.sellQty += o.quantity;
        b.sellers.push(o.ownerId);
      } else {
        b.bestBuy = b.bestBuy == null ? o.price : Math.max(b.bestBuy, o.price);
        b.buyQty += o.quantity;
      }
    }
    return books;
  }

  _book(itemId) {
    if (!this._bookCache) this._bookCache = this._buildBooks();
    const b = this._bookCache[itemId] || { bestSell: null, bestAsk: null, bestBuy: null, sellQty: 0, buyQty: 0, sellers: [], bestSellerId: null };
    return { ...b, spread: b.bestSell != null && b.bestBuy != null ? b.bestSell - b.bestBuy : null };
  }

  _invalidateBooks() { this._bookCache = null; }

  /** Pénurie / surplus perçus sur un objet. */
  marketSignal(itemId) {
    const book = this._book(itemId);
    const fair = this.getFairPrice(itemId);
    const shortage = book.sellQty === 0 || book.buyQty > book.sellQty * 1.5;
    const surplus = book.sellQty >= 6 || (book.bestSell != null && fair > 0 && book.bestSell < fair * 0.85);
    return { book, fair, shortage: shortage && !surplus, surplus };
  }

  _isRival(npc, ownerId) {
    if (!ownerId || ownerId === npc.id) return false;
    const other = NPCS.find(n => n.id === ownerId);
    const clan = getClanById(npc.clanId);
    return !!(other && clan && clan.rivalId === other.clanId);
  }

  /* ============ Journée ============ */

  onNewDay(day) {
    this._invalidateBooks();
    NPCS.forEach(npc => {
      const state = this._ensureState(npc);
      if (!state) return;
      state.dayHint = day;
      state.actionsToday = 0;
      state.mood = Math.max(-1, Math.min(1, state.mood * 0.72));
      state.trust = Math.max(-1, Math.min(1, state.trust * 0.97));
      if (state.capital < npc.capital * 0.12) state.mood = Math.max(-1, state.mood - 0.15);
      this._consume(npc, state);
      this._produce(npc, state);
      this._pickFocus(npc, state);
    });
  }

  /** Les PNJ utilisent / revendent hors marché une partie de leur stock (crée de la demande). */
  _consume(npc, state) {
    const over = this._overstocked(npc, state);
    let consumed = 0;
    state.inventory.forEach(slot => {
      const item = getItemById(slot.itemId);
      let rate = item?.category === 'Nourriture' ? 0.22 : item?.category === 'Vêtements' ? 0.05 : 0.035;
      if (over) rate *= 1.6;
      const n = Math.min(slot.quantity, Math.floor(slot.quantity * rate + Math.random()));
      slot.quantity -= n;
      consumed += n;
    });
    state.inventory = state.inventory.filter(s => s.quantity > 0);
    state.consumed = (state.consumed || 0) + consumed;
    return consumed;
  }

  /** Fabrication / approvisionnement quand le stock est sous la cible (coût payé au Comptoir). */
  _produce(npc, state) {
    const profile = this.profileOf(npc);
    const target = this.stockTarget(npc);
    const stock = this._stockQty(state);
    if (stock >= target * 0.7) return 0;
    const maxUnits = profile.producer ? 3 : 1;
    const units = Math.min(maxUnits, target - stock);
    const pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (!pool.length || units <= 0) return 0;
    const weighted = pool.map(item => {
      const sig = this.marketSignal(item.id);
      return { item, w: (sig.shortage ? 3 : 1) * (sig.surplus ? 0.3 : 1) * (1 / Math.sqrt(item.basePrice)) };
    });
    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * totalW;
    let item = weighted[0].item;
    for (const x of weighted) { r -= x.w; if (r <= 0) { item = x.item; break; } }
    const costRatio = profile.producer ? NPC_TUNING.producerCost : NPC_TUNING.productionCost;
    const unitCost = round2(this.getFairPrice(item.id) * costRatio);
    const affordable = Math.floor((state.capital * (1 - profile.reserve)) / Math.max(0.01, unitCost));
    const qty = Math.min(units, affordable);
    if (qty < 1) return 0;
    const cost = round2(unitCost * qty);
    state.capital = round2(state.capital - cost);
    this.onNpcSpend(npc.id, cost, 'production');
    const quality = Math.round(rand(40, profile.producer ? 88 : 75));
    const perfection = Math.round(rand(35, 80));
    this.giveItemToNpc(npc.id, item.id, qty, quality, perfection);
    state.produced = (state.produced || 0) + qty;
    this._remember(state, `${profile.producer ? 'Fabrique' : 'Se réapprovisionne'} ${item.icon} ×${qty}`);
    return qty;
  }

  _pickFocus(npc, state) {
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length ? preferred : ITEMS;
    if (!pool.length) return;
    const scored = pool.map(item => {
      const sig = this.marketSignal(item.id);
      let s = Math.random() * 0.3;
      if (sig.book.spread != null && sig.book.spread > sig.fair * 0.08) s += 0.4;
      if (sig.shortage) s += 0.2;
      if (sig.book.bestSell != null && sig.book.bestSell < sig.fair * 0.9) s += 0.25;
      return { item, s };
    }).sort((a, b) => b.s - a.s);
    state.focusItemId = scored[0].item.id;
    state.focusUntil = this.getNow() + this.getMsPerGameDay() * (1 + Math.floor(Math.random() * 2));
  }

  /* ============ Relations ============ */

  notePlayerDeal(npcId, wonAgainstPlayer) {
    const state = this.npcStates[npcId];
    if (!state) return;
    if (wonAgainstPlayer) { state.winsVsPlayer += 1; state.mood = Math.min(1, state.mood + 0.12); state.rivalry = Math.min(1, state.rivalry + 0.08); }
    else { state.lossesVsPlayer += 1; state.mood = Math.max(-1, state.mood - 0.1); state.rivalry = Math.min(1, state.rivalry + 0.16); }
  }

  /**
   * Confiance envers le joueur après un échange direct.
   * @param {number} deltaPct écart du prix au prix moyen (positif = cher)
   * @param {boolean} npcIsSeller
   */
  noteTradeWithPlayer(npcId, deltaPct = 0, npcIsSeller = true) {
    const state = this.npcStates[npcId];
    if (!state) return;
    const favorable = npcIsSeller ? deltaPct >= -5 : deltaPct <= 5;
    const change = favorable ? 0.06 : 0.02;
    state.trust = Math.max(-1, Math.min(1, (state.trust || 0) + change));
  }

  /* ============ Boucle ============ */

  tick(now = Date.now()) {
    const actions = [];
    this._invalidateBooks();
    NPCS.forEach(npc => {
      const state = this._ensureState(npc);
      if (!state) return;
      if (state.focusItemId && now > state.focusUntil) this._pickFocus(npc, state);
      if (state.actionsToday >= this.actionBudget(npc)) return;
      const minDelay = 4200 + (1 - npc.aggressiveness) * 16000;
      if (now - state.lastActionAt < minDelay) return;
      const actChance = npc.aggressiveness * 0.82 + 0.16 + Math.max(0, state.mood) * 0.08;
      if (Math.random() > actChance) return;
      const result = this._chooseAndAct(npc, state, now);
      if (result) {
        state.lastActionAt = now;
        state.actionsToday += 1;
        state.lastIntent = result.intent || this._intentLabel(result, state);
        state.lastReason = result.reason || null;
        this._remember(state, state.lastIntent);
        this._invalidateBooks();
        actions.push(result);
      }
    });
    return actions;
  }

  _remember(state, text) {
    if (!text) return;
    state.journal.push(text);
    if (state.journal.length > 5) state.journal.splice(0, state.journal.length - 5);
  }

  _intentLabel(result, state) {
    const moodTxt = state.mood > 0.35 ? 'confiant' : state.mood < -0.35 ? 'tendu' : 'calme';
    switch (result.type) {
      case 'bid': return `Enchère ${eur(result.amount)} € (${moodTxt})`;
      case 'buyout': return `Achat immédiat ×${result.quantity}`;
      case 'fulfill': return 'Vend sur une offre d\'achat';
      case 'sell': return 'Met en vente';
      case 'buy': return 'Poste une offre d\'achat';
      case 'cancel': return 'Retire une offre mal placée';
      case 'snipe': return `Snipe ${eur(result.amount)} €`;
      default: return result.type;
    }
  }

  _pctTxt(ratio) {
    const pct = Math.round((ratio - 1) * 100);
    if (pct === 0) return 'au prix normal';
    return pct > 0 ? `${pct} % au-dessus du prix normal` : `${-pct} % sous le prix normal`;
  }

  _chooseAndAct(npc, state, now) {
    const offers = this.getOffers().filter(o => o.status === 'active');
    const stockQty = this._stockQty(state);
    const ownSells = offers.filter(o => o.ownerId === npc.id && o.type === 'sell');
    const ownBuys = offers.filter(o => o.ownerId === npc.id && o.type === 'buy');
    const cash = this._spendable(npc, state);
    const target = this.stockTarget(npc);
    const cancel = this._tryCancelStale(npc, state, ownSells, ownBuys, now);
    if (cancel) return cancel;
    const scored = [];
    const tryPush = (type, score, fn) => { if (score > 0) scored.push({ type, score, fn }); };
    const roomToBuy = stockQty < target * 1.6;
    tryPush('buyout', cash > 8 ? this._scoreBuyout(npc, state, offers, roomToBuy) : 0, () => this._tryBuyout(npc, state));
    tryPush('bid', cash > 8 && roomToBuy ? this._scoreBid(npc, state, offers, now) : 0, () => this._tryBid(npc, state, now));
    tryPush('fulfill', stockQty > 0 ? this._scoreFulfill(npc, state, offers) : 0, () => this._tryFulfillBuy(npc, state));
    tryPush('sell', stockQty > 0 && ownSells.length < this._maxListings(npc) ? this._scoreSell(npc, state, stockQty) : 0, () => this._trySell(npc, state));
    tryPush('buy', cash > 15 && ownBuys.length < 2 && stockQty < target ? this._scoreRestock(npc, state, stockQty) : 0, () => this._tryBuy(npc, state));
    if (npc.personality === 'épicier') this._bump(scored, 'sell', 0.22);
    if (npc.personality === 'collectionneur') this._bump(scored, 'bid', 0.2);
    if (npc.personality === 'agressif') this._bump(scored, 'buyout', 0.16);
    if (npc.personality === 'artisan') this._bump(scored, 'buy', 0.14);
    if (npc.personality === 'opportuniste') this._bump(scored, 'bid', 0.1);
    if (state.rivalry > 0.4) this._bump(scored, 'bid', 0.14);
    if (stockQty > target * 1.3) this._bump(scored, 'sell', 0.25);
    if (stockQty < target * 0.4) this._bump(scored, 'buy', 0.16);
    if (this.capitalState(npc, state).id === 'dry') { this._bump(scored, 'sell', 0.3); this._bump(scored, 'fulfill', 0.3); }
    scored.sort((a, b) => b.score - a.score);
    for (const option of scored) { const result = option.fn(); if (result) return result; }
    return null;
  }

  _bump(scored, type, add) { const row = scored.find(s => s.type === type); if (row) row.score += add; }
  _maxListings(npc) { return (npc.personality === 'épicier' || npc.personality === 'agressif') ? 4 : 3; }
  _scoreSell(npc, state, stockQty) { return 0.28 + (stockQty > this.stockTarget(npc) ? 0.28 : 0) + (state.capital < 40 ? 0.2 : 0); }
  _scoreRestock(npc, state, stockQty) { return 0.24 + (stockQty < 3 ? 0.22 : 0) + (state.focusItemId ? 0.1 : 0); }
  _timeLeftRatio(offer, now) {
    if (!offer.expiresAt) return 1;
    const total = offer.expiresAt - (offer.createdAt || now);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, (offer.expiresAt - now) / total));
  }

  /** Prix max qu'un PNJ accepte de payer (ratio du prix de référence). */
  maxBuyRatio(npc, state, item) {
    const profile = this.profileOf(npc);
    const preferred = this._isPreferred(npc, item);
    let cap = preferred ? profile.maxBuyPref : profile.maxBuy;
    if (item && item.id === state.focusItemId) cap += 0.04;
    if (item && preferred && this._qtyOf(state, item.id) === 0) cap += 0.03;
    cap += state.mood * 0.03;
    const hardCap = npc.personality === 'collectionneur' && preferred ? NPC_TUNING.collectorCap : NPC_TUNING.buyCapMax;
    return Math.min(hardCap, cap);
  }

  _scoreBuyout(npc, state, offers, roomToBuy) {
    let best = 0;
    for (const o of offers) {
      if (o.type !== 'sell' || !o.buyoutPrice || o.ownerId === npc.id) continue;
      const item = getItemById(o.itemId);
      const ref = this.refPrice(o.itemId, o.quality, o.perfection);
      const ratio = ref > 0 ? o.buyoutPrice / ref : 2;
      const cap = this.maxBuyRatio(npc, state, item);
      if (ratio > cap) continue;
      if (!roomToBuy && ratio > 0.8) continue;
      let s = 1.12 - ratio;
      if (this._isPreferred(npc, item)) s += 0.25;
      if (o.itemId === state.focusItemId) s += 0.18;
      if (o.ownerId === 'player') s += 0.06 + state.rivalry * 0.1;
      if (o.quality >= 80) s += 0.08;
      best = Math.max(best, s);
    }
    return best;
  }

  _scoreBid(npc, state, offers, now) {
    let best = 0;
    for (const o of offers) {
      if (o.type !== 'sell' || o.ownerId === npc.id || o.currentBidderId === npc.id) continue;
      const item = getItemById(o.itemId);
      const ref = this.refPrice(o.itemId, o.quality, o.perfection);
      const minBid = typeof o.minNextBid === 'function' ? o.minNextBid() : o.price;
      const ratio = ref > 0 ? minBid / ref : 2;
      if (ratio > this.maxBuyRatio(npc, state, item) - 0.03) continue;
      let s = 1.08 - ratio;
      if (this._isPreferred(npc, item)) s += 0.22;
      if (o.itemId === state.focusItemId) s += 0.16;
      if (o.currentBidderId === 'player') s += 0.14 + state.rivalry * 0.18;
      if (this._timeLeftRatio(o, now) < 0.18) s += 0.28;
      best = Math.max(best, s);
    }
    return best;
  }

  _sellThreshold(npc, state, slot, buyerId) {
    const profile = this.profileOf(npc);
    const item = getItemById(slot.itemId);
    const preferred = this._isPreferred(npc, item);
    let threshold = profile.minSell;
    if (npc.personality === 'collectionneur' && preferred) threshold = 1.12;
    if (preferred && this._qtyOf(state, slot.itemId) <= 2 && !this._overstocked(npc, state)) threshold = Math.max(threshold, 1.06);
    if (this.capitalState(npc, state).id === 'dry') threshold *= 0.85;
    if (this._overstocked(npc, state)) threshold *= 0.92;
    if (buyerId === 'player') threshold *= 1 - (state.trust || 0) * 0.05;
    const ally = this.getPlayerAlliance?.();
    if (buyerId === 'player' && ally && ally === npc.clanId) threshold *= 0.97;
    return threshold;
  }

  _scoreFulfill(npc, state, offers) {
    let best = 0;
    const buys = offers.filter(o => o.type === 'buy' && o.ownerId !== npc.id);
    for (const slot of state.inventory) {
      const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
      for (const buy of buys) {
        if (buy.itemId !== slot.itemId) continue;
        if ((slot.quality ?? 50) < (buy.minQuality ?? 0) || (slot.perfection ?? 50) < (buy.minPerfection ?? 0)) continue;
        const ratio = ref > 0 ? buy.price / ref : 0;
        const threshold = this._sellThreshold(npc, state, slot, buy.ownerId);
        if (ratio < threshold) continue;
        best = Math.max(best, ratio - threshold + 0.35);
      }
    }
    return best;
  }

  _tryCancelStale(npc, state, ownSells, ownBuys, now) {
    if (Math.random() > 0.35) return null;
    if (this.executeCancel) {
      for (const offer of ownSells) {
        if (offer.currentBidderId) continue;
        const ref = this.refPrice(offer.itemId, offer.quality, offer.perfection);
        if (ref > 0 && offer.price > ref * 1.3 && this._timeLeftRatio(offer, now) < 0.55) {
          const ok = this.executeCancel(offer, npc.id);
          if (ok && ok.success) {
            this.giveItemToNpc(npc.id, offer.itemId, offer.quantity, offer.quality, offer.perfection);
            state.cooldowns[offer.itemId] = now + this.getMsPerGameDay() * NPC_TUNING.cooldownDays;
            const item = getItemById(offer.itemId);
            return { type: 'cancel', npcId: npc.id, offer, intent: `Retire ${item?.icon || ''} (trop cher)`.trim(), reason: `Annonce ${this._pctTxt(offer.price / ref)} : personne n'achète.` };
          }
        }
      }
    }
    // Offre d'achat devenue trop généreuse après une baisse du marché → récupère son argent
    for (const offer of ownBuys) {
      const ref = this.refPrice(offer.itemId);
      if (ref > 0 && offer.price > ref * 1.2 && offer.quantity > 0) {
        offer.status = 'cancelled';
        this.creditNpc(npc.id, round2(offer.price * offer.quantity));
        const item = getItemById(offer.itemId);
        return { type: 'cancel', npcId: npc.id, offer, intent: `Retire son offre ${item?.icon || ''}`.trim(), reason: `Offre d'achat ${this._pctTxt(offer.price / ref)} : le marché a baissé.` };
      }
    }
    return null;
  }

  _tryBid(npc, state, now = this.getNow()) {
    const spendable = this._spendable(npc, state);
    if (spendable < 8) return null;
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.ownerId !== npc.id && o.currentBidderId !== npc.id && o.quantity > 0);
    if (sellOffers.length === 0) return null;
    const candidates = [];
    for (const offer of sellOffers) {
      const item = getItemById(offer.itemId);
      const ref = this.refPrice(offer.itemId, offer.quality, offer.perfection);
      const preferred = this._isPreferred(npc, item);
      const focused = offer.itemId === state.focusItemId;
      const step = typeof offer.bidStep === 'function' ? offer.bidStep() : 0.01;
      const minBid = typeof offer.minNextBid === 'function' ? offer.minNextBid() : offer.price;
      if (offer.buyoutPrice != null && minBid >= offer.buyoutPrice) continue;
      const vsPlayer = offer.currentBidderId === 'player';
      let capRatio = this.maxBuyRatio(npc, state, item) - 0.03;
      if (vsPlayer) capRatio = Math.min(NPC_TUNING.buyCapMax, capRatio + 0.03 + state.rivalry * 0.05);
      const maxWilling = round2(ref * capRatio);
      if (minBid > maxWilling) continue;
      let bid = minBid;
      const ending = this._timeLeftRatio(offer, now) < 0.16;
      const extraRoll = (npc.personality === 'agressif' || npc.personality === 'opportuniste' || vsPlayer || ending);
      if (extraRoll && Math.random() < (ending ? 0.8 : 0.5)) {
        const extra = step * (vsPlayer || ending ? 2 : 1);
        const bumped = round2(minBid + extra);
        if (bumped <= maxWilling && (offer.buyoutPrice == null || bumped < offer.buyoutPrice)) bid = bumped;
      }
      if (typeof offer.canBidAmount === 'function' && !offer.canBidAmount(bid).ok) continue;
      const total = round2(bid * offer.quantity);
      if (spendable < total) continue;
      candidates.push({ offer, item, ref, bid, total, dealRatio: ref > 0 ? bid / ref : 1, preferred, vsPlayer, ending, focused });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.ending !== b.ending) return a.ending ? -1 : 1;
      if (a.vsPlayer !== b.vsPlayer) return a.vsPlayer ? -1 : 1;
      if (a.focused !== b.focused) return a.focused ? -1 : 1;
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
      return a.dealRatio - b.dealRatio;
    });
    const pick = candidates[0];
    const result = this.executeBid(pick.offer, npc.id, pick.bid);
    if (!result || !result.success) return null;
    if (pick.vsPlayer) this.notePlayerDeal(npc.id, true);
    const icon = pick.item?.icon || '';
    return {
      type: pick.ending ? 'snipe' : 'bid', npcId: npc.id, offer: pick.offer, amount: pick.bid,
      intent: pick.ending ? `Enchère de dernière minute ${icon}` : `Enchérit sur ${icon} ${eur(pick.bid)} €`,
      reason: pick.vsPlayer ? 'Veut vous souffler cette enchère.' : `Enchère ${this._pctTxt(pick.dealRatio)}.`
    };
  }

  _tryFulfillBuy(npc, state) {
    if (state.inventory.length === 0) return null;
    const buyOffers = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId !== npc.id && o.quantity > 0);
    if (buyOffers.length === 0) return null;
    const candidates = [];
    for (const slot of state.inventory) {
      if (slot.quantity <= 0) continue;
      const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
      for (const buy of buyOffers) {
        if (buy.itemId !== slot.itemId) continue;
        if ((slot.quality ?? 50) < (buy.minQuality ?? 0) || (slot.perfection ?? 50) < (buy.minPerfection ?? 0)) continue;
        const dealRatio = ref > 0 ? buy.price / ref : 1;
        if (dealRatio < this._sellThreshold(npc, state, slot, buy.ownerId)) continue;
        const qty = Math.min(slot.quantity, buy.quantity, npc.personality === 'épicier' ? slot.quantity : 1 + Math.floor(Math.random() * 3));
        if (qty < 1) continue;
        candidates.push({ slot, buy, qty, dealRatio });
      }
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.dealRatio - a.dealRatio);
    const pick = candidates[0];
    const result = this.executeFulfill(pick.buy, npc.id, pick.qty);
    if (!result || !result.success) return null;
    pick.slot.quantity -= pick.qty;
    if (pick.slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== pick.slot);
    if (pick.buy.ownerId === 'player') this.notePlayerDeal(npc.id, true);
    const item = getItemById(pick.buy.itemId);
    const dry = this.capitalState(npc, state).id === 'dry';
    return {
      type: 'fulfill', npcId: npc.id, buyOffer: pick.buy, quantity: pick.qty, total: result.transaction?.total,
      intent: `Vend ${item?.icon || ''} ×${pick.qty} sur demande`,
      reason: dry ? 'Besoin de liquidités.' : `Offre d'achat ${this._pctTxt(pick.dealRatio)}.`
    };
  }

  _tryBuyout(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 5) return null;
    const stockQty = this._stockQty(state);
    const target = this.stockTarget(npc);
    const speculator = npc.personality === 'opportuniste' || npc.personality === 'agressif';
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.buyoutPrice != null && o.ownerId !== npc.id);
    if (sellOffers.length === 0) return null;
    const candidates = sellOffers.map(o => {
      const item = getItemById(o.itemId);
      const ref = this.refPrice(o.itemId, o.quality, o.perfection);
      const preferred = this._isPreferred(npc, item);
      return { offer: o, item, ref, preferred, dealRatio: ref > 0 ? o.buyoutPrice / ref : 9, focused: o.itemId === state.focusItemId, cap: this.maxBuyRatio(npc, state, item) };
    }).filter(c => {
      if (c.dealRatio > c.cap) return false;
      if (stockQty >= target * 1.6 && c.dealRatio > 0.8) return false;
      if (npc.personality === 'collectionneur') return c.preferred || c.dealRatio < 0.9;
      if (speculator && c.dealRatio < 0.85) return true; // achète ce qui est bradé, même hors spécialité
      return c.preferred || c.focused || c.dealRatio < 0.92;
    }).sort((a, b) => a.dealRatio - b.dealRatio || (b.preferred - a.preferred));
    if (candidates.length === 0) return null;
    const pick = candidates[0];
    const offer = pick.offer;
    const maxByCapital = Math.floor(spendable / offer.buyoutPrice);
    if (maxByCapital < 1) return null;
    const room = Math.max(1, Math.ceil(target * 1.6) - stockQty);
    const qty = Math.min(offer.quantity, maxByCapital, room, npc.personality === 'agressif' ? 3 : 1 + Math.floor(Math.random() * 2));
    const totalCost = round2(offer.buyoutPrice * qty);
    if (state.capital < totalCost) return null;
    state.capital = round2(state.capital - totalCost);
    const result = this.executeBuyout(offer, npc.id, qty);
    if (!result || !result.success) { state.capital = round2(state.capital + totalCost); return null; }
    if (offer.ownerId === 'player') this.notePlayerDeal(npc.id, true);
    const icon = pick.item?.icon || '';
    return {
      type: 'buyout', npcId: npc.id, offer, quantity: qty, total: totalCost,
      intent: pick.dealRatio < 0.9 ? `Rafle ${icon} ×${qty} (bradé)` : `Achète ${icon} ×${qty}`,
      reason: `Achat immédiat ${this._pctTxt(pick.dealRatio)}${pick.preferred ? ', dans sa spécialité' : ''}.`
    };
  }

  /** Prix d'annonce : marge de personnalité, signaux de marché, concurrence — borné. */
  listingPrice(npc, state, slot) {
    const profile = this.profileOf(npc);
    const item = getItemById(slot.itemId);
    const preferred = this._isPreferred(npc, item);
    const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
    const sig = this.marketSignal(slot.itemId);
    const range = (npc.personality === 'collectionneur' && preferred && profile.prefSellMarkup) ? profile.prefSellMarkup : profile.sellMarkup;
    let mult = rand(range[0], range[1]);
    const why = [];
    if (sig.shortage) { mult += 0.06; why.push('rupture de stock sur le marché'); }
    if (sig.surplus) { mult -= 0.05; why.push('marché saturé'); }
    if (this._overstocked(npc, state)) { mult -= 0.05; why.push('stock trop plein'); }
    if (this.capitalState(npc, state).id === 'dry') { mult -= 0.05; why.push('besoin de liquidités'); }
    let price = ref * mult;
    const comp = sig.book;
    if (comp.bestSell != null && comp.bestSellerId !== npc.id && comp.bestSell >= ref * 0.85 && comp.bestSell < price) {
      const rival = this._isRival(npc, comp.bestSellerId);
      const undercut = npc.personality === 'agressif' || rival ? 0.98 : 0.995;
      price = comp.bestSell * undercut;
      why.push(rival ? 'casse les prix du clan rival' : 's\'aligne sur la concurrence');
    }
    const floor = Math.max(NPC_TUNING.listMin, profile.minSell * 0.88);
    price = Math.min(ref * NPC_TUNING.listMax, Math.max(ref * floor, price));
    return { price: Math.max(0.01, round2(price)), ref, why };
  }

  listingFee(price, qty, durationDays) {
    let pct = 0.03;
    if (durationDays === 2) pct = 0.06;
    else if (durationDays === 7) pct = 0.1;
    return round2((price * qty * pct + 0.2) * NPC_TUNING.listingFeeRate);
  }

  _trySell(npc, state) {
    if (state.inventory.length === 0) return null;
    const now = this.getNow();
    const live = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.ownerId === npc.id);
    const slots = state.inventory.filter(s => s.quantity > 0 && !live.some(o => o.itemId === s.itemId) && !((state.cooldowns[s.itemId] || 0) > now));
    if (!slots.length) return null;
    const ranked = slots.map(slot => {
      const item = getItemById(slot.itemId);
      const preferred = this._isPreferred(npc, item);
      const sig = this.marketSignal(slot.itemId);
      let dumpScore = preferred ? 0 : 1.2;
      if (npc.personality === 'collectionneur' && preferred) dumpScore -= 2;
      if (npc.personality === 'épicier' && item?.category === 'Nourriture') dumpScore += 2;
      if (slot.quality < 40) dumpScore += 1;
      if (sig.shortage) dumpScore += 1.2;
      if (sig.surplus) dumpScore -= 0.8;
      if (sig.book.bestBuy != null) {
        const ref = this.refPrice(slot.itemId, slot.quality, slot.perfection);
        if (ref > 0 && sig.book.bestBuy >= ref * 0.98) dumpScore += 1.4;
      }
      if (this._qtyOf(state, slot.itemId) <= 1 && preferred) dumpScore -= 1.5;
      return { slot, item, preferred, dumpScore };
    }).sort((a, b) => b.dumpScore - a.dumpScore);
    const chosen = ranked[0];
    const slot = chosen.slot;
    const item = chosen.item;
    if (!item) return null;
    const { price, ref, why } = this.listingPrice(npc, state, slot);
    const qty = Math.min(slot.quantity, npc.personality === 'épicier' ? 4 : 1 + Math.floor(Math.random() * 3));
    const durationDays = npc.personality === 'épicier' ? 1 : [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];
    const fee = Math.min(state.capital, this.listingFee(price, qty, durationDays));
    let buyoutPrice = null;
    if (Math.random() < (npc.personality === 'agressif' ? 0.7 : 0.55)) {
      buyoutPrice = round2(Math.min(ref * (NPC_TUNING.listMax + 0.1), price * rand(1.06, 1.2)));
      if (buyoutPrice <= price) buyoutPrice = round2(price * 1.05);
    }
    const offer = new Offer({ type: 'sell', itemId: slot.itemId, quantity: qty, price, buyoutPrice, ownerId: npc.id, durationDays, quality: slot.quality, perfection: slot.perfection, createdAt: now, msPerGameDay: this.getMsPerGameDay() });
    if (fee > 0) {
      state.capital = round2(state.capital - fee);
      this.onNpcSpend(npc.id, fee, 'fees');
    }
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    this.addOffer(offer);
    this.runMatching(offer);
    const ratio = ref > 0 ? price / ref : 1;
    return {
      type: 'sell', npcId: npc.id, offer,
      intent: `Vend ${item.icon} ×${qty} à ${eur(price)} €`,
      reason: `Prix ${this._pctTxt(ratio)}${why.length ? ' — ' + why[0] : ''}.`
    };
  }

  _tryBuy(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 10) return null;
    const profile = this.profileOf(npc);
    const liveBuys = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId === npc.id);
    let pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (npc.personality === 'artisan') pool = ITEMS.filter(i => i.category === 'Ressources' || i.category === 'Outils');
    if (state.focusItemId) {
      const focus = ITEMS.find(i => i.id === state.focusItemId);
      if (focus && !pool.includes(focus)) pool = [focus, ...pool];
    }
    pool = pool.filter(i => !liveBuys.some(o => o.itemId === i.id));
    if (pool.length === 0) return null;
    const ranked = pool.map(item => {
      const sig = this.marketSignal(item.id);
      let s = Math.random() * 0.2;
      if (item.id === state.focusItemId) s += 0.4;
      if (this._qtyOf(state, item.id) === 0) s += 0.25;
      if (sig.book.bestSell != null && sig.book.bestSell < sig.fair * 0.96) s += 0.3;
      if (sig.surplus) s += 0.15;
      return { item, s, sig };
    }).sort((a, b) => b.s - a.s);
    const { item, sig } = ranked[0];
    const ref = this.refPrice(item.id);
    const cap = this.maxBuyRatio(npc, state, item);
    let mult = rand(profile.buyMarkdown[0], profile.buyMarkdown[1]);
    if (sig.surplus) mult -= 0.04;
    let price = ref * Math.min(mult, cap);
    if (sig.book.bestBuy != null && sig.book.bestBuy + 0.01 <= ref * cap) price = Math.max(price, sig.book.bestBuy + 0.01);
    price = round2(Math.max(ref * 0.6, Math.min(ref * cap, price)));
    const room = Math.max(1, this.stockTarget(npc) - this._stockQty(state));
    const maxQty = Math.floor((spendable * 0.7) / price);
    if (maxQty < 1) return null;
    const qty = Math.min(maxQty, room, 1 + Math.floor(Math.random() * 3));
    const totalLocked = round2(price * qty);
    if (state.capital < totalLocked) return null;
    const offer = new Offer({ type: 'buy', itemId: item.id, quantity: qty, price, ownerId: npc.id, durationDays: [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)], createdAt: this.getNow(), msPerGameDay: this.getMsPerGameDay() });
    state.capital = round2(state.capital - totalLocked);
    this.addOffer(offer);
    this.runMatching(offer);
    const lowStock = this._qtyOf(state, item.id) === 0;
    return {
      type: 'buy', npcId: npc.id, offer, locked: totalLocked,
      intent: `Cherche ${item.icon} ×${qty} à ${eur(price)} €`,
      reason: `${lowStock ? 'Stock vide sur cet objet' : 'Réassort'} — offre ${this._pctTxt(price / ref)}.`
    };
  }

  /* ============ Argent & objets ============ */

  creditNpc(npcId, amount) { const state = this.npcStates[npcId]; if (state && amount > 0) state.capital = round2(state.capital + amount); }
  debitNpc(npcId, amount) { const state = this.npcStates[npcId]; if (!state || state.capital < amount) return false; state.capital = round2(state.capital - amount); return true; }
  getCapital(npcId) { return this.npcStates[npcId]?.capital ?? 0; }
  giveItemToNpc(npcId, itemId, quantity, quality = 50, perfection = 50) {
    const state = this.npcStates[npcId];
    if (!state) return;
    const existing = state.inventory.find(s => s.itemId === itemId && s.quality === quality && s.perfection === perfection);
    if (existing) existing.quantity += quantity;
    else state.inventory.push({ itemId, quantity, quality, perfection });
  }
  getNpcName(id) { const npc = NPCS.find(n => n.id === id); return npc ? npc.name : id; }

  getAiSnapshot(npcId) {
    const state = this.npcStates[npcId];
    const npc = NPCS.find(n => n.id === npcId);
    if (!state || !npc) return null;
    this._ensureState(npc);
    const focus = state.focusItemId ? getItemById(state.focusItemId) : null;
    const clan = getClanById(npc.clanId);
    const profile = this.profileOf(npc);
    const cap = this.capitalState(npc, state);
    const needs = ITEMS
      .filter(i => npc.preferredCategories.includes(i.category) && this._qtyOf(state, i.id) === 0)
      .slice(0, 3)
      .map(i => ({ itemId: i.id, name: i.name, icon: i.icon }));
    const stock = this._stockQty(state);
    const target = this.stockTarget(npc);
    return {
      lastIntent: state.lastIntent, lastReason: state.lastReason,
      mood: state.mood, rivalry: state.rivalry, focusName: focus ? focus.name : null,
      clanId: npc.clanId || null, clanName: clan?.name || null, clanIcon: clan?.icon || null, clanColor: clan?.color || null,
      trust: state.trust || 0,
      strategy: profile.label, strategyText: profile.text,
      capitalState: cap.id, capitalLabel: cap.label,
      stock, stockTarget: target,
      stockLabel: stock > target * 1.5 ? 'Stock trop plein' : stock < target * 0.5 ? 'Stock bas' : 'Stock correct',
      needs,
      actionsToday: state.actionsToday || 0, actionBudget: this.actionBudget(npc),
      journal: [...(state.journal || [])]
    };
  }

  _conditionPrice(price, quality = 50, perfection = 50) {
    const qualityMod = 0.75 + (Number(quality) / 100) * 0.45;
    const perfectionMod = 0.9 + (Number(perfection) / 100) * 0.25;
    return Math.max(0.01, Math.round(price * qualityMod * perfectionMod * 100) / 100);
  }
}
