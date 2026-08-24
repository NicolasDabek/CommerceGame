/**
 * NPCController — Comportement des 15 PNJ
 * Vente, offres d'achat, et achats immédiats (buyout) dans la limite du capital.
 */

import { NPCS } from '../data/npcs.js';
import { ITEMS, getItemById } from '../data/items.js';
import { Offer } from '../models/Offer.js';

export class NPCController {
  /**
   * @param {Object} options
   * @param {Function} options.getOffers
   * @param {Function} options.addOffer
   * @param {Function} options.runMatching
   * @param {Function} options.getAveragePrice
   * @param {Function} options.executeBuyout - (sellOffer, npcId, qty) => { success, transaction } | null
   */
  constructor(options = {}) {
    this.getOffers = options.getOffers || (() => []);
    this.addOffer = options.addOffer || (() => {});
    this.runMatching = options.runMatching || (() => {});
    this.getAveragePrice = options.getAveragePrice || ((id) => {
      const item = getItemById(id);
      return item ? item.basePrice : 10;
    });
    this.executeBuyout = options.executeBuyout || (() => null);
    // (buyOffer, npcId, qty) => { success, transaction } | null
    this.executeFulfill = options.executeFulfill || (() => null);

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

  /**
   * Tick périodique
   */
  tick(now = Date.now()) {
    const actions = [];

    NPCS.forEach(npc => {
      const state = this.npcStates[npc.id];
      if (!state) return;

      const minDelay = 6000 + (1 - npc.aggressiveness) * 20000; // 6s à 26s
      if (now - state.lastActionAt < minDelay) return;
      if (Math.random() > npc.aggressiveness * 0.75 + 0.2) return;

      // 4 types d'actions possibles
      const roll = Math.random();
      let result = null;

      if (roll < 0.28) {
        // Achat immédiat sur une bonne affaire
        result = this._tryBuyout(npc, state);
      } else if (roll < 0.50 && state.inventory.length > 0) {
        // Vendre à une offre d'achat existante
        result = this._tryFulfillBuy(npc, state);
      } else if (roll < 0.72 && state.inventory.length > 0) {
        // Poster une annonce de vente
        result = this._trySell(npc, state);
      } else {
        // Poster une offre d'achat
        result = this._tryBuy(npc, state);
      }

      // Fallbacks
      if (!result && state.inventory.length > 0) {
        result = this._tryFulfillBuy(npc, state) || this._trySell(npc, state);
      }
      if (!result) {
        result = this._tryBuyout(npc, state) || this._tryBuy(npc, state);
      }

      if (result) {
        state.lastActionAt = now;
        actions.push(result);
      }
    });

    return actions;
  }

  /**
   * Vendre depuis l'inventaire PNJ vers une offre d'achat active
   */
  _tryFulfillBuy(npc, state) {
    if (state.inventory.length === 0) return null;

    const buyOffers = this.getOffers().filter(o =>
      o.type === 'buy' &&
      o.status === 'active' &&
      o.ownerId !== npc.id &&
      o.quantity > 0
    );

    if (buyOffers.length === 0) return null;

    // Croise avec l'inventaire du PNJ
    const candidates = [];
    for (const slot of state.inventory) {
      if (slot.quantity <= 0) continue;
      const item = getItemById(slot.itemId);
      const avg = this.getAveragePrice(slot.itemId);

      for (const buy of buyOffers) {
        if (buy.itemId !== slot.itemId) continue;

        // Prix d'achat acceptable vs prix moyen ?
        const dealRatio = avg > 0 ? buy.price / avg : 1;
        let accept = false;

        switch (npc.personality) {
          case 'prudent':
            accept = dealRatio >= 1.0; // ne vend pas sous le marché
            break;
          case 'agressif':
            accept = dealRatio >= 0.85;
            break;
          case 'opportuniste':
            accept = dealRatio >= 0.9;
            break;
          case 'collectionneur':
            // vend plutôt ce qui n'est pas sa préférence
            accept = dealRatio >= 0.95 || !(item && npc.preferredCategories.includes(item.category));
            break;
          default:
            accept = dealRatio >= 0.9;
        }

        if (!accept) continue;

        const qty = Math.min(slot.quantity, buy.quantity, 1 + Math.floor(Math.random() * 3));
        if (qty < 1) continue;

        candidates.push({
          slot,
          buy,
          qty,
          dealRatio
        });
      }
    }

    if (candidates.length === 0) return null;

    // Préfère le meilleur ratio (vend au prix le plus avantageux)
    candidates.sort((a, b) => b.dealRatio - a.dealRatio);
    const pick = candidates[0];

    const result = this.executeFulfill(pick.buy, npc.id, pick.qty);
    if (!result || !result.success) return null;

    // Retire de l'inventaire PNJ
    pick.slot.quantity -= pick.qty;
    if (pick.slot.quantity <= 0) {
      state.inventory = state.inventory.filter(s => s !== pick.slot);
    }

    // Capital crédité via _handleTransaction côté Game
    return {
      type: 'fulfill',
      npcId: npc.id,
      buyOffer: pick.buy,
      quantity: pick.qty,
      total: result.transaction?.total
    };
  }

  /**
   * Achat immédiat (buyout) si une annonce est intéressante et capital suffisant
   */
  _tryBuyout(npc, state) {
    if (state.capital < 5) return null;

    const sellOffers = this.getOffers().filter(o =>
      o.type === 'sell' &&
      o.status === 'active' &&
      o.buyoutPrice != null &&
      o.ownerId !== npc.id
    );

    if (sellOffers.length === 0) return null;

    // Préfère les catégories du PNJ et les bonnes affaires vs prix moyen
    const candidates = sellOffers
      .map(o => {
        const item = getItemById(o.itemId);
        const avg = this.getAveragePrice(o.itemId);
        const preferred = item && npc.preferredCategories.includes(item.category);
        const dealRatio = avg > 0 ? o.buyoutPrice / avg : 1;
        return { offer: o, item, avg, preferred, dealRatio };
      })
      .filter(c => {
        // Accepte si bonne affaire ou catégorie préférée avec prix raisonnable
        if (c.dealRatio > 1.25) return false; // trop cher
        if (npc.personality === 'prudent' && c.dealRatio > 1.05) return false;
        if (npc.personality === 'collectionneur') return c.preferred || c.dealRatio < 0.95;
        return c.preferred || c.dealRatio < 1.0;
      })
      .sort((a, b) => a.dealRatio - b.dealRatio);

    if (candidates.length === 0) return null;

    const pick = candidates[0];
    const offer = pick.offer;

    // Quantité selon le capital
    const maxByCapital = Math.floor(state.capital / offer.buyoutPrice);
    if (maxByCapital < 1) return null;

    const qty = Math.min(offer.quantity, maxByCapital, 1 + Math.floor(Math.random() * 3));
    const totalCost = Math.round(offer.buyoutPrice * qty * 100) / 100;

    if (state.capital < totalCost) return null;

    // Débite le capital AVANT l'achat
    state.capital = Math.round((state.capital - totalCost) * 100) / 100;

    const result = this.executeBuyout(offer, npc.id, qty);
    if (!result || !result.success) {
      // Rollback capital
      state.capital = Math.round((state.capital + totalCost) * 100) / 100;
      return null;
    }

    // Les objets sont donnés via _handleTransaction (callback onTransaction)
    return { type: 'buyout', npcId: npc.id, offer, quantity: qty, total: totalCost };
  }

  /**
   * Créer une offre de vente
   */
  _trySell(npc, state) {
    if (state.inventory.length === 0) return null;

    const slot = state.inventory[Math.floor(Math.random() * state.inventory.length)];
    const item = getItemById(slot.itemId);
    if (!item) return null;

    const avg = this.getAveragePrice(slot.itemId);
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
    if (Math.random() < 0.55) {
      buyoutPrice = Math.round(price * (1.12 + Math.random() * 0.25) * 100) / 100;
    }

    const offer = new Offer({
      type: 'sell',
      itemId: slot.itemId,
      quantity: qty,
      price,
      buyoutPrice,
      ownerId: npc.id,
      durationDays,
      quality: slot.quality,
      perfection: slot.perfection
    });

    slot.quantity -= qty;
    if (slot.quantity <= 0) {
      state.inventory = state.inventory.filter(s => s !== slot);
    }

    this.addOffer(offer);
    this.runMatching(offer);

    return { type: 'sell', npcId: npc.id, offer };
  }

  /**
   * Créer une offre d'achat (capital bloqué)
   */
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

    // Quantité limitée par le capital (garde 10% de réserve)
    const maxBudget = state.capital * 0.9;
    const maxQty = Math.floor(maxBudget / price);
    if (maxQty < 1) return null;

    const qty = Math.min(maxQty, 1 + Math.floor(Math.random() * 4));
    const totalLocked = Math.round(price * qty * 100) / 100;

    if (state.capital < totalLocked) return null;

    const durationDays = [1, 1, 2, 2, 7][Math.floor(Math.random() * 5)];

    const offer = new Offer({
      type: 'buy',
      itemId: item.id,
      quantity: qty,
      price,
      ownerId: npc.id,
      durationDays
    });

    // Bloque le capital
    state.capital = Math.round((state.capital - totalLocked) * 100) / 100;

    this.addOffer(offer);
    this.runMatching(offer);

    return { type: 'buy', npcId: npc.id, offer, locked: totalLocked };
  }

  creditNpc(npcId, amount) {
    const state = this.npcStates[npcId];
    if (state && amount > 0) {
      state.capital = Math.round((state.capital + amount) * 100) / 100;
    }
  }

  debitNpc(npcId, amount) {
    const state = this.npcStates[npcId];
    if (!state || state.capital < amount) return false;
    state.capital = Math.round((state.capital - amount) * 100) / 100;
    return true;
  }

  getCapital(npcId) {
    return this.npcStates[npcId]?.capital ?? 0;
  }

  giveItemToNpc(npcId, itemId, quantity, quality = 50, perfection = 50) {
    const state = this.npcStates[npcId];
    if (!state) return;

    const existing = state.inventory.find(
      s => s.itemId === itemId && s.quality === quality && s.perfection === perfection
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      state.inventory.push({ itemId, quantity, quality, perfection });
    }
  }

  getNpcName(id) {
    const npc = NPCS.find(n => n.id === id);
    return npc ? npc.name : id;
  }
}