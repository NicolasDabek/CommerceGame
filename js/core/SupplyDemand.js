/**
 * SupplyDemand — offre et demande par objet.
 *
 * Chaque jour :
 *  1. la ville (population × besoins par catégorie × saison × événements) consomme des objets
 *     chez les marchands ; une partie des objets durables revient sur le marché en état « abîmé » ;
 *  2. on mesure la couverture = stock disponible ÷ demande quotidienne (en jours) ;
 *  3. la rareté (economy.scarcity) se rapproche d'une cible : stock faible → prix plus haut,
 *     stock abondant → prix plus bas (élasticité bornée, le rappel vers la normale reste actif) ;
 *  4. les pénuries sont suivies (début, durée de résolution).
 */

import { ITEMS, getItemById } from '../data/items.js';
import { NPCS } from '../data/npcs.js';

export const SEASON_LENGTH = 7;

export const SEASONS = [
  {
    id: 'printemps', label: 'Printemps', icon: '🌱',
    text: 'Saison des chantiers : outils et matériaux sont recherchés.',
    demand: { 'Outils': 1.25, 'Ressources': 1.15, 'Électronique': 0.95 }
  },
  {
    id: 'ete', label: 'Été', icon: '☀️',
    text: 'Fêtes et marchés : nourriture et cadeaux partent vite.',
    demand: { 'Nourriture': 1.2, 'Divers': 1.25, 'Vêtements': 0.85 }
  },
  {
    id: 'automne', label: 'Automne', icon: '🍂',
    text: 'Rentrée : électronique et vêtements très demandés.',
    demand: { 'Électronique': 1.25, 'Vêtements': 1.1, 'Outils': 0.9 }
  },
  {
    id: 'hiver', label: 'Hiver', icon: '❄️',
    text: 'Froid : vêtements, nourriture et bois de chauffage s\'arrachent.',
    demand: { 'Vêtements': 1.3, 'Nourriture': 1.15, 'Ressources': 1.1, 'Outils': 0.85 }
  }
];

/** Besoins quotidiens pour 100 habitants (unités / jour). */
const CATEGORY_NEED = { 'Nourriture': 2.4, 'Ressources': 1.5, 'Outils': 0.75, 'Vêtements': 0.9, 'Électronique': 0.75, 'Divers': 0.9 };
const RARITY_NEED = { 'Commun': 1, 'Rare': 0.5, 'Épique': 0.25 };
const DURABLE = new Set(['Électronique', 'Outils', 'Vêtements']);

export const SD_TUNING = {
  targetCoverage: 12,      // jours de stock jugés « normaux »
  elasticity: 0.1,         // sensibilité du prix à la couverture (log)
  scarcityMin: 0.92,
  scarcityMax: 1.3,
  smoothing: 0.3,          // la rareté rejoint sa cible de 30 % par jour
  shortageCoverage: 2,     // moins de 2 jours de stock = pénurie
  tightCoverage: 5,
  surplusCoverage: 30,
  wornShare: 0.3,          // part des objets durables utilisés qui reviennent abîmés
  populationMin: 80,
  populationMax: 140
};

const r2 = (n) => Math.round(n * 100) / 100;

export function seasonForDay(day = 1) {
  return SEASONS[Math.floor((Math.max(1, day) - 1) / SEASON_LENGTH) % SEASONS.length];
}

export class SupplyDemand {
  constructor(saved = {}) {
    this.population = saved.population ?? 100;
    this.items = saved.items || {};
    this.resolved = saved.resolved || [];
    this.playerFlow = saved.playerFlow || {};
    this.day = saved.day || 1;
    this.stats = { consumed: 0, unmet: 0, worn: 0, ...(saved.stats || {}) };
    ITEMS.forEach(item => {
      if (!this.items[item.id]) this.items[item.id] = { coverage: null, prevCoverage: null, demand: 0, consumed: 0, unmet: 0, shortSince: null, supply: 0 };
    });
  }

  season(day = this.day) {
    return seasonForDay(day);
  }

  baseDemand(itemId) {
    const item = getItemById(itemId);
    if (!item) return 0;
    return (CATEGORY_NEED[item.category] ?? 0.5) * (RARITY_NEED[item.rarity] ?? 1) * (this.population / 100);
  }

  /** Demande quotidienne : besoins × saison × événements en cours. */
  dailyDemand(itemId, day = this.day, economy = null) {
    const item = getItemById(itemId);
    if (!item) return 0;
    const seasonMult = this.season(day).demand[item.category] ?? 1;
    let eventMult = 1;
    if (economy) {
      const ev = economy.eventMultiplier(item.category);
      eventMult = 1 + (ev - 1) * 0.6;
    }
    return this.baseDemand(itemId) * seasonMult * eventMult;
  }

  /**
   * Stock utilisable par objet : marchands + annonces + stock du Comptoir.
   * Les objets abîmés (Q < 35) ne comptent pas : ils doivent d'abord être réparés.
   */
  supplyUnits(game) {
    const units = {};
    ITEMS.forEach(i => { units[i.id] = 0; });
    const usable = (q) => (q ?? 50) >= 35;
    Object.values(game.npcController?.npcStates || {}).forEach(st => {
      (st.inventory || []).forEach(sl => { if (usable(sl.quality)) units[sl.itemId] = (units[sl.itemId] || 0) + sl.quantity; });
    });
    (game.offers || []).forEach(o => {
      if (o.status === 'active' && o.type === 'sell' && usable(o.quality)) units[o.itemId] = (units[o.itemId] || 0) + o.quantity;
    });
    const stock = game.reserve?.stock || {};
    Object.keys(stock).forEach(id => { units[id] = (units[id] || 0) + (stock[id] || 0); });
    return units;
  }

  /** Consommation de la ville chez les marchands. Retourne { consumed, unmet, worn } pour l'objet. */
  _consumeItem(game, itemId, want) {
    const states = game.npcController?.npcStates || {};
    const holders = [];
    Object.keys(states).forEach(id => {
      (states[id].inventory || []).forEach(slot => {
        // Les objets abîmés ne satisfont pas la demande (ils attendent une réparation)
        if (slot.itemId === itemId && slot.quantity > 0 && (slot.quality ?? 50) >= 35) holders.push({ id, slot });
      });
    });
    let left = want;
    let consumed = 0;
    while (left > 0 && holders.length) {
      const idx = Math.floor(Math.random() * holders.length);
      const h = holders[idx];
      h.slot.quantity -= 1;
      consumed += 1;
      left -= 1;
      if (h.slot.quantity <= 0) holders.splice(idx, 1);
    }
    Object.values(states).forEach(st => { st.inventory = (st.inventory || []).filter(s => s.quantity > 0); });

    // Objets durables : une partie revient sur le marché en état abîmé (chez un réparateur de préférence)
    let worn = 0;
    const item = getItemById(itemId);
    if (item && DURABLE.has(item.category)) {
      for (let i = 0; i < consumed; i++) {
        if (Math.random() >= SD_TUNING.wornShare) continue;
        const repairers = NPCS.filter(n => n.profession === 'reparateur' && states[n.id]);
        const pool = repairers.length && Math.random() < 0.6 ? repairers : NPCS.filter(n => states[n.id]);
        const npc = pool[Math.floor(Math.random() * pool.length)];
        if (!npc) break;
        const quality = 8 + Math.floor(Math.random() * 25);
        const perfection = 20 + Math.floor(Math.random() * 26);
        game.npcController.giveItemToNpc(npc.id, itemId, 1, quality, perfection);
        worn += 1;
      }
    }
    return { consumed, unmet: Math.max(0, left), worn };
  }

  scarcityTarget(coverage, unmet = 0) {
    const t = SD_TUNING;
    const cov = Math.max(0.25, coverage);
    let target = 1 + t.elasticity * Math.log(t.targetCoverage / cov);
    if (unmet > 0) target += 0.03;
    return Math.max(t.scarcityMin, Math.min(t.scarcityMax, target));
  }

  /**
   * Journée : consommation, couverture, rareté, pénuries, population.
   * @param {object} game — instance Game
   */
  update(game, day) {
    this.day = day;
    const economy = game.economy;
    const t = SD_TUNING;
    let unmetTotal = 0;
    let demandTotal = 0;

    ITEMS.forEach(item => {
      const st = this.items[item.id];
      const demand = this.dailyDemand(item.id, day, economy);
      const raw = demand * (0.8 + Math.random() * 0.4);
      const want = Math.floor(raw) + (Math.random() < raw - Math.floor(raw) ? 1 : 0);
      const res = this._consumeItem(game, item.id, want);
      st.demand = r2(demand);
      st.consumed = res.consumed;
      st.unmet = res.unmet;
      this.stats.consumed += res.consumed;
      this.stats.unmet += res.unmet;
      this.stats.worn += res.worn;
      unmetTotal += res.unmet;
      demandTotal += want;
    });

    const units = this.supplyUnits(game);
    ITEMS.forEach(item => {
      const st = this.items[item.id];
      const demand = Math.max(0.05, st.demand);
      st.prevCoverage = st.coverage;
      st.supply = units[item.id] || 0;
      st.coverage = r2(st.supply / demand);
      const current = economy.scarcity[item.id] ?? 1;
      const target = this.scarcityTarget(st.coverage, st.unmet);
      economy.scarcity[item.id] = Math.round((current + (target - current) * t.smoothing) * 1000) / 1000;

      const short = st.coverage < t.shortageCoverage || st.unmet > 0;
      if (short && st.shortSince == null) st.shortSince = day;
      if (!short && st.shortSince != null) {
        this.resolved.push(day - st.shortSince);
        if (this.resolved.length > 40) this.resolved.splice(0, this.resolved.length - 40);
        st.shortSince = null;
      }
    });

    // Population : grandit quand la ville est bien approvisionnée, recule sinon
    const unmetShare = demandTotal > 0 ? unmetTotal / demandTotal : 0;
    const factor = unmetShare < 0.1 ? 1.004 : unmetShare > 0.25 ? 0.995 : 1;
    this.population = Math.round(Math.max(t.populationMin, Math.min(t.populationMax, this.population * factor)) * 10) / 10;

    // Le souvenir des achats / ventes du joueur s'estompe
    Object.keys(this.playerFlow).forEach(id => {
      this.playerFlow[id] = Math.round(this.playerFlow[id] * 0.75 * 100) / 100;
      if (Math.abs(this.playerFlow[id]) < 0.2) delete this.playerFlow[id];
    });
  }

  /** Mesure le stock sans consommer (au lancement ou après un chargement). */
  refresh(game) {
    const units = this.supplyUnits(game);
    ITEMS.forEach(item => {
      const st = this.items[item.id];
      st.demand = st.demand || r2(this.dailyDemand(item.id, this.day, game.economy));
      st.supply = units[item.id] || 0;
      if (st.coverage == null) st.coverage = r2(st.supply / Math.max(0.05, st.demand));
    });
  }

  /** Le joueur achète (+) ou vend (−) : les PNJ s'en souviennent quelques jours. */
  notePlayerTrade(itemId, qty, playerBuys) {
    this.playerFlow[itemId] = Math.round(((this.playerFlow[itemId] || 0) + (playerBuys ? qty : -qty)) * 100) / 100;
  }

  statusOf(coverage, unmet = 0) {
    const t = SD_TUNING;
    if (coverage == null) return { id: 'balanced', label: 'Équilibré' };
    if (coverage < t.shortageCoverage || unmet > 0) return { id: 'shortage', label: 'Pénurie' };
    if (coverage < t.tightCoverage) return { id: 'tight', label: 'Tendu' };
    if (coverage > t.surplusCoverage) return { id: 'surplus', label: 'Surplus' };
    return { id: 'balanced', label: 'Équilibré' };
  }

  /** Vue lisible d'un objet pour l'interface et l'IA. */
  getView(itemId, economy = null) {
    const st = this.items[itemId] || {};
    const demand = st.demand || this.dailyDemand(itemId, this.day, economy);
    const coverage = st.coverage;
    const status = this.statusOf(coverage, st.unmet);
    let trend = 'stable';
    if (st.prevCoverage != null && coverage != null) {
      const delta = coverage - st.prevCoverage;
      if (delta < -Math.max(0.5, st.prevCoverage * 0.15)) trend = 'falling';
      else if (delta > Math.max(0.5, st.prevCoverage * 0.15)) trend = 'rising';
    }
    const item = getItemById(itemId);
    const season = this.season();
    const seasonMult = item ? (season.demand[item.category] ?? 1) : 1;
    const flow = this.playerFlow[itemId] || 0;
    const reasons = [];
    if (st.unmet > 0) reasons.push(`${st.unmet} demande(s) non servie(s) hier`);
    if (seasonMult > 1.05) reasons.push(`${season.label} : demande +${Math.round((seasonMult - 1) * 100)} %`);
    if (seasonMult < 0.95) reasons.push(`${season.label} : demande ${Math.round((seasonMult - 1) * 100)} %`);
    if (trend === 'falling') reasons.push('le stock fond');
    if (trend === 'rising') reasons.push('le stock remonte');
    if (flow >= 2) reasons.push('vous achetez beaucoup cet objet');
    if (flow <= -2) reasons.push('vous en vendez beaucoup');
    const scarcity = economy?.scarcity?.[itemId] ?? 1;
    return {
      itemId,
      demand: r2(demand),
      supply: st.supply ?? null,
      coverage,
      consumed: st.consumed || 0,
      unmet: st.unmet || 0,
      status: status.id,
      label: status.label,
      trend,
      anticipate: trend === 'falling' && coverage != null && coverage < SD_TUNING.tightCoverage * 1.5,
      scarcity,
      playerFlow: flow,
      why: reasons.join(' · ')
    };
  }

  getSummary(economy = null) {
    const views = ITEMS.map(i => this.getView(i.id, economy));
    const avgResolve = this.resolved.length ? this.resolved.reduce((s, d) => s + d, 0) / this.resolved.length : null;
    const season = this.season();
    const dayInSeason = ((this.day - 1) % SEASON_LENGTH) + 1;
    return {
      season,
      seasonDaysLeft: SEASON_LENGTH - dayInSeason + 1,
      nextSeason: seasonForDay(this.day + (SEASON_LENGTH - dayInSeason + 1)),
      population: this.population,
      shortages: views.filter(v => v.status === 'shortage').map(v => v.itemId),
      surplus: views.filter(v => v.status === 'surplus').map(v => v.itemId),
      avgShortageDays: avgResolve != null ? Math.round(avgResolve * 10) / 10 : null
    };
  }

  toJSON() {
    return {
      population: this.population,
      items: this.items,
      resolved: this.resolved,
      playerFlow: this.playerFlow,
      day: this.day,
      stats: this.stats
    };
  }

  static fromJSON(data) {
    return new SupplyDemand(data || {});
  }
}
