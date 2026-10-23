/**
 * NPCController — journée des marchands (consommation, production, réparation, focus) et relations avec le joueur.
 * (méthodes de NPCController, extraites de NPCController.js sans changement de comportement)
 */

import { isRepairable } from '../../core/condition.js';
import { ITEMS, getItemById } from '../../data/items.js';
import { NPCS } from '../../data/npcs.js';
import { dailyReview, ensureMind, npcWorth } from '../NpcMind.js';
import { NPC_TUNING, rand, round2 } from './tuning.js';

export const NpcDay = {

  /* ============ Journée ============ */

  onNewDay(day) {
    this._invalidateBooks();
    NPCS.forEach(npc => {
      const state = this._ensureState(npc);
      if (!state) return;
      const worthBefore = ensureMind(state).lastWorth != null ? npcWorth(this, state, npc.id) : null;
      state.dayHint = day;
      state.actionsToday = 0;
      state.mood = Math.max(-1, Math.min(1, state.mood * 0.72));
      if (state.capital < npc.capital * 0.12) state.mood = Math.max(-1, state.mood - 0.15);
      if (!this.externalConsumption) this._consume(npc, state);
      this._repairOwnStock(npc, state);
      this._produce(npc, state);
      this._pickFocus(npc, state);
      dailyReview(this, npc, state, day, worthBefore); // bilan, apprentissage, rivalités, objectif du jour
    });
  },


  /** Les PNJ utilisent / revendent hors marché une partie de leur stock (crée de la demande). */
  _consume(npc, state) {
    const over = this._overstocked(npc, state);
    let consumed = 0;
    state.inventory.forEach(slot => {
      const item = getItemById(slot.itemId);
      let rate = item?.category === 'Nourriture' ? 0.22 : item?.category === 'Vêtements' ? 0.05 : 0.035;
      if (over) rate *= 1.6;
      const n = Math.min(slot.quantity, Math.floor(slot.quantity * rate + Math.random()));
      slot.quantity -= n;
      consumed += n;
    });
    state.inventory = state.inventory.filter(s => s.quantity > 0);
    state.consumed = (state.consumed || 0) + consumed;
    return consumed;
  },


  /** Fabrication / approvisionnement quand le stock est sous la cible (coût payé au Comptoir). */
  _produce(npc, state) {
    const profile = this.profileOf(npc);
    const producer = this.isProducer(npc);
    const target = this.stockTarget(npc);
    const stock = this._stockQty(state);
    const pool = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    if (!pool.length) return 0;
    const signals = pool.map(item => ({ item, sig: this.marketSignal(item.id) }));
    // Un producteur anticipe : il produit aussi quand une de ses spécialités manque à la ville
    const cityNeeds = producer && signals.some(x => x.sig.shortage || x.sig.anticipate);
    // Commande publique du Comptoir (rupture chronique) : un producteur de la spécialité s'y met en priorité
    const ordered = producer ? signals.filter(x => x.sig.publicOrder && this._qtyOf(state, x.item.id) === 0) : [];
    if (ordered.length && stock < target * 1.6) {
      const item = ordered[Math.floor(Math.random() * ordered.length)].item;
      const unitCost = round2(this.getFairPrice(item.id) * NPC_TUNING.producerCost);
      const qty = Math.min(2, Math.floor((state.capital * (1 - profile.reserve)) / Math.max(0.01, unitCost)));
      if (qty >= 1) {
        const cost = round2(unitCost * qty);
        state.capital = round2(state.capital - cost);
        this.onNpcSpend(npc.id, cost, 'production');
        this.giveItemToNpc(npc.id, item.id, qty, Math.round(rand(45, 88)), Math.round(rand(35, 80)));
        state.produced = (state.produced || 0) + qty;
        this._remember(state, `Fabrique ${item.icon} ×${qty} (commande publique)`);
        return qty;
      }
    }
    if (stock >= target * 0.7 && !(cityNeeds && stock < target * 1.3)) return 0;
    const maxUnits = producer ? 3 : 1;
    const units = Math.max(1, Math.min(maxUnits, Math.ceil(target * 1.3) - stock));
    const weighted = signals.map(({ item, sig }) => {
      const cov = sig.view?.coverage;
      const covWeight = cov == null ? 1 : 1 / Math.max(0.5, Math.min(cov, 30)) * 8;
      return { item, w: (sig.shortage ? 3 : 1) * (sig.publicOrder ? 4 : 1) * (sig.anticipate ? 1.6 : 1) * (sig.surplus ? 0.2 : 1) * covWeight * (1 / Math.sqrt(item.basePrice)) };
    });
    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * totalW;
    let item = weighted[0].item;
    for (const x of weighted) { r -= x.w; if (r <= 0) { item = x.item; break; } }
    const costRatio = producer ? NPC_TUNING.producerCost : NPC_TUNING.productionCost;
    const unitCost = round2(this.getFairPrice(item.id) * costRatio);
    const affordable = Math.floor((state.capital * (1 - profile.reserve)) / Math.max(0.01, unitCost));
    const qty = Math.min(units, affordable);
    if (qty < 1) return 0;
    const cost = round2(unitCost * qty);
    state.capital = round2(state.capital - cost);
    this.onNpcSpend(npc.id, cost, 'production');
    const quality = Math.round(rand(40, producer ? 88 : 75));
    const perfection = Math.round(rand(35, 80));
    this.giveItemToNpc(npc.id, item.id, qty, quality, perfection);
    state.produced = (state.produced || 0) + qty;
    const sigItem = this.marketSignal(item.id);
    this._remember(state, `${producer ? 'Fabrique' : 'Se réapprovisionne'} ${item.icon} ×${qty}${sigItem.shortage ? ' (pénurie)' : ''}`);
    return qty;
  },


  /** Réparateurs : remettent en état leurs objets abîmés (matériaux payés au Comptoir). */
  _repairOwnStock(npc, state) {
    if (!this.professionOf(npc).repairs) return 0;
    let done = 0;
    for (const slot of [...state.inventory]) {
      if (done >= NPC_TUNING.repairsPerDay) break;
      if ((slot.quality ?? 50) >= NPC_TUNING.damagedQuality || !isRepairable(slot.itemId)) continue;
      const unitCost = round2(this.getFairPrice(slot.itemId) * NPC_TUNING.repairCostRatio);
      const qty = Math.min(slot.quantity, NPC_TUNING.repairsPerDay - done);
      const cost = round2(unitCost * qty);
      if (state.capital * (1 - this.profileOf(npc).reserve) < cost) break;
      state.capital = round2(state.capital - cost);
      this.onNpcSpend(npc.id, cost, 'workshop');
      slot.quantity -= qty;
      const newQ = Math.round(rand(65, 85));
      this.giveItemToNpc(npc.id, slot.itemId, qty, newQ, Math.min(90, (slot.perfection ?? 50) + 15));
      done += qty;
      const item = getItemById(slot.itemId);
      this._remember(state, `Répare ${item?.icon || ''} ×${qty} (Q${slot.quality}→Q${newQ})`);
    }
    state.inventory = state.inventory.filter(s => s.quantity > 0);
    state.repaired = (state.repaired || 0) + done;
    return done;
  },


  _pickFocus(npc, state) {
    const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category));
    const pool = preferred.length ? preferred : ITEMS;
    if (!pool.length) return;
    const scored = pool.map(item => {
      const sig = this.marketSignal(item.id);
      let s = Math.random() * 0.3;
      if (sig.book.spread != null && sig.book.spread > sig.fair * 0.08) s += 0.4;
      if (sig.shortage) s += 0.2;
      if (sig.book.bestSell != null && sig.book.bestSell < sig.fair * 0.9) s += 0.25;
      return { item, s };
    }).sort((a, b) => b.s - a.s);
    state.focusItemId = scored[0].item.id;
    state.focusUntil = this.getNow() + this.getMsPerGameDay() * (1 + Math.floor(Math.random() * 2));
  },


  /* ============ Relations ============ */

  notePlayerDeal(npcId, wonAgainstPlayer) {
    const state = this.npcStates[npcId];
    if (!state) return;
    if (wonAgainstPlayer) { state.winsVsPlayer += 1; state.mood = Math.min(1, state.mood + 0.12); state.rivalry = Math.min(1, state.rivalry + 0.08); }
    else { state.lossesVsPlayer += 1; state.mood = Math.max(-1, state.mood - 0.1); state.rivalry = Math.min(1, state.rivalry + 0.16); }
  },


  /**
   * Confiance envers le joueur après un échange direct.
   * @param {number} deltaPct écart du prix au prix moyen (positif = cher)
   * @param {boolean} npcIsSeller
   */
  noteTradeWithPlayer(npcId, deltaPct = 0, npcIsSeller = true) {
    const state = this.npcStates[npcId];
    if (!state) return;
    const favorable = npcIsSeller ? deltaPct >= -5 : deltaPct <= 5;
    const change = favorable ? 0.06 : 0.02;
    state.trust = Math.max(-1, Math.min(1, (state.trust || 0) + change));
  },
};
