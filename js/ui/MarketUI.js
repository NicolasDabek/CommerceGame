/**
 * Interface — Marché (analyse)
 */

import { ITEMS, getItemById } from '../data/items.js';
import { formatMoney, formatPct, sparkline, marginHtml, dealBadge, priceWhyChip, economyHealthHtml, supplyCellHtml } from './TradeInsights.js';

export class MarketUI {
  constructor(options = {}) {
    this.getMarketRows = options.getMarketRows || (() => []);
    this.getEvents = options.getEvents || (() => []);
    this.getEconomyHealth = options.getEconomyHealth || null;
    this.getMsPerGameDay = options.getMsPerGameDay || (() => 24 * 60 * 60 * 1000);
    this.isWatched = options.isWatched || (() => false);
    this.onToggleWatch = options.onToggleWatch || null;
    this.healthEl = document.getElementById('economy-health');
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
    this._renderHealth();
    this._renderEvents();

    if (rows.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="11">Aucune donnée de marché</td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = rows.map(row => this._renderRow(row)).join('');
    this.tbody.querySelectorAll('[data-watch]').forEach(btn => {
      btn.addEventListener('click', () => this.onToggleWatch?.(btn.dataset.watch));
    });
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
      case 'shortage':
        return copy.sort((a, b) => (a.supply?.coverage ?? 99) - (b.supply?.coverage ?? 99));
      default:
        return copy.sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));
    }
  }

  _renderHealth() {
    if (!this.healthEl || !this.getEconomyHealth) return;
    this.healthEl.innerHTML = economyHealthHtml(this.getEconomyHealth());
  }

  _renderEvents() {
    if (!this.eventsEl) return;
    const events = this.getEvents();

    if (events.length === 0) {
      this.eventsEl.innerHTML = '<div class="event-pill muted">Aucun événement économique actif</div>';
      return;
    }

    this.eventsEl.innerHTML = events.map(event => {
      const target = event.global ? 'Tous les objets' : event.category || (event.categories || []).join(', ');
      const pct = Math.round((Number(event.modifier) - 1) * 100);
      const cls = pct >= 0 ? 'up' : 'down';
      return `
        <div class="event-pill" title="${event.description || ''} Effet temporaire sur les prix affichés, sans effet durable.">
          <strong>${event.name}</strong>
          <span>${target}</span>
          <span class="ev-effect ${cls}">${pct > 0 ? '+' : ''}${pct} %</span>
          <span>encore ${this._formatDuration(event.remainingMs)}</span>
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

    const watched = this.isWatched(row.item.id);
    const star = this.onToggleWatch
      ? `<button class="watch-star ${watched ? 'on' : ''}" data-watch="${row.item.id}" title="${watched ? 'Retirer du suivi' : 'Suivre cet objet (alertes de prix)'}" aria-label="Suivre">${watched ? '★' : '☆'}</button>`
      : '';
    return `
      <tr class="${dealClass}" data-item-row="${row.item.id}">
        <td>${star}${item?.icon || ''} ${item?.name || row.item.id}<br><small class="text-muted">${row.item.category} · ${row.item.rarity}</small></td>
        <td class="text-money">${formatMoney(row.average)} €${row.explanation ? `<br>${priceWhyChip(row.explanation)}` : ''}</td>
        <td>${supplyCellHtml(row.supply)}</td>
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

  /** Durée restante en temps de jeu (jours / heures de jeu). */
  _formatDuration(ms) {
    const dayMs = this.getMsPerGameDay() || 24 * 60 * 60 * 1000;
    const totalHours = Math.max(0, Math.round((ms / dayMs) * 24));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    if (days > 0) return `${days} j ${hours} h`;
    return `${Math.max(1, hours)} h`;
  }
}
