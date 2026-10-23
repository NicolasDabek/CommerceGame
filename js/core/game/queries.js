/**
 * Game — lecture du marché pour l'interface : offres, objets, prix ajustés, fiches et lignes de la Halle.
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

import { ITEMS, getItemById } from '../../data/items.js';
import { NPCS } from '../../data/npcs.js';
import { RESERVE_ID, RESERVE_NAME } from '../../systems/MarketReserve.js';

export const GameQueries = {

  // ============================================
  // Getters UI
  // ============================================
  getActiveSellOffers() {
    return this.auctionHouse.getActiveSellOffers(this.offers);
  },


  getActiveBuyOffers() {
    return this.buyHouse.getActiveBuyOffers(this.offers);
  },


  getPlayerSellOffers() {
    return this.auctionHouse.getPlayerSellOffers(this.offers);
  },


  getPlayerBuyOffers() {
    return this.buyHouse.getPlayerBuyOffers(this.offers);
  },


  getItem(itemId) {
    return getItemById(itemId);
  },


  getAllItems() {
    return ITEMS;
  },


  getAdjustedMarketPrice(itemId, quality = 50, perfection = 50) {
    const avg = this.economy.getAveragePrice(itemId);
    return this.economy.applyConditionModifier(avg, quality, perfection);
  },


  /**
   * Analyse marché d'un objet : carnet, historique, stock joueur, marges estimées.
   * Qualité / perfection optionnelles pour le prix ajusté (annonces, inventaire).
   */
  getItemInsight(itemId, quality = 50, perfection = 50) {
    const item = getItemById(itemId);
    const average = this.economy.getAveragePrice(itemId);
    const adjusted = this.getAdjustedMarketPrice(itemId, quality, perfection);
    const historyEntries = this.economy.priceHistory[itemId] || [];
    const history = historyEntries.slice(-16).map(p => p.price);
    const high = history.length ? Math.max(...history) : null;
    const low = history.length ? Math.min(...history) : null;
    const lastEntry = historyEntries.length ? historyEntries[historyEntries.length - 1] : null;

    const sellOffers = this.offers.filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === itemId);
    const buyOffers = this.offers.filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === itemId);
    const going = (o) => (o.currentBid != null ? o.currentBid : o.price);
    const ask = (o) => (o.buyoutPrice != null ? o.buyoutPrice : going(o));
    const bestSell = sellOffers.length ? Math.min(...sellOffers.map(ask)) : null;
    const bestGoing = sellOffers.length ? Math.min(...sellOffers.map(going)) : null;
    const bestBuy = buyOffers.length ? Math.max(...buyOffers.map(o => o.price)) : null;
    const spread = bestSell != null && bestBuy != null
      ? Math.round((bestSell - bestBuy) * 100) / 100
      : null;

    const ownedQty = this.inventory.count(itemId);
    const avgCost = this._getAveragePlayerCost(itemId);
    const freeSlots = this.inventory.freeSlots;
    const money = this.player.money;

    let marginIfSellToBestBuy = null;
    let marginIfSellToBestBuyPct = null;
    if (avgCost != null && bestBuy != null) {
      marginIfSellToBestBuy = Math.round((bestBuy - avgCost) * 100) / 100;
      marginIfSellToBestBuyPct = avgCost > 0
        ? Math.round(((bestBuy - avgCost) / avgCost) * 1000) / 10
        : null;
    }

    let discountIfBuyBestSell = null;
    let discountIfBuyBestSellPct = null;
    if (bestSell != null && average > 0) {
      discountIfBuyBestSell = Math.round((average - bestSell) * 100) / 100;
      discountIfBuyBestSellPct = Math.round(((average - bestSell) / average) * 1000) / 10;
    }

    const now = this.timeManager?.now?.() || Date.now();
    const dayMs = this.timeManager?.msPerGameDay || (24 * 60 * 60 * 1000);
    const recentTx = this.transactions.filter(tx => tx.itemId === itemId && now - tx.timestamp <= dayMs);

    const explanation = this.economy.explainPrice(itemId);
    const supply = this.getSupplyView(itemId);

    return {
      item,
      itemId,
      supply,
      average,
      adjusted,
      fair: explanation.fair,
      explanation,
      bestSell,
      bestGoing,
      bestBuy,
      spread,
      high,
      low,
      lastSold: lastEntry ? { price: lastEntry.price, timestamp: lastEntry.timestamp } : null,
      history,
      trend: this.economy.getTrend(itemId),
      volume: recentTx.reduce((sum, tx) => sum + tx.quantity, 0),
      sellCount: sellOffers.length,
      buyCount: buyOffers.length,
      sellQty: sellOffers.reduce((s, o) => s + o.quantity, 0),
      buyQty: buyOffers.reduce((s, o) => s + o.quantity, 0),
      ownedQty,
      avgCost,
      freeSlots,
      money,
      canAffordBestSell: bestSell == null ? null : money >= bestSell,
      marginIfSellToBestBuy,
      marginIfSellToBestBuyPct,
      discountIfBuyBestSell,
      discountIfBuyBestSellPct
    };
  },


  getMarketRows() {
    return ITEMS.map(item => {
      const insight = this.getItemInsight(item.id);
      return {
        item,
        average: insight.average,
        bestSell: insight.bestSell,
        bestBuy: insight.bestBuy,
        spread: insight.spread,
        volume: insight.volume,
        trend: insight.trend,
        history: insight.history,
        high: insight.high,
        low: insight.low,
        lastSold: insight.lastSold,
        ownedQty: insight.ownedQty,
        avgCost: insight.avgCost,
        marginIfSellToBestBuy: insight.marginIfSellToBestBuy,
        marginIfSellToBestBuyPct: insight.marginIfSellToBestBuyPct,
        discountIfBuyBestSell: insight.discountIfBuyBestSell,
        discountIfBuyBestSellPct: insight.discountIfBuyBestSellPct,
        sellCount: insight.sellCount,
        buyCount: insight.buyCount,
        fair: insight.fair,
        explanation: insight.explanation,
        supply: insight.supply
      };
    });
  },


  /** Offre / demande d'un objet : stock, demande / jour, couverture, statut, explication. */
  getSupplyView(itemId) {
    return this.supplyDemand.getView(itemId, this.economy);
  },


  getNpcProfiles() {
    return NPCS.map(npc => {
      const state = this.npcController.npcStates[npc.id] || {};
      const npcTransactions = this.transactions.filter(tx => tx.sellerId === npc.id || tx.buyerId === npc.id);
      const activeOffers = this.offers.filter(o => o.ownerId === npc.id && o.status === 'active');
      const sold = npcTransactions.filter(tx => tx.sellerId === npc.id).reduce((sum, tx) => sum + tx.total, 0);
      const bought = npcTransactions.filter(tx => tx.buyerId === npc.id).reduce((sum, tx) => sum + tx.total, 0);

      return {
        ...npc,
        capital: state.capital ?? npc.capital,
        inventory: state.inventory || [],
        activeOffers,
        transactions: npcTransactions.slice(0, 5),
        sold: Math.round(sold * 100) / 100,
        bought: Math.round(bought * 100) / 100
      };
    });
  },


  getNpcName(id) {
    if (id === 'player') return 'Vous';
    if (id === RESERVE_ID) return RESERVE_NAME;
    return this.npcController.getNpcName(id);
  },
};
