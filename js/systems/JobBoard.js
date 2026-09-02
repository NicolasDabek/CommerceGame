import { ITEMS, getItemById } from '../data/items.js';

const SCAVENGE_ITEMS = ['item_004', 'item_010', 'item_012', 'item_002', 'item_006', 'item_008'];
const CONTRACT_ITEMS = ITEMS.filter(i => i.rarity !== 'Épique').map(i => i.id);

export class JobBoard {
  constructor(game, saved = {}) {
    this.game = game;
    this.feeVault = saved.feeVault ?? 40;
    this.contracts = saved.contracts || [];
    this.generatedDay = saved.generatedDay || 0;
    this.scavengeUsedToday = saved.scavengeUsedToday || 0;
    this.maxScavengePerDay = 4;
    this.stats = saved.stats || { scavenges: 0, contracts: 0, earned: 0 };
  }

  depositFee(amount) {
    const n = Number(amount) || 0;
    if (n <= 0) return;
    this.feeVault = Math.round((this.feeVault + n) * 100) / 100;
  }

  takeFromVault(amount) {
    const n = Math.min(this.feeVault, Math.max(0, Number(amount) || 0));
    this.feeVault = Math.round((this.feeVault - n) * 100) / 100;
    return n;
  }

  ensureContracts() {
    const day = this.game.timeManager.getCurrentDay();
    if (this.generatedDay === day && this.contracts.length) return;
    this.generatedDay = day;
    this.scavengeUsedToday = 0;
    this.contracts = this._roll(3, day);
  }

  onNewDay() {
    this.ensureContracts();
    this.feeVault = Math.round((this.feeVault + 35) * 100) / 100;
    const states = this.game.npcController?.npcStates || {};
    Object.keys(states).forEach(id => {
      const cap = states[id].capital ?? 0;
      if (cap < 180) {
        const bonus = 12;
        this.game.npcController.creditNpc(id, bonus);
      }
    });
  }

  _roll(count, day) {
    const picked = [];
    const pool = [...CONTRACT_ITEMS];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = (day * 7 + i * 13) % pool.length;
      const itemId = pool.splice(idx, 1)[0];
      const item = getItemById(itemId);
      const qty = item.rarity === 'Rare' ? 1 + (day % 2) : 2 + (day % 3);
      const unit = this.game.economy.getAveragePrice(itemId);
      const reward = Math.round(unit * qty * 1.12 * 100) / 100;
      picked.push({
        id: `job_${day}_${itemId}`,
        itemId,
        quantity: qty,
        reward,
        status: 'open',
        title: `Livraison : ${item?.name || itemId}`,
        hint: `Fournir ${qty} × ${item?.name || itemId}`
      });
    }
    return picked;
  }

  scavenge() {
    this.ensureContracts();
    if (this.scavengeUsedToday >= this.maxScavengePerDay) {
      return { success: false, error: 'Tournées épuisées pour aujourd\'hui (max 4)' };
    }
    if (this.game.player.inventory.items.length >= this.game.player.inventory.size) {
      const cashOnly = true;
      return this._finishScavenge({ cashOnly });
    }
    return this._finishScavenge({ cashOnly: false });
  }

  _finishScavenge({ cashOnly }) {
    this.scavengeUsedToday += 1;
    this.stats.scavenges += 1;
    const roll = Math.random();
    if (cashOnly || roll < 0.28) {
      const found = Math.round((4 + Math.random() * 14 + this.takeFromVault(6)) * 100) / 100;
      this.game.addMoney(found);
      this.stats.earned = Math.round((this.stats.earned + found) * 100) / 100;
      this.game.save();
      this.game._notifyUI();
      return { success: true, type: 'cash', amount: found, left: this.maxScavengePerDay - this.scavengeUsedToday };
    }
    const itemId = SCAVENGE_ITEMS[Math.floor(Math.random() * SCAVENGE_ITEMS.length)];
    const qty = Math.random() < 0.25 ? 2 : 1;
    const quality = 35 + Math.floor(Math.random() * 40);
    const added = this.game.player.inventory.add(itemId, qty, quality, 40 + Math.floor(Math.random() * 30));
    if (!added) {
      const found = Math.round((6 + Math.random() * 10) * 100) / 100;
      this.game.addMoney(found);
      this.stats.earned = Math.round((this.stats.earned + found) * 100) / 100;
      this.game.save();
      this.game._notifyUI();
      return { success: true, type: 'cash', amount: found, left: this.maxScavengePerDay - this.scavengeUsedToday };
    }
    this.game.save();
    this.game._notifyUI();
    return {
      success: true,
      type: 'item',
      itemId,
      quantity: qty,
      quality,
      left: this.maxScavengePerDay - this.scavengeUsedToday
    };
  }

  complete(contractId) {
    this.ensureContracts();
    const job = this.contracts.find(c => c.id === contractId);
    if (!job || job.status !== 'open') return { success: false, error: 'Contrat indisponible' };
    const owned = this.game.player.inventory.count(job.itemId);
    if (owned < job.quantity) {
      return { success: false, error: `Il manque ${job.quantity - owned} objet(s)` };
    }
    const removed = this.game.player.inventory.remove(job.itemId, job.quantity);
    if (removed < job.quantity) return { success: false, error: 'Impossible de livrer' };
    const bonus = this.takeFromVault(Math.round(job.reward * 0.15 * 100) / 100);
    const payout = Math.round((job.reward + bonus) * 100) / 100;
    this.game.addMoney(payout);
    job.status = 'done';
    this.stats.contracts += 1;
    this.stats.earned = Math.round((this.stats.earned + payout) * 100) / 100;
    this.game.save();
    this.game._notifyUI();
    return { success: true, payout, bonus };
  }

  getView() {
    this.ensureContracts();
    return {
      feeVault: this.feeVault,
      scavengeUsedToday: this.scavengeUsedToday,
      maxScavengePerDay: this.maxScavengePerDay,
      contracts: this.contracts.map(c => {
        const item = getItemById(c.itemId);
        const owned = this.game.player.inventory.count(c.itemId);
        return {
          ...c,
          item,
          owned,
          canComplete: c.status === 'open' && owned >= c.quantity
        };
      }),
      stats: { ...this.stats }
    };
  }

  toJSON() {
    return {
      feeVault: this.feeVault,
      contracts: this.contracts,
      generatedDay: this.generatedDay,
      scavengeUsedToday: this.scavengeUsedToday,
      stats: this.stats
    };
  }
}
