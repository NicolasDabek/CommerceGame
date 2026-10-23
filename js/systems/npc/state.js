/**
 * NPCController — état des marchands : profils, budgets, stock cible, trésorerie.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { ITEMS } from '../../data/items.js';
import { getNpcProfession } from '../../data/npcs.js';
import { NPC_TUNING, PERSONALITY_PROFILES } from './tuning.js';

export const NpcState = {

  /* ============ État ============ */

  _freshState(npc) {
    return {
      capital: npc.capital, inventory: this._generateStarterInventory(npc),
      lastActionAt: 0, lastIntent: null, lastReason: null, mood: 0, rivalry: 0,
      focusItemId: null, focusUntil: 0, lossesVsPlayer: 0, winsVsPlayer: 0, dayHint: 0,
      trust: 0, actionsToday: 0, cooldowns: {}, journal: [], produced: 0, consumed: 0, repaired: 0, arbitrages: 0
    };
  },


  _ensureState(npc) {
    const state = this.npcStates[npc.id];
    if (!state) return null;
    if (state.trust == null) state.trust = 0;
    if (state.actionsToday == null) state.actionsToday = 0;
    if (!state.cooldowns) state.cooldowns = {};
    if (!Array.isArray(state.journal)) state.journal = [];
    if (state.lastReason === undefined) state.lastReason = null;
    if (!Array.isArray(state.inventory)) state.inventory = [];
    return state;
  },


  _generateStarterInventory(npc) {
    const inv = [];
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length > 0 ? preferred : ITEMS;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const item = pool[Math.floor(Math.random() * pool.length)];
      inv.push({ itemId: item.id, quantity: 1 + Math.floor(Math.random() * 5), quality: 40 + Math.floor(Math.random() * 50), perfection: 30 + Math.floor(Math.random() * 50) });
    }
    return inv;
  },


  profileOf(npc) {
    return PERSONALITY_PROFILES[npc.personality] || PERSONALITY_PROFILES.opportuniste;
  },


  professionOf(npc) {
    return getNpcProfession(npc);
  },


  isProducer(npc) {
    return !!(this.professionOf(npc).produces || this.profileOf(npc).producer);
  },


  _reserveRatio(npc) { return this.profileOf(npc).reserve; },

  _spendable(npc, state) { return Math.max(0, state.capital * (1 - this._reserveRatio(npc))); },

  actionBudget(npc) { return NPC_TUNING.actionBase + Math.round(npc.aggressiveness * NPC_TUNING.actionAggr); },

  stockTarget(npc) { return this.profileOf(npc).stockTarget; },

  _stockQty(state) { return state.inventory.reduce((s, sl) => s + sl.quantity, 0); },

  _qtyOf(state, itemId) { return state.inventory.filter(s => s.itemId === itemId).reduce((s, sl) => s + sl.quantity, 0); },

  _isPreferred(npc, item) { return !!item && npc.preferredCategories.includes(item.category); },


  capitalState(npc, state) {
    const r = state.capital / Math.max(1, npc.capital);
    if (r < 0.25) return { id: 'dry', label: 'À sec' };
    if (r < 0.6) return { id: 'tight', label: 'Trésorerie serrée' };
    if (r < 1.5) return { id: 'ok', label: 'Trésorerie saine' };
    return { id: 'rich', label: 'Très à l\'aise' };
  },


  _overstocked(npc, state) { return this._stockQty(state) > this.stockTarget(npc) * 1.5; },
};
