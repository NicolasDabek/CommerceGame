/**
 * Game — sauvegarde et chargement (localStorage).
 * (méthodes de Game, extraites de Game.js sans changement de comportement)
 */

import { Offer } from '../../models/Offer.js';
import { Player } from '../../models/Player.js';
import { Transaction } from '../../models/Transaction.js';
import { MarketReserve } from '../../systems/MarketReserve.js';
import { Storage } from '../../utils/storage.js';
import { Economy } from '../Economy.js';
import { SupplyDemand } from '../SupplyDemand.js';

export const GameSave = {

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
      reserve: this.reserve.toJSON(),
      supplyDemand: this.supplyDemand.toJSON(),
      completedGoals: [...this.completedGoals]
    };
    Storage.save(data);
  },


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
      this._wireEconomyClock();
    }
    this.reserve = data.reserve ? MarketReserve.fromJSON(data.reserve) : new MarketReserve();
    // Anciennes sauvegardes : pas d'offre / demande → on part d'une ville équilibrée
    this.supplyDemand = SupplyDemand.fromJSON(data.supplyDemand || { day: this.currentDay });
    this.supplyDemand.refresh(this);
    this.txCounter = 0;
    this._lastSnapshotTx = 0;

    this.completedGoals = data.completedGoals || [];

    return true;
  },
};
