/**
 * Interface — Marché (analyse)
 */

import { ITEMS, getItemById } from '../data/items.js';
import { esc } from '../utils/escape.js';
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
    this.view = 'all';          // all | deals | watched (puces de filtre)
    this.layout = (() => { try { return localStorage.getItem('ct-market-layout') || 'list'; } catch (e) { return 'list'; } })();
    this._mountListUi();

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

  /** Puces « Tout / Bonnes affaires / Suivis ★ », bascule liste ↔ tableau, encart « bonne affaire », état du marché repliable. */
  _mountListUi() {
    const panel = document.getElementById('panel-market');
    if (!panel || document.getElementById('market-chips')) return;
    const header = panel.querySelector('.panel-header');
    const chips = document.createElement('div');
    chips.className = 'market-chips';
    chips.id = 'market-chips';
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filtrer les marchandises');
    chips.innerHTML = [['all', 'Tout'], ['deals', 'Bonnes affaires'], ['watched', 'Suivis ★']]
      .map(([v, l]) => `<button class="chip-filter" data-market-view="${v}" aria-pressed="${v === this.view}">${l}</button>`).join('') +
      `<button class="chip-filter chip-layout" id="market-layout" aria-pressed="${this.layout === 'table'}" title="Basculer entre la liste et le tableau détaillé">${this.layout === 'table' ? '☰ Liste' : '▦ Tableau'}</button>` +
      // Mobile (audit UI 2) : la recherche et les menus se replient derrière un bouton « Filtres »
      '<button class="chip-filter chip-more-filters" id="market-filters-toggle" aria-expanded="false" aria-controls="market-filters">⚙️ Filtres<span class="filters-count" id="market-filters-count"></span></button>';
    const bar = header.querySelector('.filters-bar');
    if (bar) bar.id = bar.id || 'market-filters';
    header.insertAdjacentElement('afterend', chips);
    const syncFiltersCount = () => {
      const n = [document.getElementById('market-search')?.value?.trim(), document.getElementById('market-category')?.value !== 'all' ? 1 : '', document.getElementById('market-sort')?.value !== 'name' ? 1 : ''].filter(Boolean).length;
      const c = document.getElementById('market-filters-count');
      if (c) c.textContent = n ? ` (${n})` : '';
    };
    ['market-search', 'market-category', 'market-sort'].forEach(id => document.getElementById(id)?.addEventListener('input', syncFiltersCount));
    ['market-category', 'market-sort'].forEach(id => document.getElementById(id)?.addEventListener('change', syncFiltersCount));
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'market-filters-toggle') {
        const open = !panel.classList.contains('filters-open');
        panel.classList.toggle('filters-open', open);
        b.setAttribute('aria-expanded', String(open));
        if (open) document.getElementById('market-search')?.focus();
        return;
      }
      if (b.id === 'market-layout') {
        this.layout = this.layout === 'table' ? 'list' : 'table';
        try { localStorage.setItem('ct-market-layout', this.layout); } catch (err) { /* stockage indisponible */ }
        b.textContent = this.layout === 'table' ? '☰ Liste' : '▦ Tableau';
        b.setAttribute('aria-pressed', String(this.layout === 'table'));
      } else {
        this.view = b.dataset.marketView;
        chips.querySelectorAll('[data-market-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }
      this.render();
    });
    const deal = document.createElement('div');
    deal.id = 'market-deal';
    chips.insertAdjacentElement('afterend', deal);
    // État du marché (santé, événements, fil, aide) : replié sur mobile, ouvert sur grand écran
    const health = document.getElementById('economy-health');
    if (health) {
      const det = document.createElement('details');
      det.className = 'market-state';
      det.id = 'market-state';
      det.open = false;
      det.innerHTML = '<summary>📊 État du marché et événements</summary>';
      health.parentNode.insertBefore(det, health);
      const hint = panel.querySelector('.trade-hint');
      [health, document.getElementById('market-events'), document.getElementById('npc-feed'), hint].filter(Boolean).forEach(el => det.appendChild(el));
    }
  }

  _isDeal(row) {
    return (row.discountIfBuyBestSellPct != null && row.discountIfBuyBestSellPct >= 8)
      || (row.marginIfSellToBestBuyPct != null && row.marginIfSellToBestBuyPct >= 15)
      || (row.bestSell != null && row.bestBuy != null && row.bestBuy > row.bestSell);
  }

  /** Meilleure affaire du moment (données réelles) : revente immédiate, sinon plus forte remise. */
  _bestDeal(rows) {
    const arb = rows.filter(r => r.bestSell != null && r.bestBuy != null && r.bestBuy > r.bestSell)
      .sort((a, b) => (b.bestBuy - b.bestSell) / b.bestSell - (a.bestBuy - a.bestSell) / a.bestSell)[0];
    if (arb) return { row: arb, text: `Acheter dès ${formatMoney(arb.bestSell)} € à l'Hôtel de vente, revendre ${formatMoney(arb.bestBuy)} € à l'Hôtel d'achat (+${Math.round((arb.bestBuy / arb.bestSell - 1) * 100)} % avant frais)` };
    const disc = rows.filter(r => r.bestSell != null && r.average > 0 && r.bestSell < r.average * 0.95)
      .sort((a, b) => a.bestSell / a.average - b.bestSell / b.average)[0];
    if (disc) return { row: disc, text: `Annonce à ${formatMoney(disc.bestSell)} €, ${Math.round((1 - disc.bestSell / disc.average) * 100)} % sous le prix moyen (${formatMoney(disc.average)} €)` };
    return null;
  }

  _renderDeal(allRows) {
    const el = document.getElementById('market-deal');
    if (!el) return;
    const d = this._bestDeal(allRows);
    if (!d) { el.innerHTML = ''; return; }
    const item = getItemById(d.row.item.id);
    el.innerHTML = `<div class="mk-deal"><div><strong>💡 Bonne affaire : ${item?.icon || ''} ${esc(item?.name || d.row.item.id)}</strong><p>${esc(d.text)}</p></div>
      <button class="btn btn-secondary" data-compare="${esc(d.row.item.id)}">Comparer</button></div>`;
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
    const allRows = this.getMarketRows();
    let rows = allRows
      .filter(row => category === 'all' || row.item.category === category)
      .filter(row => this.view === 'all' || (this.view === 'deals' ? this._isDeal(row) : this.isWatched(row.item.id)))
      .filter(row => {
        if (!this.query) return true;
        const hay = `${row.item.name} ${row.item.icon || ''} ${row.item.category} ${row.item.rarity}`.toLowerCase();
        return hay.includes(this.query);
      });

    rows = this._sortRows(rows);
    this._renderHealth();
    this._renderEvents();
    this._renderDeal(allRows);
    const table = document.getElementById('market-table');
    table?.classList.toggle('mk-list', this.layout !== 'table');
    document.getElementById('panel-market')?.classList.toggle('mk-list-mode', this.layout !== 'table');

    if (rows.length === 0) {
      this.tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="11">${this.view === 'watched' ? 'Aucun objet suivi : touchez ☆ pour suivre un objet.' : this.view === 'deals' ? 'Pas de bonne affaire en ce moment.' : 'Aucune donnée de marché'}</td>
        </tr>
      `;
      return;
    }

    this.tbody.innerHTML = rows.map(row => (this.layout === 'table' ? this._renderRow(row) : this._renderCard(row))).join('');
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
      <tr class="${dealClass}" data-item-row="${row.item.id}" data-item-id="${row.item.id}">
        <td>${star}${item?.icon || ''} ${item?.name || row.item.id}<br><small class="text-muted">${row.item.category} · ${row.item.rarity}</small>
          <span class="row-tools"><button class="btn-link" data-compare="${row.item.id}" title="Comparer les marchands" aria-label="Comparer les marchands pour ${item?.name || row.item.id}"><span aria-hidden="true">⚖️</span><small class="mk-tool-txt" aria-hidden="true">Comparer</small></button><button class="btn-link" data-chart="${row.item.id}" title="Historique des prix" aria-label="Historique des prix de ${item?.name || row.item.id}"><span aria-hidden="true">📈</span><small class="mk-tool-txt" aria-hidden="true">Historique</small></button></span></td>
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

  /** Carte de la liste (maquette « Halle des prix ») : nom, prix + tendance, offre / demande, moyenne. */
  _renderCard(row) {
    const item = getItemById(row.item.id);
    const name = item?.name || row.item.id;
    const arrow = { up: ['▲', 'up', 'en hausse'], down: ['▼', 'down', 'en baisse'] }[row.trend] || ['=', 'stable', 'stable'];
    const price = row.bestSell != null ? row.bestSell : row.average;
    const watched = this.isWatched(row.item.id);
    const star = this.onToggleWatch
      ? `<button class="watch-star ${watched ? 'on' : ''}" data-watch="${row.item.id}" title="${watched ? 'Retirer du suivi' : 'Suivre cet objet (alertes de prix)'}" aria-label="${watched ? 'Ne plus suivre' : 'Suivre'} ${name}" aria-pressed="${watched}">${watched ? '★' : '☆'}</button>`
      : '';
    const you = row.ownedQty > 0
      ? `<span>Vous ×${row.ownedQty}${row.marginIfSellToBestBuy != null ? ` · ${marginHtml(row.marginIfSellToBestBuy, row.marginIfSellToBestBuyPct)}` : ''}</span>`
      : (row.discountIfBuyBestSell != null && row.bestSell != null ? dealBadge(row.bestSell, row.average) : '');
    return `
      <tr class="mk-row ${this._isDeal(row) ? 'row-deal' : ''}" data-item-row="${row.item.id}" data-item-id="${row.item.id}"><td colspan="11">
        <div class="mk-card">
          <div class="mk-name">${star}<span class="mk-title">${item?.icon || ''} ${name}</span></div>
          <div class="mk-price trend-${arrow[1]}" title="${row.bestSell != null ? 'Annonce la moins chère' : 'Prix moyen'} · tendance ${arrow[2]}"><span aria-hidden="true">${arrow[0]}</span> ${formatMoney(price)} €<span class="sr-only"> (${arrow[2]})</span></div>
          <div class="mk-supply">${supplyCellHtml(row.supply)}${row.explanation ? priceWhyChip(row.explanation) : ''}</div>
          <div class="mk-avg">moy. ${formatMoney(row.average)} €</div>
          <div class="mk-meta">
            <span>🛒 ${row.bestSell != null ? `dès ${formatMoney(row.bestSell)} €` : '<span class="mk-none" title="Aucune annonce en vente" aria-label="Aucune annonce en vente">— <small class="mk-tool-txt" aria-hidden="true">aucune</small></span>'}${row.sellCount ? ` (${row.sellCount})` : ''}</span>
            <span>💰 ${row.bestBuy != null ? `jusqu'à ${formatMoney(row.bestBuy)} €` : '<span class="mk-none" title="Aucune offre d\'achat" aria-label="Aucune offre d\'achat">— <small class="mk-tool-txt" aria-hidden="true">aucune</small></span>'}${row.buyCount ? ` (${row.buyCount})` : ''}</span>
            ${you}
          </div>
          <div class="mk-tools"><span class="mk-trend" role="img" aria-label="${(row.history || []).length >= 2 ? `Tendance des derniers prix de ${name}` : `Tendance de ${name} : pas encore assez de ventes`}">${sparkline(row.history, { width: 80, height: 24 })}<small class="mk-tool-txt" aria-hidden="true">Tendance</small></span><button class="btn-link" data-compare="${row.item.id}" title="Comparer les marchands" aria-label="Comparer les marchands pour ${name}"><span aria-hidden="true">⚖️</span><small class="mk-tool-txt" aria-hidden="true">Comparer</small></button><button class="btn-link" data-chart="${row.item.id}" title="Historique des prix" aria-label="Historique des prix de ${name}"><span aria-hidden="true">📈</span><small class="mk-tool-txt" aria-hidden="true">Historique</small></button></div>
        </div>
      </td></tr>`;
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
