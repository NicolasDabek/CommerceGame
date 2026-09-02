import { ITEMS, getItemById } from '../data/items.js';

const SCAVENGE_TABLE = [
  { itemId: 'item_012', w: 22 },
  { itemId: 'item_010', w: 20 },
  { itemId: 'item_004', w: 16 },
  { itemId: 'item_002', w: 14 },
  { itemId: 'item_006', w: 12 },
  { itemId: 'item_008', w: 8 },
  { itemId: 'item_011', w: 5 },
  { itemId: 'item_005', w: 3 }
];

const RECIPES = [
  {
    id: 'craft_drill',
    name: 'Assembler une perceuse',
    cost: 4,
    inputs: [{ itemId: 'item_012', qty: 2 }, { itemId: 'item_010', qty: 2 }],
    output: { itemId: 'item_008', qty: 1, quality: 62, perfection: 55 }
  },
  {
    id: 'craft_watch',
    name: 'Monter une montre',
    cost: 9,
    inputs: [{ itemId: 'item_011', qty: 1 }, { itemId: 'item_002', qty: 1 }],
    output: { itemId: 'item_013', qty: 1, quality: 70, perfection: 60 }
  },
  {
    id: 'craft_box',
    name: 'Coffret gourmand',
    cost: 3,
    inputs: [{ itemId: 'item_004', qty: 2 }],
    output: { itemId: 'item_005', qty: 1, quality: 68, perfection: 58 }
  }
];

function pickWeighted(table) {
  const total = table.reduce((s, r) => s + r.w, 0);
  let n = Math.random() * total;
  for (const row of table) {
    n -= row.w;
    if (n <= 0) return row.itemId;
  }
  return table[0].itemId;
}

export class JobBoard {
  constructor(game, saved = {}) {
    this.game = game;
    this.feeVault = saved.feeVault ?? 40;
    this.contracts = saved.contracts || [];
    this.generatedDay = saved.generatedDay || 0;
    this.scavengeUsedToday = saved.scavengeUsedToday || 0;
    this.stallUsedToday = saved.stallUsedToday || 0;
    this.maxScavengePerDay = 4;
    this.maxStallPerDay = 3;
    this.streak = saved.streak || 0;
    this.lastActiveDay = saved.lastActiveDay || 0;
    this.stats = saved.stats || { scavenges: 0, contracts: 0, crafts: 0, stalls: 0, earned: 0 };
    this.lastLoot = saved.lastLoot || null;
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

  _day() {
    return this.game.timeManager.getCurrentDay();
  }

  _markActive() {
    const day = this._day();
    if (this.lastActiveDay === day) return;
    if (this.lastActiveDay && day === this.lastActiveDay + 1) this.streak += 1;
    else this.streak = 1;
    this.lastActiveDay = day;
  }

  ensureContracts() {
    const day = this._day();
    if (this.generatedDay === day && this.contracts.length) return;
    this.generatedDay = day;
    this.scavengeUsedToday = 0;
    this.stallUsedToday = 0;
    this.contracts = this._roll(3, day);
  }

  onNewDay() {
    this.ensureContracts();
    this.feeVault = Math.round((this.feeVault + 35) * 100) / 100;
    const states = this.game.npcController?.npcStates || {};
    Object.keys(states).forEach(id => {
      const cap = states[id].capital ?? 0;
      if (cap < 180) this.game.npcController.creditNpc(id, 12);
    });
  }

  _roll(count, day) {
    const pool = ITEMS.filter(i => i.rarity !== 'Épique').map(i => i.id);
    const picked = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const itemId = pool.splice(idx, 1)[0];
      const item = getItemById(itemId);
      const rush = i === 0;
      const qty = item.rarity === 'Rare' ? 1 + (day % 2) : 2 + (day % 3);
      const unit = this.game.economy.getAveragePrice(itemId);
      const mult = rush ? 1.28 : 1.12;
      const reward = Math.round(unit * qty * mult * 100) / 100;
      picked.push({
        id: `job_${day}_${itemId}_${i}`,
        itemId,
        quantity: qty,
        reward,
        rush,
        status: 'open',
        title: `${rush ? 'Rush · ' : ''}Livraison : ${item?.name || itemId}`,
        hint: rush
          ? `Urgent : ${qty} × ${item?.name || itemId} (prime +28 %)`
          : `Fournir ${qty} × ${item?.name || itemId}`
      });
    }
    return picked;
  }

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
      success: true,
      type: 'item',
      itemId,
      name: item?.name || itemId,
      icon: item?.icon || '',
      quantity: qty,
      quality,
      left: this.maxScavengePerDay - this.scavengeUsedToday
    };
  }

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
  }

  craft(recipeId) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (!recipe) return { success: false, error: 'Recette inconnue' };
    if (!this.game.player.canAfford(recipe.cost)) {
      return { success: false, error: `Il faut ${recipe.cost.toFixed(2)} € de fournitures` };
    }
    const inv = this.game.player.inventory;
    for (const input of recipe.inputs) {
      if (inv.count(input.itemId) < input.qty) {
        const item = getItemById(input.itemId);
        return { success: false, error: `Manque ${item?.name || input.itemId}` };
      }
    }
    if (!inv.canAdd(recipe.output.itemId, recipe.output.qty, recipe.output.quality, recipe.output.perfection)) {
      return { success: false, error: 'Inventaire plein' };
    }
    this.game.removeMoney(recipe.cost);
    this.depositFee(recipe.cost);
    recipe.inputs.forEach(input => inv.remove(input.itemId, input.qty));
    inv.add(recipe.output.itemId, recipe.output.qty, recipe.output.quality, recipe.output.perfection, recipe.cost);
    this.stats.crafts += 1;
    this.game.player.addXp(10);
    this._markActive();
    this.game.save();
    this.game._notifyUI();
    const out = getItemById(recipe.output.itemId);
    return { success: true, name: out?.name || recipe.output.itemId };
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
    const bonus = this.takeFromVault(Math.round(job.reward * (job.rush ? 0.2 : 0.12) * 100) / 100);
    const streakBonus = Math.round(Math.min(8, this.streak * 1.5) * 100) / 100;
    const payout = Math.round((job.reward + bonus + streakBonus) * 100) / 100;
    this.game.addMoney(payout);
    this.game.player.addXp(job.rush ? 18 : 12);
    this.game.player.addReputation(job.rush ? 2 : 1);
    job.status = 'done';
    this.stats.contracts += 1;
    this.stats.earned = Math.round((this.stats.earned + payout) * 100) / 100;
    this._markActive();
    this.game.save();
    this.game._notifyUI();
    return { success: true, payout, bonus };
  }

  getView() {
    this.ensureContracts();
    const inv = this.game.player.inventory;
    return {
      feeVault: this.feeVault,
      scavengeUsedToday: this.scavengeUsedToday,
      stallUsedToday: this.stallUsedToday,
      maxScavengePerDay: this.maxScavengePerDay,
      maxStallPerDay: this.maxStallPerDay,
      streak: this.streak,
      lastLoot: this.lastLoot,
      contracts: this.contracts.map(c => {
        const item = getItemById(c.itemId);
        const owned = inv.count(c.itemId);
        return { ...c, item, owned, canComplete: c.status === 'open' && owned >= c.quantity };
      }),
      recipes: RECIPES.map(r => ({
        ...r,
        outputItem: getItemById(r.output.itemId),
        inputs: r.inputs.map(input => ({
          ...input,
          item: getItemById(input.itemId),
          owned: inv.count(input.itemId)
        })),
        canCraft: this.game.player.canAfford(r.cost)
          && r.inputs.every(input => inv.count(input.itemId) >= input.qty)
          && inv.canAdd(r.output.itemId, r.output.qty, r.output.quality, r.output.perfection)
      })),
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
  }

  toJSON() {
    return {
      feeVault: this.feeVault,
      contracts: this.contracts,
      generatedDay: this.generatedDay,
      scavengeUsedToday: this.scavengeUsedToday,
      stallUsedToday: this.stallUsedToday,
      streak: this.streak,
      lastActiveDay: this.lastActiveDay,
      stats: this.stats,
      lastLoot: this.lastLoot
    };
  }
}
