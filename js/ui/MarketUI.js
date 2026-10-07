/**
 * Interface — Marché (analyse)
 */

import { ITEMS, getItemById } from '../data/items.js';
import { formatMoney, formatPct, sparkline, marginHtml, dealBadge } from './TradeInsights.js';

export class MarketUI {
  constructor(options = {}) {
    this.getMarketRows = options.getMarketRows || (() => []);
    this.getEvents = options.getEvents || (() => []);
    this.tbody = document.getElementById('market-body');
    this.eventsEl = document.getElementById('market-events');
    this.categorySelect = document.getElementById('market-category');
    this.searchEl = document.getElementById('market-search');
    this.sortEl = document.getElementById('market-sort');
    this.query = '';
    this.sort = 'name';

    this._fillCategories();
    if (this.categorySelect) this.categorySelect.addEventListener('change', () => this.render());
    if (this.searchEl) {
      this.searchEl.addEventListener('input', () => {
        this.query = this.searchEl.value.trim().toLowerCase();
        this.render();
      });
    }
    if (this.sortEl) {
      this.sortEl.addEventListener('change', () => {
        this.sort = this.sortEl.value;
        this.render();
      });
    }
  }

  _fillCategories() {
    if (!this.categorySelect) return;
    const cats = [...new Set(ITEMS.map(i => i.category))];
    const current = this.categorySelect.value || 'all';
    this.categorySelect.innerHTML = `<option value="all">Tout</option>` +
      cats.map(c => `<option value="${c}">${c}</option>`).join('');
    this.categorySelect.value = current;
  }

  render() {
    if (!this.tbody) return;

    const category = this.categorySelect?.value || 'all';
    let rows = this.getMarketRows()
      .filter(row => category === 'all' || row.item.category === category)
      .filter(row => {
        if (!this.query) return true;
        const hay = `${row.item.name} ${row.item.icon || ''} ${row.item.category} ${row.item.rarity}`.toLowerCase();
        return hay.includes(this.query);
      });

    rows = this._sortRows(rows);
    this._renderEvents();

    if (rows.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">Aucune donnée de marché</td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = rows.map(row => this._renderRow(row)).join('');
  }

  _sortRows(rows) {
    const copy = [...rows];
    switch (this.sort) {
      case 'spread':
        return copy.sort((a, b) => (b.spread ?? -Infinity) - (a.spread ?? -Infinity));
      case 'discount':
        return copy.sort((a, b) => (b.discountIfBuyBestSellPct ?? -Infinity) - (a.discountIfBuyBestSellPct ?? -Infinity));
      case 'margin':
        return copy.sort((a, b) => (b.marginIfSellToBestBuyPct ?? -Infinity) - (a.marginIfSellToBestBuyPct ?? -Infinity));
      case 'volume':
        return copy.sort((a, b) => b.volume - a.volume);
      default:
        return copy.sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));
    }
  }

  _renderEvents() {
    if (!this.eventsEl) return;
    const events = this.getEvents();

    if (events.length === 0) {
      this.eventsEl.innerHTML = '<div class="event-pill muted">Aucun événement économique actif</div>';
      return;
    }

    this.eventsEl.innerHTML = events.map(event => {
      const target = event.global ? 'Global' : event.category || (event.categories || []).join(', ');
      return `
        <div class="event-pill" title="${event.description || ''}">
          <strong>${event.name}</strong>
          <span>${target}</span>
          <span>×${Number(event.modifier).toFixed(2)}</span>
          <span>${this._formatDuration(event.remainingMs)}</span>
        </div>
      `;
    }).join('');
  }

  _renderRow(row) {
    const item = getItemById(row.item.id);
    const bestSell = row.bestSell != null ? `${formatMoney(row.bestSell)} €` : '—';
    const bestBuy = row.bestBuy != null ? `${formatMoney(row.bestBuy)} €` : '—';
    const spread = row.spread != null ? `${formatMoney(row.spread)} €` : '—';
    const hiLo = (row.high != null && row.low != null)
      ? `${formatMoney(row.high)} / ${formatMoney(row.low)}`
      : '—';
    const trend = {
      up: '<span class="trend up">Hausse</span>',
      down: '<span class="trend down">Baisse</span>',
      stable: '<span class="trend stable">Stable</span>'
    }[row.trend] || '<span class="trend stable">Stable</span>';

    let youCell = '<span class="text-muted">—</span>';
    if (row.ownedQty > 0) {
      youCell = `×${row.ownedQty}`;
      if (row.avgCost != null) youCell += `<br><small>coût ${formatMoney(row.avgCost)} €</small>`;
      if (row.marginIfSellToBestBuy != null) {
        youCell += `<br>${marginHtml(row.marginIfSellToBestBuy, row.marginIfSellToBestBuyPct)}`;
      }
    } else if (row.discountIfBuyBestSell != null && row.bestSell != null) {
      youCell = dealBadge(row.bestSell, row.average);
    }

    const dealClass = (row.discountIfBuyBestSellPct != null && row.discountIfBuyBestSellPct >= 8)
      || (row.marginIfSellToBestBuyPct != null && row.marginIfSellToBestBuyPct >= 15)
      ? 'row-deal' : '';

    return `
      <tr class="${dealClass}">
        <td>${item?.icon || ''} ${item?.name || row.item.id}<br><small class="text-muted">${row.item.category} · ${row.item.rarity}</small></td>
        <td class="text-money">${formatMoney(row.average)} €</td>
        <td class="text-muted">${hiLo}</td>
        <td>${bestSell}${row.sellCount ? `<br><small class="text-muted">${row.sellCount} ann.</small>` : ''}</td>
        <td>${bestBuy}${row.buyCount ? `<br><small class="text-muted">${row.buyCount} off.</small>` : ''}</td>
        <td>${spread}</td>
        <td>${youCell}</td>
        <td>${row.volume}</td>
        <td>${trend}</td>
        <td>${sparkline(row.history)}</td>
      </tr>
    `;
  }

  _formatDuration(ms) {
    const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
    const minutes = Math.max(0, Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000)));
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  }
}
