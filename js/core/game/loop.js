/**
 * Game — boucle : tick, expiration des offres, horloge de l'économie.
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

import { Transaction } from '../../models/Transaction.js';
import { RESERVE_ID } from '../../systems/MarketReserve.js';

export const GameLoop = {

  // ============================================
  // Expiration
  // ============================================
  checkExpirations() {
    const now = Date.now();
    const expired = this.matchingEngine.expireOffers(this.offers, now);

    expired.forEach(offer => {
      if (offer.type === 'sell') {
        // S'il y a une enchère gagnante → transaction
        if (offer.currentBid != null && offer.currentBidderId) {
          const tx = new Transaction({
            itemId: offer.itemId,
            quantity: offer.quantity,
            price: offer.currentBid,
            sellerId: offer.ownerId,
            buyerId: offer.currentBidderId,
            type: 'auction_end',
            quality: offer.quality,
            perfection: offer.perfection,
            sellOfferId: offer.id,
            sellerAvgCost: offer.avgCost
          });

          // L'argent de l'enchérisseur est déjà bloqué → on crédite le vendeur
          // (pour le joueur enchérisseur, l'argent a déjà été retiré)
          this._handleTransaction(tx);
          offer.status = 'completed';
          offer.quantity = 0;
        } else {
          // Personne n'a enchéri → rend les objets au vendeur
          if (offer.ownerId === 'player') {
            this.player.inventory.add(offer.itemId, offer.quantity, offer.quality, offer.perfection);
          } else if (offer.ownerId === RESERVE_ID) {
            this.reserve.addStock(offer.itemId, offer.quantity);
          } else {
            this.npcController.giveItemToNpc(
              offer.ownerId, offer.itemId, offer.quantity, offer.quality, offer.perfection
            );
          }
        }
      } else if (offer.type === 'buy') {
        // Rembourse le capital bloqué restant
        if (offer.ownerId === 'player') {
          this.buyHouse.refundRemaining(offer);
        } else if (offer.ownerId === RESERVE_ID) {
          if (offer.quantity > 0) this.reserve.deposit(Math.round(offer.price * offer.quantity * 100) / 100, 'refund');
        } else if (offer.quantity > 0) {
          const refund = Math.round(offer.price * offer.quantity * 100) / 100;
          this.npcController.creditNpc(offer.ownerId, refund);
        }
      }
    });

    if (expired.length > 0) {
      this.save();
      this._notifyUI();
    }

    return expired;
  },


  // ============================================
  // Tick PNJ + Temps
  // ============================================
  tick() {
    const now = Date.now();

    // Temps
    this.timeManager.tick(now);
    this.timeManager.updateUI();

    // PNJ
    const actions = this.npcController.tick(now);
    if (actions.length > 0) {
      this.save();
      this._notifyUI();
    }

    // Expirations
    this.checkExpirations();
  },


  /** L'économie suit le temps de jeu (événements, expirations). */
  _wireEconomyClock() {
    this.economy.clock = () => (this.timeManager ? this.timeManager.now() : Date.now());
    Object.defineProperty(this.economy, 'msPerGameDay', {
      configurable: true,
      get: () => this.timeManager?.msPerGameDay || 24 * 60 * 60 * 1000
    });
  },
};
