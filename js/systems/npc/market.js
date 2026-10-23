/**
 * NPCController — lecture du marché : prix de référence, carnets d'ordres, signaux de pénurie.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { NPCS, getClanById } from '../../data/npcs.js';
import { NPC_TUNING } from './tuning.js';

export const NpcMarket = {

  /* ============ Lecture du marché ============ */

  /** Prix de référence : mélange moyenne du marché / valeur normale, ajusté à l'état de l'objet. */
  refPrice(itemId, quality = 50, perfection = 50) {
    const w = NPC_TUNING.refAverageWeight;
    const avg = this.getAveragePrice(itemId);
    const fair = this.getFairPrice(itemId);
    return this._conditionPrice(avg * w + fair * (1 - w), quality, perfection);
  },


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
  },


  _book(itemId) {
    if (!this._bookCache) this._bookCache = this._buildBooks();
    const b = this._bookCache[itemId] || { bestSell: null, bestAsk: null, bestBuy: null, sellQty: 0, buyQty: 0, sellers: [], bestSellerId: null };
    return { ...b, spread: b.bestSell != null && b.bestBuy != null ? b.bestSell - b.bestBuy : null };
  },


  _invalidateBooks() { this._bookCache = null; },


  /** Pénurie / surplus perçus sur un objet. */
  marketSignal(itemId) {
    const book = this._book(itemId);
    const fair = this.getFairPrice(itemId);
    const view = this.getSupplyView ? this.getSupplyView(itemId) : null;
    let shortage = book.sellQty === 0 || book.buyQty > book.sellQty * 1.5;
    let surplus = book.sellQty >= 6 || (book.bestSell != null && fair > 0 && book.bestSell < fair * 0.85);
    if (view) {
      // La ville manque de cet objet (stock < 1,5 jour de demande) ou en déborde
      if (view.status === 'shortage') shortage = true;
      if (view.status === 'surplus') surplus = true;
      if (view.status === 'shortage' || view.status === 'tight') surplus = false;
    }
    const publicOrder = !!this.publicOrderFor?.(itemId);
    return {
      book, fair, view, publicOrder,
      shortage: (shortage && !surplus) || publicOrder,
      surplus,
      anticipate: !!view?.anticipate,
      playerFlow: view?.playerFlow || 0
    };
  },


  _isRival(npc, ownerId) {
    if (!ownerId || ownerId === npc.id) return false;
    const other = NPCS.find(n => n.id === ownerId);
    const clan = getClanById(npc.clanId);
    return !!(other && clan && clan.rivalId === other.clanId);
  },
};
