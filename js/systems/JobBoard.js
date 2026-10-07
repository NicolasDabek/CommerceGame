import { ITEMS, getItemById } from '../data/items.js';
import { NPCS } from '../data/npcs.js';
import { isRepairable, repairMaterials, conditionLabel } from '../core/condition.js';

/** Paliers d'expérience des métiers du joueur (niveaux 1 à 5). */
export const PROFESSION_LEVELS = [0, 40, 120, 250, 450];

export const PLAYER_PROFESSIONS = {
  repair: { id: 'repair', label: 'Réparateur', icon: '🔧', text: 'Remet en état les objets abîmés sur l\'établi.' },
  craft: { id: 'craft', label: 'Artisan', icon: '🛠️', text: 'Fabrique des objets à partir de matériaux.' },
  trade: { id: 'trade', label: 'Négociant', icon: '📦', text: 'Livre les contrats et les commandes des marchands.' }
};

export function professionLevel(xp = 0) {
  let level = 1;
  PROFESSION_LEVELS.forEach((min, i) => { if (xp >= min) level = i + 1; });
  return level;
}

/** Réglages de l'établi de réparation. */
export const REPAIR_TUNING = {
  quickRestore: 15,            // points d'état gagnés par une réparation rapide
  quickHours: 4,               // durée (heures de jeu)
  refurbishBase: 85,           // état visé par une remise à neuf (+2 par niveau)
  refurbishHours: 10,
  suppliesBase: 2,             // fournitures : 2 € + état restauré × prix de base × 0,15 %
  suppliesRate: 0.0015,
  discountPerLevel: 0.06,      // −6 % de fournitures par niveau
  speedPerLevel: 0.1,          // −10 % de temps par niveau
  rareLevel: 2,                // niveau requis pour les objets rares
  epicLevel: 3                 // … et épiques
};

const RARITY_LEVEL = { 'Commun': 1, 'Rare': REPAIR_TUNING.rareLevel, 'Épique': REPAIR_TUNING.epicLevel };

const VAULT_DAILY_CAP = 300;

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

function canSalvage(itemId) {
  const item = getItemById(itemId);
  if (!item) return false;
  return item.category === 'Électronique' || item.category === 'Outils';
}

function salvageOutputs(itemId, quality = 50) {
  const item = getItemById(itemId);
  if (!item || !canSalvage(itemId)) return [];
  const bonus = Number(quality) >= 70 ? 1 : 0;
  if (item.category === 'Électronique') {
    return [{ itemId: 'item_011', qty: 1 + bonus, name: 'Composants électroniques', icon: '🔌' }];
  }
  const out = [{ itemId: 'item_010', qty: 1, name: 'Cuivre recyclé (lingot)', icon: '🟠' }];
  if (bonus) out.push({ itemId: 'item_012', qty: 1, name: 'Bois de palette traité', icon: '🪵' });
  return out;
}

function moneyRound(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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
    this.salvageUsedToday = saved.salvageUsedToday || 0;
    this.servicesUsedToday = saved.servicesUsedToday || 0;
    this.services = saved.services || [];
    this.maxScavengePerDay = 4;
    this.maxStallPerDay = 3;
    this.maxCraftsPerDay = 6;
    this.maxRepairsPerDay = 4;
    this.maxSalvagePerDay = 4;
    this.maxServicesPerDay = 4;
    this.streak = saved.streak || 0;
    this.lastActiveDay = saved.lastActiveDay || 0;
    this.stats = saved.stats || { scavenges: 0, contracts: 0, crafts: 0, stalls: 0, repairs: 0, services: 0, salvages: 0, earned: 0 };
    this.lastLoot = saved.lastLoot || null;
    this.lastCraft = saved.lastCraft || null;
    // Métiers : anciennes sauvegardes → expérience reconstituée depuis les statistiques
    this.professions = saved.professions || {
      repair: { xp: (this.stats.repairs || 0) * 10 },
      craft: { xp: (this.stats.crafts || 0) * 12 },
      trade: { xp: (this.stats.contracts || 0) * 15 }
    };
    ['repair', 'craft', 'trade'].forEach(k => { if (!this.professions[k]) this.professions[k] = { xp: 0 }; });
    /** Objets en cours de réparation sur l'établi */
    this.bench = saved.bench || [];
    /** Commandes des marchands (PNJ) */
    this.npcOrders = saved.npcOrders || [];
    this.lastLevelUp = saved.lastLevelUp || null;
  }

  // ============================================
  // Métiers
  // ============================================
  level(prof) {
    return professionLevel(this.professions[prof]?.xp || 0);
  }

  /** Ancien « niveau d'atelier » = niveau du métier Artisan (recettes). */
  workshopLevel() {
    return this.level('craft');
  }

  gainXp(prof, amount) {
    const before = this.level(prof);
    this.professions[prof].xp = (this.professions[prof].xp || 0) + amount;
    const after = this.level(prof);
    if (after > before) {
      this.lastLevelUp = { prof, level: after, day: this._day() };
      const label = PLAYER_PROFESSIONS[prof]?.label || prof;
      this.game.uiCallbacks?.onStatus?.(`${PLAYER_PROFESSIONS[prof]?.icon || ''} ${label} : niveau ${after} atteint !`);
    }
    return after > before;
  }

  benchSlots() {
    const lvl = this.level('repair');
    return 1 + (lvl >= 3 ? 1 : 0) + (lvl >= 5 ? 1 : 0);
  }

  maxRepairsToday() {
    return this.maxRepairsPerDay + this.level('repair') - 1;
  }

  contractPremium() {
    return (this.level('trade') - 1) * 0.04;
  }

  /** Avantages lisibles de chaque métier, pour l'interface. */
  perks(prof, level = this.level(prof)) {
    const e = (n) => `${Math.round(n * 100)} %`;
    if (prof === 'repair') {
      return [
        `Fournitures −${e((level - 1) * REPAIR_TUNING.discountPerLevel)}, temps −${e((level - 1) * REPAIR_TUNING.speedPerLevel)}`,
        `${this.benchSlots()} place(s) sur l'établi · ${this.maxRepairsToday()} réparations / jour`,
        `Remise à neuf jusqu'à Q${Math.min(95, REPAIR_TUNING.refurbishBase + 2 * level)}`,
        level >= REPAIR_TUNING.epicLevel ? 'Répare les objets épiques' : level >= REPAIR_TUNING.rareLevel ? `Rares OK · épiques au niv. ${REPAIR_TUNING.epicLevel}` : `Objets rares au niv. ${REPAIR_TUNING.rareLevel}`
      ];
    }
    if (prof === 'craft') {
      return [
        `Qualité des fabrications +${(level - 1) * 3}`,
        level >= 3 ? 'Toutes les recettes débloquées' : `Nouvelles recettes au niv. ${level + 1}`
      ];
    }
    return [
      `Prime des contrats +${e(this.contractPremium())}`,
      `${this.contractCount()} contrats / jour · ${this.standingOrderSlots()} ordres permanents`
    ];
  }

  contractCount() {
    return 3 + (this.level('trade') >= 3 ? 1 : 0);
  }

  standingOrderSlots() {
    return 2 + Math.floor(this.level('trade') / 2);
  }

  getProfessionsView() {
    return Object.values(PLAYER_PROFESSIONS).map(def => {
      const xp = this.professions[def.id]?.xp || 0;
      const level = professionLevel(xp);
      const cur = PROFESSION_LEVELS[level - 1];
      const next = PROFESSION_LEVELS[level] ?? null;
      return {
        ...def,
        xp,
        level,
        nextXp: next,
        progress: next == null ? 1 : (xp - cur) / (next - cur),
        perks: this.perks(def.id, level)
      };
    });
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
  }

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
  }

  _supplyView(itemId) {
    return this.game.getSupplyView ? this.game.getSupplyView(itemId) : null;
  }

  _fair(itemId) {
    return this.game.economy.getFairValue ? this.game.economy.getFairValue(itemId) : this.game.economy.getAveragePrice(itemId);
  }

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
  }

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
  }

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
  }

  /** Prévient le journal de trading d'un revenu d'atelier / de contrat. */
  _emitJobIncome(kind, itemId, qty, amount, costBasis = null) {
    this.game.tradingDesk?.recordJob?.({ kind, itemId, quantity: qty, amount, costBasis });
  }

  _npcState(npcId) {
    return this.game.npcController?.npcStates?.[npcId] || null;
  }

  _npcName(npcId) {
    return this.game.npcController?.getNpcName?.(npcId) || NPCS.find(n => n.id === npcId)?.name || npcId;
  }

  _takeNpcItem(npcId, itemId, quality, perfection, qty = 1) {
    const state = this._npcState(npcId);
    if (!state || !Array.isArray(state.inventory)) return 0;
    const slot = state.inventory.find(s => s.itemId === itemId && Number(s.quality) === Number(quality) && Number(s.perfection) === Number(perfection));
    if (!slot || slot.quantity < qty) return 0;
    slot.quantity -= qty;
    if (slot.quantity <= 0) state.inventory = state.inventory.filter(s => s !== slot);
    return qty;
  }

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
  }

  _repairPay(itemId, quality) {
    const item = getItemById(itemId);
    const base = item?.basePrice || 20;
    return moneyRound(7 + (90 - Number(quality)) * 0.22 + base * 0.045);
  }

  _salvagePay(itemId, quality) {
    const item = getItemById(itemId);
    const base = item?.basePrice || 20;
    return moneyRound(5 + base * 0.03 + Number(quality) * 0.04);
  }

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
  }

  /** Compatibilité : « Réparer » lance une réparation rapide sur l'établi. */
  polish(itemId, quality, perfection) {
    return this.startRepair(itemId, quality, perfection, 'quick');
  }

  _hourMs() {
    return (this.game.timeManager?.msPerGameDay || 24 * 3600 * 1000) / 24;
  }

  _now() {
    return this.game.timeManager?.now?.() ?? Date.now();
  }

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
  }

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
  }

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
  }

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
  }

  _servicePart(job) {
    return repairMaterials(job.itemId, this._serviceNextQuality(job) - job.quality, 'quick');
  }

  _serviceNextQuality(job) {
    return clamp(job.quality + 12 + this.level('repair'), 1, 96);
  }

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
  }

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
  }

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
    const payout = Math.round((job.reward + bonus + streakBonus) * 100) / 100;
    // La récompense vient de la trésorerie du Comptoir (sans la vider sous 200 €), le reste est créé
    const reserve = this.game.reserve;
    if (reserve) {
      const fromReserve = Math.min(job.reward, Math.max(0, reserve.treasury - 200));
      reserve.withdraw(fromReserve, 'contracts');
      reserve.addStock(job.itemId, job.quantity);
    }
    this.game.addMoney(payout);
    this.gainXp('trade', job.rush ? 20 : 15);
    this._emitJobIncome('contract', job.itemId, job.quantity, payout, costBasis);
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
      salvageUsedToday: this.salvageUsedToday,
      servicesUsedToday: this.servicesUsedToday,
      services: this.services,
      streak: this.streak,
      lastActiveDay: this.lastActiveDay,
      stats: this.stats,
      lastLoot: this.lastLoot,
      lastCraft: this.lastCraft,
      professions: this.professions,
      bench: this.bench,
      npcOrders: this.npcOrders,
      lastLevelUp: this.lastLevelUp
    };
  }
}
