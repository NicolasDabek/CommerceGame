/**
 * NPCController — scores des actions possibles et seuils de prix.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { getItemById } from '../../data/items.js';
import { isPersonalRival } from '../NpcMind.js';
import { NPC_TUNING } from './tuning.js';

export const NpcScoring = {
  _scoreSell(npc, state, stockQty) {
    // Bonus quand il détient un objet absent des étals (il peut fixer le prix)
    const gap = state.inventory.some(sl => sl.quantity > 0 && this._book(sl.itemId).sellQty === 0) ? 0.22 : 0;
    return 0.28 + (stockQty > this.stockTarget(npc) ? 0.28 : 0) + (state.capital < 40 ? 0.2 : 0) + gap;
  },

  _scoreRestock(npc, state, stockQty) { return 0.24 + (stockQty < 3 ? 0.22 : 0) + (state.focusItemId ? 0.1 : 0); },

  _timeLeftRatio(offer, now) {
    if (!offer.expiresAt) return 1;
    const total = offer.expiresAt - (offer.createdAt || now);
    if (total <= 0) return 0;
    return Math.max(0, Math.min(1, (offer.expiresAt - now) / total));
  },


  /** Prix max qu'un PNJ accepte de payer (ratio du prix de référence). */
  maxBuyRatio(npc, state, item) {
    const profile = this.profileOf(npc);
    const preferred = this._isPreferred(npc, item);
    let cap = preferred ? profile.maxBuyPref : profile.maxBuy;
    if (item && item.id === state.focusItemId) cap += 0.04;
    if (item && preferred && this._qtyOf(state, item.id) === 0) cap += 0.03;
    cap += state.mood * 0.03;
    cap -= (state.mind?.caution || 0) * 0.06; // prudent après des pertes (max −1,8 %)
    const hardCap = npc.personality === 'collectionneur' && preferred ? NPC_TUNING.collectorCap : NPC_TUNING.buyCapMax;
    return Math.min(hardCap, cap);
  },


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
  },


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
      else if (isPersonalRival(state, o.currentBidderId)) s += 0.08;
      if (this._timeLeftRatio(o, now) < 0.18) s += 0.28;
      best = Math.max(best, s);
    }
    return best;
  },


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
  },


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
  },
};
