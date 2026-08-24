/**
 * Hôtel de vente (Auction House)
 * - Création d'annonces de vente
 * - Achat immédiat (buyout)
 * - Modification de prix
 * - Annulation
 * - Frais de mise en vente
 */

import { Offer } from '../models/Offer.js';
import { MatchingEngine } from './MatchingEngine.js';

export class AuctionHouse {
  /**
   * @param {Object} options
   * @param {MatchingEngine} options.matchingEngine
   * @param {Function} options.getPlayerMoney
   * @param {Function} options.addPlayerMoney
   * @param {Function} options.removePlayerMoney
   * @param {Function} options.getPlayerInventory
   * @param {Function} options.onOffersChanged
   */
  constructor(options = {}) {
    this.matchingEngine = options.matchingEngine;
    this.getPlayerMoney = options.getPlayerMoney || (() => 0);
    this.addPlayerMoney = options.addPlayerMoney || (() => {});
    this.removePlayerMoney = options.removePlayerMoney || (() => false);
    this.getPlayerInventory = options.getPlayerInventory || (() => null);
    this.onOffersChanged = options.onOffersChanged || (() => {});
  }

  /**
   * Crée une nouvelle annonce de vente
   * @returns {{ success: boolean, offer?: Offer, error?: string, fee?: number }}
   */
  createSellOffer({ itemId, quantity, price, buyoutPrice = null, durationDays = 1, quality = 50, perfection = 50, ownerId = 'player' }) {
    // Validations de base
    if (!itemId || quantity <= 0 || price <= 0) {
      return { success: false, error: 'Paramètres invalides' };
    }
    if (![1, 2, 7].includes(durationDays)) {
      return { success: false, error: 'Durée invalide (1, 2 ou 7 jours)' };
    }
    if (buyoutPrice !== null && buyoutPrice < price) {
      return { success: false, error: 'Le prix d\'achat immédiat doit être ≥ au prix de départ' };
    }

    // Vérifie que le joueur possède les items
    if (ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      if (!inventory || inventory.count(itemId) < quantity) {
        return { success: false, error: 'Vous n\'avez pas assez de cet objet' };
      }
    }

    // Calcul des frais
    const fee = Offer.calculateListingFee(price, quantity, durationDays);

    // Vérifie que le joueur peut payer les frais
    if (ownerId === 'player') {
      if (this.getPlayerMoney() < fee) {
        return { success: false, error: `Frais de mise en vente insuffisants (${fee.toFixed(2)} €)` };
      }
    }

    // Retire les items de l'inventaire + les frais
    if (ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      const removed = inventory.remove(itemId, quantity, quality, perfection);
      if (removed < quantity) {
        return { success: false, error: 'Impossible de retirer les objets de l\'inventaire' };
      }
      this.removePlayerMoney(fee);
    }

    // Crée l'offre
    const offer = new Offer({
      type: 'sell',
      itemId,
      quantity,
      price,
      buyoutPrice,
      ownerId,
      durationDays,
      quality,
      perfection
    });

    return { success: true, offer, fee };
  }

  /**
   * Achat immédiat (buyout)
   */
  buyout(sellOffer, buyerId, quantity) {
    if (!sellOffer || sellOffer.type !== 'sell' || sellOffer.status !== 'active') {
      return { success: false, error: 'Annonce invalide' };
    }
    if (!sellOffer.buyoutPrice) {
      return { success: false, error: 'Cette annonce n\'a pas de prix d\'achat immédiat' };
    }
    if (quantity <= 0 || quantity > sellOffer.quantity) {
      return { success: false, error: 'Quantité invalide' };
    }
    if (sellOffer.ownerId === buyerId) {
      return { success: false, error: 'Vous ne pouvez pas acheter votre propre annonce' };
    }

    const totalCost = sellOffer.buyoutPrice * quantity;

    // Vérifie l'argent de l'acheteur (uniquement si c'est le joueur)
    if (buyerId === 'player') {
      if (this.getPlayerMoney() < totalCost) {
        return { success: false, error: 'Fonds insuffisants' };
      }
    }

    // Exécute via le MatchingEngine
    const tx = this.matchingEngine.executeBuyout(sellOffer, buyerId, quantity);
    if (!tx) {
      return { success: false, error: 'Échec de la transaction' };
    }

    // Débit / crédit
    if (buyerId === 'player') {
      this.removePlayerMoney(totalCost);
    }
    // Le vendeur reçoit l'argent (géré plus tard dans le flux global)

    return { success: true, transaction: tx };
  }

  /**
   * Place une enchère sur une offre de vente
   * - Le montant est un prix unitaire
   * - Doit être strictement supérieur à l'enchère actuelle (ou au prix de départ)
   * - L'argent du joueur est bloqué ; l'ancien enchérisseur est remboursé
   * @returns {{ success: boolean, error?: string, previousBidderId?: string, previousBid?: number }}
   */
  placeBid(sellOffer, bidderId, bidAmount) {
    if (!sellOffer || sellOffer.type !== 'sell' || sellOffer.status !== 'active') {
      return { success: false, error: 'Annonce invalide' };
    }
    if (sellOffer.ownerId === bidderId) {
      return { success: false, error: 'Vous ne pouvez pas enchérir sur votre propre annonce' };
    }

    const minBid = sellOffer.currentBid != null
      ? sellOffer.currentBid + 0.01
      : sellOffer.price;

    if (bidAmount < minBid) {
      return {
        success: false,
        error: `Enchère trop basse (minimum ${minBid.toFixed(2)} €)`
      };
    }

    // Si buyout existe et que l'enchère le dépasse → on refuse (il faut utiliser buyout)
    if (sellOffer.buyoutPrice != null && bidAmount >= sellOffer.buyoutPrice) {
      return {
        success: false,
        error: `Utilisez l'achat immédiat à ${sellOffer.buyoutPrice.toFixed(2)} €`
      };
    }

    const totalLocked = Math.round(bidAmount * sellOffer.quantity * 100) / 100;

    // Vérifie les fonds du joueur
    if (bidderId === 'player') {
      if (this.getPlayerMoney() < totalLocked) {
        return { success: false, error: 'Fonds insuffisants' };
      }
    }

    // Rembourse l'ancien enchérisseur (si joueur)
    const previousBidderId = sellOffer.currentBidderId;
    const previousBid = sellOffer.currentBid;
    if (previousBidderId === 'player' && previousBid != null) {
      const refund = Math.round(previousBid * sellOffer.quantity * 100) / 100;
      this.addPlayerMoney(refund);
    }

    // Bloque l'argent du nouvel enchérisseur
    if (bidderId === 'player') {
      this.removePlayerMoney(totalLocked);
    }

    // Met à jour l'offre
    sellOffer.currentBid = bidAmount;
    sellOffer.currentBidderId = bidderId;
    sellOffer.bids.push({
      bidderId,
      amount: bidAmount,
      at: Date.now()
    });

    return {
      success: true,
      previousBidderId,
      previousBid
    };
  }

  /**
   * Modifie le prix d'une annonce existante
   */
  changePrice(offer, newPrice, newBuyoutPrice = undefined) {
    if (!offer || offer.type !== 'sell' || offer.status !== 'active') {
      return { success: false, error: 'Annonce invalide' };
    }
    if (newPrice <= 0) {
      return { success: false, error: 'Prix invalide' };
    }

    const fee = Offer.calculatePriceChangeFee(offer.price, newPrice, offer.quantity);

    if (offer.ownerId === 'player' && fee > 0) {
      if (this.getPlayerMoney() < fee) {
        return { success: false, error: `Frais de modification insuffisants (${fee.toFixed(2)} €)` };
      }
      this.removePlayerMoney(fee);
    }

    offer.price = newPrice;
    if (newBuyoutPrice !== undefined) {
      offer.buyoutPrice = newBuyoutPrice;
    }

    return { success: true, fee };
  }

  /**
   * Annule une annonce et rend les objets au vendeur
   */
  cancel(offer) {
    if (!offer || offer.type !== 'sell' || offer.status !== 'active') {
      return { success: false, error: 'Annonce invalide ou déjà terminée' };
    }

    // Rembourse l'enchérisseur actuel s'il y en a un
    if (offer.currentBidderId === 'player' && offer.currentBid != null) {
      const refund = Math.round(offer.currentBid * offer.quantity * 100) / 100;
      this.addPlayerMoney(refund);
    }

    offer.status = 'cancelled';

    // Rend les objets à l'inventaire si c'est le joueur
    if (offer.ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      if (inventory) {
        inventory.add(offer.itemId, offer.quantity, offer.quality, offer.perfection);
      }
    }

    return { success: true };
  }

  /**
   * Retourne toutes les offres de vente actives
   */
  getActiveSellOffers(allOffers) {
    return allOffers.filter(o => o.type === 'sell' && o.status === 'active');
  }

  /**
   * Retourne les annonces du joueur
   */
  getPlayerSellOffers(allOffers, playerId = 'player') {
    return allOffers.filter(o => o.type === 'sell' && o.ownerId === playerId && o.status === 'active');
  }
}
