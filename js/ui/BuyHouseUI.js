/**
 * Interface — Hôtel d'achat
 */

import { getItemById } from '../data/items.js';

export class BuyHouseUI {
  /**
   * @param {Object} options
   * @param {Function} options.getActiveBuyOffers
   * @param {Function} options.getPlayerBuyOffers
   * @param {Function} options.getPlayerItemCount  - (itemId) => number
   * @param {Function} options.onCancel
   * @param {Function} options.onCreateBuy
   * @param {Function} options.onFulfill          - (offerId, maxQty) => void
   * @param {Function} options.resolveName
   */
  constructor(options = {}) {
    this.getActiveBuyOffers = options.getActiveBuyOffers || (() => []);
    this.getPlayerBuyOffers = options.getPlayerBuyOffers || (() => []);
    this.getPlayerItemCount = options.getPlayerItemCount || (() => 0);
    this.onCancel = options.onCancel || (() => {});
    this.onCreateBuy = options.onCreateBuy || (() => {});
    this.onFulfill = options.onFulfill || (() => {});
    this.resolveName = options.resolveName || ((id) => id === 'player' ? 'Vous' : id);

    this.tbody = document.getElementById('buyhouse-body');
    this.btnNewBuy = document.getElementById('btn-new-buy');
    this.currentTab = 'active-buys';

    this._bindEvents();
  }

  _bindEvents() {
    if (this.btnNewBuy) {
      this.btnNewBuy.addEventListener('click', () => this.onCreateBuy());
    }

    const tabs = document.querySelectorAll('#panel-buyhouse .tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = tab.dataset.tab;
        this.render();
      });
    });
  }

  render() {
    if (!this.tbody) return;

    const offers = this.currentTab === 'my-buys'
      ? this.getPlayerBuyOffers()
      : this.getActiveBuyOffers();

    if (offers.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="6">Aucune offre d'achat active</td>
        </tr>
      `;
      return;
    }

    const sorted = [...offers].sort((a, b) => b.createdAt - a.createdAt);

    this.tbody.innerHTML = sorted.map(offer => this._renderRow(offer)).join('');

    // Bind actions
    this.tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const offerId = btn.dataset.offerId;

        if (action === 'cancel') {
          this.onCancel(offerId);
        } else if (action === 'fulfill') {
          const maxQty = Number(btn.dataset.maxQty) || 1;
          this.onFulfill(offerId, maxQty);
        }
      });
    });
  }

  _renderRow(offer) {
    const item = getItemById(offer.itemId);
    const itemName = item ? `${item.icon || ''} ${item.name}` : offer.itemId;
    const buyer = this.resolveName(offer.ownerId);
    const remaining = offer.getRemainingText();

    let actions = '';

    if (offer.ownerId === 'player') {
      // Mes offres → Annuler
      actions = `
        <button class="btn btn-small btn-ghost" data-action="cancel" data-offer-id="${offer.id}">
          Annuler
        </button>
      `;
    } else {
      // Offre d'un autre → Vendre si on possède l'objet
      const owned = this.getPlayerItemCount(offer.itemId);
      if (owned > 0) {
        const maxQty = Math.min(owned, offer.quantity);
        const label = owned >= offer.quantity
          ? `Vendre (x${maxQty})`
          : `Vendre ${maxQty}/${offer.quantity}`;
        actions = `
          <button class="btn btn-small btn-success" data-action="fulfill" data-offer-id="${offer.id}" data-max-qty="${maxQty}" title="Vente partielle possible">
            ${label}
          </button>
        `;
      } else {
        actions = `<span class="text-muted">Pas en stock</span>`;
      }
    }

    return `
      <tr>
        <td>${itemName}</td>
        <td>${offer.quantity}</td>
        <td class="text-money">${this._formatMoney(offer.price)} €</td>
        <td>${buyer}</td>
        <td class="text-muted">${remaining}</td>
        <td>${actions}</td>
      </tr>
    `;
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}