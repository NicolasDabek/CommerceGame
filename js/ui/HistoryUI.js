/**
 * Interface — Historique des transactions
 */

import { getItemById } from '../data/items.js';

export class HistoryUI {
  /**
   * @param {Object} options
   * @param {Function} options.getTransactions - () => Transaction[]
   */
  constructor(options = {}) {
    this.getTransactions = options.getTransactions || (() => []);
    this.resolveName = options.resolveName || ((id) => id === 'player' ? 'Vous' : id);
    this.tbody = document.getElementById('history-body');
    this.filterType = document.getElementById('filter-type');
    this.filterItem = document.getElementById('filter-item');
    this.btnClear = document.getElementById('btn-clear-filters');

    this._bindEvents();
  }

  _bindEvents() {
    if (this.filterType) {
      this.filterType.addEventListener('change', () => this.render());
    }
    if (this.filterItem) {
      this.filterItem.addEventListener('input', () => this.render());
    }
    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => {
        if (this.filterType) this.filterType.value = 'all';
        if (this.filterItem) this.filterItem.value = '';
        this.render();
      });
    }
  }

  render() {
    if (!this.tbody) return;

    let transactions = this.getTransactions();

    // Filtres
    const typeFilter = this.filterType?.value || 'all';
    const itemFilter = (this.filterItem?.value || '').toLowerCase().trim();

    if (typeFilter !== 'all') {
      transactions = transactions.filter(tx => tx.type === typeFilter);
    }

    if (itemFilter) {
      transactions = transactions.filter(tx => {
        const item = getItemById(tx.itemId);
        return item && item.name.toLowerCase().includes(itemFilter);
      });
    }

    if (transactions.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="9">Aucune transaction pour le moment</td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = transactions.map(tx => this._renderRow(tx)).join('');
  }

  _renderRow(tx) {
    const item = getItemById(tx.itemId);
    const itemName = item ? `${item.icon || ''} ${item.name}` : tx.itemId;
    const date = new Date(tx.timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const typeLabel = {
      matching: 'Matching',
      buyout: 'Achat immédiat',
      auction_end: 'Fin d\'enchère'
    }[tx.type] || tx.type;

    const typeClass = {
      matching: 'badge-matching',
      buyout: 'badge-buyout',
      auction_end: 'badge-auction'
    }[tx.type] || '';

    const seller = this.resolveName(tx.sellerId);
    const buyer = this.resolveName(tx.buyerId);
    const insight = this._renderInsight(tx);

    return `
      <tr>
        <td class="text-muted">${date}</td>
        <td>${itemName}</td>
        <td>${tx.quantity}</td>
        <td class="text-money">${this._formatMoney(tx.price)} €</td>
        <td class="text-money">${this._formatMoney(tx.total)} €</td>
        <td>${seller}</td>
        <td>${buyer}</td>
        <td><span class="badge ${typeClass}">${typeLabel}</span></td>
        <td>${insight}</td>
      </tr>
    `;
  }

  _renderInsight(tx) {
    if (tx.sellerId === 'player' && tx.playerMargin != null) {
      const cls = tx.playerMargin >= 0 ? 'text-success' : 'text-danger';
      const pct = tx.playerMarginPct != null ? ` (${tx.playerMarginPct >= 0 ? '+' : ''}${tx.playerMarginPct}%)` : '';
      return `<span class="${cls}">${tx.playerMargin >= 0 ? '+' : ''}${this._formatMoney(tx.playerMargin)} €${pct}</span>`;
    }

    if (tx.priceDeltaPct != null) {
      if (tx.priceDeltaPct <= -8) return '<span class="text-success">Bonne affaire</span>';
      if (tx.priceDeltaPct >= 8) return '<span class="text-warning">Prix haut</span>';
    }

    return '<span class="text-muted">Marche</span>';
  }

  _formatMoney(amount) {
    return Number(amount).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
}
