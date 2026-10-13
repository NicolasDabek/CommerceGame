/**
 * v7 — Outils de marché :
 *  - demandes des marchands (panneau Marchands) avec bouton « Livrer » ;
 *  - fil des échanges entre marchands (panneau Marché) ;
 *  - comparateur de marchands pour un objet (modale) ;
 *  - graphique d'historique des prix avec zoom 7 j / 30 j / tout (modale SVG).
 */
import { getItemById } from '../data/items.js';

const money = (n) => (n == null || !isFinite(n) ? '—' : Number(n).toFixed(2).replace('.', ','));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Construit le SVG du graphique (pur, testable). */
export function priceChartSvg(series, { days = null, width = 520, height = 200, fair = null } = {}) {
  const pts = days == null ? series : series.filter(p => p.day >= -days);
  if (pts.length < 2) return '<p class="text-muted chart-empty">Pas encore assez de ventes pour tracer une courbe.</p>';
  const pad = 28;
  const xs = pts.map(p => p.day); const ys = pts.map(p => p.price);
  if (fair != null) ys.push(fair);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 0;
  const y0 = Math.min(...ys) * 0.97, y1 = Math.max(...ys) * 1.03;
  const X = (d) => pad + ((d - x0) / Math.max(1e-9, x1 - x0)) * (width - pad * 2);
  const Y = (v) => height - pad - ((v - y0) / Math.max(1e-9, y1 - y0)) * (height - pad * 2);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.day).toFixed(1)},${Y(p.price).toFixed(1)}`).join(' ');
  const dots = pts.map(p => `<circle class="chart-dot" cx="${X(p.day).toFixed(1)}" cy="${Y(p.price).toFixed(1)}" r="3"><title>${money(p.price)} € — il y a ${Math.max(0, -p.day).toFixed(1).replace('.', ',')} j</title></circle>`).join('');
  const fairLine = fair != null ? `<line class="chart-fair" x1="${pad}" x2="${width - pad}" y1="${Y(fair).toFixed(1)}" y2="${Y(fair).toFixed(1)}"><title>Prix juste ${money(fair)} €</title></line>` : '';
  return `<svg class="price-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Historique des prix : ${pts.length} ventes, de ${money(Math.min(...pts.map(p => p.price)))} à ${money(Math.max(...pts.map(p => p.price)))} €">
    <text x="4" y="${pad - 8}" class="chart-label">${money(y1)} €</text><text x="4" y="${height - 6}" class="chart-label">${money(y0)} €</text>
    ${fairLine}<path class="chart-line" d="${path}" fill="none"/>${dots}</svg>`;
}

export class MarketTools {
  constructor({ game, Modal, setStatus, openNegotiation, refresh }) {
    Object.assign(this, { game, Modal, setStatus, openNegotiation, refresh });
    this._mount();
    document.addEventListener('click', (e) => {
      const c = e.target.closest?.('[data-compare]');
      if (c) { e.preventDefault(); this.openCompare(c.dataset.compare); return; }
      const h = e.target.closest?.('[data-chart]');
      if (h) { e.preventDefault(); this.openChart(h.dataset.chart); return; }
      const d = e.target.closest?.('[data-deliver]');
      if (d) { e.preventDefault(); this.deliver(d.dataset.deliver); }
    });
  }

  _mount() {
    const grid = document.getElementById('npc-grid');
    if (grid && !document.getElementById('npc-requests')) {
      const el = document.createElement('section'); el.id = 'npc-requests'; el.className = 'npc-requests'; el.setAttribute('aria-live', 'polite');
      grid.parentNode.insertBefore(el, grid);
    }
    const ev = document.getElementById('market-events');
    if (ev && !document.getElementById('npc-feed')) {
      const el = document.createElement('section'); el.id = 'npc-feed'; el.className = 'npc-feed';
      ev.parentNode.insertBefore(el, ev.nextSibling);
    }
  }

  render() { this.renderRequests(); this.renderFeed(); }

  renderRequests() {
    const el = document.getElementById('npc-requests');
    if (!el || !this.game.getNpcRequests) return;
    const list = this.game.getNpcRequests();
    el.innerHTML = `<h3 class="section-title">📜 Demandes des marchands <small class="text-muted">(${list.length})</small></h3>` + (list.length ? `<ul class="req-list">${list.map(r => `
      <li class="req-item ${r.have ? 'ready' : ''}" data-request="${esc(r.id)}">
        <span class="req-what">${r.icon} <strong>${r.qty} × ${esc(r.itemName)}</strong> Q${r.minQuality}+ pour <strong>${esc(r.npcName)}</strong></span>
        <span class="req-price">${money(r.price)} € pièce · total ${money(r.total)} €</span>
        <span class="text-muted req-why">${esc(r.reason || '')} · ${r.daysLeft > 0 ? `encore ${r.daysLeft} j` : 'dernier jour'}</span>
        <button class="btn btn-sm ${r.have ? 'btn-primary' : 'btn-secondary'}" data-deliver="${esc(r.id)}" ${r.have ? '' : 'disabled title="Vous n\'avez pas assez d\'objets dans cet état"'}>Livrer</button>
      </li>`).join('')}</ul>` : '<p class="text-muted">Aucune demande pour l\'instant : les marchands en publient quand un objet qu\'ils aiment vient à manquer.</p>');
  }

  deliver(id) {
    const r = this.game.deliverNpcRequest(id);
    this.setStatus(r.success ? `✅ Livré : +${money(r.total)} € et la confiance de ${r.npcName} monte` : `❌ ${r.error}`);
    this.refresh?.();
  }

  renderFeed() {
    const el = document.getElementById('npc-feed');
    if (!el || !this.game.getNpcTradeFeed) return;
    const feed = this.game.getNpcTradeFeed(6);
    el.innerHTML = `<details class="npc-feed-box" ${feed.length ? 'open' : ''}><summary>🔁 Entre marchands <small class="text-muted">(${feed.length} échanges récents)</small></summary>` +
      (feed.length ? `<ul>${feed.map(t => { const it = getItemById(t.itemId); return `<li>${esc(t.seller)} → ${esc(t.buyer)} : ${t.qty} × ${it?.icon || ''} ${esc(it?.name || t.itemId)} à ${money(t.price)} €${t.sameClan ? ' <span class="chip chip-clan">même clan</span>' : ''}</li>`; }).join('')}</ul>` : '<p class="text-muted">Pas encore d\'échange entre marchands.</p>') + '</details>';
  }

  openCompare(itemId) {
    const item = getItemById(itemId);
    const c = this.game.getMerchantComparison(itemId);
    const row = (r) => `<tr><td>${esc(r.npcName)}<br><small class="text-muted">${esc(r.style)} · confiance ${Math.round((r.trust || 0) * 100)} %</small></td>
      <td class="text-money">${money(r.price)} €</td><td>Q${r.quality ?? '—'} ×${r.quantity}</td><td><small>${esc(r.flexLabel || '')}</small><br><small class="text-muted">${esc(r.tell)}</small></td>
      <td><button class="btn btn-sm btn-secondary" data-cmp-neg="${esc(r.offerId)}" ${r.canHaggle ? '' : 'disabled'}>Marchander</button></td></tr>`;
    const table = (rows, title) => `<h4>${title}</h4>` + (rows.length ? `<table class="data-table compare-table"><thead><tr><th>Marchand</th><th>Prix</th><th>État</th><th>Marge / attitude</th><th></th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table>` : '<p class="text-muted">Aucune.</p>');
    this.Modal.open({
      title: `⚖️ Comparer les marchands — ${item?.icon || ''} ${item?.name || itemId}`,
      bodyHTML: `<div class="compare-modal"><p class="text-muted">Prix juste ${money(c.fair)} € · moyenne ${money(c.average)} €</p>${table(c.sells, '🛒 Ils vendent (moins cher en premier)')}${table(c.buys, '💰 Ils achètent (plus offrant en premier)')}</div>`,
      buttons: [{ label: '📈 Historique', className: 'btn-secondary', onClick: () => this.openChart(itemId) }, { label: 'Fermer', className: 'btn-secondary', onClick: () => this.Modal.close() }]
    });
    this.Modal.bodyEl.querySelectorAll('[data-cmp-neg]').forEach(b => b.addEventListener('click', () => { this.Modal.close(); this.openNegotiation(b.dataset.cmpNeg); }));
  }

  openChart(itemId, days = 30) {
    const item = getItemById(itemId);
    const series = this.game.getPriceSeries(itemId);
    const fair = this.game.economy.getFairValue(itemId);
    const zoom = [[7, '7 j'], [30, '30 j'], [null, 'Tout']];
    this.Modal.open({
      title: `📈 Historique — ${item?.icon || ''} ${item?.name || itemId}`,
      bodyHTML: `<div class="chart-modal"><div class="chart-zoom" role="group" aria-label="Zoom">${zoom.map(([d, l]) => `<button class="btn btn-sm ${d === days ? 'btn-primary' : 'btn-secondary'}" data-zoom="${d ?? 'all'}" aria-pressed="${d === days}">${l}</button>`).join('')}</div>
        <div class="chart-box">${priceChartSvg(series, { days, fair })}</div><p class="text-muted chart-legend">— ventes · <span class="legend-fair">- - prix juste</span> · survolez un point pour le détail</p></div>`,
      buttons: [{ label: '⚖️ Comparer', className: 'btn-secondary', onClick: () => this.openCompare(itemId) }, { label: 'Fermer', className: 'btn-secondary', onClick: () => this.Modal.close() }]
    });
    this.Modal.bodyEl.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => this.openChart(itemId, b.dataset.zoom === 'all' ? null : Number(b.dataset.zoom))));
  }
}
