import { Offer } from '../models/Offer.js';

export class AuctionHouse {
  constructor(options = {}) {
    this.matchingEngine = options.matchingEngine;
    this.getPlayerMoney = options.getPlayerMoney || (() => 0);
    this.addPlayerMoney = options.addPlayerMoney || (() => {});
    this.removePlayerMoney = options.removePlayerMoney || (() => false);
    this.getPlayerInventory = options.getPlayerInventory || (() => null);
    this.onOffersChanged = options.onOffersChanged || (() => {});
    this.lockFunds = options.lockFunds || null;
    this.unlockFunds = options.unlockFunds || null;
  }

  createSellOffer({ itemId, quantity, price, buyoutPrice = null, durationDays = 1, quality = 50, perfection = 50, ownerId = 'player', createdAt, msPerGameDay }) {
    if (!itemId || quantity <= 0 || price <= 0) return { success: false, error: 'Paramètres invalides' };
    if (![1, 2, 7].includes(durationDays)) return { success: false, error: 'Durée invalide (1, 2 ou 7 jours)' };
    if (buyoutPrice !== null && buyoutPrice < price) return { success: false, error: "Le prix d'achat immédiat doit être ≥ au prix de départ" };

    if (ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      if (!inventory || inventory.count(itemId) < quantity) return { success: false, error: "Vous n'avez pas assez de cet objet" };
    }

    const fee = Offer.calculateListingFee(price, quantity, durationDays);
    if (ownerId === 'player' && this.getPlayerMoney() < fee) {
      return { success: false, error: `Frais de mise en vente insuffisants (${fee.toFixed(2)} €)` };
    }

    let avgCost = null;
    if (ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      const stacks = inventory.getStacks(itemId).filter(s => s.quality === quality && s.perfection === perfection && s.avgBuyPrice != null);
      const stackQty = stacks.reduce((sum, s) => sum + s.quantity, 0);
      if (stackQty > 0) {
        const totalCost = stacks.reduce((sum, s) => sum + s.avgBuyPrice * s.quantity, 0);
        avgCost = Math.round((totalCost / stackQty) * 100) / 100;
      }
      const removed = inventory.remove(itemId, quantity, quality, perfection);
      if (removed < quantity) return { success: false, error: "Impossible de retirer les objets de l'inventaire" };
      this.removePlayerMoney(fee);
    }

    const offer = new Offer({ type: 'sell', itemId, quantity, price, buyoutPrice, ownerId, durationDays, quality, perfection, avgCost, createdAt, msPerGameDay });
    return { success: true, offer, fee };
  }

  buyout(sellOffer, buyerId, quantity) {
    if (!sellOffer || sellOffer.type !== 'sell' || sellOffer.status !== 'active') return { success: false, error: 'Annonce invalide' };
    if (!sellOffer.buyoutPrice) return { success: false, error: "Cette annonce n'a pas de prix d'achat immédiat" };
    if (quantity <= 0 || quantity > sellOffer.quantity) return { success: false, error: 'Quantité invalide' };
    if (sellOffer.ownerId === buyerId) return { success: false, error: 'Vous ne pouvez pas acheter votre propre annonce' };
    const totalCost = sellOffer.buyoutPrice * quantity;
    if (buyerId === 'player' && this.getPlayerMoney() < totalCost) return { success: false, error: 'Fonds insuffisants' };
    const tx = this.matchingEngine.executeBuyout(sellOffer, buyerId, quantity);
    if (!tx) return { success: false, error: 'Echec de la transaction' };
    if (buyerId === 'player') this.removePlayerMoney(totalCost);
    return { success: true, transaction: tx };
  }

  placeBid(sellOffer, bidderId, bidAmount) {
    if (!sellOffer || sellOffer.type !== 'sell' || sellOffer.status !== 'active') return { success: false, error: 'Annonce invalide' };
    if (sellOffer.ownerId === bidderId) return { success: false, error: 'Vous ne pouvez pas enchérir sur votre propre annonce' };
    const minBid = sellOffer.currentBid != null ? sellOffer.currentBid + 0.01 : sellOffer.price;
    if (bidAmount < minBid) return { success: false, error: `Enchère trop basse (minimum ${minBid.toFixed(2)} €)` };
    if (sellOffer.buyoutPrice != null && bidAmount >= sellOffer.buyoutPrice) {
      return { success: false, error: `Utilisez l'achat immédiat à ${sellOffer.buyoutPrice.toFixed(2)} €` };
    }
    const totalLocked = Math.round(bidAmount * sellOffer.quantity * 100) / 100;
    const previousBidderId = sellOffer.currentBidderId;
    const previousBid = sellOffer.currentBid;
    if (this.lockFunds) {
      if (!this.lockFunds(bidderId, totalLocked)) return { success: false, error: 'Fonds insuffisants' };
    } else if (bidderId === 'player' && this.getPlayerMoney() < totalLocked) {
      return { success: false, error: 'Fonds insuffisants' };
    }
    if (previousBidderId && previousBid != null) {
      const refund = Math.round(previousBid * sellOffer.quantity * 100) / 100;
      if (this.unlockFunds) this.unlockFunds(previousBidderId, refund);
      else if (previousBidderId === 'player') this.addPlayerMoney(refund);
    }
    if (!this.lockFunds && bidderId === 'player') this.removePlayerMoney(totalLocked);
    sellOffer.currentBid = bidAmount;
    sellOffer.currentBidderId = bidderId;
    sellOffer.bids.push({ bidderId, amount: bidAmount, at: Date.now() });
    return { success: true, previousBidderId, previousBid };
  }

  changePrice(offer, newPrice, newBuyoutPrice = undefined) {
    if (!offer || offer.type !== 'sell' || offer.status !== 'active') return { success: false, error: 'Annonce invalide' };
    if (newPrice <= 0) return { success: false, error: 'Prix invalide' };
    const fee = Offer.calculatePriceChangeFee(offer.price, newPrice, offer.quantity);
    if (offer.ownerId === 'player' && fee > 0) {
      if (this.getPlayerMoney() < fee) return { success: false, error: `Frais de modification insuffisants (${fee.toFixed(2)} €)` };
      this.removePlayerMoney(fee);
    }
    offer.price = newPrice;
    if (newBuyoutPrice !== undefined) offer.buyoutPrice = newBuyoutPrice;
    return { success: true, fee };
  }

  cancel(offer) {
    if (!offer || offer.type !== 'sell' || offer.status !== 'active') return { success: false, error: 'Annonce invalide ou déjà terminée' };
    if (offer.currentBidderId === 'player' && offer.currentBid != null) {
      this.addPlayerMoney(Math.round(offer.currentBid * offer.quantity * 100) / 100);
    }
    offer.status = 'cancelled';
    if (offer.ownerId === 'player') {
      const inventory = this.getPlayerInventory();
      if (inventory) inventory.add(offer.itemId, offer.quantity, offer.quality, offer.perfection);
    }
    return { success: true };
  }

  getActiveSellOffers(allOffers) {
    return allOffers.filter(o => o.type === 'sell' && o.status === 'active');
  }

  getPlayerSellOffers(allOffers, playerId = 'player') {
    return allOffers.filter(o => o.type === 'sell' && o.ownerId === playerId && o.status === 'active');
  }
}
