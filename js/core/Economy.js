import { ITEMS, getItemById } from '../data/items.js';

const MAX_HISTORY = 80;
const MAX_SNAPSHOTS = 60;
const ECONOMY_VERSION = 2;

/* Réglages de stabilisation (ajustés avec `npm run sim`) */
export const ECONOMY_TUNING = {
  emaWeight: 0.15,          // poids d'une transaction dans le prix moyen
  outlierLow: 0.6,          // une vente à moins de 60 % du prix moyen compte comme 60 %
  outlierHigh: 1.6,         // … et à plus de 160 % comme 160 %
  meanReversion: 0.05,      // rappel quotidien vers la valeur normale (5 % de l'écart)
  softBandLow: 0.6,         // en dessous : rappel renforcé
  softBandHigh: 1.8,        // au-dessus : rappel renforcé
  hardBandLow: 0.35,        // bornes absolues du prix moyen (× prix de base)
  hardBandHigh: 3,
  modifierReversion: 0.08,  // les tendances de catégorie / l'inflation reviennent vers 1
  modifierNoise: 0.02,
  inflationMin: 0.85,
  inflationMax: 1.2,
  categoryMin: 0.75,
  categoryMax: 1.35
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

export class Economy {
  constructor() {
    this.version = ECONOMY_VERSION;
    this.averagePrices = {};
    this.categoryModifiers = {
      'Électronique': 1.0,
      'Nourriture': 1.0,
      'Vêtements': 1.0,
      'Outils': 1.0,
      'Ressources': 1.0,
      'Divers': 1.0
    };
    this.globalInflation = 1.0;
    this.priceHistory = {};
    this.activeEvents = [];
    this.snapshots = [];
    /** Horloge du jeu (remplacée par Game pour utiliser le temps de jeu). */
    this.clock = () => Date.now();
    this.msPerGameDay = 24 * 60 * 60 * 1000;
    ITEMS.forEach(item => {
      this.averagePrices[item.id] = item.basePrice;
      this.priceHistory[item.id] = [];
    });
  }

  /* ---------- Modificateurs ---------- */

  /** Multiplicateur des événements actifs pour une catégorie (non « cuit » dans les tendances). */
  eventMultiplier(category, now = this.clock()) {
    let mult = 1;
    this.activeEvents.forEach(event => {
      if (event.expiresAt != null && event.expiresAt <= now) return;
      if (event.global) mult *= event.modifier;
      else if (event.categories && event.categories.includes(category)) mult *= event.modifier;
      else if (event.category === category) mult *= event.modifier;
    });
    return mult;
  }

  /** Conditions de marché actuelles : tendance de catégorie × inflation × événements. */
  macroModifier(itemId, now = this.clock()) {
    const item = getItemById(itemId);
    const catMod = item ? (this.categoryModifiers[item.category] ?? 1.0) : 1.0;
    return catMod * this.globalInflation * (item ? this.eventMultiplier(item.category, now) : 1);
  }

  conditionModifier(quality = 50, perfection = 50) {
    const qualityMod = 0.75 + (Number(quality) / 100) * 0.45;
    const perfectionMod = 0.9 + (Number(perfection) / 100) * 0.25;
    return qualityMod * perfectionMod;
  }

  /** Prix moyen affiché (Q/P neutres) = moyenne « de base » × conditions de marché. */
  getAveragePrice(itemId) {
    const base = this.averagePrices[itemId] ?? getItemById(itemId)?.basePrice ?? 10;
    return round2(base * this.macroModifier(itemId));
  }

  /** Valeur normale : prix de base × conditions de marché (sans l'effet offre/demande). */
  getFairValue(itemId) {
    const item = getItemById(itemId);
    const base = item?.basePrice ?? 10;
    return round2(base * this.macroModifier(itemId));
  }

  applyConditionModifier(price, quality = 50, perfection = 50) {
    return Math.max(0.01, round2(price * this.conditionModifier(quality, perfection)));
  }

  getTrend(itemId) {
    const history = this.priceHistory[itemId] || [];
    if (history.length < 3) return 'stable';
    const recent = history.slice(-3).reduce((sum, p) => sum + p.price, 0) / Math.min(3, history.length);
    const previousSlice = history.slice(Math.max(0, history.length - 8), Math.max(0, history.length - 3));
    if (previousSlice.length === 0) return 'stable';
    const previous = previousSlice.reduce((sum, p) => sum + p.price, 0) / previousSlice.length;
    const delta = previous > 0 ? (recent - previous) / previous : 0;
    if (delta > 0.04) return 'up';
    if (delta < -0.04) return 'down';
    return 'stable';
  }

  /**
   * Enregistre une vente. Le prix est ramené en « équivalent base » (on retire la qualité,
   * la tendance de catégorie, l'inflation et les événements) avant d'entrer dans la moyenne :
   * sinon ces multiplicateurs s'appliqueraient deux fois et les prix s'emballeraient.
   */
  recordTransaction(itemId, price, timestamp = this.clock(), options = {}) {
    const item = getItemById(itemId);
    const basePrice = item?.basePrice ?? price;
    const current = this.averagePrices[itemId] ?? basePrice;
    // relatif à un objet « moyen » (Q50/P50), référence du prix moyen
    const condition = this.conditionModifier(options.quality ?? 50, options.perfection ?? 50) / this.conditionModifier(50, 50);
    const macro = this.macroModifier(itemId, options.now ?? this.clock());
    let normalized = price / Math.max(0.01, condition * macro);
    const t = ECONOMY_TUNING;
    normalized = Math.min(current * t.outlierHigh, Math.max(current * t.outlierLow, normalized));
    let next = current * (1 - t.emaWeight) + normalized * t.emaWeight;
    next = Math.min(basePrice * t.hardBandHigh, Math.max(basePrice * t.hardBandLow, next));
    this.averagePrices[itemId] = round2(next);
    if (!this.priceHistory[itemId]) this.priceHistory[itemId] = [];
    this.priceHistory[itemId].push({ price, timestamp });
    if (this.priceHistory[itemId].length > MAX_HISTORY) {
      this.priceHistory[itemId].splice(0, this.priceHistory[itemId].length - MAX_HISTORY);
    }
  }

  /** Rappel quotidien des prix moyens vers leur valeur normale (prix de base). */
  applyMeanReversion() {
    const t = ECONOMY_TUNING;
    ITEMS.forEach(item => {
      const base = item.basePrice;
      const avg = this.averagePrices[item.id] ?? base;
      const ratio = avg / base;
      let k = t.meanReversion;
      if (ratio > t.softBandHigh || ratio < t.softBandLow) k *= 3;
      const next = avg + (base - avg) * k;
      this.averagePrices[item.id] = round2(Math.min(base * t.hardBandHigh, Math.max(base * t.hardBandLow, next)));
    });
  }

  _revertModifier(value, min, max) {
    const t = ECONOMY_TUNING;
    const noise = (Math.random() - 0.5) * t.modifierNoise;
    const next = value + (1 - value) * t.modifierReversion + noise;
    return Math.max(min, Math.min(max, next));
  }

  tickDaily(now = this.clock()) {
    const t = ECONOMY_TUNING;
    this.globalInflation = this._revertModifier(this.globalInflation, t.inflationMin, t.inflationMax);
    Object.keys(this.categoryModifiers).forEach(cat => {
      this.categoryModifiers[cat] = this._revertModifier(this.categoryModifiers[cat], t.categoryMin, t.categoryMax);
    });
    this.applyMeanReversion();
    if (Math.random() < 0.15) this._triggerRandomEvent(now);
    this.expireEvents(now);
  }

  expireEvents(now = this.clock()) {
    this.activeEvents = this.activeEvents.filter(event => event.expiresAt > now);
  }

  /* Conservés pour compatibilité : en v2 les événements ne modifient plus les tendances stockées. */
  _applyEvent() {}
  _revertEvent() {}

  _triggerRandomEvent(now = this.clock()) {
    const events = [
      { id: 'shortage_electronics', name: 'Pénurie de composants', description: "Les prix de l'électronique grimpent.", category: 'Électronique', modifier: 1.25, durationDays: 3 },
      { id: 'food_boom', name: 'Bonne récolte', description: 'Les prix alimentaires baissent.', category: 'Nourriture', modifier: 0.8, durationDays: 4 },
      { id: 'crime_wave', name: 'Vague de criminalité', description: 'Ressources et outils plus chers.', categories: ['Ressources', 'Outils'], modifier: 1.15, durationDays: 3 },
      { id: 'fashion_trend', name: 'Tendance mode', description: 'Les vêtements sont demandés.', category: 'Vêtements', modifier: 1.3, durationDays: 2 },
      { id: 'market_crash', name: 'Correction du marché', description: 'Déflation globale.', global: true, modifier: 0.92, durationDays: 2 },
      { id: 'speculation', name: 'Spéculation', description: 'Inflation temporaire.', global: true, modifier: 1.08, durationDays: 2 }
    ];
    const event = events[Math.floor(Math.random() * events.length)];
    this.activeEvents.push({ ...event, startedAt: now, expiresAt: now + event.durationDays * this.msPerGameDay });
    return event;
  }

  getActiveEvents(now = this.clock()) {
    return this.activeEvents.filter(e => e.expiresAt > now).map(e => ({ ...e, remainingMs: e.expiresAt - now }));
  }

  /* ---------- Lecture pour l'interface ---------- */

  /** Niveau général des prix : moyenne des prix affichés / prix de base (1 = normal). */
  getPriceLevel() {
    const ratios = ITEMS.map(item => this.getAveragePrice(item.id) / item.basePrice);
    return ratios.reduce((s, r) => s + r, 0) / ratios.length;
  }

  /**
   * Explique en français pourquoi le prix d'un objet s'écarte de sa valeur de base.
   * @returns {{ base:number, average:number, fair:number, ratio:number, factors:Array<{label:string,pct:number}>, summary:string }}
   */
  explainPrice(itemId, now = this.clock()) {
    const item = getItemById(itemId);
    const base = item?.basePrice ?? 10;
    const average = this.getAveragePrice(itemId);
    const fair = this.getFairValue(itemId);
    const factors = [];
    const pct = (m) => Math.round((m - 1) * 1000) / 10;
    if (item) {
      this.activeEvents.forEach(event => {
        if (event.expiresAt <= now) return;
        const hits = event.global || event.category === item.category || (event.categories || []).includes(item.category);
        if (hits) factors.push({ label: event.name, pct: pct(event.modifier), kind: 'event' });
      });
      const catMod = this.categoryModifiers[item.category] ?? 1;
      if (Math.abs(catMod - 1) >= 0.02) {
        factors.push({ label: `Tendance ${item.category}`, pct: pct(catMod), kind: 'category' });
      }
    }
    if (Math.abs(this.globalInflation - 1) >= 0.02) {
      factors.push({ label: 'Inflation générale', pct: pct(this.globalInflation), kind: 'inflation' });
    }
    const supply = (this.averagePrices[itemId] ?? base) / base;
    if (Math.abs(supply - 1) >= 0.03) {
      factors.push({
        label: supply > 1 ? 'Ventes récentes chères' : 'Ventes récentes bradées',
        pct: pct(supply),
        kind: 'supply'
      });
    }
    factors.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const ratio = base > 0 ? average / base : 1;
    let summary = 'Prix proche de sa valeur normale.';
    if (factors.length) {
      const top = factors[0];
      summary = `${top.pct > 0 ? 'Plus cher' : 'Moins cher'} surtout à cause de : ${top.label} (${top.pct > 0 ? '+' : ''}${top.pct} %).`;
    }
    return { base, average, fair, ratio, factors, summary };
  }

  /** Photo quotidienne de l'économie (gardée sur 60 jours, sauvegardée). */
  recordSnapshot(snapshot) {
    this.snapshots.push(snapshot);
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOTS);
  }

  getSummary() {
    return {
      globalInflation: Math.round(this.globalInflation * 1000) / 1000,
      categoryModifiers: { ...this.categoryModifiers },
      activeEvents: this.getActiveEvents().map(e => e.name),
      priceLevel: Math.round(this.getPriceLevel() * 1000) / 1000
    };
  }

  toJSON() {
    return {
      version: this.version,
      averagePrices: { ...this.averagePrices },
      categoryModifiers: { ...this.categoryModifiers },
      globalInflation: this.globalInflation,
      priceHistory: this.priceHistory,
      activeEvents: this.activeEvents,
      snapshots: this.snapshots
    };
  }

  static fromJSON(data) {
    const eco = new Economy();
    if (data.averagePrices) eco.averagePrices = { ...eco.averagePrices, ...data.averagePrices };
    if (data.categoryModifiers) eco.categoryModifiers = { ...eco.categoryModifiers, ...data.categoryModifiers };
    if (data.globalInflation != null) eco.globalInflation = data.globalInflation;
    if (data.priceHistory) {
      eco.priceHistory = data.priceHistory;
      Object.keys(eco.priceHistory).forEach(id => {
        if (eco.priceHistory[id].length > MAX_HISTORY) eco.priceHistory[id] = eco.priceHistory[id].slice(-MAX_HISTORY);
      });
    }
    if (data.activeEvents) eco.activeEvents = data.activeEvents;
    if (Array.isArray(data.snapshots)) eco.snapshots = data.snapshots.slice(-MAX_SNAPSHOTS);

    if ((data.version || 1) < 2) {
      // Anciennes sauvegardes : les événements étaient « cuits » dans les tendances → on les retire.
      eco.activeEvents.forEach(event => {
        if (!event?.modifier) return;
        if (event.global) eco.globalInflation /= event.modifier;
        else (event.categories || [event.category]).forEach(cat => {
          if (eco.categoryModifiers[cat] != null) eco.categoryModifiers[cat] /= event.modifier;
        });
      });
      const t = ECONOMY_TUNING;
      eco.globalInflation = Math.max(t.inflationMin, Math.min(t.inflationMax, eco.globalInflation));
      Object.keys(eco.categoryModifiers).forEach(cat => {
        eco.categoryModifiers[cat] = Math.max(t.categoryMin, Math.min(t.categoryMax, eco.categoryModifiers[cat]));
      });
      // Prix moyens emballés par l'ancien calcul : on les ramène dans la bande autorisée.
      ITEMS.forEach(item => {
        const avg = eco.averagePrices[item.id] ?? item.basePrice;
        eco.averagePrices[item.id] = round2(Math.min(item.basePrice * t.hardBandHigh, Math.max(item.basePrice * t.hardBandLow, avg)));
      });
    }
    eco.version = ECONOMY_VERSION;
    return eco;
  }
}
