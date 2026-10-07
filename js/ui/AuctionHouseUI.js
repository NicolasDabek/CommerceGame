/**
 * Interface — Hôtel de vente
 * Filtres, contexte marché et badges d'opportunité.
 */

import { ITEMS, getItemById } from '../data/items.js';
import { formatMoney, dealBadge, marginHtml } from './TradeInsights.js';

function gameNow() {
  return (typeof window !== 'undefined' && window.game?.timeManager)
    ? window.game.timeManager.now()
    : Date.now();
}

function effectivePrice(offer) {
  return offer.currentBid != null ? offer.currentBid : offer.price;
}

function askPrice(offer) {
  return offer.buyoutPrice != null ? offer.buyoutPrice : effectivePrice(offer);
}

export class AuctionHouseUI {
  constructor(options = {}) {
    this.getActiveSellOffers = options.getActiveSellOffers || (() => []);
    this.getPlayerSellOffers = options.getPlayerSellOffers || (() => []);
    this.getInsight = options.getInsight || (() => null);
    this.getMoney = options.getMoney || (() => 0);
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
    const hay = [item?.name, item?.icon, item?.category, offer.itemId, seller, bidder].join(' ').toLowerCase();
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
      const pNew = askPrice(offer);
      const pOld = askPrice(prev);
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

    const sorted = [...filtered].sort((a, b) => askPrice(a) - askPrice(b));
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
    const insight = this.getInsight(offer.itemId, offer.quality, offer.perfection);
    const avg = insight?.average ?? null;
    const comparePrice = offer.buyoutPrice ?? going;
    const money = this.getMoney();

    let bidCell = `<span class="text-money">${formatMoney(going)} €</span>`;
    if (offer.currentBid != null) {
      const bidder = this.resolveName(offer.currentBidderId);
      const count = Array.isArray(offer.bids) ? offer.bids.length : 1;
      bidCell += `<br><small class="text-muted">départ ${formatMoney(offer.price)} € · ${bidder} · ${count} ench.</small>`;
    }

    const buyoutCell = offer.buyoutPrice
      ? `<span class="text-money">${formatMoney(offer.buyoutPrice)} €</span>`
      : `<span class="text-muted">—</span>`;

    const vsAvg = avg != null
      ? `${dealBadge(comparePrice, avg)}<br><small class="text-muted">moy. ${formatMoney(avg)} €</small>`
      : '<span class="text-muted">—</span>';

    let ownedBit = '';
    if (insight?.ownedQty > 0) {
      ownedBit = `<br><small>sac ×${insight.ownedQty}`;
      if (insight.avgCost != null) ownedBit += ` · coût ${formatMoney(insight.avgCost)} €`;
      ownedBit += '</small>';
    }

    let actions = '';
    if (offer.ownerId === 'player') {
      actions = `<button class="btn btn-small btn-ghost" data-action="cancel" data-offer-id="${offer.id}">Annuler</button>`;
    } else {
      const buttons = [];
      if (offer.currentBidderId !== 'player') {
        buttons.push(`<button class="btn btn-small btn-warning" data-action="bid" data-offer-id="${offer.id}">Enchérir</button>`);
      }
      if (offer.buyoutPrice) {
        const total = Math.round(offer.buyoutPrice * offer.quantity * 100) / 100;
        const canPay = money >= total;
        const title = canPay
          ? `Total ${formatMoney(total)} €`
          : `Il manque ${formatMoney(total - money)} €`;
        buttons.push(`<button class="btn btn-small ${canPay ? 'btn-primary' : 'btn-ghost'}" data-action="buyout" data-offer-id="${offer.id}" data-qty="${offer.quantity}" ${canPay ? '' : 'disabled'} title="${title}">Acheter</button>`);
      }
      actions = buttons.join(' ') || `<span class="text-muted">Votre enchère</span>`;
    }

    const rowClass = offer.buyoutPrice != null && avg != null && offer.buyoutPrice < avg * 0.95 ? 'row-deal' : '';

    return `
      <tr class="${rowClass}">
        <td>${itemName}<br><small class="text-muted">Q${offer.quality} P${offer.perfection}</small>${ownedBit}</td>
        <td>${offer.quantity}</td>
        <td>${bidCell}</td>
        <td>${buyoutCell}</td>
        <td>${vsAvg}</td>
        <td>${seller}</td>
        <td class="text-muted">${remaining}</td>
        <td>${actions}</td>
      </tr>
    `;
  }
}
