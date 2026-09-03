/**
 * Interface — Hôtel de vente
 */

import { ITEMS, getItemById } from '../data/items.js';

function gameNow() {
  return (typeof window !== 'undefined' && window.game?.timeManager)
    ? window.game.timeManager.now()
    : Date.now();
}

function effectivePrice(offer) {
  return offer.currentBid != null ? offer.currentBid : offer.price;
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
    this.searchEl = document.getElementById('auction-search');
    this.categoryEl = document.getElementById('auction-category');
    this.bestOnlyEl = document.getElementById('auction-best-only');
    this.currentTab = 'active-sells';
    this.query = '';
    this.category = 'all';
    this.bestOnly = true;

    this._fillCategories();
    this._bindEvents();
  }

  _fillCategories() {
    if (!this.categoryEl) return;
    const cats = [...new Set(ITEMS.map(i => i.category))];
    this.categoryEl.innerHTML = `<option value="all">Toutes catégories</option>` +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
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
    if (this.searchEl) {
      this.searchEl.addEventListener('input', () => {
        this.query = this.searchEl.value.trim().toLowerCase();
        this.render();
      });
    }
    if (this.categoryEl) {
      this.categoryEl.addEventListener('change', () => {
        this.category = this.categoryEl.value;
        this.render();
      });
    }
    if (this.bestOnlyEl) {
      this.bestOnlyEl.checked = true;
      this.bestOnlyEl.addEventListener('change', () => {
        this.bestOnly = this.bestOnlyEl.checked;
        this.render();
      });
    }
  }

  _matches(offer) {
    const item = getItemById(offer.itemId);
    if (this.category !== 'all' && item?.category !== this.category) return false;
    if (!this.query) return true;
    const seller = this.resolveName(offer.ownerId) || '';
    const bidder = offer.currentBidderId ? (this.resolveName(offer.currentBidderId) || '') : '';
    const hay = [
      item?.name, item?.icon, item?.category, offer.itemId, seller, bidder
    ].join(' ').toLowerCase();
    return hay.includes(this.query);
  }

  _applyBestOnly(offers) {
    if (!this.bestOnly || this.currentTab === 'my-sells') return offers;
    const best = new Map();
    offers.forEach(offer => {
      const key = offer.itemId;
      const prev = best.get(key);
      if (!prev) {
        best.set(key, offer);
        return;
      }
      const pNew = effectivePrice(offer);
      const pOld = effectivePrice(prev);
      if (pNew < pOld || (pNew === pOld && offer.quantity > prev.quantity)) {
        best.set(key, offer);
      }
    });
    return [...best.values()];
  }

  render() {
    if (!this.tbody) return;

    const raw = this.currentTab === 'my-sells'
      ? this.getPlayerSellOffers()
      : this.getActiveSellOffers();
    const filtered = this._applyBestOnly(raw.filter(o => this._matches(o)));

    if (filtered.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="8">Aucune annonce ne correspond aux filtres</td>
        </tr>
      `;
      return;
    }

    const sorted = [...filtered].sort((a, b) => effectivePrice(a) - effectivePrice(b));
    this.tbody.innerHTML = sorted.map(offer => this._renderRow(offer)).join('');

    this.tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const offerId = btn.dataset.offerId;
        if (action === 'buyout') this.onBuyout(offerId, Number(btn.dataset.qty) || 1);
        else if (action === 'cancel') this.onCancel(offerId);
        else if (action === 'bid') this.onBid(offerId);
      });
    });
  }

  _renderRow(offer) {
    const item = getItemById(offer.itemId);
    const itemName = item ? `${item.icon || ''} ${item.name}` : offer.itemId;
    const seller = this.resolveName(offer.ownerId);
    const remaining = offer.getRemainingText(gameNow());
    const going = effectivePrice(offer);

    let bidCell = `<span class="text-muted">—</span>`;
    if (offer.currentBid != null) {
      const bidder = this.resolveName(offer.currentBidderId);
      const count = Array.isArray(offer.bids) ? offer.bids.length : 1;
      bidCell = `<span class="text-warning">${this._formatMoney(offer.currentBid)} €</span><br><small>${bidder} · ${count} ench.</small>`;
    }

    const buyoutCell = offer.buyoutPrice
      ? `<span class="text-money">${this._formatMoney(offer.buyoutPrice)} €</span>`
      : `<span class="text-muted">—</span>`;

    let actions = '';
    if (offer.ownerId === 'player') {
      actions = `<button class="btn btn-small btn-ghost" data-action="cancel" data-offer-id="${offer.id}">Annuler</button>`;
    } else {
      const buttons = [];
      if (offer.currentBidderId !== 'player') {
        buttons.push(`<button class="btn btn-small btn-warning" data-action="bid" data-offer-id="${offer.id}">Enchérir</button>`);
      }
      if (offer.buyoutPrice) {
        buttons.push(`<button class="btn btn-small btn-primary" data-action="buyout" data-offer-id="${offer.id}" data-qty="${offer.quantity}">Acheter</button>`);
      }
      actions = buttons.join(' ') || `<span class="text-muted">Votre enchère</span>`;
    }

    return `
      <tr>
        <td>${itemName}<br><small class="text-muted">Q${offer.quality} P${offer.perfection}</small></td>
        <td>${offer.quantity}</td>
        <td><span class="text-money">${this._formatMoney(going)} €</span>${offer.currentBid != null ? `<br><small class="text-muted">départ ${this._formatMoney(offer.price)} €</small>` : ''}</td>
        <td>${bidCell}</td>
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
