/**
 * Aperçu rapide d'un objet au survol (ou au focus clavier) de toute ligne portant data-item-id :
 * valeur normale, moyenne, meilleures offres, offre / demande, votre stock et votre coût.
 */
import { getItemById } from '../data/items.js';
import { formatMoney } from './TradeInsights.js';

export class ItemPreview {
  constructor({ game, delay = 350 }) {
    this.game = game;
    this.delay = delay;
    this.el = document.createElement('div');
    this.el.className = 'item-preview';
    this.el.hidden = true;
    this.el.setAttribute('role', 'tooltip');
    document.body.appendChild(this.el);
    this.timer = null;
    this.mouse = null;
    document.addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; }, { passive: true });
    this.current = null;
    const show = (e) => {
      const host = e.target.closest?.('[data-item-id]');
      if (!host || host === this.current) return;
      if (host.closest('.modal') || host.closest('.item-preview')) return;
      this.current = host;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.show(host), e.type === 'focusin' ? 0 : this.delay);
    };
    const hide = (e) => {
      const host = e.target.closest?.('[data-item-id]');
      if (!host || (e.relatedTarget && host.contains(e.relatedTarget))) return;
      this.hide();
    };
    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
    window.addEventListener('panel-changed', () => this.hide());
  }

  hide() { clearTimeout(this.timer); this.current = null; this.el.hidden = true; }

  html(itemId, q = 50, p = 50) {
    const g = this.game;
    const item = getItemById(itemId);
    if (!item) return '';
    const ins = g.getItemInsight(itemId, q, p);
    const fair = g.economy.getFairValue ? g.economy.getFairValue(itemId) : null;
    const sup = g.getSupplyView ? g.getSupplyView(itemId) : null;
    const trend = ins.history && ins.history.length >= 2 ? ins.history[ins.history.length - 1] - ins.history[0] : 0;
    const spark = (ins.history || []).slice(-12);
    const max = Math.max(...spark, 0.01); const min = Math.min(...spark, max);
    const bars = spark.map(v => `<i style="height:${Math.round(20 + 80 * (v - min) / Math.max(0.01, max - min))}%"></i>`).join('');
    const supLabel = sup ? ({ shortage: '🔴 Pénurie', tight: '🟠 Tendu', balanced: '🟢 Équilibré', surplus: '🔵 Surplus' }[sup.status] || sup.status) : '—';
    return `
      <div class="ip-head"><span class="ip-icon">${item.icon}</span><div><strong>${item.name}</strong><br><small class="text-muted">${item.category} · ${item.rarity || ''}</small></div></div>
      <div class="ip-grid">
        <span>Valeur normale</span><strong>${fair != null ? formatMoney(fair) + ' €' : '—'}</strong>
        <span>Moyenne marché</span><strong>${formatMoney(ins.average)} € <small class="${trend > 0 ? 'text-danger' : trend < 0 ? 'text-success' : 'text-muted'}">${trend > 0 ? '▲' : trend < 0 ? '▼' : '='}</small></strong>
        <span>Moins chère</span><strong>${ins.bestSell != null ? formatMoney(ins.bestSell) + ' €' : '—'}</strong>
        <span>Mieux payée</span><strong>${ins.bestBuy != null ? formatMoney(ins.bestBuy) + ' €' : '—'}</strong>
        <span>Offre / demande</span><span>${supLabel}${sup?.coverage != null ? ` · ${String(Math.round(sup.coverage * 10) / 10).replace('.', ',')} j de stock` : ''}</span>
        <span>Votre stock</span><strong>${ins.ownedQty || 0}${ins.avgCost != null ? ` · coût ${formatMoney(ins.avgCost)} €` : ''}</strong>
      </div>
      ${bars ? `<div class="ip-spark" aria-hidden="true">${bars}</div>` : ''}
      <small class="text-muted">Ctrl+K : chercher une autre fiche</small>`;
  }

  show(host) {
    if (!host.isConnected) return;
    const html = this.html(host.dataset.itemId, Number(host.dataset.q) || 50, Number(host.dataset.p) || 50);
    if (!html) return;
    this.el.innerHTML = html;
    this.el.hidden = false;
    const r = host.getBoundingClientRect();
    const w = this.el.offsetWidth; const h = this.el.offsetHeight;
    // près du pointeur (ou sous la ligne au clavier), sans masquer la ligne survolée
    const ax = this.mouse && this.current === host ? this.mouse.x : r.left + 24;
    let x = ax + 18;
    let y = r.bottom + 6;
    if (x + w > window.innerWidth - 8) x = Math.max(8, ax - w - 18);
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 6);
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }
}
