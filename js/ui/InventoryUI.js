/**
 * Interface — Inventaire
 */

import { getItemById } from '../data/items.js';

export class InventoryUI {
  /**
   * @param {Object} options
   * @param {Function} options.getInventory - () => Inventory
   * @param {Function} options.onSlotClick  - (slotIndex, slotData) => void
   */
  constructor(options = {}) {
    this.getInventory = options.getInventory || (() => null);
    this.onSlotClick = options.onSlotClick || (() => {});

    this.grid = document.getElementById('inventory-grid');
    this.slotsInfo = document.getElementById('inventory-slots');
    this.categoryButtons = document.querySelectorAll('.category-btn');
    this.currentCategory = 'all';

    this._bindEvents();
  }

  _bindEvents() {
    this.categoryButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.categoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentCategory = btn.dataset.category;
        this.render();
      });
    });
  }

  render() {
    const inventory = this.getInventory();
    if (!inventory || !this.grid) return;

    // Filtre par catégorie
    let slots = inventory.items;
    if (this.currentCategory !== 'all') {
      slots = inventory.filterByCategory(this.currentCategory, getItemById);
    }

    // Met à jour le compteur
    if (this.slotsInfo) {
      this.slotsInfo.textContent = `${inventory.usedSlots} / ${inventory.size} cases`;
    }

    // Génère les cases
    this.grid.innerHTML = '';

    // Cases remplies (filtrées)
    slots.forEach((slot, index) => {
      const item = getItemById(slot.itemId);
      const el = document.createElement('div');
      el.className = 'inventory-slot filled';
      el.dataset.slotIndex = index;

      const rarityColor = this._rarityColor(item?.rarity);

      const avgPriceText = slot.avgBuyPrice != null
        ? `<span class="slot-avg-price">${this._formatMoney(slot.avgBuyPrice)} €</span>`
        : '';

      el.innerHTML = `
        <span class="slot-rarity" style="background:${rarityColor}"></span>
        <span class="slot-icon">${item?.icon || '📦'}</span>
        <span class="slot-name">${item?.name || slot.itemId}</span>
        ${avgPriceText}
        <span class="slot-qty">${slot.quantity}</span>
      `;

      el.title = this._buildTooltip(item, slot);
      el.addEventListener('click', () => this.onSlotClick(index, slot));
      this.grid.appendChild(el);
    });

    // Cases vides pour atteindre la taille totale (uniquement si filtre = all)
    if (this.currentCategory === 'all') {
      const emptyCount = inventory.size - inventory.usedSlots;
      for (let i = 0; i < emptyCount; i++) {
        const el = document.createElement('div');
        el.className = 'inventory-slot';
        el.innerHTML = `<span class="slot-icon" style="opacity:0.25">📦</span>`;
        this.grid.appendChild(el);
      }
    }
  }

  _rarityColor(rarity) {
    const map = {
      'Commun': 'var(--rarity-common)',
      'Rare': 'var(--rarity-rare)',
      'Épique': 'var(--rarity-epic)',
      'Légendaire': 'var(--rarity-legendary)'
    };
    return map[rarity] || 'var(--rarity-common)';
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  _buildTooltip(item, slot) {
    if (!item) return '';
    const lines = [
      item.name,
      `Catégorie : ${item.category}`,
      `Rareté : ${item.rarity}`,
      `Qualité : ${slot.quality}/100`,
      `Perfection : ${slot.perfection}/100`,
      `Quantité : ${slot.quantity}`,
      `Prix de base : ${item.basePrice.toFixed(2)} €`
    ];

    if (slot.avgBuyPrice != null) {
      lines.push(`Prix moyen d'achat : ${slot.avgBuyPrice.toFixed(2)} €`);
      const margin = item.basePrice - slot.avgBuyPrice;
      const marginPct = slot.avgBuyPrice > 0
        ? ((margin / slot.avgBuyPrice) * 100).toFixed(1)
        : '—';
      lines.push(`Marge vs base : ${margin >= 0 ? '+' : ''}${margin.toFixed(2)} € (${marginPct}%)`);
    } else {
      lines.push(`Prix moyen d'achat : — (départ / craft)`);
    }

    return lines.join('\n');
  }
}
