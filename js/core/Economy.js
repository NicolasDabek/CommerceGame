/**
 * Economy — Prix moyens, inflation, événements économiques
 *
 * - Calcule les prix moyens à partir des transactions
 * - Applique une inflation / déflation légère
 * - Génère des événements (saison, criminalité, etc.) qui font varier les prix
 */

import { ITEMS, getItemById } from '../data/items.js';

export class Economy {
  constructor(options = {}) {
    // Prix moyen par itemId (mis à jour avec les transactions)
    this.averagePrices = {};

    // Multiplicateurs actuels par catégorie (1.0 = normal)
    this.categoryModifiers = {
      'Électronique': 1.0,
      'Nourriture': 1.0,
      'Vêtements': 1.0,
      'Outils': 1.0,
      'Ressources': 1.0,
      'Divers': 1.0
    };

    // Inflation globale (1.0 = stable)
    this.globalInflation = 1.0;

    // Historique des prix (pour plus tard : graphiques)
    // { itemId: [{ price, timestamp }, ...] }
    this.priceHistory = {};

    // Événements actifs
    this.activeEvents = [];

    // Initialise avec les prix de base
    ITEMS.forEach(item => {
      this.averagePrices[item.id] = item.basePrice;
      this.priceHistory[item.id] = [];
    });
  }

  /**
   * Prix moyen actuel d'un objet (avec modificateurs)
   */
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

  /**
   * Enregistre une transaction pour mettre à jour le prix moyen
   * Moyenne mobile simple (poids 20% sur le nouveau prix)
   */
  recordTransaction(itemId, price, timestamp = Date.now()) {
    const current = this.averagePrices[itemId] ?? price;
    const newAvg = current * 0.8 + price * 0.2;
    this.averagePrices[itemId] = Math.round(newAvg * 100) / 100;

    if (!this.priceHistory[itemId]) this.priceHistory[itemId] = [];
    this.priceHistory[itemId].push({ price, timestamp });

    // Garde max 100 points d'historique par item
    if (this.priceHistory[itemId].length > 100) {
      this.priceHistory[itemId].shift();
    }
  }

  /**
   * Applique une légère dérive d'inflation (appelé chaque jour)
   */
  tickDaily() {
    // Petite fluctuation aléatoire de l'inflation globale (±0.5%)
    const drift = (Math.random() - 0.5) * 0.01;
    this.globalInflation = Math.max(0.7, Math.min(1.5, this.globalInflation + drift));

    // Fluctuation par catégorie
    Object.keys(this.categoryModifiers).forEach(cat => {
      const catDrift = (Math.random() - 0.5) * 0.02;
      this.categoryModifiers[cat] = Math.max(
        0.6,
        Math.min(1.8, this.categoryModifiers[cat] + catDrift)
      );
    });

    // Chance d'événement
    if (Math.random() < 0.15) {
      this._triggerRandomEvent();
    }

    // Expire les événements terminés
    const now = Date.now();
    this.activeEvents = this.activeEvents.filter(e => e.expiresAt > now);
  }

  /**
   * Déclenche un événement économique aléatoire
   */
  _triggerRandomEvent() {
    const events = [
      {
        id: 'shortage_electronics',
        name: 'Pénurie de composants',
        description: 'Les prix de l\'électronique grimpent.',
        category: 'Électronique',
        modifier: 1.25,
        durationHours: 12
      },
      {
        id: 'food_boom',
        name: 'Bonne récolte',
        description: 'Les prix alimentaires baissent.',
        category: 'Nourriture',
        modifier: 0.8,
        durationHours: 18
      },
      {
        id: 'crime_wave',
        name: 'Vague de criminalité',
        description: 'Insécurité : les ressources et outils coûtent plus cher.',
        categories: ['Ressources', 'Outils'],
        modifier: 1.15,
        durationHours: 24
      },
      {
        id: 'fashion_trend',
        name: 'Tendance mode',
        description: 'Les vêtements sont très demandés.',
        category: 'Vêtements',
        modifier: 1.3,
        durationHours: 10
      },
      {
        id: 'market_crash',
        name: 'Correction du marché',
        description: 'Légère déflation globale.',
        global: true,
        modifier: 0.92,
        durationHours: 8
      },
      {
        id: 'speculation',
        name: 'Spéculation',
        description: 'Inflation temporaire sur tout.',
        global: true,
        modifier: 1.08,
        durationHours: 6
      }
    ];

    const event = events[Math.floor(Math.random() * events.length)];
    const expiresAt = Date.now() + event.durationHours * 60 * 60 * 1000;

    // Applique le modificateur
    if (event.global) {
      this.globalInflation *= event.modifier;
    } else if (event.categories) {
      event.categories.forEach(cat => {
        if (this.categoryModifiers[cat] != null) {
          this.categoryModifiers[cat] *= event.modifier;
        }
      });
    } else if (event.category) {
      if (this.categoryModifiers[event.category] != null) {
        this.categoryModifiers[event.category] *= event.modifier;
      }
    }

    this.activeEvents.push({
      ...event,
      expiresAt,
      startedAt: Date.now()
    });

    return event;
  }

  /**
   * Retourne les événements actifs (pour l'UI plus tard)
   */
  getActiveEvents() {
    const now = Date.now();
    return this.activeEvents.filter(e => e.expiresAt > now).map(e => ({
      ...e,
      remainingMs: e.expiresAt - now
    }));
  }

  /**
   * Résumé pour debug / UI
   */
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
    if (data.priceHistory) eco.priceHistory = data.priceHistory;
    if (data.activeEvents) eco.activeEvents = data.activeEvents;
    return eco;
  }
}
