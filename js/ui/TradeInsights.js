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

function escapeAttr(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Texte d'info-bulle listant les causes d'un prix (economy.explainPrice). */
export function priceFactorsTitle(explanation) {
  if (!explanation) return '';
  const lines = [`Valeur normale : ${formatMoney(explanation.fair)} € (prix de base ${formatMoney(explanation.base)} €)`];
  if (!explanation.factors.length) lines.push('Aucun facteur notable : prix proche de la normale.');
  explanation.factors.forEach(f => lines.push(`• ${f.label} : ${f.pct > 0 ? '+' : ''}${f.pct.toFixed(1).replace('.', ',')} %`));
  return escapeAttr(lines.join('\n'));
}

/**
 * Petite pastille « pourquoi ce prix ? » : écart à la base + cause principale.
 * Rien n'est affiché si le prix est à moins de 3 % de sa valeur de base.
 */
export function priceWhyChip(explanation) {
  if (!explanation) return '';
  const pct = (explanation.ratio - 1) * 100;
  if (Math.abs(pct) < 3 || !explanation.factors.length) return '';
  const top = explanation.factors[0];
  const cls = pct > 0 ? 'up' : 'down';
  const label = top.label.length > 26 ? `${top.label.slice(0, 24)}…` : top.label;
  return `<small class="why-chip ${cls}" title="Pourquoi ce prix ?\n${priceFactorsTitle(explanation)}">${pct > 0 ? '+' : ''}${Math.round(pct)} % · ${label}</small>`;
}

const ECO_STATUS_ICON = { stable: '🟢', tendu: '🟠', surchauffe: '🔴', 'prix-bas': '🔵', deflation: '🔵' };

/** Indice des prix lisible : 100 = normal. */
export function priceIndexLabel(index) {
  return Math.round((Number(index) || 1) * 100);
}

/** Pastille compacte pour la barre du haut. */
export function economyChipHtml(health) {
  if (!health) return '';
  return `<span class="eco-dot">${ECO_STATUS_ICON[health.status] || '🟢'}</span><span class="eco-chip-text">Prix ${priceIndexLabel(health.priceIndex)}</span><span class="eco-chip-label">${health.label}</span>`;
}

/** Carte « Santé de l'économie » du panneau Marché. */
export function economyHealthHtml(health) {
  if (!health) return '';
  const idx = priceIndexLabel(health.priceIndex);
  const pc = health.priceChange7d * 100;
  const mc = health.moneyChange7d * 100;
  const fill = Math.min(100, Math.round((health.treasury / health.treasuryCap) * 100));
  const last = (health.reserveActions || []).slice(-2).map(a => {
    const verb = a.type === 'sell' ? 'revend' : a.type === 'procure' ? 'commande' : 'rachète';
    return `${verb} ${a.icon} à ${formatMoney(a.price)} €`;
  }).join(' · ');
  return `
    <div class="eco-health eco-${health.status}" data-eco-status="${health.status}">
      <div class="eco-tile" title="Moyenne des prix de tous les objets comparée à leur valeur normale. 100 = normal, 110 = 10 % plus cher que d'habitude.">
        <span class="eco-label">Niveau des prix</span>
        <div class="eco-main"><strong>${idx}</strong><span class="eco-status-chip">${ECO_STATUS_ICON[health.status] || ''} ${health.label}</span></div>
        <small class="text-muted">normal = 100 · 7 j : ${formatPct(pc)}</small>
        <div class="eco-spark">${sparkline(health.history, { width: 120, height: 22 })}</div>
      </div>
      <div class="eco-tile" title="Argent total en circulation : vous, les marchands, les sommes bloquées dans les offres, le Comptoir municipal et la caisse des contrats.">
        <span class="eco-label">Masse monétaire</span>
        <div class="eco-main"><strong>${formatMoney(health.moneySupply)} €</strong></div>
        <small class="text-muted">7 j : ${formatPct(mc)} · marchands ${formatMoney(health.npcCash)} €</small>
      </div>
      <div class="eco-tile" title="Le Comptoir municipal encaisse taxes et frais des marchands, revend son stock quand un objet manque ou devient trop cher (plafond ≈ 130 % de la valeur normale) et rachète quand un objet est bradé (plancher ≈ 75 %). Son excédent est reversé en commandes et en aides.">
        <span class="eco-label">Comptoir municipal</span>
        <div class="eco-main"><strong>${formatMoney(health.treasury)} €</strong><small class="text-muted"> · ${health.reserveStock} obj.</small></div>
        <div class="eco-bar" aria-hidden="true"><span style="width:${fill}%"></span></div>
        <small class="text-muted">${last || 'Aucune intervention aujourd\'hui'}</small>
      </div>
      <div class="eco-tile" title="Ventes conclues sur le dernier jour de jeu et stock total des marchands.">
        <span class="eco-label">Activité</span>
        <div class="eco-main"><strong>${health.txPerDay}</strong><small class="text-muted"> ventes / jour</small></div>
        <small class="text-muted">stock marchands : ${health.npcStock} objets</small>
      </div>
      <p class="eco-explain">${health.explanation}</p>
    </div>
  `;
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
  if (insight.explanation) {
    rows.splice(1, 0, `<span title="${priceFactorsTitle(insight.explanation)}">Valeur normale : <strong>${formatMoney(insight.fair)} €</strong> · <span class="text-muted">${insight.explanation.summary}</span></span>`);
  }

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
