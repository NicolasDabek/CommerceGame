/**
 * NPCController — IA des 15 PNJ
 * Chaque PNJ raisonne à partir d'un « prix de référence » (moyenne du marché mêlée à la valeur
 * normale), de son stock cible, de sa trésorerie, de sa personnalité et de son clan.
 * Garde-fous : prix d'annonce bornés, achats plafonnés, budget d'actions quotidien, délais par objet.
 */

import { NPCS } from '../data/npcs.js';
import { getItemById } from '../data/items.js';

import { PERSONALITY_PROFILES, NPC_TUNING } from './npc/tuning.js';
import { mixin } from '../utils/mixin.js';
import { NpcState } from './npc/state.js';
import { NpcMarket } from './npc/market.js';
import { NpcDay } from './npc/day.js';
import { NpcLoop } from './npc/loop.js';
import { NpcScoring } from './npc/scoring.js';
import { NpcActions } from './npc/actions.js';
import { NpcMoney } from './npc/money.js';
export { PERSONALITY_PROFILES, NPC_TUNING } from './npc/tuning.js';

export class NPCController {
  constructor(options = {}) {
    this.getOffers = options.getOffers || (() => []);
    this.addOffer = options.addOffer || (() => {});
    this.runMatching = options.runMatching || (() => {});
    this.getAveragePrice = options.getAveragePrice || ((id) => {
      const item = getItemById(id);
      return item ? item.basePrice : 10;
    });
    this.getFairPrice = options.getFairPrice || ((id) => this.getAveragePrice(id));
    this.onNpcSpend = options.onNpcSpend || (() => {});
    this.executeBuyout = options.executeBuyout || (() => null);
    this.executeFulfill = options.executeFulfill || (() => null);
    this.executeBid = options.executeBid || (() => null);
    this.executeCancel = options.executeCancel || null;
    this.getNow = options.getNow || (() => Date.now());
    this.getMsPerGameDay = options.getMsPerGameDay || (() => 24 * 60 * 60 * 1000);
    this.getPlayerAlliance = options.getPlayerAlliance || (() => null);
    /** Vue offre / demande d'un objet (SupplyDemand.getView) — optionnelle. */
    this.getSupplyView = options.getSupplyView || null;
    this.publicOrderFor = options.publicOrderFor || null;
    /** true quand la consommation est gérée par la ville (SupplyDemand) */
    this.externalConsumption = !!options.externalConsumption;
    this._bookCache = null;
    this.npcStates = {};
    NPCS.forEach(npc => { this.npcStates[npc.id] = this._freshState(npc); });
  }
}

// Méthodes réparties dans des sous-modules (même prototype, aucun changement de comportement)
mixin(NPCController, NpcState, NpcMarket, NpcDay, NpcLoop, NpcScoring, NpcActions, NpcMoney);
