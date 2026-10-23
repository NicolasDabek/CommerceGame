/**
 * JobBoard — atelier : récupération, étal, fabrication, polissage.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { getItemById } from '../../data/items.js';
import { RECIPES, SCAVENGE_TABLE } from '../../data/jobs.js';
import { clamp, pickWeighted } from './helpers.js';

export const JobWorkshop = {

  scavenge() {
    this.ensureContracts();
    if (this.scavengeUsedToday >= this.maxScavengePerDay) {
      return { success: false, error: "Tournées épuisées pour aujourd'hui (max 4)" };
    }
    const inv = this.game.player.inventory;
    const cashOnly = inv.freeSlots < 1;
    this.scavengeUsedToday += 1;
    this.stats.scavenges += 1;
    this._markActive();
    const rareHit = Math.random() < 0.08;
    if (cashOnly || (!rareHit && Math.random() < 0.22)) {
      const streakBonus = Math.min(6, this.streak);
      const found = Math.round((5 + Math.random() * 12 + this.takeFromVault(5) + streakBonus) * 100) / 100;
      this.game.addMoney(found);
      this.game.player.addXp(4);
      this.stats.earned = Math.round((this.stats.earned + found) * 100) / 100;
      this.lastLoot = { type: 'cash', amount: found };
      this.game.save();
      this.game._notifyUI();
      return { success: true, type: 'cash', amount: found, left: this.maxScavengePerDay - this.scavengeUsedToday };
    }
    const itemId = rareHit ? 'item_011' : pickWeighted(SCAVENGE_TABLE);
    const qty = Math.random() < 0.2 ? 2 : 1;
    const quality = 32 + Math.floor(Math.random() * 46);
    const perfection = 38 + Math.floor(Math.random() * 32);
    const added = inv.add(itemId, qty, quality, perfection);
    if (!added) {
      const found = Math.round((6 + Math.random() * 10) * 100) / 100;
      this.game.addMoney(found);
      this.stats.earned = Math.round((this.stats.earned + found) * 100) / 100;
      this.lastLoot = { type: 'cash', amount: found };
      this.game.save();
      this.game._notifyUI();
      return { success: true, type: 'cash', amount: found, left: this.maxScavengePerDay - this.scavengeUsedToday };
    }
    this.game.player.addXp(6);
    const item = getItemById(itemId);
    this.lastLoot = { type: 'item', itemId, name: item?.name, icon: item?.icon, quantity: qty, quality };
    this.game.save();
    this.game._notifyUI();
    return {
      success: true, type: 'item', itemId,
      name: item?.name || itemId, icon: item?.icon || '',
      quantity: qty, quality,
      left: this.maxScavengePerDay - this.scavengeUsedToday
    };
  },


  sellFromStall(itemId, quality, perfection, quantity = 1) {
    this.ensureContracts();
    if (this.stallUsedToday >= this.maxStallPerDay) {
      return { success: false, error: "Étal saturé pour aujourd'hui (max 3 ventes)" };
    }
    const qty = Math.max(1, Number(quantity) || 1);
    const owned = this.game.player.inventory.remove(itemId, qty, Number(quality), Number(perfection));
    if (owned < qty) {
      if (owned > 0) this.game.player.inventory.add(itemId, owned, Number(quality), Number(perfection));
      return { success: false, error: 'Objet introuvable' };
    }
    const unit = this.game.getAdjustedMarketPrice(itemId, Number(quality), Number(perfection));
    const price = Math.round(unit * 0.9 * 100) / 100;
    const total = Math.round(price * qty * 100) / 100;
    this.game.addMoney(total);
    this.game.player.addXp(3);
    this.stallUsedToday += 1;
    this.stats.stalls += 1;
    this.stats.earned = Math.round((this.stats.earned + total) * 100) / 100;
    this._markActive();
    this.game.save();
    this.game._notifyUI();
    return { success: true, total, unit: price };
  },


  _previewQuality(recipe, focus) {
    const inv = this.game.player.inventory;
    let qSum = 0;
    let pSum = 0;
    let units = 0;
    recipe.inputs.forEach(input => {
      const stacks = inv.getStacks(input.itemId).slice().sort((a, b) => {
        const da = a.quality + a.perfection;
        const db = b.quality + b.perfection;
        return focus ? db - da : da - db;
      });
      let left = input.qty;
      stacks.forEach(s => {
        if (left <= 0) return;
        const take = Math.min(left, s.quantity);
        qSum += s.quality * take;
        pSum += s.perfection * take;
        units += take;
        left -= take;
      });
    });
    const avgQ = units ? qSum / units : 50;
    const avgP = units ? pSum / units : 50;
    const lvl = this.workshopLevel();
    const bonus = recipe.qualityBonus + (focus ? 12 : 0) + (lvl - 1) * 3;
    return {
      quality: clamp(avgQ * 0.82 + bonus, 25, 96),
      perfection: clamp(avgP * 0.82 + bonus - 2, 25, 96)
    };
  },


  _consumeInputs(recipe, focus) {
    const inv = this.game.player.inventory;
    let qSum = 0;
    let pSum = 0;
    let units = 0;
    for (const input of recipe.inputs) {
      const stacks = inv.getStacks(input.itemId).map(s => ({ ...s })).sort((a, b) => {
        const da = a.quality + a.perfection;
        const db = b.quality + b.perfection;
        return focus ? db - da : da - db;
      });
      let left = input.qty;
      for (const s of stacks) {
        if (left <= 0) break;
        const take = Math.min(left, s.quantity);
        inv.remove(input.itemId, take, s.quality, s.perfection);
        qSum += s.quality * take;
        pSum += s.perfection * take;
        units += take;
        left -= take;
      }
      if (left > 0) return null;
    }
    return { avgQ: units ? qSum / units : 50, avgP: units ? pSum / units : 50 };
  },


  craft(recipeId, options = {}) {
    this.ensureContracts();
    const focus = !!options.focus;
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { success: false, error: 'Recette inconnue' };
    if (this.workshopLevel() < recipe.minLevel) {
      return { success: false, error: `Atelier niv. ${recipe.minLevel} requis` };
    }
    if (this.craftsUsedToday >= this.maxCraftsPerDay) {
      return { success: false, error: "Établi saturé pour aujourd'hui" };
    }
    const fee = recipe.cost + (focus ? recipe.focusCost : 0);
    if (!this.game.player.canAfford(fee)) {
      return { success: false, error: `Il faut ${fee.toFixed(2)} € de fournitures` };
    }
    const inv = this.game.player.inventory;
    for (const input of recipe.inputs) {
      if (inv.count(input.itemId) < input.qty) {
        const item = getItemById(input.itemId);
        return { success: false, error: `Manque ${item?.name || input.itemId}` };
      }
    }
    const preview = this._previewQuality(recipe, focus);
    if (!inv.canAdd(recipe.output.itemId, recipe.output.qty, preview.quality, preview.perfection)) {
      return { success: false, error: 'Inventaire plein' };
    }
    this.game.removeMoney(fee);
    this.depositFee(fee);
    const consumed = this._consumeInputs(recipe, focus);
    if (!consumed) return { success: false, error: 'Pièces insuffisantes' };
    const quality = preview.quality;
    const perfection = preview.perfection;
    inv.add(recipe.output.itemId, recipe.output.qty, quality, perfection, fee);
    this.stats.crafts += 1;
    this.craftsUsedToday += 1;
    this.gainXp('craft', focus ? 16 : 12);
    this.game.tradingDesk?.recordWorkshopCost?.(fee);
    this.game.player.addXp(focus ? 14 : 10);
    this._markActive();
    const out = getItemById(recipe.output.itemId);
    const value = this.game.getAdjustedMarketPrice(recipe.output.itemId, quality, perfection);
    this.lastCraft = { name: out?.name, icon: out?.icon, quality, perfection, value, focus };
    this.game.save();
    this.game._notifyUI();
    return {
      success: true,
      name: out?.name || recipe.output.itemId,
      quality,
      perfection,
      value,
      focus,
      level: this.workshopLevel()
    };
  },


  /** Compatibilité : « Réparer » lance une réparation rapide sur l'établi. */
  polish(itemId, quality, perfection) {
    return this.startRepair(itemId, quality, perfection, 'quick');
  },
};
