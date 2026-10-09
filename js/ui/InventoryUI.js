/**
 * Interface — Inventaire avec fiche marché et vente rapide
 */

import { ITEMS, getItemById } from '../data/items.js';
import { conditionLabel, conditionMultiplier, isRepairable } from '../core/condition.js';
import { formatMoney, insightCardHtml, marginHtml } from './TradeInsights.js';

export class InventoryUI {
  constructor(options = {}) {
    this.getInventory = options.getInventory || (() => null);
    this.getInsight = options.getInsight || (() => null);
    this.onSlotClick = options.onSlotClick || (() => {});
    this.onSell = options.onSell || (() => {});
    this.onList = options.onList || (() => {});
    this.onBulkSell = options.onBulkSell || null;

    this.grid = document.getElementById('inventory-grid');
    this.slotsInfo = document.getElementById('inventory-slots');
    this.categoriesEl = document.getElementById('inventory-categories');
    this.detailEl = document.getElementById('inventory-detail');
    this.getRepairQuote = options.getRepairQuote || null;
    this.onOpenWorkshop = options.onOpenWorkshop || null;
    this.currentCategory = 'all';
    this.selectedKey = null;

    this._fillCategories();
    this._bindEvents();
  }

  _fillCategories() {
    if (!this.categoriesEl) return;
    const cats = [...new Set(ITEMS.map(i => i.category))];
    this.categoriesEl.innerHTML = `<button class="category-btn active" data-category="all">Tout</button>` +
      cats.map(c => `<button class="category-btn" data-category="${c}">${c}</button>`).join('');
  }

  _bindEvents() {
    this.categoriesEl?.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setCategory(btn.dataset.category));
    });
  }

  /** Change la catégorie affichée (mémorisée par main.js). */
  setCategory(category) {
    const btns = this.categoriesEl ? [...this.categoriesEl.querySelectorAll('.category-btn')] : [];
    if (!btns.some(b => b.dataset.category === category)) category = 'all';
    btns.forEach(b => b.classList.toggle('active', b.dataset.category === category));
    this.currentCategory = category;
    this.onCategoryChange?.(category);
    this.render();
  }

  render() {
    const inventory = this.getInventory();
    if (!inventory || !this.grid) return;

    let slots = inventory.items;
    if (this.currentCategory !== 'all') {
      slots = inventory.filterByCategory(this.currentCategory, getItemById);
    }

    if (this.slotsInfo) {
      const value = slots.reduce((sum, slot) => {
        const insight = this.getInsight(slot.itemId, slot.quality, slot.perfection);
        const unit = insight?.average ?? getItemById(slot.itemId)?.basePrice ?? 0;
        return sum + unit * slot.quantity;
      }, 0);
      this.slotsInfo.textContent = `${inventory.usedSlots} / ${inventory.size} cases · ≈ ${formatMoney(value)} €`;
    }

    this.grid.innerHTML = '';
    slots.forEach((slot, index) => {
      const item = getItemById(slot.itemId);
      const insight = this.getInsight(slot.itemId, slot.quality, slot.perfection);
      const el = document.createElement('div');
      const key = `${slot.itemId}|${slot.quality}|${slot.perfection}`;
      el.className = 'inventory-slot filled' + (this.selectedKey === key ? ' selected' : '');
      el.dataset.slotIndex = index;

      const rarityColor = this._rarityColor(item?.rarity);
      let marginBit = '';
      if (slot.avgBuyPrice != null && insight?.bestBuy != null) {
        const m = Math.round((insight.bestBuy - slot.avgBuyPrice) * 100) / 100;
        const cls = m >= 0 ? 'slot-margin up' : 'slot-margin down';
        marginBit = `<span class="${cls}">${m >= 0 ? '+' : ''}${formatMoney(m)}</span>`;
      } else if (slot.avgBuyPrice != null) {
        marginBit = `<span class="slot-avg-price">${formatMoney(slot.avgBuyPrice)} €</span>`;
      } else if (insight?.average != null) {
        marginBit = `<span class="slot-avg-price">${formatMoney(insight.average)} €</span>`;
      }

      el.innerHTML = `
        <span class="slot-rarity" style="background:${rarityColor}"></span>
        <span class="slot-icon">${item?.icon || '📦'}</span>
        <span class="slot-name">${item?.name || slot.itemId}</span>
        ${marginBit}
        <span class="slot-qty">${slot.quantity}</span>
      `;
      el.title = this._buildTooltip(item, slot, insight);
      el.addEventListener('click', () => {
        this.selectedKey = key;
        this.onSlotClick(index, slot);
        this._showDetail(slot, insight);
        this.render();
      });
      this.grid.appendChild(el);
    });

    if (this.currentCategory === 'all') {
      const emptyCount = inventory.size - inventory.usedSlots;
      for (let i = 0; i < emptyCount; i++) {
        const el = document.createElement('div');
        el.className = 'inventory-slot';
        el.innerHTML = `<span class="slot-icon" style="opacity:0.25">📦</span>`;
        this.grid.appendChild(el);
      }
    }

    if (this.selectedKey) {
      const still = slots.find(s => `${s.itemId}|${s.quality}|${s.perfection}` === this.selectedKey);
      if (still) this._showDetail(still, this.getInsight(still.itemId, still.quality, still.perfection));
      else if (this.detailEl) {
        this.detailEl.hidden = true;
        this.selectedKey = null;
      }
    }
  }

  _showDetail(slot, insight) {
    if (!this.detailEl) return;
    const item = getItemById(slot.itemId);
    this.detailEl.hidden = false;
    const costLine = slot.avgBuyPrice != null
      ? `Coût moyen : <strong class="text-money">${formatMoney(slot.avgBuyPrice)} €</strong>`
      : 'Coût moyen : <span class="text-muted">départ / craft</span>';
    let actionMargin = '';
    if (slot.avgBuyPrice != null && insight?.bestBuy != null) {
      const m = Math.round((insight.bestBuy - slot.avgBuyPrice) * 100) / 100;
      const pct = slot.avgBuyPrice > 0 ? Math.round((m / slot.avgBuyPrice) * 1000) / 10 : null;
      actionMargin = `<p>Marge si vente à la meilleure offre d'achat : ${marginHtml(m, pct)}</p>`;
    }
    const cond = conditionLabel(slot.quality);
    const mult = conditionMultiplier(slot.quality, slot.perfection);
    const condLine = `<p class="cond-line" title="L'état (Q) et la finition (P) changent la valeur : Q10 ≈ −35 %, Q50 = normal, Q90 ≈ +20 %.">État : <span class="cond-chip cond-${cond.id}">${cond.label}</span> <span class="text-muted">· vaut ${Math.round(mult * 100)} % d'un objet standard</span></p>`;
    let repairLine = '';
    if (isRepairable(slot.itemId) && slot.quality < 90 && this.getRepairQuote) {
      const quick = this.getRepairQuote(slot.itemId, slot.quality, slot.perfection, 'quick');
      const refurb = this.getRepairQuote(slot.itemId, slot.quality, slot.perfection, 'refurbish');
      const best = [quick, refurb].filter(q => q?.ok).sort((a, b) => b.profit - a.profit)[0];
      if (best) {
        const mat = best.materials ? ` + ${best.materials.qty} × ${best.materials.name}` : '';
        repairLine = `<p class="repair-hint">🔧 ${best.mode === 'refurbish' ? 'Remise à neuf' : 'Réparation rapide'} → Q${best.toQuality} : ${formatMoney(best.supplies)} €${mat}, ${String(best.hours).replace('.', ',')} h · profit attendu <strong class="${best.profit >= 0 ? 'text-success' : 'text-danger'}">${best.profit >= 0 ? '+' : ''}${formatMoney(best.profit)} €</strong>${this.onOpenWorkshop ? ' <button class="btn btn-small btn-ghost" data-act="workshop">Atelier</button>' : ''}</p>`;
      } else if (quick && !quick.ok) {
        repairLine = `<p class="repair-hint text-muted">🔧 ${quick.error}</p>`;
      }
    } else if (!isRepairable(slot.itemId)) {
      repairLine = '<p class="repair-hint text-muted">Ne se répare pas (nourriture, ressources, divers).</p>';
    }
    this.detailEl.innerHTML = `
      <h3>${item?.icon || ''} ${item?.name || slot.itemId}</h3>
      <p class="text-muted">${item?.category || ''} · ${item?.rarity || ''} · Q${slot.quality} P${slot.perfection} · ×${slot.quantity}</p>
      ${condLine}
      ${repairLine}
      <p>${costLine}</p>
      ${actionMargin}
      ${insightCardHtml(insight, { compact: true })}
      <div class="detail-actions">
        <button class="btn btn-primary btn-small" data-act="list">Mettre en vente</button>
        <button class="btn btn-success btn-small" data-act="sell" ${insight?.bestBuy ? '' : 'disabled'} title="Vendre à la meilleure offre d'achat">Vendre à l'hôtel d'achat</button>
        ${this.onBulkSell ? `<button class="btn btn-ghost btn-small" data-act="bulk" ${insight?.bestBuy ? '' : 'disabled'} title="Vend tout votre stock de cet objet aux offres d'achat, de la mieux payée à la moins bien payée, au-dessus d'un prix minimum que vous choisissez">Tout vendre…</button>` : ''}
      </div>
    `;
    this.detailEl.querySelector('[data-act="list"]')?.addEventListener('click', () => this.onList(slot));
    this.detailEl.querySelector('[data-act="sell"]')?.addEventListener('click', () => this.onSell(slot));
    this.detailEl.querySelector('[data-act="bulk"]')?.addEventListener('click', () => this.onBulkSell?.(slot));
    this.detailEl.querySelector('[data-act="workshop"]')?.addEventListener('click', () => this.onOpenWorkshop?.());
  }

  _rarityColor(rarity) {
    const map = {
      'Commun': 'var(--rarity-common)',
      'Rare': 'var(--rarity-rare)',
      'Épique': 'var(--rarity-epic)',
      'Légendaire': 'var(--rarity-legendary)'
    };
    return map[rarity] || 'var(--rarity-common)';
  }

  _buildTooltip(item, slot, insight) {
    if (!item) return '';
    const lines = [
      item.name,
      `Catégorie : ${item.category} · ${item.rarity}`,
      `Q${slot.quality} / P${slot.perfection} (${conditionLabel(slot.quality).label}) · ×${slot.quantity}`
    ];
    if (slot.avgBuyPrice != null) lines.push(`Coût moyen : ${formatMoney(slot.avgBuyPrice)} €`);
    if (insight?.average != null) lines.push(`Prix moyen marché : ${formatMoney(insight.average)} €`);
    if (insight?.bestSell != null) lines.push(`Moins chère en vente : ${formatMoney(insight.bestSell)} €`);
    if (insight?.bestBuy != null) lines.push(`Mieux payée à l'achat : ${formatMoney(insight.bestBuy)} €`);
    if (slot.avgBuyPrice != null && insight?.bestBuy != null) {
      const m = insight.bestBuy - slot.avgBuyPrice;
      lines.push(`Marge estimée : ${m >= 0 ? '+' : ''}${formatMoney(m)} € /u`);
    }
    return lines.join('\n');
  }
}
