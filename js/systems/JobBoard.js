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
    id: 'craft_box',
    name: 'Coffret gourmand',
    minLevel: 1,
    cost: 3,
    focusCost: 2,
    qualityBonus: 8,
    inputs: [{ itemId: 'item_004', qty: 2 }],
    output: { itemId: 'item_005', qty: 1 }
  },
  {
    id: 'craft_drill',
    name: 'Assembler une perceuse',
    minLevel: 1,
    cost: 4,
    focusCost: 3,
    qualityBonus: 6,
    inputs: [{ itemId: 'item_012', qty: 2 }, { itemId: 'item_010', qty: 2 }],
    output: { itemId: 'item_008', qty: 1 }
  },
  {
    id: 'craft_jacket',
    name: 'Retaper une veste',
    minLevel: 1,
    cost: 5,
    focusCost: 3,
    qualityBonus: 10,
    inputs: [{ itemId: 'item_006', qty: 1 }, { itemId: 'item_012', qty: 1 }],
    output: { itemId: 'item_006', qty: 1 }
  },
  {
    id: 'craft_watch',
    name: 'Monter une montre',
    minLevel: 2,
    cost: 9,
    focusCost: 5,
    qualityBonus: 8,
    inputs: [{ itemId: 'item_011', qty: 1 }, { itemId: 'item_002', qty: 1 }],
    output: { itemId: 'item_013', qty: 1 }
  },
  {
    id: 'craft_saw',
    name: 'Monter une scie pro',
    minLevel: 2,
    cost: 12,
    focusCost: 6,
    qualityBonus: 7,
    inputs: [{ itemId: 'item_008', qty: 1 }, { itemId: 'item_010', qty: 3 }, { itemId: 'item_012', qty: 2 }],
    output: { itemId: 'item_009', qty: 1 }
  },
  {
    id: 'craft_phone',
    name: 'Reconditionner un smartphone',
    minLevel: 3,
    cost: 18,
    focusCost: 8,
    qualityBonus: 9,
    inputs: [{ itemId: 'item_013', qty: 1 }, { itemId: 'item_011', qty: 1 }, { itemId: 'item_002', qty: 1 }],
    output: { itemId: 'item_001', qty: 1 }
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

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function repairPartFor(itemId) {
  const item = getItemById(itemId);
  if (!item) return null;
  switch (item.category) {
    case 'Électronique':
      return { itemId: 'item_011', name: 'Composants électroniques', icon: '🔌' };
    case 'Outils':
      return { itemId: 'item_010', name: 'Cuivre recyclé (lingot)', icon: '🟠' };
    case 'Ressources':
      if (itemId === 'item_012') {
        return { itemId: 'item_012', name: 'Bois de palette traité', icon: '🪵' };
      }
      return null;
    default:
      return null;
  }
}

export class JobBoard {
  constructor(game, saved = {}) {
    this.game = game;
    this.feeVault = saved.feeVault ?? 40;
    this.contracts = saved.contracts || [];
    this.generatedDay = saved.generatedDay || 0;
    this.scavengeUsedToday = saved.scavengeUsedToday || 0;
    this.stallUsedToday = saved.stallUsedToday || 0;
    this.craftsUsedToday = saved.craftsUsedToday || 0;
    this.repairsUsedToday = saved.repairsUsedToday || 0;
    this.maxScavengePerDay = 4;
    this.maxStallPerDay = 3;
    this.maxCraftsPerDay = 6;
    this.maxRepairsPerDay = 4;
    this.streak = saved.streak || 0;
    this.lastActiveDay = saved.lastActiveDay || 0;
    this.stats = saved.stats || { scavenges: 0, contracts: 0, crafts: 0, stalls: 0, repairs: 0, earned: 0 };
    this.lastLoot = saved.lastLoot || null;
    this.lastCraft = saved.lastCraft || null;
  }

  workshopLevel() {
    const n = this.stats.crafts || 0;
    if (n >= 12) return 3;
    if (n >= 5) return 2;
    return 1;
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
    this.craftsUsedToday = 0;
    this.repairsUsedToday = 0;
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
      success: true, type: 'item', itemId,
      name: item?.name || itemId, icon: item?.icon || '',
      quantity: qty, quality,
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
  }

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
  }

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
  }

  polish(itemId, quality, perfection) {
    this.ensureContracts();
    if (this.repairsUsedToday >= this.maxRepairsPerDay) {
      return { success: false, error: "Plus de réparations aujourd'hui" };
    }
    const q = Number(quality);
    const p = Number(perfection);
    if (q >= 90) return { success: false, error: 'Déjà en excellent état' };
    const part = repairPartFor(itemId);
    const cost = Math.round((4 + (90 - q) * 0.12) * 100) / 100;
    if (!this.game.player.canAfford(cost)) {
      return { success: false, error: `Il faut ${cost.toFixed(2)} €` };
    }
    const inv = this.game.player.inventory;
    if (part) {
      const reserved = part.itemId === itemId ? 1 : 0;
      if (inv.count(part.itemId) - reserved < 1) {
        return { success: false, error: `Il faut 1 × ${part.name}` };
      }
    }
    const removed = inv.remove(itemId, 1, q, p);
    if (removed < 1) return { success: false, error: 'Objet introuvable' };
    let usedPart = false;
    if (part) {
      const took = inv.remove(part.itemId, 1);
      if (took < 1) {
        inv.add(itemId, 1, q, p);
        return { success: false, error: `Il faut 1 × ${part.name}` };
      }
      usedPart = true;
    }
    const nq = clamp(q + 10 + (usedPart ? 4 : 0) + this.workshopLevel(), 1, 96);
    const np = clamp(p + 8 + (usedPart ? 3 : 0), 1, 96);
    if (!inv.add(itemId, 1, nq, np)) {
      inv.add(itemId, 1, q, p);
      if (usedPart) inv.add(part.itemId, 1);
      return { success: false, error: 'Inventaire plein' };
    }
    this.game.removeMoney(cost);
    this.depositFee(cost);
    this.repairsUsedToday += 1;
    this.stats.repairs = (this.stats.repairs || 0) + 1;
    this.game.player.addXp(5);
    this._markActive();
    const item = getItemById(itemId);
    this.game.save();
    this.game._notifyUI();
    return {
      success: true,
      name: item?.name || itemId,
      quality: nq,
      perfection: np,
      cost,
      partName: usedPart ? part.name : null
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
    const level = this.workshopLevel();
    const crafts = this.stats.crafts || 0;
    const nextAt = level === 1 ? 5 : level === 2 ? 12 : null;
    return {
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
        return { ...c, item, owned, canComplete: c.status === 'open' && owned >= c.quantity };
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
      repairItems: inv.items.filter(s => s.quality < 90).slice(0, 6).map(slot => {
        const part = repairPartFor(slot.itemId);
        const reserved = part && part.itemId === slot.itemId ? 1 : 0;
        const partOwned = part ? inv.count(part.itemId) : 0;
        const hasPart = !part || partOwned - reserved >= 1;
        return {
          itemId: slot.itemId,
          quality: slot.quality,
          perfection: slot.perfection,
          quantity: slot.quantity,
          item: getItemById(slot.itemId),
          cost: Math.round((4 + (90 - slot.quality) * 0.12) * 100) / 100,
          nextQuality: clamp(slot.quality + 10 + (hasPart && part ? 4 : 0) + this.workshopLevel(), 1, 96),
          part,
          hasPart,
          partOwned
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
  }

  toJSON() {
    return {
      feeVault: this.feeVault,
      contracts: this.contracts,
      generatedDay: this.generatedDay,
      scavengeUsedToday: this.scavengeUsedToday,
      stallUsedToday: this.stallUsedToday,
      craftsUsedToday: this.craftsUsedToday,
      repairsUsedToday: this.repairsUsedToday,
      streak: this.streak,
      lastActiveDay: this.lastActiveDay,
      stats: this.stats,
      lastLoot: this.lastLoot,
      lastCraft: this.lastCraft
    };
  }
}
