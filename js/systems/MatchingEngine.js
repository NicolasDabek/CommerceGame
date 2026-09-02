/**
 * MatchingEngine — Cœur du système de commerce
 */

import { Transaction } from '../models/Transaction.js';

export class MatchingEngine {
  constructor(options = {}) {
    this.onTransaction = options.onTransaction || (() => {});
    this.getItem = options.getItem || (() => null);
  }

  match(newOffer, allOffers) {
    const transactions = [];
    if (!newOffer || newOffer.status !== 'active') {
      return { transactions, updatedOffers: allOffers };
    }

    if (newOffer.type === 'sell') {
      transactions.push(...this._matchSellOffer(newOffer, allOffers).transactions);
    } else if (newOffer.type === 'buy') {
      transactions.push(...this._matchBuyOffer(newOffer, allOffers).transactions);
    }

    transactions.forEach(tx => this.onTransaction(tx));
    return { transactions, updatedOffers: allOffers };
  }

  _qualityOk(sellOffer, buyOffer) {
    const minQ = buyOffer.minQuality ?? 0;
    const minP = buyOffer.minPerfection ?? 0;
    return (sellOffer.quality ?? 50) >= minQ && (sellOffer.perfection ?? 50) >= minP;
  }

  _matchSellOffer(sellOffer, offers) {
    const transactions = [];
    const buyCandidates = offers
      .filter(o =>
        o.type === 'buy' &&
        o.status === 'active' &&
        o.itemId === sellOffer.itemId &&
        o.price >= sellOffer.price &&
        o.ownerId !== sellOffer.ownerId &&
        this._qualityOk(sellOffer, o)
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    let remainingQty = sellOffer.quantity;

    for (const buyOffer of buyCandidates) {
      if (remainingQty <= 0) break;
      if (buyOffer.status !== 'active') continue;

      const qty = Math.min(remainingQty, buyOffer.quantity);
      transactions.push(new Transaction({
        itemId: sellOffer.itemId,
        quantity: qty,
        price: sellOffer.price,
        sellerId: sellOffer.ownerId,
        buyerId: buyOffer.ownerId,
        type: 'matching',
        quality: sellOffer.quality,
        perfection: sellOffer.perfection,
        sellOfferId: sellOffer.id,
        buyOfferId: buyOffer.id,
        sellerAvgCost: sellOffer.avgCost
      }));

      remainingQty -= qty;
      buyOffer.quantity -= qty;
      if (buyOffer.quantity <= 0) buyOffer.status = 'completed';
    }

    sellOffer.quantity = remainingQty;
    if (remainingQty <= 0) sellOffer.status = 'completed';
    return { transactions };
  }

  _matchBuyOffer(buyOffer, offers) {
    const transactions = [];
    const sellCandidates = offers
      .filter(o =>
        o.type === 'sell' &&
        o.status === 'active' &&
        o.itemId === buyOffer.itemId &&
        o.price <= buyOffer.price &&
        o.ownerId !== buyOffer.ownerId &&
        this._qualityOk(o, buyOffer)
      )
      .sort((a, b) => a.createdAt - b.createdAt);

    let remainingQty = buyOffer.quantity;

    for (const sellOffer of sellCandidates) {
      if (remainingQty <= 0) break;
      if (sellOffer.status !== 'active') continue;

      const qty = Math.min(remainingQty, sellOffer.quantity);
      transactions.push(new Transaction({
        itemId: buyOffer.itemId,
        quantity: qty,
        price: sellOffer.price,
        sellerId: sellOffer.ownerId,
        buyerId: buyOffer.ownerId,
        type: 'matching',
        quality: sellOffer.quality,
        perfection: sellOffer.perfection,
        sellOfferId: sellOffer.id,
        buyOfferId: buyOffer.id,
        sellerAvgCost: sellOffer.avgCost
      }));

      remainingQty -= qty;
      sellOffer.quantity -= qty;
      if (sellOffer.quantity <= 0) sellOffer.status = 'completed';
    }

    buyOffer.quantity = remainingQty;
    if (remainingQty <= 0) buyOffer.status = 'completed';
    return { transactions };
  }

  executeBuyout(sellOffer, buyerId, quantity) {
    if (
      sellOffer.type !== 'sell' ||
      sellOffer.status !== 'active' ||
      !sellOffer.buyoutPrice ||
      quantity <= 0 ||
      quantity > sellOffer.quantity ||
      sellOffer.ownerId === buyerId
    ) {
      return null;
    }

    const tx = new Transaction({
      itemId: sellOffer.itemId,
      quantity,
      price: sellOffer.buyoutPrice,
      sellerId: sellOffer.ownerId,
      buyerId,
      type: 'buyout',
      quality: sellOffer.quality,
      perfection: sellOffer.perfection,
      sellOfferId: sellOffer.id,
      sellerAvgCost: sellOffer.avgCost
    });

    sellOffer.quantity -= quantity;
    if (sellOffer.quantity <= 0) sellOffer.status = 'completed';
    this.onTransaction(tx);
    return tx;
  }

  expireOffers(offers, now = Date.now()) {
    const expired = [];
    offers.forEach(offer => {
      if (offer.status === 'active' && offer.isExpired(now)) {
        offer.status = 'expired';
        expired.push(offer);
      }
    });
    return expired;
  }
}
