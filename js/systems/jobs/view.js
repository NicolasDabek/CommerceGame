/**
 * JobBoard — vue complète pour l'interface.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { conditionLabel, isRepairable } from '../../core/condition.js';
import { getItemById } from '../../data/items.js';
import { RECIPES } from '../../data/jobs.js';
import { canSalvage, moneyRound, salvageOutputs } from './helpers.js';

export const JobView = {

  getView() {
    this.ensureContracts();
    const inv = this.game.player.inventory;
    const level = this.workshopLevel();
    const crafts = this.stats.crafts || 0;
    const nextAt = level === 1 ? 5 : level === 2 ? 12 : null;
    this.collectReady();
    const now = this._now();
    const day = this._day();
    return {
      professions: this.getProfessionsView(),
      lastLevelUp: this.lastLevelUp,
      bench: this.bench.map(e => {
        const item = getItemById(e.itemId);
        const total = Math.max(1, e.readyAt - e.startedAt);
        return {
          ...e,
          item,
          remainingMs: Math.max(0, e.readyAt - now),
          progress: Math.min(1, (now - e.startedAt) / total),
          valueAfter: this.game.getAdjustedMarketPrice(e.itemId, e.toQuality, e.toPerfection)
        };
      }),
      benchSlots: this.benchSlots(),
      maxRepairsToday: this.maxRepairsToday(),
      refurbishDeals: this.getRefurbishDeals(),
      npcOrders: (this.npcOrders || []).filter(o => o.status === 'open' || o.status === 'done').map(o => {
        const item = getItemById(o.itemId);
        const owned = inv.getStacks(o.itemId).filter(s => s.quality >= o.minQuality).reduce((t, s) => t + s.quantity, 0);
        const value = moneyRound(this._fair(o.itemId) * o.quantity);
        return {
          ...o,
          item,
          npcName: this._npcName(o.npcId),
          owned,
          daysLeft: o.deadlineDay - day,
          premium: moneyRound(o.pay - value),
          canDeliver: o.status === 'open' && owned >= o.quantity && o.deadlineDay >= day
        };
      }),
      feeVault: this.feeVault,
      scavengeUsedToday: this.scavengeUsedToday,
      stallUsedToday: this.stallUsedToday,
      craftsUsedToday: this.craftsUsedToday,
      repairsUsedToday: this.repairsUsedToday,
      maxScavengePerDay: this.maxScavengePerDay,
      maxStallPerDay: this.maxStallPerDay,
      maxCraftsPerDay: this.maxCraftsPerDay,
      maxRepairsPerDay: this.maxRepairsPerDay,
      streak: this.streak,
      lastLoot: this.lastLoot,
      lastCraft: this.lastCraft,
      workshopLevel: level,
      workshopProgress: nextAt ? `${crafts}/${nextAt} pour niv. ${level + 1}` : `${crafts} fabrications`,
      contracts: this.contracts.map(c => {
        const item = getItemById(c.itemId);
        const owned = inv.count(c.itemId);
        const view = this._supplyView(c.itemId);
        return {
          ...c,
          item,
          owned,
          coverage: view?.coverage ?? null,
          shortage: c.shortage || view?.status || 'balanced',
          reason: c.reason || 'Commande courante du Comptoir',
          value: moneyRound(this._fair(c.itemId) * c.quantity),
          canComplete: c.status === 'open' && owned >= c.quantity
        };
      }),
      recipes: RECIPES.map(r => {
        const preview = this._previewQuality(r, false);
        const previewFocus = this._previewQuality(r, true);
        const value = this.game.getAdjustedMarketPrice(r.output.itemId, preview.quality, preview.perfection);
        const unlocked = level >= r.minLevel;
        const hasParts = r.inputs.every(input => inv.count(input.itemId) >= input.qty);
        return {
          ...r,
          outputItem: getItemById(r.output.itemId),
          preview,
          previewFocus,
          value,
          unlocked,
          inputs: r.inputs.map(input => ({
            ...input,
            item: getItemById(input.itemId),
            owned: inv.count(input.itemId)
          })),
          canCraft: unlocked && hasParts && this.game.player.canAfford(r.cost)
            && this.craftsUsedToday < this.maxCraftsPerDay
            && inv.canAdd(r.output.itemId, r.output.qty, preview.quality, preview.perfection),
          canFocus: unlocked && hasParts && this.game.player.canAfford(r.cost + r.focusCost)
            && this.craftsUsedToday < this.maxCraftsPerDay
            && inv.canAdd(r.output.itemId, r.output.qty, previewFocus.quality, previewFocus.perfection)
        };
      }),
      services: (this.services || []).map(s => {
        const item = getItemById(s.itemId);
        const part = s.kind === 'repair' ? this._servicePart(s) : null;
        const hasPart = s.kind !== 'repair' || !part || inv.count(part.itemId) >= part.qty;
        const npcCap = this._npcState(s.npcId)?.capital ?? 0;
        const outputs = s.kind === 'salvage' ? (s.outputs || salvageOutputs(s.itemId, s.quality)) : [];
        return {
          ...s,
          item,
          npcName: this._npcName(s.npcId),
          part,
          hasPart,
          canFulfill: s.status === 'open'
            && this.servicesUsedToday < this.maxServicesPerDay
            && npcCap >= s.pay
            && hasPart,
          outputs,
          nextQuality: s.kind === 'repair' ? this._serviceNextQuality(s) : null,
          partCost: part ? moneyRound(this._fair(part.itemId) * part.qty) : 0
        };
      }),
      salvageItems: inv.items.filter(s => canSalvage(s.itemId)).slice(0, 8).map(slot => ({
        itemId: slot.itemId,
        quality: slot.quality,
        perfection: slot.perfection,
        quantity: slot.quantity,
        item: getItemById(slot.itemId),
        outputs: salvageOutputs(slot.itemId, slot.quality)
      })),
      salvageUsedToday: this.salvageUsedToday,
      servicesUsedToday: this.servicesUsedToday,
      maxSalvagePerDay: this.maxSalvagePerDay,
      maxServicesPerDay: this.maxServicesPerDay,
      repairItems: inv.items.filter(s => s.quality < 90 && isRepairable(s.itemId)).slice(0, 8).map(slot => {
        const quick = this.repairQuote(slot.itemId, slot.quality, slot.perfection, 'quick');
        const refurbish = this.repairQuote(slot.itemId, slot.quality, slot.perfection, 'refurbish');
        return {
          itemId: slot.itemId,
          quality: slot.quality,
          perfection: slot.perfection,
          quantity: slot.quantity,
          item: getItemById(slot.itemId),
          condition: conditionLabel(slot.quality).label,
          quick,
          refurbish,
          // Compatibilité avec l'ancienne interface
          cost: quick.supplies ?? null,
          nextQuality: quick.toQuality ?? null,
          part: quick.materials || null,
          hasPart: quick.hasMaterials ?? false
        };
      }),
      stallItems: inv.items.slice(0, 8).map((slot, index) => ({
        index,
        itemId: slot.itemId,
        quality: slot.quality,
        perfection: slot.perfection,
        quantity: slot.quantity,
        item: getItemById(slot.itemId),
        unit: this.game.getAdjustedMarketPrice(slot.itemId, slot.quality, slot.perfection)
      })),
      stats: { ...this.stats }
    };
  },
};
