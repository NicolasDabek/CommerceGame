/**
 * Interface — Hôtel de vente
 */

import { getItemById } from '../data/items.js';

function gameNow() {
  return (typeof window !== 'undefined' && window.game?.timeManager)
    ? window.game.timeManager.now()
    : Date.now();
}

export class AuctionHouseUI {
  constructor(options = {}) {
    this.getActiveSellOffers = options.getActiveSellOffers || (() => []);
    this.getPlayerSellOffers = options.getPlayerSellOffers || (() => []);
    this.onBuyout = options.onBuyout || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.onCreateSell = options.onCreateSell || (() => {});
    this.onBid = options.onBid || (() => {});
    this.resolveName = options.resolveName || ((id) => id === 'player' ? 'Vous' : id);

    this.tbody = document.getElementById('auction-body');
    this.btnNewSell = document.getElementById('btn-new-sell');
    this.currentTab = 'active-sells';

    this._bindEvents();
  }

  _bindEvents() {
    if (this.btnNewSell) {
      this.btnNewSell.addEventListener('click', () => this.onCreateSell());
    }

    const tabs = document.querySelectorAll('#panel-auction .tab');
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

    const offers = this.currentTab === 'my-sells'
      ? this.getPlayerSellOffers()
      : this.getActiveSellOffers();

    if (offers.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">Aucune annonce active</td>
        </tr>
      `;
      return;
    }

    const sorted = [...offers].sort((a, b) => b.createdAt - a.createdAt);
    this.tbody.innerHTML = sorted.map(offer => this._renderRow(offer)).join('');

    this.tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const offerId = btn.dataset.offerId;
        if (action === 'buyout') {
          this.onBuyout(offerId, Number(btn.dataset.qty) || 1);
        } else if (action === 'cancel') {
          this.onCancel(offerId);
        } else if (action === 'bid') {
          this.onBid(offerId);
        }
      });
    });
  }

  _renderRow(offer) {
    const item = getItemById(offer.itemId);
    const itemName = item ? `${item.icon || ''} ${item.name}` : offer.itemId;
    const seller = this.resolveName(offer.ownerId);
    const remaining = offer.getRemainingText(gameNow());

    let priceCell = `<span class="text-money">${this._formatMoney(offer.price)} €</span>`;
    if (offer.currentBid != null) {
      priceCell += `<br><small class="text-warning">Enchère : ${this._formatMoney(offer.currentBid)} € (${this.resolveName(offer.currentBidderId)})</small>`;
    }

    const buyoutCell = offer.buyoutPrice
      ? `<span class="text-money">${this._formatMoney(offer.buyoutPrice)} €</span>`
      : `<span class="text-muted">—</span>`;

    let actions = '';
    if (offer.ownerId === 'player') {
      actions = `
        <button class="btn btn-small btn-ghost" data-action="cancel" data-offer-id="${offer.id}">
          Annuler
        </button>
      `;
    } else {
      const buttons = [];
      if (offer.currentBidderId !== 'player') {
        buttons.push(`
          <button class="btn btn-small btn-warning" data-action="bid" data-offer-id="${offer.id}">
            Enchérir
          </button>
        `);
      }
      if (offer.buyoutPrice) {
        buttons.push(`
          <button class="btn btn-small btn-primary" data-action="buyout" data-offer-id="${offer.id}" data-qty="${offer.quantity}">
            Acheter
          </button>
        `);
      }
      actions = buttons.join(' ') || `<span class="text-muted">Votre enchère</span>`;
    }

    return `
      <tr>
        <td>${itemName}</td>
        <td>${offer.quantity}</td>
        <td>${priceCell}</td>
        <td>${buyoutCell}</td>
        <td>${seller}</td>
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
