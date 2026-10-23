/**
 * JobBoard — services aux marchands (réparation, récupération) et échanges d'objets avec les PNJ.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { isRepairable, repairMaterials } from '../../core/condition.js';
import { ITEMS, getItemById } from '../../data/items.js';
import { NPCS } from '../../data/npcs.js';
import { canSalvage, clamp, moneyRound, salvageOutputs } from './helpers.js';

export const JobServices = {

  /** Prévient le journal de trading d'un revenu d'atelier / de contrat. */
  _emitJobIncome(kind, itemId, qty, amount, costBasis = null) {
    this.game.tradingDesk?.recordJob?.({ kind, itemId, quantity: qty, amount, costBasis });
  },


  _npcState(npcId) {
    return this.game.npcController?.npcStates?.[npcId] || null;
  },


  _npcName(npcId) {
    return this.game.npcController?.getNpcName?.(npcId) || NPCS.find(n => n.id === npcId)?.name || npcId;
  },


  _takeNpcItem(npcId, itemId, quality, perfection, qty = 1) {
    const state = this._npcState(npcId);
    if (!state || !Array.isArray(state.inventory)) return 0;
    const slot = state.inventory.find(s => s.itemId === itemId && Number(s.quality) === Number(quality) && Number(s.perfection) === Number(perfection));
    if (!slot || slot.quantity < qty) return 0;
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    return qty;
  },


  _giveNpcItem(npcId, itemId, quantity, quality = 50, perfection = 50) {
    if (this.game.npcController?.giveItemToNpc) {
      this.game.npcController.giveItemToNpc(npcId, itemId, quantity, quality, perfection);
      return;
    }
    const state = this._npcState(npcId);
    if (!state) return;
    const existing = state.inventory.find(s => s.itemId === itemId && s.quality === quality && s.perfection === perfection);
    if (existing) existing.quantity += quantity;
    else state.inventory.push({ itemId, quantity, quality, perfection });
  },


  _repairPay(itemId, quality) {
    const item = getItemById(itemId);
    const base = item?.basePrice || 20;
    return moneyRound(7 + (90 - Number(quality)) * 0.22 + base * 0.045);
  },


  _salvagePay(itemId, quality) {
    const item = getItemById(itemId);
    const base = item?.basePrice || 20;
    return moneyRound(5 + base * 0.03 + Number(quality) * 0.04);
  },


  _rollServices(day) {
    const pool = NPCS.slice();
    const picked = [];
    const used = new Set();
    let guard = 0;
    while (picked.length < 3 && guard < 40 && pool.length) {
      guard += 1;
      const idx = Math.floor(Math.random() * pool.length);
      const npc = pool.splice(idx, 1)[0];
      if (used.has(npc.id)) continue;
      const state = this._npcState(npc.id);
      const inv = (state?.inventory || []).filter(s => s.quantity > 0);
      const wantRepair = Math.random() < 0.55;
      if (wantRepair) {
        const damaged = inv.filter(s => Number(s.quality) < 88 && isRepairable(s.itemId));
        let slot = damaged[Math.floor(Math.random() * damaged.length)];
        if (!slot) {
          const preferred = ITEMS.filter(i => npc.preferredCategories.includes(i.category) && isRepairable(i.id));
          const fallback = ITEMS.filter(i => i.category === 'Électronique' || i.category === 'Outils');
          const poolItems = preferred.length ? preferred : fallback;
          const item = poolItems[Math.floor(Math.random() * poolItems.length)] || ITEMS.find(i => i.category === 'Électronique');
          if (!item) continue;
          slot = { itemId: item.id, quality: 28 + Math.floor(Math.random() * 50), perfection: 30 + Math.floor(Math.random() * 40), quantity: 1, virtual: true };
        }
        const pay = this._repairPay(slot.itemId, slot.quality);
        if ((state?.capital ?? 0) < pay) continue;
        used.add(npc.id);
        picked.push({
          id: `svc_${day}_${npc.id}_repair`,
          kind: 'repair',
          npcId: npc.id,
          itemId: slot.itemId,
          quality: slot.quality,
          perfection: slot.perfection,
          virtual: !!slot.virtual,
          pay,
          status: 'open'
        });
        continue;
      }
      const salvageable = inv.filter(s => canSalvage(s.itemId));
      let slot = salvageable[Math.floor(Math.random() * salvageable.length)];
      if (!slot) {
        const preferred = ITEMS.filter(i => canSalvage(i.id) && npc.preferredCategories.includes(i.category));
        const item = (preferred.length ? preferred : ITEMS.filter(i => canSalvage(i.id)))[0];
        if (!item) continue;
        slot = { itemId: item.id, quality: 35 + Math.floor(Math.random() * 45), perfection: 30 + Math.floor(Math.random() * 40), quantity: 1, virtual: true };
      }
      const outputs = salvageOutputs(slot.itemId, slot.quality);
      if (!outputs.length) continue;
      const pay = this._salvagePay(slot.itemId, slot.quality);
      if ((state?.capital ?? 0) < pay) continue;
      used.add(npc.id);
      picked.push({
        id: `svc_${day}_${npc.id}_salvage`,
        kind: 'salvage',
        npcId: npc.id,
        itemId: slot.itemId,
        quality: slot.quality,
        perfection: slot.perfection,
        virtual: !!slot.virtual,
        outputs,
        pay,
        status: 'open'
      });
    }
    return picked;
  },


  _servicePart(job) {
    return repairMaterials(job.itemId, this._serviceNextQuality(job) - job.quality, 'quick');
  },


  _serviceNextQuality(job) {
    return clamp(job.quality + 12 + this.level('repair'), 1, 96);
  },


  fulfillService(serviceId) {
    this.ensureContracts();
    const job = this.services.find(s => s.id === serviceId);
    if (!job || job.status !== 'open') return { success: false, error: 'Demande indisponible' };
    if (this.servicesUsedToday >= this.maxServicesPerDay) {
      return { success: false, error: "Plus de services clients aujourd'hui" };
    }
    const npcName = this._npcName(job.npcId);
    const state = this._npcState(job.npcId);
    if (!state || state.capital < job.pay) {
      return { success: false, error: `${npcName} n'a plus assez d'argent` };
    }
    if (job.kind === 'repair') {
      const part = this._servicePart(job);
      const inv = this.game.player.inventory;
      if (part && inv.count(part.itemId) < part.qty) {
        return { success: false, error: `Il faut ${part.qty} × ${part.name}` };
      }
      if (!job.virtual) {
        const took = this._takeNpcItem(job.npcId, job.itemId, job.quality, job.perfection, 1);
        if (took < 1) return { success: false, error: "L'objet n'est plus chez le client" };
      }
      if (part) {
        const tookPart = inv.remove(part.itemId, part.qty);
        if (tookPart < part.qty) {
          if (tookPart > 0) inv.add(part.itemId, tookPart);
          if (!job.virtual) this._giveNpcItem(job.npcId, job.itemId, 1, job.quality, job.perfection);
          return { success: false, error: `Il faut ${part.qty} × ${part.name}` };
        }
      }
      const nq = this._serviceNextQuality(job);
      const np = clamp(job.perfection + 10, 1, 96);
      this._giveNpcItem(job.npcId, job.itemId, 1, nq, np);
      if (!this.game.npcController.debitNpc(job.npcId, job.pay)) {
        this._takeNpcItem(job.npcId, job.itemId, nq, np, 1);
        if (!job.virtual) this._giveNpcItem(job.npcId, job.itemId, 1, job.quality, job.perfection);
        if (part) inv.add(part.itemId, part.qty);
        return { success: false, error: `${npcName} n'a plus assez d'argent` };
      }
      this.game.addMoney(job.pay);
      job.status = 'done';
      job.resultQuality = nq;
      this.servicesUsedToday += 1;
      this.stats.services = (this.stats.services || 0) + 1;
      this.stats.repairs = (this.stats.repairs || 0) + 1;
      this.stats.earned = moneyRound((this.stats.earned || 0) + job.pay);
      this.gainXp('repair', 8);
      this._emitJobIncome('service', job.itemId, 1, job.pay, part ? moneyRound(this._fair(part.itemId) * part.qty) : 0);
      this.game.player.addXp(7);
      this.game.player.addReputation(1);
      this._markActive();
      this.game.save();
      this.game._notifyUI();
      const item = getItemById(job.itemId);
      return { success: true, kind: 'repair', payout: job.pay, npcName, name: item?.name || job.itemId, quality: nq };
    }
    if (job.kind === 'salvage') {
      const outputs = job.outputs?.length ? job.outputs : salvageOutputs(job.itemId, job.quality);
      if (!outputs.length) return { success: false, error: 'Rien à récupérer' };
      if (!job.virtual) {
        const took = this._takeNpcItem(job.npcId, job.itemId, job.quality, job.perfection, 1);
        if (took < 1) return { success: false, error: "L'objet n'est plus chez le client" };
      }
      if (!this.game.npcController.debitNpc(job.npcId, job.pay)) {
        if (!job.virtual) this._giveNpcItem(job.npcId, job.itemId, 1, job.quality, job.perfection);
        return { success: false, error: `${npcName} n'a plus assez d'argent` };
      }
      outputs.forEach(out => this._giveNpcItem(job.npcId, out.itemId, out.qty, 55, 50));
      this.game.addMoney(job.pay);
      job.status = 'done';
      this.servicesUsedToday += 1;
      this.stats.services = (this.stats.services || 0) + 1;
      this.stats.salvages = (this.stats.salvages || 0) + 1;
      this.stats.earned = moneyRound((this.stats.earned || 0) + job.pay);
      this.game.player.addXp(6);
      this.game.player.addReputation(1);
      this._markActive();
      this.game.save();
      this.game._notifyUI();
      const item = getItemById(job.itemId);
      return { success: true, kind: 'salvage', payout: job.pay, npcName, name: item?.name || job.itemId, outputs };
    }
    return { success: false, error: 'Service inconnu' };
  },
};
