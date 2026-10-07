/**
 * TradeInsights — formatage et fiches d'analyse marché partagés.
 * S'appuie uniquement sur les données déjà calculées par le jeu (pas de réseau).
 */

export function formatMoney(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return Number(amount).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatPct(pct, withSign = true) {
  if (pct == null || Number.isNaN(Number(pct))) return '—';
  const n = Number(pct);
  const sign = withSign && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} %`;
}

export function sparkline(values, { width = 110, height = 28, cls = '' } = {}) {
  if (!values || values.length < 2) return '<span class="text-muted">—</span>';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const rising = values[values.length - 1] >= values[0];
  return `
    <svg class="sparkline ${cls}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline class="${rising ? 'up' : 'down'}" points="${points}" />
    </svg>
  `;
}

/** Badge d'opportunité par rapport au prix moyen. */
export function dealBadge(price, average, { invert = false } = {}) {
  if (price == null || average == null || average <= 0) return '';
  const delta = (price - average) / average;
  const cheap = invert ? delta > 0.05 : delta < -0.05;
  const rich = invert ? delta < -0.05 : delta > 0.08;
  if (cheap) {
    return `<span class="deal-badge deal-good" title="Écart vs prix moyen : ${formatPct(delta * 100)}">Bonne affaire</span>`;
  }
  if (rich) {
    return `<span class="deal-badge deal-bad" title="Écart vs prix moyen : ${formatPct(delta * 100)}">Cher</span>`;
  }
  return `<span class="deal-badge deal-fair" title="Écart vs prix moyen : ${formatPct(delta * 100)}">Dans le marché</span>`;
}

export function marginHtml(unitMargin, pct) {
  if (unitMargin == null) return '<span class="text-muted">—</span>';
  const cls = unitMargin >= 0 ? 'text-success' : 'text-danger';
  const sign = unitMargin >= 0 ? '+' : '';
  const pctBit = pct != null ? ` (${formatPct(pct)})` : '';
  return `<span class="${cls}">${sign}${formatMoney(unitMargin)} €${pctBit}</span>`;
}

/**
 * Fiche HTML compacte pour un insight d'objet (modales, inventaire, détail).
 * @param {object} insight — retour de game.getItemInsight
 */
export function insightCardHtml(insight, { compact = false } = {}) {
  if (!insight) return '';
  const owned = insight.ownedQty > 0
    ? `Vous : <strong>${insight.ownedQty}</strong>${insight.avgCost != null ? ` · coût ${formatMoney(insight.avgCost)} €` : ''}`
    : 'Vous : <span class="text-muted">pas en stock</span>';
  const last = insight.lastSold
    ? `Dernière vente : <strong class="text-money">${formatMoney(insight.lastSold.price)} €</strong>`
    : 'Dernière vente : <span class="text-muted">—</span>';
  const hiLo = (insight.high != null && insight.low != null)
    ? `Haut / bas : <strong>${formatMoney(insight.high)} €</strong> / <strong>${formatMoney(insight.low)} €</strong>`
    : 'Haut / bas : <span class="text-muted">historique insuffisant</span>';

  const rows = [
    `Prix moyen : <strong class="text-money">${formatMoney(insight.average)} €</strong>${insight.adjusted != null && insight.adjusted !== insight.average ? ` · ajusté Q/P ${formatMoney(insight.adjusted)} €` : ''}`,
    `Carnet : vente <strong>${insight.bestSell != null ? formatMoney(insight.bestSell) + ' €' : '—'}</strong> · achat <strong>${insight.bestBuy != null ? formatMoney(insight.bestBuy) + ' €' : '—'}</strong>${insight.spread != null ? ` · écart ${formatMoney(insight.spread)} €` : ''}`,
    hiLo,
    last,
    owned
  ];

  if (insight.marginIfSellToBestBuy != null) {
    rows.push(`Marge si vous vendez à la meilleure offre d'achat : ${marginHtml(insight.marginIfSellToBestBuy, insight.marginIfSellToBestBuyPct)}`);
  }
  if (insight.discountIfBuyBestSell != null) {
    const cls = insight.discountIfBuyBestSell >= 0 ? 'text-success' : 'text-danger';
    rows.push(`Économie vs moyenne si vous achetez la moins chère : <span class="${cls}">${formatMoney(insight.discountIfBuyBestSell)} € /u (${formatPct(insight.discountIfBuyBestSellPct)})</span>`);
  }
  if (insight.canAffordBestSell === false && insight.bestSell != null) {
    rows.push('<span class="text-warning">Capital insuffisant pour la meilleure vente</span>');
  }
  if (insight.freeSlots === 0 && insight.ownedQty === 0) {
    rows.push('<span class="text-warning">Inventaire plein — pas de case libre</span>');
  }

  const chart = sparkline(insight.history);
  if (compact) {
    return `<div class="insight-card compact">${rows.map(r => `<div>${r}</div>`).join('')}<div class="insight-spark">${chart}</div></div>`;
  }
  return `
    <div class="insight-card">
      <div class="insight-grid">${rows.map(r => `<div>${r}</div>`).join('')}</div>
      <div class="insight-spark" title="Historique récent des prix">${chart}</div>
    </div>
  `;
}

/** Boutons rapides de quantité (1 / moitié / max). */
export function qtyQuickButtons(inputId, maxQty) {
  const max = Math.max(1, Number(maxQty) || 1);
  const half = Math.max(1, Math.floor(max / 2));
  return `
    <div class="qty-quick" data-qty-target="${inputId}">
      <button type="button" class="btn btn-small btn-ghost" data-qty="1">1</button>
      <button type="button" class="btn btn-small btn-ghost" data-qty="${half}">½ (${half})</button>
      <button type="button" class="btn btn-small btn-ghost" data-qty="${max}">Max (${max})</button>
    </div>
  `;
}

export function wireQtyQuick(root = document) {
  root.querySelectorAll('.qty-quick').forEach(bar => {
    const id = bar.dataset.qtyTarget;
    const input = document.getElementById(id);
    if (!input) return;
    bar.querySelectorAll('[data-qty]').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.qty;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  });
}
