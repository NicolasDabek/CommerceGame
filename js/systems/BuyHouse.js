/**
 * Hôtel d'achat (Buy House)
 * - Création d'offres d'achat
 * - L'argent est bloqué à l'avance
 * - Plusieurs offres possibles sur le même objet
 * - Même système de durée et de frais que l'hôtel de vente
 */

import { Offer } from '../models/Offer.js';

export class BuyHouse {
  /**
   * @param {Object} options
   * @param {Function} options.getPlayerMoney
   * @param {Function} options.removePlayerMoney
   * @param {Function} options.addPlayerMoney
   * @param {Function} options.onOffersChanged
   */
  constructor(options = {}) {
    this.getPlayerMoney = options.getPlayerMoney || (() => 0);
    this.removePlayerMoney = options.removePlayerMoney || (() => false);
    this.addPlayerMoney = options.addPlayerMoney || (() => {});
    this.onOffersChanged = options.onOffersChanged || (() => {});
  }

  /**
   * Crée une nouvelle offre d'achat
   * L'argent est débité immédiatement (bloqué)
   * @returns {{ success: boolean, offer?: Offer, error?: string, fee?: number, lockedAmount?: number }}
   */
  createBuyOffer({ itemId, quantity, price, durationDays = 1, ownerId = 'player' }) {
    // Validations
    if (!itemId || quantity <= 0 || price <= 0) {
      return { success: false, error: 'Paramètres invalides' };
    }
    if (![1, 2, 7].includes(durationDays)) {
      return { success: false, error: 'Durée invalide (1, 2 ou 7 jours)' };
    }

    const totalLocked = Math.round(price * quantity * 100) / 100;
    const fee = Offer.calculateListingFee(price, quantity, durationDays);
    const totalCost = Math.round((totalLocked + fee) * 100) / 100;

    // Vérifie les fonds (joueur uniquement)
    if (ownerId === 'player') {
      if (this.getPlayerMoney() < totalCost) {
        return {
          success: false,
          error: `Fonds insuffisants (besoin de ${totalCost.toFixed(2)} € : ${totalLocked.toFixed(2)} € bloqués + ${fee.toFixed(2)} € de frais)`
        };
      }
    }

    // Débite l'argent (montant bloqué + frais)
    if (ownerId === 'player') {
      this.removePlayerMoney(totalCost);
    }

    // Crée l'offre
    const offer = new Offer({
      type: 'buy',
      itemId,
      quantity,
      price,
      buyoutPrice: null,
      ownerId,
      durationDays
      // quality / perfection non pertinents pour une offre d'achat
    });

    return {
      success: true,
      offer,
      fee,
      lockedAmount: totalLocked
    };
  }

  /**
   * Annule une offre d'achat et rend l'argent bloqué au joueur
   * (les frais de mise en offre ne sont PAS remboursés)
   */
  cancel(offer) {
    if (!offer || offer.type !== 'buy' || offer.status !== 'active') {
      return { success: false, error: 'Offre invalide ou déjà terminée' };
    }

    const refund = Math.round(offer.price * offer.quantity * 100) / 100;
    offer.status = 'cancelled';

    if (offer.ownerId === 'player') {
      this.addPlayerMoney(refund);
    }

    return { success: true, refund };
  }

  /**
   * Quand une offre d'achat est partiellement ou totalement remplie,
   * on peut avoir un surplus à rendre (si le prix de vente était inférieur)
   * Cette méthode est appelée par le flux global après un matching.
   */
  refundSurplus(buyOffer, actualPricePaid, quantityBought) {
    // actualPricePaid = prix unitaire de la transaction (prix de vente)
    // buyOffer.price = ce que l'acheteur était prêt à payer
    const surplusPerUnit = buyOffer.price - actualPricePaid;
    if (surplusPerUnit <= 0) return 0;

    const surplus = Math.round(surplusPerUnit * quantityBought * 100) / 100;

    if (buyOffer.ownerId === 'player' && surplus > 0) {
      this.addPlayerMoney(surplus);
    }

    return surplus;
  }

  /**
   * Quand une offre d'achat expire ou est annulée avec quantité restante,
   * on rend l'argent correspondant à la quantité non utilisée.
   */
  refundRemaining(offer) {
    if (offer.type !== 'buy') return 0;
    if (offer.quantity <= 0) return 0;

    const refund = Math.round(offer.price * offer.quantity * 100) / 100;

    if (offer.ownerId === 'player') {
      this.addPlayerMoney(refund);
    }

    return refund;
  }

  /**
   * Le joueur (ou un PNJ) vend directement à une offre d'achat existante.
   * Transaction au prix de l'offre d'achat.
   * @returns {{ success: boolean, error?: string, quantity?: number, total?: number }}
   */
  fulfill(buyOffer, sellerId, quantity, hasItemFn) {
    if (!buyOffer || buyOffer.type !== 'buy' || buyOffer.status !== 'active') {
      return { success: false, error: 'Offre d\'achat invalide' };
    }
    if (buyOffer.ownerId === sellerId) {
      return { success: false, error: 'Vous ne pouvez pas vendre à votre propre offre' };
    }
    if (quantity <= 0 || quantity > buyOffer.quantity) {
      return { success: false, error: 'Quantité invalide' };
    }

    // Vérifie que le vendeur possède les objets
    if (typeof hasItemFn === 'function' && !hasItemFn(buyOffer.itemId, quantity)) {
      return { success: false, error: 'Vous n\'avez pas assez de cet objet' };
    }

    const total = Math.round(buyOffer.price * quantity * 100) / 100;

    // Réduit la quantité de l'offre
    buyOffer.quantity -= quantity;
    if (buyOffer.quantity <= 0) {
      buyOffer.status = 'completed';
    }

    return {
      success: true,
      quantity,
      price: buyOffer.price,
      total,
      itemId: buyOffer.itemId,
      buyerId: buyOffer.ownerId
    };
  }

  /**
   * Retourne toutes les offres d'achat actives
   */
  getActiveBuyOffers(allOffers) {
    return allOffers.filter(o => o.type === 'buy' && o.status === 'active');
  }

  /**
   * Retourne les offres d'achat du joueur
   */
  getPlayerBuyOffers(allOffers, playerId = 'player') {
    return allOffers.filter(o => o.type === 'buy' && o.ownerId === playerId && o.status === 'active');
  }
}
