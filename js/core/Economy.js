import { ITEMS, getItemById } from '../data/items.js';

const MAX_HISTORY = 80;

export class Economy {
  constructor() {
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
    ITEMS.forEach(item => {
      this.averagePrices[item.id] = item.basePrice;
      this.priceHistory[item.id] = [];
    });
  }

  getAveragePrice(itemId) {
    const base = this.averagePrices[itemId] ?? getItemById(itemId)?.basePrice ?? 10;
    const item = getItemById(itemId);
    const catMod = item ? (this.categoryModifiers[item.category] ?? 1.0) : 1.0;
    return Math.round(base * catMod * this.globalInflation * 100) / 100;
  }

  applyConditionModifier(price, quality = 50, perfection = 50) {
    const qualityMod = 0.75 + (Number(quality) / 100) * 0.45;
    const perfectionMod = 0.9 + (Number(perfection) / 100) * 0.25;
    return Math.max(0.01, Math.round(price * qualityMod * perfectionMod * 100) / 100);
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

  recordTransaction(itemId, price, timestamp = Date.now()) {
    const current = this.averagePrices[itemId] ?? price;
    this.averagePrices[itemId] = Math.round((current * 0.8 + price * 0.2) * 100) / 100;
    if (!this.priceHistory[itemId]) this.priceHistory[itemId] = [];
    this.priceHistory[itemId].push({ price, timestamp });
    if (this.priceHistory[itemId].length > MAX_HISTORY) {
      this.priceHistory[itemId].splice(0, this.priceHistory[itemId].length - MAX_HISTORY);
    }
  }

  tickDaily(now = Date.now()) {
    this.globalInflation = Math.max(0.7, Math.min(1.5, this.globalInflation + (Math.random() - 0.5) * 0.01));
    Object.keys(this.categoryModifiers).forEach(cat => {
      this.categoryModifiers[cat] = Math.max(0.6, Math.min(1.8, this.categoryModifiers[cat] + (Math.random() - 0.5) * 0.02));
    });
    if (Math.random() < 0.15) this._triggerRandomEvent(now);
    this.expireEvents(now);
  }

  expireEvents(now = Date.now()) {
    const stillActive = [];
    this.activeEvents.forEach(event => {
      if (event.expiresAt > now) stillActive.push(event);
      else this._revertEvent(event);
    });
    this.activeEvents = stillActive;
  }

  _applyEvent(event) {
    if (event.global) this.globalInflation *= event.modifier;
    else if (event.categories) event.categories.forEach(cat => {
      if (this.categoryModifiers[cat] != null) this.categoryModifiers[cat] *= event.modifier;
    });
    else if (event.category && this.categoryModifiers[event.category] != null) {
      this.categoryModifiers[event.category] *= event.modifier;
    }
  }

  _revertEvent(event) {
    if (!event?.modifier) return;
    const inverse = 1 / event.modifier;
    if (event.global) this.globalInflation = Math.max(0.7, Math.min(1.5, this.globalInflation * inverse));
    else if (event.categories) event.categories.forEach(cat => {
      if (this.categoryModifiers[cat] != null) {
        this.categoryModifiers[cat] = Math.max(0.6, Math.min(1.8, this.categoryModifiers[cat] * inverse));
      }
    });
    else if (event.category && this.categoryModifiers[event.category] != null) {
      this.categoryModifiers[event.category] = Math.max(0.6, Math.min(1.8, this.categoryModifiers[event.category] * inverse));
    }
  }

  _triggerRandomEvent(now = Date.now()) {
    const events = [
      { id: 'shortage_electronics', name: 'Pénurie de composants', description: "Les prix de l'électronique grimpent.", category: 'Électronique', modifier: 1.25, durationHours: 12 },
      { id: 'food_boom', name: 'Bonne récolte', description: 'Les prix alimentaires baissent.', category: 'Nourriture', modifier: 0.8, durationHours: 18 },
      { id: 'crime_wave', name: 'Vague de criminalité', description: 'Ressources et outils plus chers.', categories: ['Ressources', 'Outils'], modifier: 1.15, durationHours: 24 },
      { id: 'fashion_trend', name: 'Tendance mode', description: 'Les vêtements sont demandés.', category: 'Vêtements', modifier: 1.3, durationHours: 10 },
      { id: 'market_crash', name: 'Correction du marché', description: 'Déflation globale.', global: true, modifier: 0.92, durationHours: 8 },
      { id: 'speculation', name: 'Spéculation', description: 'Inflation temporaire.', global: true, modifier: 1.08, durationHours: 6 }
    ];
    const event = events[Math.floor(Math.random() * events.length)];
    this._applyEvent(event);
    this.activeEvents.push({ ...event, startedAt: now, expiresAt: now + event.durationHours * 3600000 });
    return event;
  }

  getActiveEvents(now = Date.now()) {
    return this.activeEvents.filter(e => e.expiresAt > now).map(e => ({ ...e, remainingMs: e.expiresAt - now }));
  }

  getSummary() {
    return {
      globalInflation: Math.round(this.globalInflation * 1000) / 1000,
      categoryModifiers: { ...this.categoryModifiers },
      activeEvents: this.getActiveEvents().map(e => e.name)
    };
  }

  toJSON() {
    return {
      averagePrices: { ...this.averagePrices },
      categoryModifiers: { ...this.categoryModifiers },
      globalInflation: this.globalInflation,
      priceHistory: this.priceHistory,
      activeEvents: this.activeEvents
    };
  }

  static fromJSON(data) {
    const eco = new Economy();
    if (data.averagePrices) eco.averagePrices = data.averagePrices;
    if (data.categoryModifiers) eco.categoryModifiers = data.categoryModifiers;
    if (data.globalInflation != null) eco.globalInflation = data.globalInflation;
    if (data.priceHistory) {
      eco.priceHistory = data.priceHistory;
      Object.keys(eco.priceHistory).forEach(id => {
        if (eco.priceHistory[id].length > MAX_HISTORY) eco.priceHistory[id] = eco.priceHistory[id].slice(-MAX_HISTORY);
      });
    }
    if (data.activeEvents) eco.activeEvents = data.activeEvents;
    return eco;
  }
}
