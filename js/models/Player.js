/**
 * Modèle Joueur
 * - Argent, inventaire, progression, statistiques
 */

import { Inventory } from './Inventory.js';

export class Player {
  /**
   * @param {Object} data
   */
  constructor(data = {}) {
    this.id = data.id || 'player';
    this.name = data.name || 'Joueur';
    this.money = data.money ?? 1250.00;

    // Inventaire
    this.inventory = data.inventory instanceof Inventory
      ? data.inventory
      : Inventory.fromJSON(data.inventory || { size: 10, items: [] });

    // Progression
    this.level = data.level ?? 1;
    this.xp = data.xp ?? 0;
    this.reputation = data.reputation ?? 0;   // réputation marchande

    // Stats de commerce
    this.stats = {
      totalSales: data.stats?.totalSales ?? 0,
      totalPurchases: data.stats?.totalPurchases ?? 0,
      totalEarned: data.stats?.totalEarned ?? 0,
      totalSpent: data.stats?.totalSpent ?? 0,
      transactionsCount: data.stats?.transactionsCount ?? 0,
      ...(data.stats || {})
    };

    // Liste noire (joueurs / PNJ avec qui on refuse de trader)
    this.blacklist = data.blacklist || [];

    // Taxes éventuelles (modificateur, 0 = pas de taxe extra)
    this.taxRate = data.taxRate ?? 0;
  }

  // ============================================
  // Argent
  // ============================================
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

  // ============================================
  // Progression
  // ============================================
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
    this.reputation = Math.max(0, this.reputation + amount);
  }

  // ============================================
  // Stats
  // ============================================
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

  // ============================================
  // Liste noire
  // ============================================
  isBlacklisted(id) {
    return this.blacklist.includes(id);
  }

  addToBlacklist(id) {
    if (!this.blacklist.includes(id)) {
      this.blacklist.push(id);
    }
  }

  removeFromBlacklist(id) {
    this.blacklist = this.blacklist.filter(x => x !== id);
  }

  // ============================================
  // Sérialisation
  // ============================================
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      money: this.money,
      inventory: this.inventory.toJSON(),
      level: this.level,
      xp: this.xp,
      reputation: this.reputation,
      stats: { ...this.stats },
      blacklist: [...this.blacklist],
      taxRate: this.taxRate
    };
  }

  static fromJSON(data) {
    return new Player(data);
  }
}
