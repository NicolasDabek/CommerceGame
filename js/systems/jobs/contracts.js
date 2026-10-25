/**
 * JobBoard — contrats du Comptoir et commandes des marchands.
 * (méthodes de JobBoard, extraites de JobBoard.js sans changement de comportement)
 */

import { ITEMS } from '../../data/items.js';
import { VAULT_DAILY_CAP } from '../../data/jobs.js';
import { NPCS } from '../../data/npcs.js';
import { moneyRound } from './helpers.js';
import { rankFor } from '../../core/Ranks.js';

/** Passe 4 : prime de démarrage — +20 % sur les 3 premiers contrats livrés tant que l'on est au rang 0 ou 1. */
export const NEWCOMER_CONTRACTS = { count: 3, bonus: 0.2, maxRank: 1 };

export const JobContracts = {

  ensureContracts() {
    const day = this._day();
    if (this.generatedDay === day && this.contracts.length) {
      if (!Array.isArray(this.services) || this.services.length === 0) {
        this.services = this._rollServices(day);
      }
      return;
    }
    this.generatedDay = day;
    this.scavengeUsedToday = 0;
    this.stallUsedToday = 0;
    this.craftsUsedToday = 0;
    this.repairsUsedToday = 0;
    this.salvageUsedToday = 0;
    this.servicesUsedToday = 0;
    this.contracts = this._roll(this.contractCount(), day);
    this.services = this._rollServices(day);
    this._rollNpcOrders(day);
  },


  onNewDay() {
    this.ensureContracts();
    // La caisse des contrats est réalimentée chaque jour, mais plafonnée (évite de créer de l'argent sans fin)
    if (this.feeVault < VAULT_DAILY_CAP) {
      this.feeVault = Math.round(Math.min(VAULT_DAILY_CAP, this.feeVault + 35) * 100) / 100;
    }
    // Les PNJ à sec sont aidés par le Comptoir municipal (argent prélevé sur sa trésorerie).
    // Sans Comptoir (anciens tests), on garde l'aide historique.
    if (!this.game.reserve) {
      const states = this.game.npcController?.npcStates || {};
      Object.keys(states).forEach(id => {
        const cap = states[id].capital ?? 0;
        if (cap < 180) this.game.npcController.creditNpc(id, 12);
      });
    }
  },


  _supplyView(itemId) {
    return this.game.getSupplyView ? this.game.getSupplyView(itemId) : null;
  },


  _fair(itemId) {
    return this.game.economy.getFairValue ? this.game.economy.getFairValue(itemId) : this.game.economy.getAveragePrice(itemId);
  },


  /**
   * Contrats municipaux : la ville commande en priorité les objets en pénurie
   * (2 contrats sur les stocks les plus bas + 1 commande courante).
   * Payés par la trésorerie du Comptoir ; les objets livrés rejoignent son stock.
   */
  _roll(count, day) {
    const pool = ITEMS.filter(i => i.rarity !== 'Épique');
    const ranked = pool.map(item => ({ item, view: this._supplyView(item.id) }))
      .sort((a, b) => (a.view?.coverage ?? 99) - (b.view?.coverage ?? 99));
    const chosen = [];
    ranked.slice(0, Math.max(1, count - 1)).forEach(x => chosen.push(x));
    const rest = ranked.filter(x => !chosen.includes(x));
    while (chosen.length < count && rest.length) {
      chosen.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    }
    return chosen.map(({ item, view }, i) => {
      const status = view?.status || 'balanced';
      const lowStock = i < count - 1 && status === 'balanced';
      const qty = item.rarity === 'Rare' ? 1 + (day % 2) : 2 + (day % 3);
      const scarcityPremium = status === 'shortage' ? 0.18 : status === 'tight' ? 0.1 : lowStock ? 0.04 : 0;
      const rush = i === 0 && status === 'shortage';
      const mult = 1.12 + scarcityPremium + this.contractPremium();
      const unit = this._fair(item.id);
      const reward = moneyRound(unit * qty * mult);
      const cov = view?.coverage;
      const covTxt = cov == null ? '' : `${String(Math.round(cov * 10) / 10).replace('.', ',')} jour(s) de stock`;
      const unmetTxt = view?.unmet > 0 ? ` · ${view.unmet} client(s) non servi(s) hier` : '';
      const reason = status === 'shortage' ? `Pénurie : ${covTxt}${unmetTxt}`
        : status === 'tight' ? `Stock tendu : ${covTxt}`
          : lowStock ? `Stock le plus bas du marché : ${covTxt}`
            : 'Commande courante du Comptoir';
      return {
        id: `job_${day}_${item.id}_${i}`,
        itemId: item.id,
        quantity: qty,
        reward,
        rush,
        status: 'open',
        shortage: lowStock ? 'low' : status,
        reason,
        premiumPct: Math.round((mult - 1) * 100),
        title: `${rush ? 'Rush · ' : ''}Livraison : ${item.name}`,
        hint: `Fournir ${qty} × ${item.name} (prime +${Math.round((mult - 1) * 100)} %)`
      };
    });
  },


  /** Commandes des marchands : un PNJ à court de stock paie la livraison avec son propre argent. */
  _rollNpcOrders(day) {
    this.npcOrders = (this.npcOrders || []).filter(o => o.status === 'open' && o.deadlineDay >= day);
    let guard = 0;
    while (this.npcOrders.length < 3 && guard < 20) {
      guard += 1;
      const npc = NPCS[Math.floor(Math.random() * NPCS.length)];
      if (this.npcOrders.some(o => o.npcId === npc.id)) continue;
      const state = this._npcState(npc.id);
      if (!state) continue;
      const items = ITEMS.filter(i => npc.preferredCategories.includes(i.category) && i.rarity !== 'Épique');
      if (!items.length) continue;
      const scored = items.map(i => ({ i, cov: this._supplyView(i.id)?.coverage ?? 10 })).sort((a, b) => a.cov - b.cov);
      const free = scored.filter(x => !this.npcOrders.some(o => o.itemId === x.i.id));
      if (!free.length) continue;
      const item = free[0].i;
      const qty = item.basePrice > 150 ? 1 : item.basePrice > 40 ? 2 : 3;
      const trust = state.trust || 0;
      const pay = moneyRound(this._fair(item.id) * qty * (1.1 + Math.max(0, trust) * 0.01));
      if ((state.capital || 0) < pay * 1.5) continue;
      this.npcOrders.push({
        id: `npco_${day}_${npc.id}`,
        npcId: npc.id,
        itemId: item.id,
        quantity: qty,
        minQuality: 40,
        pay,
        deadlineDay: day + 2,
        status: 'open'
      });
    }
  },


  deliverNpcOrder(orderId) {
    const order = (this.npcOrders || []).find(o => o.id === orderId);
    if (!order || order.status !== 'open') return { success: false, error: 'Commande indisponible' };
    if (order.deadlineDay < this._day()) return { success: false, error: 'Commande expirée' };
    const inv = this.game.player.inventory;
    const stacks = inv.getStacks(order.itemId).filter(s => s.quality >= order.minQuality)
      .sort((a, b) => a.quality - b.quality);
    const have = stacks.reduce((t, s) => t + s.quantity, 0);
    if (have < order.quantity) return { success: false, error: `Il faut ${order.quantity} × état Q${order.minQuality}+ (vous en avez ${have})` };
    const npcName = this._npcName(order.npcId);
    if (!this.game.npcController.debitNpc(order.npcId, order.pay)) {
      return { success: false, error: `${npcName} n'a plus assez d'argent` };
    }
    let left = order.quantity;
    let costBasis = 0;
    for (const st of stacks) {
      if (left <= 0) break;
      const take = Math.min(left, st.quantity);
      inv.remove(order.itemId, take, st.quality, st.perfection);
      this._giveNpcItem(order.npcId, order.itemId, take, st.quality, st.perfection);
      if (st.avgBuyPrice != null) costBasis += st.avgBuyPrice * take;
      left -= take;
    }
    this.game.addMoney(order.pay);
    this.game.npcController.noteTradeWithPlayer?.(order.npcId, 0, false);
    order.status = 'done';
    this.game.career?.noteShortageDelivery?.(order.itemId);
    this.stats.npcOrders = (this.stats.npcOrders || 0) + 1;
    this.stats.earned = moneyRound((this.stats.earned || 0) + order.pay);
    this.gainXp('trade', 10);
    this.game.player.addXp(10);
    this.game.player.addReputation(1);
    this._markActive();
    this._emitJobIncome('npcOrder', order.itemId, order.quantity, order.pay, costBasis);
    this.game.save();
    this.game._notifyUI();
    return { success: true, payout: order.pay, npcName };
  },


  /** Prime de démarrage due sur ce contrat (0 si épuisée ou rang trop élevé). */
  newcomerBonus(job) {
    const T = NEWCOMER_CONTRACTS;
    if (!job || (this.stats.newcomerContracts || 0) >= T.count) return 0;
    if (rankFor(this.game.player?.reputation || 0).id > T.maxRank) return 0;
    return moneyRound(job.reward * T.bonus);
  },

  complete(contractId) {
    this.ensureContracts();
    const job = this.contracts.find(c => c.id === contractId);
    if (!job || job.status !== 'open') return { success: false, error: 'Contrat indisponible' };
    const owned = this.game.player.inventory.count(job.itemId);
    if (owned < job.quantity) {
      return { success: false, error: `Il manque ${job.quantity - owned} objet(s)` };
    }
    const inv = this.game.player.inventory;
    const stacks = inv.getStacks(job.itemId).slice().sort((a, b) => a.quality - b.quality);
    let costBasis = 0;
    let left = job.quantity;
    stacks.forEach(st => {
      if (left <= 0) return;
      const take = Math.min(left, st.quantity);
      if (st.avgBuyPrice != null) costBasis += st.avgBuyPrice * take;
      left -= take;
    });
    const removed = inv.remove(job.itemId, job.quantity);
    if (removed < job.quantity) {
      if (removed > 0) inv.add(job.itemId, removed);
      return { success: false, error: 'Impossible de livrer' };
    }
    const bonus = this.takeFromVault(Math.round(job.reward * (job.rush ? 0.08 : 0.04) * 100) / 100);
    const streakBonus = Math.round(Math.min(8, this.streak * 1.5) * 100) / 100;
    const newcomer = this.newcomerBonus(job);
    const payout = Math.round((job.reward + bonus + streakBonus + newcomer) * 100) / 100;
    // La récompense vient de la trésorerie du Comptoir (sans la vider sous 200 €), le reste est créé
    const reserve = this.game.reserve;
    if (reserve) {
      // Passe 4 : la prime de démarrage et la prime de série sont aussi payées par le Comptoir quand il le peut
      const fromReserve = Math.min(job.reward + newcomer + streakBonus, Math.max(0, reserve.treasury - 200));
      reserve.withdraw(fromReserve, 'contracts');
      reserve.addStock(job.itemId, job.quantity);
    }
    this.game.addMoney(payout);
    this.gainXp('trade', job.rush ? 20 : 15);
    this._emitJobIncome('contract', job.itemId, job.quantity, payout, costBasis);
    this.game.player.addXp(job.rush ? 18 : 12);
    this.game.player.addReputation(job.rush ? 2 : 1);
    job.status = 'done';
    this.game.career?.noteShortageDelivery?.(job.itemId);
    this.stats.contracts += 1;
    if (newcomer > 0) this.stats.newcomerContracts = (this.stats.newcomerContracts || 0) + 1;
    this.stats.earned = Math.round((this.stats.earned + payout) * 100) / 100;
    this._markActive();
    this.game.save();
    this.game._notifyUI();
    return { success: true, payout, bonus, newcomer };
  },
};
