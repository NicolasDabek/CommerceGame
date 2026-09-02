import { Offer } from '../models/Offer.js';

export class BuyHouse {
  constructor(options = {}) {
    this.getPlayerMoney = options.getPlayerMoney || (() => 0);
    this.removePlayerMoney = options.removePlayerMoney || (() => false);
    this.addPlayerMoney = options.addPlayerMoney || (() => {});
    this.onOffersChanged = options.onOffersChanged || (() => {});
  }

  createBuyOffer({ itemId, quantity, price, durationDays = 1, ownerId = 'player', minQuality = 0, minPerfection = 0, createdAt, msPerGameDay }) {
    if (!itemId || quantity <= 0 || price <= 0) {
      return { success: false, error: 'Paramètres invalides' };
    }
    if (![1, 2, 7].includes(durationDays)) {
      return { success: false, error: 'Durée invalide (1, 2 ou 7 jours)' };
    }

    const totalLocked = Math.round(price * quantity * 100) / 100;
    const fee = Offer.calculateListingFee(price, quantity, durationDays);
    const totalCost = Math.round((totalLocked + fee) * 100) / 100;

    if (ownerId === 'player') {
      if (this.getPlayerMoney() < totalCost) {
        return {
          success: false,
          error: `Fonds insuffisants (besoin de ${totalCost.toFixed(2)} € : ${totalLocked.toFixed(2)} € bloqués + ${fee.toFixed(2)} € de frais)`
        };
      }
      this.removePlayerMoney(totalCost);
    }

    const offer = new Offer({
      type: 'buy',
      itemId,
      quantity,
      price,
      buyoutPrice: null,
      ownerId,
      durationDays,
      minQuality,
      minPerfection,
      createdAt,
      msPerGameDay,
      originalQuantity: quantity
    });

    return { success: true, offer, fee, lockedAmount: totalLocked };
  }

  cancel(offer) {
    if (!offer || offer.type !== 'buy' || offer.status !== 'active') {
      return { success: false, error: 'Offre invalide ou déjà terminée' };
    }
    const refund = Math.round(offer.price * offer.quantity * 100) / 100;
    offer.status = 'cancelled';
    if (offer.ownerId === 'player') this.addPlayerMoney(refund);
    return { success: true, refund };
  }

  refundSurplus(buyOffer, actualPricePaid, quantityBought) {
    const surplusPerUnit = buyOffer.price - actualPricePaid;
    if (surplusPerUnit <= 0) return 0;
    const surplus = Math.round(surplusPerUnit * quantityBought * 100) / 100;
    if (buyOffer.ownerId === 'player' && surplus > 0) this.addPlayerMoney(surplus);
    return surplus;
  }

  refundRemaining(offer) {
    if (offer.type !== 'buy') return 0;
    if (offer.quantity <= 0) return 0;
    const refund = Math.round(offer.price * offer.quantity * 100) / 100;
    if (offer.ownerId === 'player') this.addPlayerMoney(refund);
    return refund;
  }

  fulfill(buyOffer, sellerId, quantity, hasItemFn) {
    if (!buyOffer || buyOffer.type !== 'buy' || buyOffer.status !== 'active') {
      return { success: false, error: "Offre d'achat invalide" };
    }
    if (buyOffer.ownerId === sellerId) {
      return { success: false, error: 'Vous ne pouvez pas vendre à votre propre offre' };
    }
    if (quantity <= 0 || quantity > buyOffer.quantity) {
      return { success: false, error: 'Quantité invalide' };
    }
    if (typeof hasItemFn === 'function' && !hasItemFn(buyOffer.itemId, quantity)) {
      return { success: false, error: "Vous n'avez pas assez de cet objet" };
    }
    const total = Math.round(buyOffer.price * quantity * 100) / 100;
    buyOffer.quantity -= quantity;
    if (buyOffer.quantity <= 0) buyOffer.status = 'completed';
    return {
      success: true,
      quantity,
      price: buyOffer.price,
      total,
      itemId: buyOffer.itemId,
      buyerId: buyOffer.ownerId
    };
  }

  getActiveBuyOffers(allOffers) {
    return allOffers.filter(o => o.type === 'buy' && o.status === 'active');
  }

  getPlayerBuyOffers(allOffers, playerId = 'player') {
    return allOffers.filter(o => o.type === 'buy' && o.ownerId === playerId && o.status === 'active');
  }
}
