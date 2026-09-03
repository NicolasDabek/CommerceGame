/**
 * NPCController — Comportement des 15 PNJ
 * Vente, offres d'achat, buyout et enchères.
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

    this.npcStates = {};
    NPCS.forEach(npc => {
      this.npcStates[npc.id] = {
        capital: npc.capital,
        inventory: this._generateStarterInventory(npc),
        lastActionAt: 0
      };
    });
  }

  _generateStarterInventory(npc) {
    const inv = [];
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length > 0 ? preferred : ITEMS;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      inv.push({
        itemId: item.id,
        quantity: 1 + Math.floor(Math.random() * 5),
        quality: 40 + Math.floor(Math.random() * 50),
        perfection: 30 + Math.floor(Math.random() * 50)
      });
    }
    return inv;
  }

  tick(now = Date.now()) {
    const actions = [];
    NPCS.forEach(npc => {
      const state = this.npcStates[npc.id];
      if (!state) return;
      const minDelay = 6000 + (1 - npc.aggressiveness) * 20000;
      if (now - state.lastActionAt < minDelay) return;
      if (Math.random() > npc.aggressiveness * 0.75 + 0.2) return;
      const roll = Math.random();
      let result = null;
      if (roll < 0.22) result = this._tryBuyout(npc, state);
      else if (roll < 0.46) result = this._tryBid(npc, state);
      else if (roll < 0.64 && state.inventory.length > 0) result = this._tryFulfillBuy(npc, state);
      else if (roll < 0.82 && state.inventory.length > 0) result = this._trySell(npc, state);
      else result = this._tryBuy(npc, state);
      if (!result && state.inventory.length > 0) result = this._tryFulfillBuy(npc, state) || this._trySell(npc, state);
      if (!result) result = this._tryBid(npc, state) || this._tryBuyout(npc, state) || this._tryBuy(npc, state);
      if (result) { state.lastActionAt = now; actions.push(result); }
    });
    return actions;
  }

  _tryBid(npc, state) {
    if (state.capital < 8) return null;
    const sellOffers = this.getOffers().filter(o =>
      o.type === 'sell' && o.status === 'active' && o.ownerId !== npc.id && o.currentBidderId !== npc.id && o.quantity > 0
    );
    if (sellOffers.length === 0) return null;
    const candidates = [];
    for (const offer of sellOffers) {
      const item = getItemById(offer.itemId);
      const avg = this._conditionPrice(this.getAveragePrice(offer.itemId), offer.quality, offer.perfection);
      const preferred = item && npc.preferredCategories.includes(item.category);
      const minBid = typeof offer.minNextBid === 'function' ? offer.minNextBid() : offer.price;
      if (offer.buyoutPrice != null && minBid >= offer.buyoutPrice) continue;
      if (typeof offer.canBidAmount === 'function' && !offer.canBidAmount(minBid).ok) continue;
      let capRatio = 1.02;
      switch (npc.personality) {
        case 'prudent': capRatio = preferred ? 1.00 : 0.92; break;
        case 'agressif': capRatio = preferred ? 1.12 : 1.04; break;
        case 'opportuniste': capRatio = preferred ? 1.08 : 0.98; break;
        case 'collectionneur': capRatio = preferred ? 1.22 : 0.94; break;
        default: capRatio = preferred ? 1.06 : 0.98;
      }
      const maxWilling = Math.round(avg * capRatio * 100) / 100;
      if (minBid > maxWilling) continue;
      const bid = minBid;
      const total = Math.round(bid * offer.quantity * 100) / 100;
      if (state.capital < total) continue;
      candidates.push({ offer, bid, total, dealRatio: avg > 0 ? bid / avg : 1, preferred });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (a.preferred !== b.preferred ? (a.preferred ? -1 : 1) : a.dealRatio - b.dealRatio));
    const pick = candidates[0];
    const result = this.executeBid(pick.offer, npc.id, pick.bid);
    if (!result || !result.success) return null;
    return { type: 'bid', npcId: npc.id, offer: pick.offer, amount: pick.bid };
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
      for (const buy of buyOffers) {
        if (buy.itemId !== slot.itemId) continue;
        const dealRatio = avg > 0 ? buy.price / avg : 1;
        let accept = false;
        switch (npc.personality) {
          case 'prudent': accept = dealRatio >= 1.0; break;
          case 'agressif': accept = dealRatio >= 0.85; break;
          case 'opportuniste': accept = dealRatio >= 0.9; break;
          case 'collectionneur': accept = dealRatio >= 0.95 || !(item && npc.preferredCategories.includes(item.category)); break;
          default: accept = dealRatio >= 0.9;
        }
        if (!accept) continue;
        const qty = Math.min(slot.quantity, buy.quantity, 1 + Math.floor(Math.random() * 3));
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
    return { type: 'fulfill', npcId: npc.id, buyOffer: pick.buy, quantity: pick.qty, total: result.transaction?.total };
  }

  _tryBuyout(npc, state) {
    if (state.capital < 5) return null;
    const sellOffers = this.getOffers().filter(o => o.type === 'sell' && o.status === 'active' && o.buyoutPrice != null && o.ownerId !== npc.id);
    if (sellOffers.length === 0) return null;
    const candidates = sellOffers.map(o => {
      const item = getItemById(o.itemId);
      const avg = this._conditionPrice(this.getAveragePrice(o.itemId), o.quality, o.perfection);
      const preferred = item && npc.preferredCategories.includes(item.category);
      return { offer: o, item, avg, preferred, dealRatio: avg > 0 ? o.buyoutPrice / avg : 1 };
    }).filter(c => {
      if (c.dealRatio > 1.25) return false;
      if (npc.personality === 'prudent' && c.dealRatio > 1.05) return false;
      if (npc.personality === 'collectionneur') return c.preferred || c.dealRatio < 0.95;
      return c.preferred || c.dealRatio < 1.0;
    }).sort((a, b) => a.dealRatio - b.dealRatio);
    if (candidates.length === 0) return null;
    const pick = candidates[0];
    const offer = pick.offer;
    const maxByCapital = Math.floor(state.capital / offer.buyoutPrice);
    if (maxByCapital < 1) return null;
    const qty = Math.min(offer.quantity, maxByCapital, 1 + Math.floor(Math.random() * 3));
    const totalCost = Math.round(offer.buyoutPrice * qty * 100) / 100;
    if (state.capital < totalCost) return null;
    state.capital = Math.round((state.capital - totalCost) * 100) / 100;
    const result = this.executeBuyout(offer, npc.id, qty);
    if (!result || !result.success) {
      state.capital = Math.round((state.capital + totalCost) * 100) / 100;
      return null;
    }
    return { type: 'buyout', npcId: npc.id, offer, quantity: qty, total: totalCost };
  }

  _trySell(npc, state) {
    if (state.inventory.length === 0) return null;
    const slot = state.inventory[Math.floor(Math.random() * state.inventory.length)];
    const item = getItemById(slot.itemId);
    if (!item) return null;
    const avg = this._conditionPrice(this.getAveragePrice(slot.itemId), slot.quality, slot.perfection);
    let priceMultiplier = 1.0;
    switch (npc.personality) {
      case 'prudent': priceMultiplier = 1.08 + Math.random() * 0.12; break;
      case 'agressif': priceMultiplier = 0.92 + Math.random() * 0.10; break;
      case 'opportuniste': priceMultiplier = 0.95 + Math.random() * 0.20; break;
      case 'collectionneur': priceMultiplier = 1.15 + Math.random() * 0.25; break;
      default: priceMultiplier = 1.00 + Math.random() * 0.15;
    }
    const price = Math.round(avg * priceMultiplier * 100) / 100;
    const qty = Math.min(slot.quantity, 1 + Math.floor(Math.random() * 3));
    const durationDays = [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];
    let buyoutPrice = null;
    if (Math.random() < 0.55) buyoutPrice = Math.round(price * (1.12 + Math.random() * 0.25) * 100) / 100;
    const createdAt = this.getNow ? this.getNow() : Date.now();
    const msPerGameDay = this.getMsPerGameDay ? this.getMsPerGameDay() : 24 * 60 * 60 * 1000;
    const offer = new Offer({ type: 'sell', itemId: slot.itemId, quantity: qty, price, buyoutPrice, ownerId: npc.id, durationDays, quality: slot.quality, perfection: slot.perfection, createdAt, msPerGameDay });
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    this.addOffer(offer);
    this.runMatching(offer);
    return { type: 'sell', npcId: npc.id, offer };
  }

  _tryBuy(npc, state) {
    if (state.capital < 10) return null;
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length > 0 ? preferred : ITEMS;
    const item = pool[Math.floor(Math.random() * pool.length)];
    if (!item) return null;
    const avg = this.getAveragePrice(item.id);
    let priceMultiplier = 1.0;
    switch (npc.personality) {
      case 'prudent': priceMultiplier = 0.85 + Math.random() * 0.10; break;
      case 'agressif': priceMultiplier = 1.00 + Math.random() * 0.15; break;
      case 'opportuniste': priceMultiplier = 0.90 + Math.random() * 0.20; break;
      case 'collectionneur': priceMultiplier = 1.10 + Math.random() * 0.30; break;
      default: priceMultiplier = 0.92 + Math.random() * 0.12;
    }
    const price = Math.round(avg * priceMultiplier * 100) / 100;
    const maxQty = Math.floor((state.capital * 0.9) / price);
    if (maxQty < 1) return null;
    const qty = Math.min(maxQty, 1 + Math.floor(Math.random() * 4));
    const totalLocked = Math.round(price * qty * 100) / 100;
    if (state.capital < totalLocked) return null;
    const durationDays = [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];
    const createdAt = this.getNow ? this.getNow() : Date.now();
    const msPerGameDay = this.getMsPerGameDay ? this.getMsPerGameDay() : 24 * 60 * 60 * 1000;
    const offer = new Offer({ type: 'buy', itemId: item.id, quantity: qty, price, ownerId: npc.id, durationDays, createdAt, msPerGameDay });
    state.capital = Math.round((state.capital - totalLocked) * 100) / 100;
    this.addOffer(offer);
    this.runMatching(offer);
    return { type: 'buy', npcId: npc.id, offer, locked: totalLocked };
  }

  creditNpc(npcId, amount) {
    const state = this.npcStates[npcId];
    if (state && amount > 0) state.capital = Math.round((state.capital + amount) * 100) / 100;
  }
  debitNpc(npcId, amount) {
    const state = this.npcStates[npcId];
    if (!state || state.capital < amount) return false;
    state.capital = Math.round((state.capital - amount) * 100) / 100;
    return true;
  }
  getCapital(npcId) { return this.npcStates[npcId]?.capital ?? 0; }
  giveItemToNpc(npcId, itemId, quantity, quality = 50, perfection = 50) {
    const state = this.npcStates[npcId];
    if (!state) return;
    const existing = state.inventory.find(s => s.itemId === itemId && s.quality === quality && s.perfection === perfection);
    if (existing) existing.quantity += quantity;
    else state.inventory.push({ itemId, quantity, quality, perfection });
  }
  getNpcName(id) {
    const npc = NPCS.find(n => n.id === id);
    return npc ? npc.name : id;
  }
  _conditionPrice(price, quality = 50, perfection = 50) {
    const qualityMod = 0.75 + (Number(quality) / 100) * 0.45;
    const perfectionMod = 0.9 + (Number(perfection) / 100) * 0.25;
    return Math.max(0.01, Math.round(price * qualityMod * perfectionMod * 100) / 100);
  }
}
