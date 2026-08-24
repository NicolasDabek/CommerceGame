/**
 * MatchingEngine — Cœur du système de commerce
 *
 * Règles :
 * - Si une offre d'achat ≥ prix de vente → transaction au PRIX DE VENTE
 * - Le surplus (buyPrice - sellPrice) retourne à l'acheteur
 * - En cas d'égalité de prix → priorité à l'offre la plus ancienne (FIFO)
 * - Matching automatique dès qu'une offre est créée ou modifiée
 */

import { Offer } from '../models/Offer.js';
import { Transaction } from '../models/Transaction.js';

export class MatchingEngine {
  /**
   * @param {Object} options
   * @param {Function} options.onTransaction  - Callback appelé à chaque transaction
   * @param {Function} options.getItem        - Fonction pour récupérer un item par id
   */
  constructor(options = {}) {
    this.onTransaction = options.onTransaction || (() => {});
    this.getItem = options.getItem || (() => null);
  }

  /**
   * Tente de matcher une nouvelle offre (ou une offre modifiée) avec les offres existantes
   * @param {Offer} newOffer
   * @param {Offer[]} allOffers  - Liste de toutes les offres actives
   * @returns {{ transactions: Transaction[], updatedOffers: Offer[] }}
   */
  match(newOffer, allOffers) {
    const transactions = [];
    const updatedOffers = [...allOffers];

    if (newOffer.status !== 'active') {
      return { transactions, updatedOffers };
    }

    if (newOffer.type === 'sell') {
      // Cherche les offres d'achat compatibles
      const result = this._matchSellOffer(newOffer, updatedOffers);
      transactions.push(...result.transactions);
    } else if (newOffer.type === 'buy') {
      // Cherche les offres de vente compatibles
      const result = this._matchBuyOffer(newOffer, updatedOffers);
      transactions.push(...result.transactions);
    }

    // Notifie chaque transaction
    transactions.forEach(tx => this.onTransaction(tx));

    return { transactions, updatedOffers };
  }

  /**
   * Matching d'une offre de VENTE contre les offres d'ACHAT existantes
   * On prend les acheteurs qui proposent ≥ prix de vente, du plus ancien au plus récent
   */
  _matchSellOffer(sellOffer, offers) {
    const transactions = [];

    // Filtre les offres d'achat actives pour le même item, prix ≥ sellOffer.price
    const buyCandidates = offers
      .filter(o =>
        o.type === 'buy' &&
        o.status === 'active' &&
        o.itemId === sellOffer.itemId &&
        o.price >= sellOffer.price &&
        o.ownerId !== sellOffer.ownerId   // Pas d'auto-trade
      )
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO (plus ancien d'abord)

    let remainingQty = sellOffer.quantity;

    for (const buyOffer of buyCandidates) {
      if (remainingQty <= 0) break;
      if (buyOffer.status !== 'active') continue;

      const qty = Math.min(remainingQty, buyOffer.quantity);

      // Transaction au PRIX DE VENTE
      const tx = new Transaction({
        itemId: sellOffer.itemId,
        quantity: qty,
        price: sellOffer.price,           // ← prix de vente
        sellerId: sellOffer.ownerId,
        buyerId: buyOffer.ownerId,
        type: 'matching',
        quality: sellOffer.quality,
        perfection: sellOffer.perfection,
        sellOfferId: sellOffer.id,
        buyOfferId: buyOffer.id,
        sellerAvgCost: sellOffer.avgCost
      });

      transactions.push(tx);

      // Mise à jour des quantités
      remainingQty -= qty;
      buyOffer.quantity -= qty;

      if (buyOffer.quantity <= 0) {
        buyOffer.status = 'completed';
      }
    }

    // Met à jour l'offre de vente
    if (remainingQty <= 0) {
      sellOffer.quantity = 0;
      sellOffer.status = 'completed';
    } else {
      sellOffer.quantity = remainingQty;
    }

    return { transactions };
  }

  /**
   * Matching d'une offre d'ACHAT contre les offres de VENTE existantes
   * On prend les vendeurs dont le prix ≤ buyOffer.price, du plus ancien au plus récent
   */
  _matchBuyOffer(buyOffer, offers) {
    const transactions = [];

    const sellCandidates = offers
      .filter(o =>
        o.type === 'sell' &&
        o.status === 'active' &&
        o.itemId === buyOffer.itemId &&
        o.price <= buyOffer.price &&
        o.ownerId !== buyOffer.ownerId
      )
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO

    let remainingQty = buyOffer.quantity;

    for (const sellOffer of sellCandidates) {
      if (remainingQty <= 0) break;
      if (sellOffer.status !== 'active') continue;

      const qty = Math.min(remainingQty, sellOffer.quantity);

      // Transaction au PRIX DE VENTE
      const tx = new Transaction({
        itemId: buyOffer.itemId,
        quantity: qty,
        price: sellOffer.price,           // ← prix de vente
        sellerId: sellOffer.ownerId,
        buyerId: buyOffer.ownerId,
        type: 'matching',
        quality: sellOffer.quality,
        perfection: sellOffer.perfection,
        sellOfferId: sellOffer.id,
        buyOfferId: buyOffer.id,
        sellerAvgCost: sellOffer.avgCost
      });

      transactions.push(tx);

      remainingQty -= qty;
      sellOffer.quantity -= qty;

      if (sellOffer.quantity <= 0) {
        sellOffer.status = 'completed';
      }
    }

    if (remainingQty <= 0) {
      buyOffer.quantity = 0;
      buyOffer.status = 'completed';
    } else {
      buyOffer.quantity = remainingQty;
    }

    return { transactions };
  }

  /**
   * Gère un achat immédiat (buyout)
   * @param {Offer} sellOffer
   * @param {string} buyerId
   * @param {number} quantity
   * @returns {Transaction|null}
   */
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
    if (sellOffer.quantity <= 0) {
      sellOffer.status = 'completed';
    }

    this.onTransaction(tx);
    return tx;
  }

  /**
   * Nettoie les offres expirées
   * @param {Offer[]} offers
   * @param {number} now
   * @returns {Offer[]} offres qui viennent d'expirer
   */
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
