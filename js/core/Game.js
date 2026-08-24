/**
 * Game — Orchestrateur principal
 * Relie inventaire, argent, offres, matching, hôtels, PNJ, temps et sauvegarde
 */

import { Storage } from '../utils/storage.js';
import { Inventory } from '../models/Inventory.js';
import { Player } from '../models/Player.js';
import { Offer } from '../models/Offer.js';
import { Transaction } from '../models/Transaction.js';
import { MatchingEngine } from '../systems/MatchingEngine.js';
import { AuctionHouse } from '../systems/AuctionHouse.js';
import { BuyHouse } from '../systems/BuyHouse.js';
import { NPCController } from '../systems/NPCController.js';
import { TimeManager } from './TimeManager.js';
import { Economy } from './Economy.js';
import { ITEMS, getItemById } from '../data/items.js';
import { NPCS, getNpcById } from '../data/npcs.js';

export class Game {
  constructor() {
    this.player = new Player({ id: 'player', name: 'Joueur', money: 1250.00 });
    // Alias pour compatibilité UI existante
    this.inventory = this.player.inventory;

    this.offers = [];
    this.transactions = [];
    this.currentDay = 1;
    this.startTimestamp = Date.now();
    this.completedGoals = [];

    this.economy = new Economy();

    // Systèmes
    this.matchingEngine = new MatchingEngine({
      onTransaction: (tx) => this._handleTransaction(tx),
      getItem: getItemById
    });

    this.auctionHouse = new AuctionHouse({
      matchingEngine: this.matchingEngine,
      getPlayerMoney: () => this.player.money,
      addPlayerMoney: (amount) => this.addMoney(amount),
      removePlayerMoney: (amount) => this.removeMoney(amount),
      getPlayerInventory: () => this.player.inventory,
      onOffersChanged: () => this._notifyUI()
    });

    this.buyHouse = new BuyHouse({
      getPlayerMoney: () => this.player.money,
      removePlayerMoney: (amount) => this.removeMoney(amount),
      addPlayerMoney: (amount) => this.addMoney(amount),
      onOffersChanged: () => this._notifyUI()
    });

    this.npcController = new NPCController({
      getOffers: () => this.offers,
      addOffer: (offer) => this.offers.push(offer),
      runMatching: (offer) => {
        this.matchingEngine.match(offer, this.offers);
      },
      getAveragePrice: (itemId) => this.economy.getAveragePrice(itemId),
      executeBuyout: (sellOffer, npcId, qty) => {
        // Capital déjà débité côté NPCController.
        // executeBuyout déclenche onTransaction → _handleTransaction
        const tx = this.matchingEngine.executeBuyout(sellOffer, npcId, qty);
        return tx ? { success: true, transaction: tx } : { success: false };
      },
      executeFulfill: (buyOffer, npcId, qty) => {
        // PNJ vend à une offre d'achat (objets retirés côté NPCController)
        const result = this.buyHouse.fulfill(buyOffer, npcId, qty, () => true);
        if (!result.success) return { success: false };

        const tx = new Transaction({
          itemId: result.itemId,
          quantity: result.quantity,
          price: result.price,
          sellerId: npcId,
          buyerId: result.buyerId,
          type: 'matching',
          buyOfferId: buyOffer.id
        });

        this._handleTransaction(tx);
        return { success: true, transaction: tx };
      }
    });

    this.timeManager = new TimeManager({
      startTimestamp: this.startTimestamp,
      onDayChange: (day) => {
        this.currentDay = day;
        this.economy.tickDaily();
        const events = this.economy.getActiveEvents();
        if (events.length > 0) {
          // Notifie le dernier événement
          const last = events[events.length - 1];
          if (this.uiCallbacks.onStatus) {
            this.uiCallbacks.onStatus(`Événement : ${last.name}`);
          }
        }
        this._notifyUI();
      }
    });

    // Callbacks UI
    this.uiCallbacks = {
      onMoneyChanged: null,
      onInventoryChanged: null,
      onOffersChanged: null,
      onTransactionsChanged: null,
      onStatus: null
    };
  }

  // ============================================
  // Argent
  // ============================================
  addMoney(amount) {
    this.player.addMoney(amount);
    this._notifyMoney();
  }

  removeMoney(amount) {
    const ok = this.player.removeMoney(amount);
    if (ok) this._notifyMoney();
    return ok;
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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

    // Économie : met à jour le prix moyen
    this.economy.recordTransaction(tx.itemId, tx.price, tx.timestamp);

    // Vendeur = joueur → reçoit l'argent + stats
    if (tx.sellerId === 'player') {
      this.addMoney(tx.total);
      this.player.recordSale(tx.total);
      this._checkGoals();
    } else {
      this.npcController.creditNpc(tx.sellerId, tx.total);
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
  }

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
  }

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
  }

  // ============================================
  // Getters UI
  // ============================================
  getActiveSellOffers() {
    return this.auctionHouse.getActiveSellOffers(this.offers);
  }

  getActiveBuyOffers() {
    return this.buyHouse.getActiveBuyOffers(this.offers);
  }

  getPlayerSellOffers() {
    return this.auctionHouse.getPlayerSellOffers(this.offers);
  }

  getPlayerBuyOffers() {
    return this.buyHouse.getPlayerBuyOffers(this.offers);
  }

  getItem(itemId) {
    return getItemById(itemId);
  }

  getAllItems() {
    return ITEMS;
  }

  getAdjustedMarketPrice(itemId, quality = 50, perfection = 50) {
    const avg = this.economy.getAveragePrice(itemId);
    return this.economy.applyConditionModifier(avg, quality, perfection);
  }

  getMarketRows() {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return ITEMS.map(item => {
      const sellOffers = this.offers.filter(o => o.type === 'sell' && o.status === 'active' && o.itemId === item.id);
      const buyOffers = this.offers.filter(o => o.type === 'buy' && o.status === 'active' && o.itemId === item.id);
      const recentTx = this.transactions.filter(tx => tx.itemId === item.id && now - tx.timestamp <= dayMs);
      const history = this.economy.priceHistory[item.id] || [];
      const bestSell = sellOffers.length ? Math.min(...sellOffers.map(o => o.buyoutPrice ?? o.price)) : null;
      const bestBuy = buyOffers.length ? Math.max(...buyOffers.map(o => o.price)) : null;
      const average = this.economy.getAveragePrice(item.id);
      const spread = bestSell != null && bestBuy != null
        ? Math.round((bestSell - bestBuy) * 100) / 100
        : null;

      return {
        item,
        average,
        bestSell,
        bestBuy,
        spread,
        volume: recentTx.reduce((sum, tx) => sum + tx.quantity, 0),
        trend: this.economy.getTrend(item.id),
        history: history.slice(-16).map(p => p.price)
      };
    });
  }

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
  }

  getProgressSummary() {
    return {
      level: this.player.level,
      xp: this.player.xp,
      xpToNext: this.player.xpToNextLevel(),
      reputation: this.player.reputation,
      inventorySize: this.player.inventory.size,
      stats: { ...this.player.stats }
    };
  }

  getGoals() {
    const stats = this.player.stats;
    const playerSales = this.transactions.filter(tx => tx.sellerId === 'player');
    const playerPurchases = this.transactions.filter(tx => tx.buyerId === 'player');
    const profitableSales = this.transactions.filter(tx =>
      tx.sellerId === 'player' && (tx.playerMarginPct ?? -Infinity) >= 20
    ).length;
    const auctionWins = this.transactions.filter(tx => tx.buyerId === 'player' && tx.type === 'auction_end').length;
    const buyouts = this.transactions.filter(tx => tx.buyerId === 'player' && tx.type === 'buyout').length;
    const playerMatchings = this.transactions.filter(tx =>
      (tx.buyerId === 'player' || tx.sellerId === 'player') && tx.type === 'matching'
    ).length;
    const bestSale = playerSales.reduce((best, tx) => Math.max(best, tx.total), 0);
    const activeSellOffers = this.offers.filter(o => o.ownerId === 'player' && o.type === 'sell' && o.status === 'active').length;
    const activeBuyOffers = this.offers.filter(o => o.ownerId === 'player' && o.type === 'buy' && o.status === 'active').length;
    const distinctItemsTraded = new Set(
      this.transactions
        .filter(tx => tx.buyerId === 'player' || tx.sellerId === 'player')
        .map(tx => tx.itemId)
    ).size;
    const npcPartners = new Set(
      this.transactions
        .filter(tx => tx.buyerId === 'player' || tx.sellerId === 'player')
        .map(tx => tx.buyerId === 'player' ? tx.sellerId : tx.buyerId)
        .filter(id => id && id !== 'player')
    ).size;
    const inventoryQuantity = this.player.inventory.items.reduce((sum, slot) => sum + slot.quantity, 0);
    const rareInventory = this.player.inventory.items.reduce((sum, slot) => {
      const item = getItemById(slot.itemId);
      return item && item.rarity !== 'Commun' ? sum + slot.quantity : sum;
    }, 0);
    const highQualityStacks = this.player.inventory.items.filter(slot => slot.quality >= 80 || slot.perfection >= 80).length;
    const belowMarketPurchases = playerPurchases.filter(tx => (tx.priceDeltaPct ?? 0) <= -8).length;
    const aboveMarketSales = playerSales.filter(tx => (tx.priceDeltaPct ?? 0) >= 8).length;

    return [
      {
        id: 'cash_2000',
        title: 'Tresorerie solide',
        description: 'Atteindre 2 000 euros de solde.',
        progress: Math.min(this.player.money, 2000),
        target: 2000,
        reward: '+2 reputation',
        reputationReward: 2
      },
      {
        id: 'sell_electronics_10',
        title: 'Specialiste electronique',
        description: 'Vendre 10 objets electroniques.',
        progress: this._countPlayerSoldByCategory('Électronique'),
        target: 10,
        reward: '+1 case inventaire',
        inventoryReward: 1
      },
      {
        id: 'margin_20_1',
        title: 'Belle marge',
        description: 'Realiser une vente avec au moins 20 % de marge.',
        progress: Math.min(profitableSales, 1),
        target: 1,
        reward: '+3 reputation',
        reputationReward: 3
      },
      {
        id: 'auction_win_1',
        title: 'Derniere enchere',
        description: 'Gagner une enchere contre un autre marchand.',
        progress: Math.min(auctionWins, 1),
        target: 1,
        reward: '+2 reputation',
        reputationReward: 2
      },
      {
        id: 'transactions_25',
        title: 'Vrai commercant',
        description: 'Participer a 25 transactions.',
        progress: stats.transactionsCount,
        target: 25,
        reward: '+2 cases inventaire',
        inventoryReward: 2
      },
      {
        id: 'cash_5000',
        title: 'Caisse confortable',
        description: 'Atteindre 5 000 euros de solde.',
        progress: Math.min(this.player.money, 5000),
        target: 5000,
        reward: '+4 reputation',
        reputationReward: 4
      },
      {
        id: 'sales_10',
        title: 'Premier reseau vendeur',
        description: 'Realiser 10 ventes.',
        progress: stats.totalSales,
        target: 10,
        reward: '+60 XP',
        xpReward: 60
      },
      {
        id: 'sales_50',
        title: 'Grossiste local',
        description: 'Realiser 50 ventes.',
        progress: stats.totalSales,
        target: 50,
        reward: '+180 XP',
        xpReward: 180
      },
      {
        id: 'purchases_10',
        title: 'Acheteur actif',
        description: 'Realiser 10 achats.',
        progress: stats.totalPurchases,
        target: 10,
        reward: '+40 XP',
        xpReward: 40
      },
      {
        id: 'purchases_40',
        title: 'Sourcing intensif',
        description: 'Realiser 40 achats.',
        progress: stats.totalPurchases,
        target: 40,
        reward: '+140 XP',
        xpReward: 140
      },
      {
        id: 'earned_5000',
        title: 'Chiffre d affaires',
        description: 'Encaisser 5 000 euros via les ventes.',
        progress: stats.totalEarned,
        target: 5000,
        reward: '+4 reputation',
        reputationReward: 4
      },
      {
        id: 'earned_20000',
        title: 'Maison de commerce',
        description: 'Encaisser 20 000 euros via les ventes.',
        progress: stats.totalEarned,
        target: 20000,
        reward: '+10 reputation',
        reputationReward: 10
      },
      {
        id: 'spent_3000',
        title: 'Investisseur',
        description: 'Depenser 3 000 euros en achats.',
        progress: stats.totalSpent,
        target: 3000,
        reward: '+80 XP',
        xpReward: 80
      },
      {
        id: 'sell_food_15',
        title: 'Rotation alimentaire',
        description: 'Vendre 15 objets de nourriture.',
        progress: this._countPlayerSoldByCategory('Nourriture'),
        target: 15,
        reward: '+2 reputation',
        reputationReward: 2
      },
      {
        id: 'sell_resources_30',
        title: 'Courtier en ressources',
        description: 'Vendre 30 ressources.',
        progress: this._countPlayerSoldByCategory('Ressources'),
        target: 30,
        reward: '+1 case inventaire',
        inventoryReward: 1
      },
      {
        id: 'sell_tools_10',
        title: 'Quincailler malin',
        description: 'Vendre 10 outils.',
        progress: this._countPlayerSoldByCategory('Outils'),
        target: 10,
        reward: '+70 XP',
        xpReward: 70
      },
      {
        id: 'sell_clothes_10',
        title: 'Mode rentable',
        description: 'Vendre 10 vetements.',
        progress: this._countPlayerSoldByCategory('Vêtements'),
        target: 10,
        reward: '+2 reputation',
        reputationReward: 2
      },
      {
        id: 'buy_electronics_8',
        title: 'Chasseur de tech',
        description: 'Acheter 8 objets electroniques.',
        progress: this._countPlayerBoughtByCategory('Électronique'),
        target: 8,
        reward: '+60 XP',
        xpReward: 60
      },
      {
        id: 'buy_resources_25',
        title: 'Stock matiere premiere',
        description: 'Acheter 25 ressources.',
        progress: this._countPlayerBoughtByCategory('Ressources'),
        target: 25,
        reward: '+1 case inventaire',
        inventoryReward: 1
      },
      {
        id: 'buyouts_5',
        title: 'Reflexe achat immediat',
        description: 'Faire 5 achats immediats.',
        progress: buyouts,
        target: 5,
        reward: '+50 XP',
        xpReward: 50
      },
      {
        id: 'buyouts_20',
        title: 'Rafleur de bonnes affaires',
        description: 'Faire 20 achats immediats.',
        progress: buyouts,
        target: 20,
        reward: '+5 reputation',
        reputationReward: 5
      },
      {
        id: 'matching_15',
        title: 'Carnet d ordres',
        description: 'Participer a 15 transactions par matching.',
        progress: playerMatchings,
        target: 15,
        reward: '+90 XP',
        xpReward: 90
      },
      {
        id: 'auction_wins_5',
        title: 'Marteau gagnant',
        description: 'Gagner 5 encheres.',
        progress: auctionWins,
        target: 5,
        reward: '+5 reputation',
        reputationReward: 5
      },
      {
        id: 'profit_sales_5',
        title: 'Serie profitable',
        description: 'Realiser 5 ventes avec au moins 20 % de marge.',
        progress: profitableSales,
        target: 5,
        reward: '+1 case inventaire',
        inventoryReward: 1
      },
      {
        id: 'best_sale_500',
        title: 'Grosse piece',
        description: 'Realiser une vente d au moins 500 euros.',
        progress: Math.min(bestSale, 500),
        target: 500,
        reward: '+3 reputation',
        reputationReward: 3
      },
      {
        id: 'best_sale_1500',
        title: 'Transaction majeure',
        description: 'Realiser une vente d au moins 1 500 euros.',
        progress: Math.min(bestSale, 1500),
        target: 1500,
        reward: '+8 reputation',
        reputationReward: 8
      },
      {
        id: 'active_sell_5',
        title: 'Vitrine remplie',
        description: 'Avoir 5 annonces de vente actives en meme temps.',
        progress: activeSellOffers,
        target: 5,
        reward: '+50 XP',
        xpReward: 50
      },
      {
        id: 'active_buy_5',
        title: 'Filets tendus',
        description: 'Avoir 5 offres d achat actives en meme temps.',
        progress: activeBuyOffers,
        target: 5,
        reward: '+50 XP',
        xpReward: 50
      },
      {
        id: 'inventory_50',
        title: 'Entrepot compact',
        description: 'Posseder 50 objets en inventaire.',
        progress: inventoryQuantity,
        target: 50,
        reward: '+1 case inventaire',
        inventoryReward: 1
      },
      {
        id: 'rare_inventory_5',
        title: 'Pieces choisies',
        description: 'Posseder 5 objets rares ou mieux.',
        progress: rareInventory,
        target: 5,
        reward: '+3 reputation',
        reputationReward: 3
      },
      {
        id: 'quality_stacks_5',
        title: 'Qualite premium',
        description: 'Posseder 5 stacks avec qualite ou perfection de 80+.',
        progress: highQualityStacks,
        target: 5,
        reward: '+70 XP',
        xpReward: 70
      },
      {
        id: 'distinct_items_10',
        title: 'Catalogue varie',
        description: 'Trader 10 objets differents.',
        progress: distinctItemsTraded,
        target: 10,
        reward: '+2 reputation',
        reputationReward: 2
      },
      {
        id: 'npc_partners_8',
        title: 'Carnet d adresses',
        description: 'Commercer avec 8 PNJ differents.',
        progress: npcPartners,
        target: 8,
        reward: '+4 reputation',
        reputationReward: 4
      },
      {
        id: 'below_market_buys_5',
        title: 'Sous le marche',
        description: 'Acheter 5 fois au moins 8 % sous le prix moyen.',
        progress: belowMarketPurchases,
        target: 5,
        reward: '+90 XP',
        xpReward: 90
      },
      {
        id: 'above_market_sales_5',
        title: 'Vendeur convaincant',
        description: 'Vendre 5 fois au moins 8 % au-dessus du prix moyen.',
        progress: aboveMarketSales,
        target: 5,
        reward: '+5 reputation',
        reputationReward: 5
      }
    ].map(goal => ({
      ...goal,
      completed: this.completedGoals.includes(goal.id) || goal.progress >= goal.target
    }));
  }

  getNpcName(id) {
    if (id === 'player') return 'Vous';
    return this.npcController.getNpcName(id);
  }

  // ============================================
  // Sauvegarde / Chargement
  // ============================================
  save() {
    const data = {
      player: this.player.toJSON(),
      offers: this.offers.map(o => o.toJSON()),
      transactions: this.transactions.map(t => t.toJSON()),
      currentDay: this.currentDay,
      startTimestamp: this.startTimestamp,
      npcStates: this.npcController.npcStates,
      economy: this.economy.toJSON(),
      completedGoals: [...this.completedGoals]
    };
    Storage.save(data);
  }

  load() {
    const data = Storage.load();
    if (!data) return false;

    // Compatibilité anciennes sauvegardes (player plat + inventory séparé)
    if (data.player && data.player.inventory) {
      this.player = Player.fromJSON(data.player);
    } else {
      this.player = new Player({
        ...(data.player || {}),
        inventory: data.inventory || { size: 10, items: [] }
      });
    }
    this.inventory = this.player.inventory;

    this.offers = (data.offers || []).map(o => Offer.fromJSON(o));
    this.transactions = (data.transactions || []).map(t => Transaction.fromJSON(t));
    this.currentDay = data.currentDay || 1;
    this.startTimestamp = data.startTimestamp || Date.now();

    this.timeManager.startTimestamp = this.startTimestamp;
    this.timeManager.currentDay = this.currentDay;

    if (data.npcStates) {
      this.npcController.npcStates = data.npcStates;
    }

    if (data.economy) {
      this.economy = Economy.fromJSON(data.economy);
    }

    this.completedGoals = data.completedGoals || [];

    return true;
  }

  // ============================================
  // Notifications UI
  // ============================================
  _notifyMoney() {
    if (this.uiCallbacks.onMoneyChanged) {
      this.uiCallbacks.onMoneyChanged(this.player.money);
    }
  }

  _notifyUI() {
    if (this.uiCallbacks.onInventoryChanged) this.uiCallbacks.onInventoryChanged();
    if (this.uiCallbacks.onOffersChanged) this.uiCallbacks.onOffersChanged();
    if (this.uiCallbacks.onTransactionsChanged) this.uiCallbacks.onTransactionsChanged();
    this._notifyMoney();
  }

  /**
   * Donne des objets de départ au joueur (pour tester)
   */
  giveStarterItems() {
    this.player.inventory.add('item_001', 2, 70, 40);
    this.player.inventory.add('item_004', 5, 60, 50);
    this.player.inventory.add('item_010', 20, 50, 50);
    this.player.inventory.add('item_006', 1, 80, 65);
    this.save();
    this._notifyUI();
  }

  _getAveragePlayerCost(itemId) {
    const stacks = this.player.inventory.getStacks(itemId).filter(s => s.avgBuyPrice != null);
    if (stacks.length === 0) return null;
    const qty = stacks.reduce((sum, s) => sum + s.quantity, 0);
    if (qty <= 0) return null;
    const total = stacks.reduce((sum, s) => sum + s.avgBuyPrice * s.quantity, 0);
    return Math.round((total / qty) * 100) / 100;
  }

  _countPlayerSoldByCategory(category) {
    return this.transactions
      .filter(tx => tx.sellerId === 'player')
      .reduce((sum, tx) => {
        const item = getItemById(tx.itemId);
        return item && item.category === category ? sum + tx.quantity : sum;
      }, 0);
  }

  _countPlayerBoughtByCategory(category) {
    return this.transactions
      .filter(tx => tx.buyerId === 'player')
      .reduce((sum, tx) => {
        const item = getItemById(tx.itemId);
        return item && item.category === category ? sum + tx.quantity : sum;
      }, 0);
  }

  _checkGoals() {
    const newlyCompleted = this.getGoals().filter(goal =>
      goal.progress >= goal.target && !this.completedGoals.includes(goal.id)
    );

    newlyCompleted.forEach(goal => {
      this.completedGoals.push(goal.id);
      if (goal.inventoryReward) this.player.inventory.expand(goal.inventoryReward);
      if (goal.reputationReward) this.player.addReputation(goal.reputationReward);
      if (goal.xpReward) this.player.addXp(goal.xpReward);
      if (this.uiCallbacks.onStatus) this.uiCallbacks.onStatus(`Objectif termine : ${goal.title}`);
    });
  }
}
