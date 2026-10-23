/**
 * NPCController — argent et objets des marchands, vue de l'IA.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { conditionMultiplier } from '../../core/condition.js';
import { ITEMS, getItemById } from '../../data/items.js';
import { NPCS, getClanById } from '../../data/npcs.js';
import { mindView } from '../NpcMind.js';
import { round2 } from './tuning.js';

export const NpcMoney = {

  /* ============ Argent & objets ============ */

  creditNpc(npcId, amount) { const state = this.npcStates[npcId]; if (state && amount > 0) state.capital = round2(state.capital + amount); },

  debitNpc(npcId, amount) { const state = this.npcStates[npcId]; if (!state || state.capital < amount) return false; state.capital = round2(state.capital - amount); return true; },

  getCapital(npcId) { return this.npcStates[npcId]?.capital ?? 0; },

  giveItemToNpc(npcId, itemId, quantity, quality = 50, perfection = 50) {
    const state = this.npcStates[npcId];
    if (!state) return;
    const existing = state.inventory.find(s => s.itemId === itemId && s.quality === quality && s.perfection === perfection);
    if (existing) existing.quantity += quantity;
    else state.inventory.push({ itemId, quantity, quality, perfection });
  },

  getNpcName(id) { const npc = NPCS.find(n => n.id === id); return npc ? npc.name : id; },


  getAiSnapshot(npcId) {
    const state = this.npcStates[npcId];
    const npc = NPCS.find(n => n.id === npcId);
    if (!state || !npc) return null;
    this._ensureState(npc);
    const focus = state.focusItemId ? getItemById(state.focusItemId) : null;
    const clan = getClanById(npc.clanId);
    const profile = this.profileOf(npc);
    const cap = this.capitalState(npc, state);
    const needs = ITEMS
      .filter(i => npc.preferredCategories.includes(i.category) && this._qtyOf(state, i.id) === 0)
      .slice(0, 3)
      .map(i => ({ itemId: i.id, name: i.name, icon: i.icon }));
    const stock = this._stockQty(state);
    const target = this.stockTarget(npc);
    return {
      lastIntent: state.lastIntent, lastReason: state.lastReason,
      mood: state.mood, rivalry: state.rivalry, focusName: focus ? focus.name : null,
      clanId: npc.clanId || null, clanName: clan?.name || null, clanIcon: clan?.icon || null, clanColor: clan?.color || null,
      trust: state.trust || 0,
      strategy: profile.label, strategyText: profile.text,
      profession: this.professionOf(npc).label, professionIcon: this.professionOf(npc).icon, professionText: this.professionOf(npc).text,
      repaired: state.repaired || 0, arbitrages: state.arbitrages || 0,
      capitalState: cap.id, capitalLabel: cap.label,
      stock, stockTarget: target,
      stockLabel: stock > target * 1.5 ? 'Stock trop plein' : stock < target * 0.5 ? 'Stock bas' : 'Stock correct',
      needs,
      actionsToday: state.actionsToday || 0, actionBudget: this.actionBudget(npc),
      journal: [...(state.journal || [])],
      mind: mindView(this, npc, state)
    };
  },


  _conditionPrice(price, quality = 50, perfection = 50) {
    return Math.max(0.01, Math.round(price * conditionMultiplier(quality, perfection) * 100) / 100);
  },
};
