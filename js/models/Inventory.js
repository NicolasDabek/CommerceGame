/**
 * Gestion de l'inventaire du joueur (et potentiellement des PNJ)
 * - Cases limitées (10 au départ)
 * - Pas de poids, uniquement nombre de cases + catégories
 * - Chaque stack = 1 case (itemId + quantity + quality + perfection)
 */

export class Inventory {
  /**
   * @param {number} size - Nombre de cases maximum
   * @param {Array} [items=[]] - Contenu initial
   */
  constructor(size = 10, items = []) {
    this.size = size;
    this.items = items.map(item => ({ ...item })); // deep enough copy
  }

  /**
   * Nombre de cases utilisées
   */
  get usedSlots() {
    return this.items.length;
  }

  /**
   * Cases restantes
   */
  get freeSlots() {
    return this.size - this.items.length;
  }

  /**
   * Vérifie si on peut ajouter une certaine quantité d'un item
   * (soit stack existant, soit nouvelle case)
   */
  canAdd(itemId, quantity = 1, quality = 50, perfection = 50) {
    // Cherche un stack identique (même item + même qualité + même perfection)
    const existing = this.items.find(
      i => i.itemId === itemId && i.quality === quality && i.perfection === perfection
    );

    if (existing) return true; // on peut empiler
    return this.freeSlots >= 1;
  }

  /**
   * Ajoute des items. Retourne true si succès, false sinon.
   * @param {number|null} avgBuyPrice - Prix moyen d'achat unitaire (null = inconnu / craft / départ)
   */
  add(itemId, quantity = 1, quality = 50, perfection = 50, avgBuyPrice = null) {
    if (quantity <= 0) return false;

    const existing = this.items.find(
      i => i.itemId === itemId && i.quality === quality && i.perfection === perfection
    );

    if (existing) {
      // Recalcule le prix moyen pondéré
      if (avgBuyPrice != null) {
        const oldTotal = (existing.avgBuyPrice ?? 0) * existing.quantity;
        const newTotal = avgBuyPrice * quantity;
        const totalQty = existing.quantity + quantity;
        existing.avgBuyPrice = Math.round(((oldTotal + newTotal) / totalQty) * 100) / 100;
      }
      existing.quantity += quantity;
      return true;
    }

    if (this.freeSlots < 1) return false;

    this.items.push({
      itemId,
      quantity,
      quality,
      perfection,
      avgBuyPrice: avgBuyPrice != null ? Math.round(avgBuyPrice * 100) / 100 : null
    });
    return true;
  }

  /**
   * Retire des items. Retourne la quantité réellement retirée.
   */
  remove(itemId, quantity = 1, quality = null, perfection = null) {
    let remaining = quantity;

    // On parcourt à l'envers pour pouvoir supprimer des cases
    for (let i = this.items.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.items[i];

      if (slot.itemId !== itemId) continue;
      if (quality !== null && slot.quality !== quality) continue;
      if (perfection !== null && slot.perfection !== perfection) continue;

      if (slot.quantity <= remaining) {
        remaining -= slot.quantity;
        this.items.splice(i, 1);
      } else {
        slot.quantity -= remaining;
        remaining = 0;
      }
    }

    return quantity - remaining; // quantité effectivement retirée
  }

  /**
   * Retourne la quantité totale d'un item (toutes qualités confondues)
   */
  count(itemId) {
    return this.items
      .filter(i => i.itemId === itemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  /**
   * Retourne les stacks d'un item précis
   */
  getStacks(itemId) {
    return this.items.filter(i => i.itemId === itemId);
  }

  /**
   * Filtre par catégorie (nécessite la liste des items)
   * @param {string} category - 'all' ou nom de catégorie
   * @param {Function} getItemFn - fonction (id) => item
   */
  filterByCategory(category, getItemFn) {
    if (category === 'all') return [...this.items];

    return this.items.filter(slot => {
      const item = getItemFn(slot.itemId);
      return item && item.category === category;
    });
  }

  /**
   * Agrandit l'inventaire
   */
  expand(additionalSlots) {
    this.size += additionalSlots;
  }

  toJSON() {
    return {
      size: this.size,
      items: this.items.map(i => ({ ...i }))
    };
  }

  static fromJSON(data) {
    return new Inventory(data.size, data.items);
  }
}
