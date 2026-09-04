/**
 * NPCController — IA des 15 PNJ
 * Décision pondérée : marché, stock, trésorerie, humeur, rivaux, échéance.
 */

import { NPCS } from '../data/npcs.js';
import { ITEMS, getItemById } from '../data/items.js';
import { Offer } from '../models/Offer.js';

export class NPCController {
  constructor(options = {}) {
    this.getOffers = options.getOffers || (() => []);
    this.addOffer = options.addOffer || (() => {});
    this.runMatching = options.runMatching || (() => {});
    this.getAveragePrice = options.getAveragePrice || ((id) => {
      const item = getItemById(id);
      return item ? item.basePrice : 10;
    });
    this.executeBuyout = options.executeBuyout || (() => null);
    this.executeFulfill = options.executeFulfill || (() => null);
    this.executeBid = options.executeBid || (() => null);
    this.executeCancel = options.executeCancel || null;
    this.getNow = options.getNow || (() => Date.now());
    this.getMsPerGameDay = options.getMsPerGameDay || (() => 24 * 60 * 60 * 1000);
    this.npcStates = {};
    NPCS.forEach(npc => { this.npcStates[npc.id] = this._freshState(npc); });
  }

  _freshState(npc) {
    return { capital: npc.capital, inventory: this._generateStarterInventory(npc), lastActionAt: 0, lastIntent: null, mood: 0, rivalry: 0, focusItemId: null, focusUntil: 0, lossesVsPlayer: 0, winsVsPlayer: 0, dayHint: 0 };
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

  _reserveRatio(npc) {
    switch (npc.personality) {
      case 'prudent': return 0.28;
      case 'collectionneur': return 0.20;
      case 'artisan': return 0.16;
      case 'opportuniste': return 0.12;
      case 'épicier': return 0.10;
      case 'agressif': return 0.06;
      default: return 0.14;
    }
  }
  _spendable(npc, state) { return Math.max(0, state.capital * (1 - this._reserveRatio(npc))); }

  onNewDay(day) {
    NPCS.forEach(npc => {
      const state = this.npcStates[npc.id];
      if (!state) return;
      state.dayHint = day;
      state.mood = Math.max(-1, Math.min(1, state.mood * 0.72));
      this._pickFocus(npc, state);
      if (state.capital < npc.capital * 0.12) state.mood = Math.max(-1, state.mood - 0.15);
    });
  }

  _pickFocus(npc, state) {
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length ? preferred : ITEMS;
    if (!pool.length) return;
    const scored = pool.map(item => {
      const avg = this.getAveragePrice(item.id);
      const book = this._book(item.id);
      let s = Math.random() * 0.3;
      if (book.spread != null && book.spread > avg * 0.08) s += 0.4;
      if (book.sellQty === 0) s += 0.2;
      if (book.buyQty > book.sellQty) s += 0.15;
      return { item, s };
    }).sort((a, b) => b.s - a.s);
    state.focusItemId = scored[0].item.id;
    state.focusUntil = this.getNow() + this.getMsPerGameDay() * (1 + Math.floor(Math.random() * 2));
  }

  _book(itemId) {
    const sells = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === itemId);
    const buys = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === itemId);
    const bestSell = sells.length ? Math.min(...sells.map(o => o.currentBid != null ? o.currentBid : o.price)) : null;
    const bestBuy = buys.length ? Math.max(...buys.map(o => o.price)) : null;
    return { bestSell, bestBuy, spread: bestSell != null && bestBuy != null ? bestSell - bestBuy : null, sellQty: sells.reduce((s, o) => s + o.quantity, 0), buyQty: buys.reduce((s, o) => s + o.quantity, 0) };
  }

  notePlayerDeal(npcId, wonAgainstPlayer) {
    const state = this.npcStates[npcId];
    if (!state) return;
    if (wonAgainstPlayer) { state.winsVsPlayer += 1; state.mood = Math.min(1, state.mood + 0.12); state.rivalry = Math.min(1, state.rivalry + 0.08); }
    else { state.lossesVsPlayer += 1; state.mood = Math.max(-1, state.mood - 0.1); state.rivalry = Math.min(1, state.rivalry + 0.16); }
  }

  tick(now = Date.now()) {
    const actions = [];
    NPCS.forEach(npc => {
      const state = this.npcStates[npc.id];
      if (!state) return;
      if (state.focusItemId && now > state.focusUntil) this._pickFocus(npc, state);
      const minDelay = 4200 + (1 - npc.aggressiveness) * 16000;
      if (now - state.lastActionAt < minDelay) return;
      const actChance = npc.aggressiveness * 0.82 + 0.16 + Math.max(0, state.mood) * 0.08;
      if (Math.random() > actChance) return;
      const result = this._chooseAndAct(npc, state, now);
      if (result) { state.lastActionAt = now; state.lastIntent = this._intentLabel(result, state); actions.push(result); }
    });
    return actions;
  }

  _intentLabel(result, state) {
    const moodTxt = state.mood > 0.35 ? 'confiant' : state.mood < -0.35 ? 'tendu' : 'calme';
    switch (result.type) {
      case 'bid': return `Enchère ${Number(result.amount).toFixed(2)} € (${moodTxt})`;
      case 'buyout': return `Achat immédiat ×${result.quantity}`;
      case 'fulfill': return `Vend sur une offre d'achat`;
      case 'sell': return `Met en vente`;
      case 'buy': return `Poste une offre d'achat`;
      case 'cancel': return `Annule une offre trop chère`;
      case 'snipe': return `Snipe ${Number(result.amount).toFixed(2)} €`;
      default: return result.type;
    }
  }

  _chooseAndAct(npc, state, now) {
    const offers = this.getOffers().filter(o => o.status === 'active');
    const stockQty = state.inventory.reduce((s, sl) => s + sl.quantity, 0);
    const ownSells = offers.filter(o => o.ownerId === npc.id && o.type === 'sell');
    const ownBuys = offers.filter(o => o.ownerId === npc.id && o.type === 'buy');
    const cash = this._spendable(npc, state);
    const cancel = this._tryCancelStale(npc, state, ownSells, now);
    if (cancel) return cancel;
    const scored = [];
    const tryPush = (type, score, fn) => { if (score > 0) scored.push({ type, score, fn }); };
    tryPush('buyout', cash > 8 ? this._scoreBuyout(npc, state, offers) : 0, () => this._tryBuyout(npc, state));
    tryPush('bid', cash > 8 ? this._scoreBid(npc, state, offers, now) : 0, () => this._tryBid(npc, state, now));
    tryPush('fulfill', stockQty > 0 ? this._scoreFulfill(npc, state, offers) : 0, () => this._tryFulfillBuy(npc, state));
    tryPush('sell', stockQty > 0 && ownSells.length < this._maxListings(npc) ? this._scoreSell(npc, state, stockQty) : 0, () => this._trySell(npc, state));
    tryPush('buy', cash > 15 && ownBuys.length < 2 ? this._scoreRestock(npc, state, stockQty) : 0, () => this._tryBuy(npc, state));
    if (npc.personality === 'épicier') this._bump(scored, 'sell', 0.22);
    if (npc.personality === 'collectionneur') this._bump(scored, 'bid', 0.2);
    if (npc.personality === 'agressif') this._bump(scored, 'buyout', 0.16);
    if (npc.personality === 'artisan') this._bump(scored, 'buy', 0.14);
    if (npc.personality === 'opportuniste') this._bump(scored, 'bid', 0.1);
    if (state.rivalry > 0.4) this._bump(scored, 'bid', 0.14);
    if (stockQty > 12) this._bump(scored, 'sell', 0.18);
    if (stockQty < 2) this._bump(scored, 'buy', 0.16);
    scored.sort((a, b) => b.score - a.score);
    for (const option of scored) { const result = option.fn(); if (result) return result; }
    return this._tryFulfillBuy(npc, state) || this._tryBid(npc, state, now) || this._tryBuyout(npc, state);
  }

  _bump(scored, type, add) { const row = scored.find(s => s.type === type); if (row) row.score += add; }
  _maxListings(npc) { return (npc.personality === 'épicier' || npc.personality === 'agressif') ? 4 : 3; }
  _scoreSell(npc, state, stockQty) { return 0.28 + (stockQty > 8 ? 0.28 : 0) + (state.capital < 40 ? 0.2 : 0); }
  _scoreRestock(npc, state, stockQty) { return 0.24 + (stockQty < 3 ? 0.22 : 0) + (state.focusItemId ? 0.1 : 0); }
  _timeLeftRatio(offer, now) {
    if (!offer.expiresAt) return 1;
    const total = offer.expiresAt - (offer.createdAt || now);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, (offer.expiresAt - now) / total));
  }

  _scoreBuyout(npc, state, offers) {
    let best = 0;
    for (const o of offers) {
      if (o.type !== 'sell' || !o.buyoutPrice || o.ownerId === npc.id) continue;
      const item = getItemById(o.itemId);
      const avg = this._conditionPrice(this.getAveragePrice(o.itemId), o.quality, o.perfection);
      const ratio = avg > 0 ? o.buyoutPrice / avg : 2;
      if (ratio >= 1.18) continue;
      let s = 1.16 - ratio;
      if (item && npc.preferredCategories.includes(item.category)) s += 0.25;
      if (o.itemId === state.focusItemId) s += 0.18;
      if (o.ownerId === 'player') s += 0.1 + state.rivalry * 0.15;
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
      const avg = this._conditionPrice(this.getAveragePrice(o.itemId), o.quality, o.perfection);
      const minBid = typeof o.minNextBid === 'function' ? o.minNextBid() : o.price;
      const ratio = avg > 0 ? minBid / avg : 2;
      if (ratio > 1.2) continue;
      let s = 1.12 - ratio;
      if (item && npc.preferredCategories.includes(item.category)) s += 0.22;
      if (o.itemId === state.focusItemId) s += 0.16;
      if (o.currentBidderId === 'player') s += 0.18 + state.rivalry * 0.22;
      if (this._timeLeftRatio(o, now) < 0.18) s += 0.28;
      best = Math.max(best, s);
    }
    return best;
  }

  _scoreFulfill(npc, state, offers) {
    let best = 0;
    const buys = offers.filter(o => o.type === 'buy' && o.ownerId !== npc.id);
    for (const slot of state.inventory) {
      const avg = this._conditionPrice(this.getAveragePrice(slot.itemId), slot.quality, slot.perfection);
      for (const buy of buys) {
        if (buy.itemId !== slot.itemId) continue;
        const ratio = avg > 0 ? buy.price / avg : 0;
        if (ratio > best) best = ratio - 0.65;
      }
    }
    return Math.max(0, best);
  }

  _tryCancelStale(npc, state, ownSells, now) {
    if (!this.executeCancel || ownSells.length === 0) return null;
    if (Math.random() > 0.35) return null;
    for (const offer of ownSells) {
      if (offer.currentBidderId) continue;
      const avg = this._conditionPrice(this.getAveragePrice(offer.itemId), offer.quality, offer.perfection);
      if (avg > 0 && offer.price > avg * 1.28 && this._timeLeftRatio(offer, now) < 0.55) {
        const ok = this.executeCancel(offer, npc.id);
        if (ok && ok.success) {
          this.giveItemToNpc(npc.id, offer.itemId, offer.quantity, offer.quality, offer.perfection);
          return { type: 'cancel', npcId: npc.id, offer };
        }
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
      const avg = this._conditionPrice(this.getAveragePrice(offer.itemId), offer.quality, offer.perfection);
      const preferred = item && npc.preferredCategories.includes(item.category);
      const focused = offer.itemId === state.focusItemId;
      const step = typeof offer.bidStep === 'function' ? offer.bidStep() : 0.01;
      const minBid = typeof offer.minNextBid === 'function' ? offer.minNextBid() : offer.price;
      if (offer.buyoutPrice != null && minBid >= offer.buyoutPrice) continue;
      let capRatio = preferred ? 1.06 : 0.98;
      switch (npc.personality) {
        case 'prudent': capRatio = preferred ? 1.00 : 0.90; break;
        case 'agressif': capRatio = preferred ? 1.16 : 1.05; break;
        case 'opportuniste': capRatio = preferred ? 1.10 : 0.97; break;
        case 'collectionneur': capRatio = preferred ? 1.26 : 0.92; break;
        case 'épicier': capRatio = preferred ? 1.04 : 0.94; break;
        case 'artisan': capRatio = preferred ? 1.08 : 0.96; break;
        default: break;
      }
      if (focused) capRatio += 0.06;
      capRatio += state.mood * 0.04;
      const vsPlayer = offer.currentBidderId === 'player';
      if (vsPlayer) capRatio += 0.04 + state.rivalry * 0.08;
      const maxWilling = Math.round(avg * capRatio * 100) / 100;
      if (minBid > maxWilling) continue;
      let bid = minBid;
      const ending = this._timeLeftRatio(offer, now) < 0.16;
      const extraRoll = (npc.personality === 'agressif' || npc.personality === 'opportuniste' || vsPlayer || ending);
      if (extraRoll && Math.random() < (ending ? 0.8 : 0.5)) {
        const extra = step * (vsPlayer || ending ? 2 : 1);
        const bumped = Math.round((minBid + extra) * 100) / 100;
        if (bumped <= maxWilling && (offer.buyoutPrice == null || bumped < offer.buyoutPrice)) bid = bumped;
      }
      if (typeof offer.canBidAmount === 'function' && !offer.canBidAmount(bid).ok) continue;
      const total = Math.round(bid * offer.quantity * 100) / 100;
      if (spendable < total) continue;
      candidates.push({ offer, bid, total, dealRatio: avg > 0 ? bid / avg : 1, preferred, vsPlayer, ending, focused });
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
    return { type: pick.ending ? 'snipe' : 'bid', npcId: npc.id, offer: pick.offer, amount: pick.bid };
  }

  _tryFulfillBuy(npc, state) {
    if (state.inventory.length === 0) return null;
    const buyOffers = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId !== npc.id && o.quantity > 0);
    if (buyOffers.length === 0) return null;
    const candidates = [];
    for (const slot of state.inventory) {
      if (slot.quantity <= 0) continue;
      const item = getItemById(slot.itemId);
      const avg = this._conditionPrice(this.getAveragePrice(slot.itemId), slot.quality, slot.perfection);
      const keepPreferred = npc.personality === 'collectionneur' && item && npc.preferredCategories.includes(item.category);
      const lowStockPreferred = item && npc.preferredCategories.includes(item.category) && this._qtyOf(state, slot.itemId) <= 2;
      for (const buy of buyOffers) {
        if (buy.itemId !== slot.itemId) continue;
        const dealRatio = avg > 0 ? buy.price / avg : 1;
        let accept = dealRatio >= 0.9;
        switch (npc.personality) {
          case 'prudent': accept = dealRatio >= 1.02; break;
          case 'agressif': accept = dealRatio >= 0.84; break;
          case 'opportuniste': accept = dealRatio >= 0.9; break;
          case 'collectionneur': accept = keepPreferred ? dealRatio >= 1.12 : dealRatio >= 0.92; break;
          case 'épicier': accept = dealRatio >= 0.88; break;
          case 'artisan': accept = dealRatio >= 0.95; break;
          default: break;
        }
        if (lowStockPreferred && dealRatio < 1.08) accept = false;
        if (!accept) continue;
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
    return { type: 'fulfill', npcId: npc.id, buyOffer: pick.buy, quantity: pick.qty, total: result.transaction?.total };
  }

  _qtyOf(state, itemId) { return state.inventory.filter(s => s.itemId === itemId).reduce((s, sl) => s + sl.quantity, 0); }

  _tryBuyout(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 5) return null;
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.buyoutPrice != null && o.ownerId !== npc.id);
    if (sellOffers.length === 0) return null;
    const candidates = sellOffers.map(o => {
      const item = getItemById(o.itemId);
      const avg = this._conditionPrice(this.getAveragePrice(o.itemId), o.quality, o.perfection);
      const preferred = item && npc.preferredCategories.includes(item.category);
      return { offer: o, item, avg, preferred, dealRatio: avg > 0 ? o.buyoutPrice / avg : 1, focused: o.itemId === state.focusItemId };
    }).filter(c => {
      if (c.dealRatio > 1.22) return false;
      if (npc.personality === 'prudent' && c.dealRatio > 1.04) return false;
      if (npc.personality === 'collectionneur') return c.preferred || c.dealRatio < 0.94;
      return c.preferred || c.focused || c.dealRatio < 1.0 || (c.offer.ownerId === 'player' && c.dealRatio < 1.08);
    }).sort((a, b) => a.dealRatio - b.dealRatio || (b.preferred - a.preferred));
    if (candidates.length === 0) return null;
    const pick = candidates[0];
    const offer = pick.offer;
    const maxByCapital = Math.floor(spendable / offer.buyoutPrice);
    if (maxByCapital < 1) return null;
    const qty = Math.min(offer.quantity, maxByCapital, npc.personality === 'agressif' ? 3 : 1 + Math.floor(Math.random() * 2));
    const totalCost = Math.round(offer.buyoutPrice * qty * 100) / 100;
    if (state.capital < totalCost) return null;
    state.capital = Math.round((state.capital - totalCost) * 100) / 100;
    const result = this.executeBuyout(offer, npc.id, qty);
    if (!result || !result.success) { state.capital = Math.round((state.capital + totalCost) * 100) / 100; return null; }
    if (offer.ownerId === 'player') this.notePlayerDeal(npc.id, true);
    return { type: 'buyout', npcId: npc.id, offer, quantity: qty, total: totalCost };
  }

  _trySell(npc, state) {
    if (state.inventory.length === 0) return null;
    const live = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.ownerId === npc.id);
    const slots = state.inventory.filter(s => s.quantity > 0 && !live.some(o => o.itemId === s.itemId));
    const pool = slots.length ? slots : state.inventory.filter(s => s.quantity > 0);
    if (!pool.length) return null;
    const ranked = pool.map(slot => {
      const item = getItemById(slot.itemId);
      const preferred = item && npc.preferredCategories.includes(item.category);
      const book = this._book(slot.itemId);
      let dumpScore = preferred ? 0 : 1.2;
      if (npc.personality === 'collectionneur' && preferred) dumpScore -= 2;
      if (npc.personality === 'épicier' && item?.category === 'Nourriture') dumpScore += 2;
      if (slot.quality < 40) dumpScore += 1;
      if (book.bestBuy != null) {
        const avg = this._conditionPrice(this.getAveragePrice(slot.itemId), slot.quality, slot.perfection);
        if (avg > 0 && book.bestBuy >= avg * 0.98) dumpScore += 1.4;
      }
      if (this._qtyOf(state, slot.itemId) <= 1 && preferred) dumpScore -= 1.5;
      return { slot, item, preferred, dumpScore };
    }).sort((a, b) => b.dumpScore - a.dumpScore);
    const chosen = ranked[0];
    const slot = chosen.slot;
    const item = chosen.item;
    if (!item) return null;
    const avg = this._conditionPrice(this.getAveragePrice(slot.itemId), slot.quality, slot.perfection);
    const book = this._book(slot.itemId);
    let priceMultiplier = 1.0;
    switch (npc.personality) {
      case 'prudent': priceMultiplier = 1.08 + Math.random() * 0.10; break;
      case 'agressif': priceMultiplier = 0.90 + Math.random() * 0.10; break;
      case 'opportuniste': priceMultiplier = 0.94 + Math.random() * 0.18; break;
      case 'collectionneur': priceMultiplier = chosen.preferred ? 1.18 + Math.random() * 0.2 : 0.98; break;
      case 'épicier': priceMultiplier = 0.93 + Math.random() * 0.08; break;
      case 'artisan': priceMultiplier = 1.04 + Math.random() * 0.10; break;
      default: priceMultiplier = 1.00 + Math.random() * 0.12;
    }
    if (book.bestSell != null && avg > 0) {
      const undercut = book.bestSell * (npc.personality === 'agressif' ? 0.98 : 0.995);
      priceMultiplier = Math.min(avg * priceMultiplier, undercut) / avg;
    }
    const price = Math.max(0.01, Math.round(avg * priceMultiplier * 100) / 100);
    const qty = Math.min(slot.quantity, npc.personality === 'épicier' ? Math.min(slot.quantity, 4) : 1 + Math.floor(Math.random() * 3));
    const durationDays = npc.personality === 'épicier' ? 1 : [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];
    let buyoutPrice = null;
    if (Math.random() < (npc.personality === 'agressif' ? 0.7 : 0.5)) buyoutPrice = Math.round(price * (1.10 + Math.random() * 0.22) * 100) / 100;
    const offer = new Offer({ type: 'sell', itemId: slot.itemId, quantity: qty, price, buyoutPrice, ownerId: npc.id, durationDays, quality: slot.quality, perfection: slot.perfection, createdAt: this.getNow(), msPerGameDay: this.getMsPerGameDay() });
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    this.addOffer(offer);
    this.runMatching(offer);
    return { type: 'sell', npcId: npc.id, offer };
  }

  _tryBuy(npc, state) {
    const spendable = this._spendable(npc, state);
    if (spendable < 10) return null;
    const liveBuys = this.getOffers().filter(o => o.type === 'buy' && o.status === 'active' && o.ownerId === npc.id);
    let pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (npc.personality === 'artisan') pool = ITEMS.filter(i => i.category === 'Ressources' || i.category === 'Outils');
    if (state.focusItemId) {
      const focus = ITEMS.find(i => i.id === state.focusItemId);
      if (focus && !liveBuys.some(o => o.itemId === focus.id)) pool = [focus, ...pool];
    }
    pool = pool.filter(i => !liveBuys.some(o => o.itemId === i.id));
    if (pool.length === 0) pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (pool.length === 0) pool = ITEMS;
    const ranked = pool.map(item => {
      const book = this._book(item.id);
      let s = Math.random() * 0.2;
      if (item.id === state.focusItemId) s += 0.4;
      const avg = this.getAveragePrice(item.id);
      if (book.bestSell != null && avg > 0 && book.bestSell < avg * 0.96) s += 0.3;
      return { item, s };
    }).sort((a, b) => b.s - a.s);
    const item = ranked[0].item;
    if (!item) return null;
    const avg = this.getAveragePrice(item.id);
    const book = this._book(item.id);
    let priceMultiplier = 0.90 + Math.random() * 0.10;
    switch (npc.personality) {
      case 'prudent': priceMultiplier = 0.84 + Math.random() * 0.08; break;
      case 'agressif': priceMultiplier = 0.98 + Math.random() * 0.14; break;
      case 'opportuniste': priceMultiplier = 0.88 + Math.random() * 0.18; break;
      case 'collectionneur': priceMultiplier = 1.08 + Math.random() * 0.22; break;
      case 'épicier': priceMultiplier = 0.90 + Math.random() * 0.08; break;
      case 'artisan': priceMultiplier = 0.92 + Math.random() * 0.10; break;
      default: break;
    }
    let price = Math.round(avg * priceMultiplier * 100) / 100;
    if (book.bestBuy != null) price = Math.max(price, Math.round((book.bestBuy + 0.01) * 100) / 100);
    const maxQty = Math.floor((spendable * 0.7) / price);
    if (maxQty < 1) return null;
    const qty = Math.min(maxQty, 1 + Math.floor(Math.random() * 4));
    const totalLocked = Math.round(price * qty * 100) / 100;
    if (state.capital < totalLocked) return null;
    const offer = new Offer({ type: 'buy', itemId: item.id, quantity: qty, price, ownerId: npc.id, durationDays: [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)], createdAt: this.getNow(), msPerGameDay: this.getMsPerGameDay() });
    state.capital = Math.round((state.capital - totalLocked) * 100) / 100;
    this.addOffer(offer);
    this.runMatching(offer);
    return { type: 'buy', npcId: npc.id, offer, locked: totalLocked };
  }

  creditNpc(npcId, amount) { const state = this.npcStates[npcId]; if (state && amount > 0) state.capital = Math.round((state.capital + amount) * 100) / 100; }
  debitNpc(npcId, amount) { const state = this.npcStates[npcId]; if (!state || state.capital < amount) return false; state.capital = Math.round((state.capital - amount) * 100) / 100; return true; }
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
    if (!state) return null;
    const focus = state.focusItemId ? getItemById(state.focusItemId) : null;
    return { lastIntent: state.lastIntent, mood: state.mood, rivalry: state.rivalry, focusName: focus ? focus.name : null };
  }
  _conditionPrice(price, quality = 50, perfection = 50) {
    const qualityMod = 0.75 + (Number(quality) / 100) * 0.45;
    const perfectionMod = 0.9 + (Number(perfection) / 100) * 0.25;
    return Math.max(0.01, Math.round(price * qualityMod * perfectionMod * 100) / 100);
  }
}
