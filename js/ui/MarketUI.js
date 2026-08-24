import { getItemById } from '../data/items.js';

export class MarketUI {
  constructor(options = {}) {
    this.getMarketRows = options.getMarketRows || (() => []);
    this.getEvents = options.getEvents || (() => []);
    this.tbody = document.getElementById('market-body');
    this.eventsEl = document.getElementById('market-events');
    this.categorySelect = document.getElementById('market-category');

    if (this.categorySelect) {
      this.categorySelect.addEventListener('change', () => this.render());
    }
  }

  render() {
    if (!this.tbody) return;

    const category = this.categorySelect?.value || 'all';
    const rows = this.getMarketRows()
      .filter(row => category === 'all' || row.item.category === category)
      .sort((a, b) => a.item.category.localeCompare(b.item.category) || a.item.name.localeCompare(b.item.name));

    this._renderEvents();

    if (rows.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="8">Aucune donnee de marche</td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = rows.map(row => this._renderRow(row)).join('');
  }

  _renderEvents() {
    if (!this.eventsEl) return;
    const events = this.getEvents();

    if (events.length === 0) {
      this.eventsEl.innerHTML = '<div class="event-pill muted">Aucun evenement economique actif</div>';
      return;
    }

    this.eventsEl.innerHTML = events.map(event => {
      const target = event.global ? 'Global' : event.category || (event.categories || []).join(', ');
      return `
        <div class="event-pill">
          <strong>${event.name}</strong>
          <span>${target}</span>
          <span>${this._formatDuration(event.remainingMs)}</span>
        </div>
      `;
    }).join('');
  }

  _renderRow(row) {
    const item = getItemById(row.item.id);
    const bestSell = row.bestSell != null ? `${this._formatMoney(row.bestSell)} €` : '-';
    const bestBuy = row.bestBuy != null ? `${this._formatMoney(row.bestBuy)} €` : '-';
    const spread = row.spread != null ? `${this._formatMoney(row.spread)} €` : '-';
    const trend = {
      up: '<span class="trend up">Hausse</span>',
      down: '<span class="trend down">Baisse</span>',
      stable: '<span class="trend stable">Stable</span>'
    }[row.trend] || '<span class="trend stable">Stable</span>';

    return `
      <tr>
        <td>${item?.icon || ''} ${item?.name || row.item.id}<br><small class="text-muted">${row.item.category} · ${row.item.rarity}</small></td>
        <td class="text-money">${this._formatMoney(row.average)} €</td>
        <td>${bestSell}</td>
        <td>${bestBuy}</td>
        <td>${spread}</td>
        <td>${row.volume}</td>
        <td>${trend}</td>
        <td>${this._sparkline(row.history)}</td>
      </tr>
    `;
  }

  _sparkline(values) {
    if (!values || values.length < 2) return '<span class="text-muted">-</span>';
    const width = 110;
    const height = 28;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return `
      <svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <polyline points="${points}" />
      </svg>
    `;
  }

  _formatDuration(ms) {
    const hours = Math.max(0, Math.floor(ms / (60 * 60 * 1000)));
    const minutes = Math.max(0, Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000)));
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
