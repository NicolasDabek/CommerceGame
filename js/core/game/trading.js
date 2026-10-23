/**
 * Game — argent du joueur, création d'offres, achats, enchères, ventes, annulations et règlement des transactions.
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

import { getItemById } from '../../data/items.js';
import { Transaction } from '../../models/Transaction.js';
import { RESERVE_ID, RESERVE_TUNING } from '../../systems/MarketReserve.js';

export const GameTrading = {

  // ============================================
  // Argent
  // ============================================
  addMoney(amount) {
    this.player.addMoney(amount);
    this._notifyMoney();
  },


  removeMoney(amount) {
    const ok = this.player.removeMoney(amount);
    if (ok) this._notifyMoney();
    return ok;
  },


  // ============================================
  // Création d'offres (joueur)
  // ============================================
  createSellOffer(params) {
    const adjusted = this.getAdjustedMarketPrice(params.itemId, params.quality, params.perfection);
    if (params.price == null && adjusted > 0) params.price = adjusted;

    const result = this.auctionHouse.createSellOffer({
      ...params,
      ownerId: 'player'
    });

    if (!result.success) return result;

    this.offers.push(result.offer);
    this.matchingEngine.match(result.offer, this.offers);

    this.save();
    this._notifyUI();
    return result;
  },


  createBuyOffer(params) {
    const result = this.buyHouse.createBuyOffer({
      ...params,
      ownerId: 'player'
    });

    if (!result.success) return result;

    this.offers.push(result.offer);
    this.matchingEngine.match(result.offer, this.offers);

    this.save();
    this._notifyUI();
    return result;
  },


  // ============================================
  // Achat immédiat
  // ============================================
  buyout(offerId, quantity) {
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Annonce introuvable' };

    // auctionHouse.buyout débite le joueur + executeBuyout → _handleTransaction
    // (crédit vendeur, objets dans l'inventaire, stats, économie)
    const result = this.auctionHouse.buyout(offer, 'player', quantity);
    if (!result.success) return result;

    this.save();
    this._notifyUI();
    return result;
  },


  // ============================================
  // Enchères
  // ============================================
  placeBid(offerId, bidAmount) {
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Annonce introuvable' };

    const result = this.auctionHouse.placeBid(offer, 'player', bidAmount);
    if (result.success) {
      this.save();
      this._notifyUI();
    }
    return result;
  },


  // ============================================
  // Vendre à une offre d'achat
  // ============================================
  fulfillBuyOffer(offerId, quantity) {
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Offre introuvable' };

    const result = this.buyHouse.fulfill(
      offer,
      'player',
      quantity,
      (itemId, qty) => this.inventory.count(itemId) >= qty
    );

    if (!result.success) return result;

    const avgCost = this._getAveragePlayerCost(result.itemId);

    // Retire les objets de l'inventaire du joueur
    // (on prend le premier stack disponible)
    const removed = this.inventory.remove(result.itemId, result.quantity);
    if (removed < result.quantity) {
      // Rollback basique
      offer.quantity += result.quantity;
      offer.status = 'active';
      return { success: false, error: 'Impossible de retirer les objets' };
    }

    // Crée la transaction (le prix est celui de l'offre d'achat)
    const tx = new Transaction({
      itemId: result.itemId,
      quantity: result.quantity,
      price: result.price,
      sellerId: 'player',
      buyerId: result.buyerId,
      type: 'matching',
      buyOfferId: offer.id,
      sellerAvgCost: avgCost
    });

    this._handleTransaction(tx);

    this.save();
    this._notifyUI();
    return { success: true, transaction: tx, total: result.total };
  },


  // ============================================
  // Annulation
  // ============================================
  cancelOffer(offerId) {
    const offer = this.offers.find(o => o.id === offerId);
    if (!offer) return { success: false, error: 'Offre introuvable' };

    let result;
    if (offer.type === 'sell') {
      result = this.auctionHouse.cancel(offer);
    } else {
      result = this.buyHouse.cancel(offer);
    }

    if (result.success) {
      this.save();
      this._notifyUI();
    }
    return result;
  },


  // ============================================
  // Gestion interne des transactions
  // ============================================
  _handleTransaction(tx) {
    const item = getItemById(tx.itemId);
    const marketPrice = this.economy.getAveragePrice(tx.itemId);
    tx.marketPrice = marketPrice;
    tx.priceDeltaPct = marketPrice > 0
      ? Math.round(((tx.price - marketPrice) / marketPrice) * 1000) / 10
      : 0;

    if (tx.sellerId === 'player') {
      const avgCost = tx.sellerAvgCost ?? this._getAveragePlayerCost(tx.itemId);
      if (avgCost != null) {
        tx.playerMargin = Math.round((tx.price - avgCost) * tx.quantity * 100) / 100;
        tx.playerMarginPct = avgCost > 0
          ? Math.round(((tx.price - avgCost) / avgCost) * 1000) / 10
          : null;
      }
    }

    this.transactions.unshift(tx);
    this.txCounter += 1;

    // Économie : met à jour le prix moyen (prix ramené à qualité / conditions neutres)
    this.economy.recordTransaction(tx.itemId, tx.price, tx.timestamp, {
      quality: tx.quality, perfection: tx.perfection
    });

    // Vendeur = joueur → reçoit l'argent + stats
    if (tx.sellerId === 'player') {
      this.addMoney(tx.total);
      this.player.recordSale(tx.total);
      this._checkGoals();
    } else if (tx.sellerId === RESERVE_ID) {
      this.reserve.deposit(tx.total, 'sold');
    } else {
      // Taxe sur les ventes des PNJ → Comptoir municipal (puits d'argent)
      const tax = Math.round(tx.total * RESERVE_TUNING.npcSalesTax * 100) / 100;
      this.npcController.creditNpc(tx.sellerId, Math.round((tx.total - tax) * 100) / 100);
      this.reserve.deposit(tax, 'taxes');
    }

    // Offre / demande : les PNJ remarquent quand le joueur achète ou vend beaucoup un objet
    if (tx.buyerId === 'player') this.supplyDemand.notePlayerTrade(tx.itemId, tx.quantity, true);
    else if (tx.sellerId === 'player') this.supplyDemand.notePlayerTrade(tx.itemId, tx.quantity, false);

    // Confiance PNJ ↔ joueur
    if (tx.sellerId === 'player' && tx.buyerId !== RESERVE_ID) {
      this.npcController.noteTradeWithPlayer?.(tx.buyerId, tx.priceDeltaPct, false);
    } else if (tx.buyerId === 'player' && tx.sellerId !== RESERVE_ID) {
      this.npcController.noteTradeWithPlayer?.(tx.sellerId, tx.priceDeltaPct, true);
    }

    // Acheteur = joueur → reçoit les objets + surplus éventuel + stats
    if (tx.buyerId === 'player') {
      this.player.inventory.add(tx.itemId, tx.quantity, tx.quality, tx.perfection, tx.price);
      this.player.recordPurchase(tx.total);
      this._checkGoals();

      if (tx.type === 'matching') {
        const buyOffer = this.offers.find(o => o.id === tx.buyOfferId);
        if (buyOffer) {
          this.buyHouse.refundSurplus(buyOffer, tx.price, tx.quantity);
        }
      }
    } else if (tx.buyerId === RESERVE_ID) {
      const reserveOffer = tx.buyOfferId ? this.offers.find(o => o.id === tx.buyOfferId) : null;
      if (reserveOffer?.publicOrder) {
        // Commande publique : la ville en manque consomme aussitôt les objets livrés
        this.reserve.stats.used = (this.reserve.stats.used || 0) + tx.quantity;
        this.reserve.notePublicDelivery(reserveOffer, tx.quantity);
      } else {
        this.reserve.addStock(tx.itemId, tx.quantity);
      }
      const statKey = reserveOffer?.procurement ? 'procurement' : 'bought';
      this.reserve.stats[statKey] = Math.round(((this.reserve.stats[statKey] || 0) + tx.total) * 100) / 100;
      if (tx.type === 'matching' && tx.buyOfferId) {
        const buyOffer = this.offers.find(o => o.id === tx.buyOfferId);
        if (buyOffer && buyOffer.price > tx.price) {
          this.reserve.deposit(Math.round((buyOffer.price - tx.price) * tx.quantity * 100) / 100, 'refund');
        }
      }
    } else {
      // Acheteur = PNJ
      this.npcController.giveItemToNpc(
        tx.buyerId,
        tx.itemId,
        tx.quantity,
        tx.quality,
        tx.perfection
      );

      // Surplus si matching à un prix inférieur à l'offre d'achat
      if (tx.type === 'matching' && tx.buyOfferId) {
        const buyOffer = this.offers.find(o => o.id === tx.buyOfferId);
        if (buyOffer && buyOffer.price > tx.price) {
          const surplus = Math.round((buyOffer.price - tx.price) * tx.quantity * 100) / 100;
          this.npcController.creditNpc(tx.buyerId, surplus);
        }
      }
    }

    this.tradeListeners.forEach(fn => {
      try { fn(tx); } catch (e) { /* un écouteur défaillant ne bloque pas le marché */ }
    });
  },


  // ============================================
  // Argent des différents acteurs (joueur / PNJ / Comptoir)
  // ============================================
  _debitParty(id, amount) {
    if (id === 'player') return this.removeMoney(amount);
    if (id === RESERVE_ID) {
      if (this.reserve.treasury < amount) return false;
      this.reserve.withdraw(amount);
      return true;
    }
    return this.npcController.debitNpc(id, amount);
  },


  _creditParty(id, amount) {
    if (id === 'player') this.addMoney(amount);
    else if (id === RESERVE_ID) this.reserve.deposit(amount, 'refund');
    else this.npcController.creditNpc(id, amount);
  },
};
