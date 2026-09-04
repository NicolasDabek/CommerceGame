/**
 * Modèle Joueur
 * - Argent, inventaire, progression, statistiques
 */

import { Inventory } from './Inventory.js';

export class Player {
  constructor(data = {}) {
    this.id = data.id || 'player';
    this.name = data.name || 'Joueur';
    this.money = data.money ?? 1250.00;
    this.inventory = data.inventory instanceof Inventory
      ? data.inventory
      : Inventory.fromJSON(data.inventory || { size: 10, items: [] });
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.reputation = data.reputation ?? 0;
    this.allianceClanId = data.allianceClanId || null;
    this.stats = {
      totalSales: data.stats?.totalSales ?? 0,
      totalPurchases: data.stats?.totalPurchases ?? 0,
      totalEarned: data.stats?.totalEarned ?? 0,
      totalSpent: data.stats?.totalSpent ?? 0,
      transactionsCount: data.stats?.transactionsCount ?? 0,
      ...(data.stats || {})
    };
    this.blacklist = data.blacklist || [];
    this.taxRate = data.taxRate ?? 0;
  }

  addMoney(amount) {
    this.money = Math.round((this.money + amount) * 100) / 100;
    return this.money;
  }

  removeMoney(amount) {
    if (this.money < amount) return false;
    this.money = Math.round((this.money - amount) * 100) / 100;
    return true;
  }

  canAfford(amount) {
    return this.money >= amount;
  }

  addXp(amount) {
    this.xp += amount;
    const needed = this.xpToNextLevel();
    while (this.xp >= needed) {
      this.xp -= needed;
      this.level += 1;
    }
  }

  xpToNextLevel() {
    return 100 + (this.level - 1) * 50;
  }

  addReputation(amount) {
    this.reputation = Math.max(-40, Math.min(120, this.reputation + amount));
    return this.reputation;
  }

  getReputationTitle() {
    const r = this.reputation;
    if (r >= 60) return 'Maison reconnue';
    if (r >= 35) return 'Marchand estimé';
    if (r >= 18) return 'Commerçant fiable';
    if (r >= 8) return 'Connu sur la place';
    if (r >= 0) return 'Nouveau venu';
    if (r >= -12) return 'Peu fiable';
    return 'Indésirable';
  }

  getFeeMultiplier() {
    return Math.max(0.62, Math.min(1.28, 1 - this.reputation * 0.008));
  }

  getTrustScore() {
    return Math.max(-1, Math.min(1, this.reputation / 40));
  }

  recordSale(total) {
    this.stats.totalSales += 1;
    this.stats.totalEarned = Math.round((this.stats.totalEarned + total) * 100) / 100;
    this.stats.transactionsCount += 1;
    this.addXp(Math.max(1, Math.floor(total / 10)));
    this.addReputation(1);
  }

  recordPurchase(total) {
    this.stats.totalPurchases += 1;
    this.stats.totalSpent = Math.round((this.stats.totalSpent + total) * 100) / 100;
    this.stats.transactionsCount += 1;
    this.addXp(Math.max(1, Math.floor(total / 15)));
  }

  isBlacklisted(id) {
    return this.blacklist.includes(id);
  }

  addToBlacklist(id) {
    if (!this.blacklist.includes(id)) this.blacklist.push(id);
  }

  removeFromBlacklist(id) {
    this.blacklist = this.blacklist.filter(x => x !== id);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      money: this.money,
      inventory: this.inventory.toJSON(),
      level: this.level,
      xp: this.xp,
      reputation: this.reputation,
      allianceClanId: this.allianceClanId,
      stats: { ...this.stats },
      blacklist: [...this.blacklist],
      taxRate: this.taxRate
    };
  }

  static fromJSON(data) {
    return new Player(data);
  }
}
