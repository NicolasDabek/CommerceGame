/**
 * JobBoard — établi de réparation et démontage.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { conditionLabel, isRepairable, repairMaterials } from '../../core/condition.js';
import { getItemById } from '../../data/items.js';
import { RARITY_LEVEL, REPAIR_TUNING } from '../../data/jobs.js';
import { canSalvage, moneyRound, salvageOutputs } from './helpers.js';

export const JobRepair = {

  _hourMs() {
    return (this.game.timeManager?.msPerGameDay || 24 * 3600 * 1000) / 24;
  },


  _now() {
    return this.game.timeManager?.now?.() ?? Date.now();
  },


  /**
   * Devis de réparation : état visé, matériaux, fournitures, durée, valeur avant / après, profit attendu.
   * mode : 'quick' (réparation rapide) | 'refurbish' (remise à neuf, niveau 2 requis)
   */
  repairQuote(itemId, quality, perfection, mode = 'quick') {
    const item = getItemById(itemId);
    const q = Number(quality);
    const p = Number(perfection);
    const lvl = this.level('repair');
    const t = REPAIR_TUNING;
    const base = { itemId, item, quality: q, perfection: p, mode, ok: false };
    if (!item) return { ...base, error: 'Objet inconnu' };
    if (!isRepairable(itemId)) return { ...base, error: `${item.category} : ne se répare pas` };
    const needLvl = RARITY_LEVEL[item.rarity] || 1;
    if (lvl < needLvl) return { ...base, locked: true, error: `Réparateur niv. ${needLvl} requis (objet ${item.rarity.toLowerCase()})` };
    if (mode === 'refurbish' && lvl < 2) return { ...base, locked: true, error: 'Remise à neuf : Réparateur niv. 2 requis' };
    const toQuality = mode === 'refurbish'
      ? Math.max(q + 5, Math.min(95, t.refurbishBase + 2 * lvl))
      : Math.min(96, q + t.quickRestore + lvl);
    const toPerfection = Math.min(92, p + (mode === 'refurbish' ? 15 : 8));
    const restore = toQuality - q;
    if (q >= 90 || restore <= 0) return { ...base, error: 'Déjà en excellent état' };
    const mat = repairMaterials(itemId, restore, mode);
    const inv = this.game.player.inventory;
    const materials = mat ? {
      ...mat,
      owned: inv.count(mat.itemId),
      value: moneyRound(this._fair(mat.itemId) * mat.qty)
    } : null;
    const discount = 1 - t.discountPerLevel * (lvl - 1);
    const supplies = moneyRound((t.suppliesBase + restore * item.basePrice * t.suppliesRate) * discount * (mode === 'refurbish' ? 1.3 : 1));
    const hours = (mode === 'refurbish' ? t.refurbishHours : t.quickHours) * (1 - t.speedPerLevel * (lvl - 1));
    const valueBefore = this.game.getAdjustedMarketPrice(itemId, q, p);
    const valueAfter = this.game.getAdjustedMarketPrice(itemId, toQuality, toPerfection);
    const totalCost = moneyRound(supplies + (materials?.value || 0));
    const gain = moneyRound(valueAfter - valueBefore);
    return {
      ...base,
      ok: true,
      toQuality,
      toPerfection,
      restore,
      labelBefore: conditionLabel(q).label,
      labelAfter: conditionLabel(toQuality).label,
      materials,
      hasMaterials: !materials || materials.owned >= materials.qty,
      supplies,
      totalCost,
      hours: Math.round(hours * 10) / 10,
      durationMs: Math.round(hours * this._hourMs()),
      valueBefore,
      valueAfter,
      gain,
      profit: moneyRound(gain - totalCost)
    };
  },


  /** Pose un objet sur l'établi : il quitte l'inventaire et revient réparé après le délai. */
  startRepair(itemId, quality, perfection, mode = 'quick') {
    this.ensureContracts();
    this.collectReady();
    const quote = this.repairQuote(itemId, quality, perfection, mode);
    if (!quote.ok) return { success: false, error: quote.error };
    if (this.bench.length >= this.benchSlots()) {
      return { success: false, error: `Établi plein (${this.benchSlots()} place${this.benchSlots() > 1 ? 's' : ''})` };
    }
    if (this.repairsUsedToday >= this.maxRepairsToday()) {
      return { success: false, error: `Plus de réparations aujourd'hui (max ${this.maxRepairsToday()})` };
    }
    if (!quote.hasMaterials) {
      return { success: false, error: `Il faut ${quote.materials.qty} × ${quote.materials.name}` };
    }
    if (!this.game.player.canAfford(quote.supplies)) {
      return { success: false, error: `Il faut ${quote.supplies.toFixed(2).replace('.', ',')} € de fournitures` };
    }
    const inv = this.game.player.inventory;
    const q = Number(quality);
    const p = Number(perfection);
    const stack = inv.getStacks(itemId).find(s => Number(s.quality) === q && Number(s.perfection) === p);
    const avgBuy = stack?.avgBuyPrice ?? null;
    const removed = inv.remove(itemId, 1, q, p);
    if (removed < 1) return { success: false, error: 'Objet introuvable' };
    if (quote.materials) {
      const took = inv.remove(quote.materials.itemId, quote.materials.qty);
      if (took < quote.materials.qty) {
        if (took > 0) inv.add(quote.materials.itemId, took);
        inv.add(itemId, 1, q, p, avgBuy);
        return { success: false, error: `Il faut ${quote.materials.qty} × ${quote.materials.name}` };
      }
    }
    this.game.removeMoney(quote.supplies);
    // Les fournitures sont achetées au Comptoir municipal : l'argent sort du circuit des joueurs (puits)
    if (this.game.reserve) this.game.reserve.deposit(quote.supplies, 'workshop');
    else this.depositFee(quote.supplies);
    const now = this._now();
    const entry = {
      id: `bench_${now}_${Math.floor(Math.random() * 1e6)}`,
      itemId,
      quality: q,
      perfection: p,
      toQuality: quote.toQuality,
      toPerfection: quote.toPerfection,
      mode,
      startedAt: now,
      readyAt: now + quote.durationMs,
      costBasis: avgBuy != null ? moneyRound(avgBuy + quote.totalCost) : null,
      spent: quote.totalCost
    };
    this.bench.push(entry);
    this.repairsUsedToday += 1;
    this._markActive();
    this.game.tradingDesk?.recordWorkshopCost?.(quote.totalCost);
    this.game.save();
    this.game._notifyUI();
    return { success: true, name: quote.item.name, quote, readyAt: entry.readyAt, hours: quote.hours, cost: quote.supplies };
  },


  /** Récupère les objets dont la réparation est terminée (si l'inventaire a de la place). */
  collectReady() {
    if (!this.bench?.length) return [];
    const now = this._now();
    const inv = this.game.player.inventory;
    const done = [];
    this.bench = this.bench.filter(entry => {
      if (entry.readyAt > now) return true;
      if (!inv.add(entry.itemId, 1, entry.toQuality, entry.toPerfection, entry.costBasis)) return true;
      done.push(entry);
      return false;
    });
    done.forEach(entry => {
      this.stats.repairs = (this.stats.repairs || 0) + 1;
      const item = getItemById(entry.itemId);
      const rarityXp = item?.rarity === 'Épique' ? 8 : item?.rarity === 'Rare' ? 4 : 0;
      this.gainXp('repair', (entry.mode === 'refurbish' ? 14 : 8) + rarityXp);
      this.game.player.addXp(5);
      this.lastRepair = { name: item?.name, icon: item?.icon, quality: entry.toQuality };
      this.game.uiCallbacks?.onStatus?.(`🔧 ${item?.name || 'Objet'} réparé : état Q${entry.quality} → Q${entry.toQuality}`);
    });
    if (done.length) {
      this.game.save();
      this.game._notifyUI();
    }
    return done;
  },


  /** Bonnes affaires à retaper : annonces d'objets abîmés dont la réparation est rentable. */
  getRefurbishDeals(limit = 5) {
    const mode = this.level('repair') >= 2 ? 'refurbish' : 'quick';
    const deals = [];
    (this.game.offers || []).forEach(o => {
      if (o.type !== 'sell' || o.status !== 'active' || o.ownerId === 'player' || o.buyoutPrice == null) return;
      if ((o.quality ?? 50) >= 60 || !isRepairable(o.itemId)) return;
      const quote = this.repairQuote(o.itemId, o.quality, o.perfection, mode);
      if (!quote.ok) return;
      const profit = moneyRound(quote.valueAfter - o.buyoutPrice - quote.totalCost);
      if (profit <= 0) return;
      deals.push({
        offerId: o.id,
        itemId: o.itemId,
        item: quote.item,
        quality: o.quality,
        perfection: o.perfection,
        price: o.buyoutPrice,
        sellerName: this._npcName(o.ownerId),
        mode,
        toQuality: quote.toQuality,
        totalCost: quote.totalCost,
        materials: quote.materials,
        valueAfter: quote.valueAfter,
        hours: quote.hours,
        profit,
        roi: Math.round(profit / (o.buyoutPrice + quote.totalCost) * 100),
        canAfford: this.game.player.canAfford(o.buyoutPrice)
      });
    });
    return deals.sort((a, b) => b.profit - a.profit).slice(0, limit);
  },


  salvageOwn(itemId, quality, perfection) {
    this.ensureContracts();
    if (this.salvageUsedToday >= this.maxSalvagePerDay) {
      return { success: false, error: "Plus de démantèlements aujourd'hui" };
    }
    if (!canSalvage(itemId)) {
      return { success: false, error: 'Cet objet ne se démonte pas en ressources' };
    }
    const outputs = salvageOutputs(itemId, quality);
    if (!outputs.length) return { success: false, error: 'Aucune ressource récupérable' };
    const inv = this.game.player.inventory;
    const removed = inv.remove(itemId, 1, Number(quality), Number(perfection));
    if (removed < 1) return { success: false, error: 'Objet introuvable' };
    for (const out of outputs) {
      if (!inv.canAdd(out.itemId, out.qty, 55, 50)) {
        inv.add(itemId, 1, Number(quality), Number(perfection));
        return { success: false, error: 'Inventaire plein' };
      }
    }
    outputs.forEach(out => inv.add(out.itemId, out.qty, 55, 50));
    this.salvageUsedToday += 1;
    this.stats.salvages = (this.stats.salvages || 0) + 1;
    this.game.player.addXp(4);
    this._markActive();
    const item = getItemById(itemId);
    this.game.save();
    this.game._notifyUI();
    return { success: true, name: item?.name || itemId, outputs };
  },
};
