/**
 * Game — Orchestrateur principal
 * Relie inventaire, argent, offres, matching, hôtels, PNJ, temps et sauvegarde
 */

import { Player } from '../models/Player.js';
import { Transaction } from '../models/Transaction.js';
import { MatchingEngine } from '../systems/MatchingEngine.js';
import { AuctionHouse } from '../systems/AuctionHouse.js';
import { BuyHouse } from '../systems/BuyHouse.js';
import { NPCController } from '../systems/NPCController.js';
import { MarketReserve } from '../systems/MarketReserve.js';
import { TimeManager } from './TimeManager.js';
import { Economy } from './Economy.js';
import { SupplyDemand } from './SupplyDemand.js';
import { getItemById } from '../data/items.js';
import { mixin } from '../utils/mixin.js';
import { GameTrading } from './game/trading.js';
import { GameLoop } from './game/loop.js';
import { GameQueries } from './game/queries.js';
import { GameEconomyView } from './game/economyView.js';
import { GameGoals } from './game/goals.js';
import { GameSave } from './game/save.js';
import { GameUI } from './game/ui.js';

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
    this._wireEconomyClock();
    this.reserve = new MarketReserve();
    this.supplyDemand = new SupplyDemand();
    /** Écouteurs des transactions (journal de trading, alertes…) */
    this.tradeListeners = [];
    this.txCounter = 0;
    this._lastSnapshotTx = 0;

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
      getFairPrice: (itemId) => this.economy.getFairValue(itemId),
      // Offre / demande : couverture du stock, pénuries, achats du joueur
      getSupplyView: (itemId) => this.supplyDemand.getView(itemId, this.economy),
      // Commande publique du Comptoir en cours sur cet objet (les producteurs s'y intéressent)
      publicOrderFor: (itemId) => this.reserve?.publicOrders?.[itemId] || null,
      externalConsumption: true,
      // Frais d'annonce et coûts de fabrication des PNJ → trésorerie du Comptoir municipal
      onNpcSpend: (npcId, amount, reason) => this.reserve.deposit(amount, reason),
      executeCancel: (offer, npcId) => {
        if (!offer || offer.ownerId !== npcId || offer.status !== 'active') return { success: false };
        this.auctionHouse.releaseBid(offer);
        offer.status = 'cancelled';
        return { success: true };
      },
      executeBid: (offer, npcId, amount) => this.auctionHouse.placeBid(offer, npcId, amount),
      executeBuyout: (sellOffer, npcId, qty) => {
        // Capital déjà débité côté NPCController.
        // L'enchérisseur éventuel est remboursé avant l'achat immédiat (sinon sa mise disparaît).
        if (sellOffer && sellOffer.ownerId === npcId) return { success: false };
        this.auctionHouse.releaseBid(sellOffer);
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

    // Argent bloqué des enchères : joueur, PNJ ou Comptoir
    this.auctionHouse.lockFunds = (id, amount) => this._debitParty(id, amount);
    this.auctionHouse.unlockFunds = (id, amount) => this._creditParty(id, amount);

    this.timeManager = new TimeManager({
      startTimestamp: this.startTimestamp,
      onDayChange: (day) => {
        this.currentDay = day;
        const now = this.timeManager?.now?.() ?? Date.now();
        this.economy.tickDaily(now);
        // La ville consomme, la rareté des objets se met à jour, puis les PNJ réagissent
        this.supplyDemand.update(this, day);
        this.npcController.onNewDay(day);
        this.reserve.dailyIntervene(this);
        this.recordEconomySnapshot(day);
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

    this.supplyDemand.refresh(this);

    // Callbacks UI
    this.uiCallbacks = {
      onMoneyChanged: null,
      onInventoryChanged: null,
      onOffersChanged: null,
      onTransactionsChanged: null,
      onStatus: null
    };
  }
}

// Méthodes réparties dans des sous-modules (même prototype, aucun changement de comportement)
mixin(Game, GameTrading, GameLoop, GameQueries, GameEconomyView, GameGoals, GameSave, GameUI);
