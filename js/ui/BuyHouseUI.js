/**
 * Interface — Hôtel d'achat
 * Stock joueur et marge estimée à la revente.
 */

import { ITEMS, getItemById } from '../data/items.js';
import { formatMoney, dealBadge, marginHtml } from './TradeInsights.js';

function gameNow() {
  return (typeof window !== 'undefined' && window.game?.timeManager)
    ? window.game.timeManager.now()
    : Date.now();
}

export class BuyHouseUI {
  constructor(options = {}) {
    this.getActiveBuyOffers = options.getActiveBuyOffers || (() => []);
    this.getPlayerBuyOffers = options.getPlayerBuyOffers || (() => []);
    this.getPlayerItemCount = options.getPlayerItemCount || (() => 0);
    this.getInsight = options.getInsight || (() => null);
    this.onCancel = options.onCancel || (() => {});
    this.onCreateBuy = options.onCreateBuy || (() => {});
    this.onFulfill = options.onFulfill || (() => {});
    this.resolveName = options.resolveName || ((id) => id === 'player' ? 'Vous' : id);

    this.tbody = document.getElementById('buyhouse-body');
    this.btnNewBuy = document.getElementById('btn-new-buy');
    this.searchEl = document.getElementById('buy-search');
    this.categoryEl = document.getElementById('buy-category');
    this.bestOnlyEl = document.getElementById('buy-best-only');
    this.currentTab = 'active-buys';
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
    const buyer = this.resolveName(offer.ownerId) || '';
    const hay = [item?.name, item?.icon, item?.category, offer.itemId, buyer].join(' ').toLowerCase();
    return hay.includes(this.query);
  }

  _applyBestOnly(offers) {
    if (!this.bestOnly || this.currentTab === 'my-buys') return offers;
    const best = new Map();
    offers.forEach(offer => {
      const prev = best.get(offer.itemId);
      if (!prev || offer.price > prev.price || (offer.price === prev.price && offer.quantity > prev.quantity)) {
        best.set(offer.itemId, offer);
      }
    });
    return [...best.values()];
  }

  render() {
    if (!this.tbody) return;

    const raw = this.currentTab === 'my-buys'
      ? this.getPlayerBuyOffers()
      : this.getActiveBuyOffers();
    const filtered = this._applyBestOnly(raw.filter(o => this._matches(o)));

    if (filtered.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="7">Aucune offre ne correspond aux filtres</td>
        </tr>
      `;
      return;
    }

    const sorted = [...filtered].sort((a, b) => b.price - a.price);
    this.tbody.innerHTML = sorted.map(offer => this._renderRow(offer)).join('');

    this.tbody.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const offerId = btn.dataset.offerId;
        if (action === 'cancel') this.onCancel(offerId);
        else if (action === 'fulfill') this.onFulfill(offerId, Number(btn.dataset.maxQty) || 1);
      });
    });
  }

  _renderRow(offer) {
    const item = getItemById(offer.itemId);
    const itemName = item ? `${item.icon || ''} ${item.name}` : offer.itemId;
    const buyer = this.resolveName(offer.ownerId);
    const remaining = offer.getRemainingText(gameNow());
    const insight = this.getInsight(offer.itemId);
    const avg = insight?.average ?? null;
    const owned = this.getPlayerItemCount(offer.itemId);
    const avgCost = insight?.avgCost ?? null;

    let stockCell = `<span class="text-muted">sac ×${owned}</span>`;
    if (owned > 0 && avgCost != null) {
      const unitMargin = Math.round((offer.price - avgCost) * 100) / 100;
      const pct = avgCost > 0 ? Math.round((unitMargin / avgCost) * 1000) / 10 : null;
      stockCell = `sac ×${owned}<br>marge ${marginHtml(unitMargin, pct)}`;
    } else if (owned > 0) {
      stockCell = `sac ×${owned}<br><small class="text-muted">coût inconnu</small>`;
    }

    const vsMarket = avg != null
      ? `${dealBadge(offer.price, avg, { invert: true })}<br><small class="text-muted">moy. ${formatMoney(avg)} €</small>`
      : '';

    let actions = '';
    if (offer.ownerId === 'player') {
      actions = `<button class="btn btn-small btn-ghost" data-action="cancel" data-offer-id="${offer.id}">Annuler</button>`;
    } else if (owned > 0) {
      const maxQty = Math.min(owned, offer.quantity);
      const label = owned >= offer.quantity ? `Vendre (x${maxQty})` : `Vendre ${maxQty}/${offer.quantity}`;
      const total = Math.round(offer.price * maxQty * 100) / 100;
      actions = `<button class="btn btn-small btn-success" data-action="fulfill" data-offer-id="${offer.id}" data-max-qty="${maxQty}" title="Total ≈ ${formatMoney(total)} €">${label}</button>`;
    } else {
      actions = `<span class="text-muted">Pas en stock</span>`;
    }

    const rowClass = owned > 0 && avgCost != null && offer.price > avgCost ? 'row-deal' : '';

    return `
      <tr class="${rowClass}">
        <td>${itemName}${vsMarket ? `<br>${vsMarket}` : ''}</td>
        <td>${offer.quantity}</td>
        <td class="text-money">${formatMoney(offer.price)} €</td>
        <td>${stockCell}</td>
        <td>${buyer}</td>
        <td class="text-muted">${remaining}</td>
        <td>${actions}</td>
      </tr>
    `;
  }
}
