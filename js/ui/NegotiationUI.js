/**
 * Interface — Marchandage (fenêtre) et fenêtres d'achat partiel / vente groupée.
 * Les fenêtres réutilisent la modale de main.js (Modal.open / close).
 */
import { formatMoney, qtyQuickButtons, wireQtyQuick, supplyChipHtml } from './TradeInsights.js';
import { getItemById } from '../data/items.js';

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const pctTxt = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

function trustBar(trust) {
  const pct = Math.round(Math.max(-1, Math.min(1, trust)) * 100);
  const width = Math.abs(pct) / 2;
  const left = pct >= 0 ? 50 : 50 - width;
  const cls = pct > 25 ? 'good' : pct < -10 ? 'bad' : 'mid';
  return `<span class="trust-bar" title="Confiance de −100 (méfiant) à +100 (vous fait confiance). Elle monte quand vous commercez avec lui à prix correct, baisse si vous le vexez."><i class="${cls}" style="left:${left}%;width:${width}%"></i><b></b></span> <strong>${pct > 0 ? '+' : ''}${pct}</strong>`;
}

/**
 * @param {{game:object, Modal:object, setStatus:Function, refresh:Function, offerId:string}} ctx
 */
export function openNegotiationModal({ game, Modal, setStatus, refresh, offerId }) {
  const q = game.getNegotiationQuote(offerId);
  if (!q.ok) { setStatus(q.error); return; }
  const isBuy = q.kind === 'buy';
  const sign = isBuy ? -1 : 1;
  const supply = game.getSupplyView?.(q.itemId);
  const defaultPrice = q.counter ?? r2(q.ask * (1 + sign * Math.min(0.06, Math.max(0.02, q.flex * 0.7))));
  const quick = [0.03, 0.06, 0.1].map(p => `<button type="button" class="btn btn-small btn-ghost" data-neg-pct="${p}">${isBuy ? '−' : '+'}${Math.round(p * 100)} %</button>`).join('');
  const reasons = q.reasons.length ? q.reasons.join(' · ') : 'rien de particulier';
  const blockedMsg = q.blocked || q.haggleBlocked;
  const body = `
    <div class="neg-head">
      <p>${isBuy ? 'Prix demandé' : 'Son offre'} : <strong class="text-money">${formatMoney(q.ask)} €</strong> l'unité
        <span class="text-muted">· ${isBuy ? `${q.quantity} en vente` : `demande ${q.quantity} · vous en avez ${q.maxQty} éligible(s)`}</span>
        ${isBuy && game.offers.find(o => o.id === offerId)?.buyoutPrice == null ? '<br><small class="text-muted" title="Annonce sans achat immédiat : le marchand accepte de vendre tout de suite un peu au-dessus du prix de départ.">Pas d\'achat immédiat sur l\'annonce : prix demandé pour une vente tout de suite.</small>' : ''}
      </p>
    </div>
    <div class="insight-card compact neg-card">
      <div class="neg-grid">
        <span title="Prix que le marchand juge normal pour cet objet dans cet état (moyenne du marché + valeur normale).">Valeur de référence</span><strong>${formatMoney(q.ref)} €</strong>
        <span>Prix moyen du marché</span><strong>${formatMoney(q.average)} €</strong>
        <span>Offre / demande</span><span>${supply ? supplyChipHtml(supply) : '—'}</span>
        <span>Confiance de ${q.npcName}</span><span>${trustBar(q.trust)}</span>
        <span title="Estimation de ce que le marchand peut lâcher. Facteurs : ${reasons}.">Marge de manœuvre</span><span><strong class="neg-flex neg-flex-${q.flexLabel.replace(/\s/g, '-')}">${q.flexLabel}</strong> <small class="text-muted">(≈ ${q.flexPct} % · ${reasons})</small></span>
        <span title="Chaque proposition compte, sauf accepter une contre-offre ou payer le prix demandé. Le rang de réputation donne des essais en plus.">Essais aujourd'hui</span><span><strong id="neg-tries">${q.triesLeft}</strong> / ${q.triesPerDay} · accords restants ${q.dealsLeft}</span>
      </div>
    </div>
    ${q.noRoom ? `<p class="neg-note">${isBuy ? 'Ce prix est déjà au plancher du marchand : pas de rabais possible, mais vous pouvez acheter au prix demandé.' : 'Cette offre est déjà au maximum de ce qu\'il peut payer.'}</p>` : ''}
    ${blockedMsg ? `<p class="neg-note neg-warn">${blockedMsg}</p>` : ''}
    <div class="form-row">
      <div class="form-group"><label>${isBuy ? 'Votre prix unitaire (€)' : 'Prix unitaire demandé (€)'}</label>
        <input type="number" id="neg-price" class="input" step="0.01" min="0.01" value="${defaultPrice.toFixed(2)}" style="width:100%" />
        <div class="qty-quick">${quick}</div>
      </div>
      <div class="form-group"><label>Quantité</label>
        <input type="number" id="neg-qty" class="input" value="1" min="1" max="${Math.max(1, q.maxQty)}" style="width:100%" />${qtyQuickButtons('neg-qty', Math.max(1, q.maxQty))}
      </div>
    </div>
    <p class="text-muted neg-preview" id="neg-preview"></p>
    <div id="neg-response" class="neg-response" ${q.counter ? '' : 'hidden'}>${q.counter ? `${q.npcName} vous a proposé <strong>${formatMoney(q.counter)} €</strong> aujourd'hui. <button class="btn btn-small btn-success" data-neg-accept="${q.counter}">Accepter ${formatMoney(q.counter)} €</button>` : ''}</div>
    <p class="text-muted neg-help">Astuce : une proposition trop éloignée vexe le marchand (confiance en baisse). Une proposition proche déclenche une contre-offre.</p>`;

  const buttons = [{ label: 'Fermer', className: 'btn-ghost', onClick: () => Modal.close() }];
  if (!q.blocked) {
    buttons.push({ label: `${isBuy ? 'Acheter' : 'Vendre'} au prix ${isBuy ? 'demandé' : 'offert'} (${formatMoney(q.ask)} €)`, className: 'btn-ghost', onClick: () => submit(q.ask, false, true) });
    if (!q.haggleBlocked && !q.noRoom) buttons.push({ label: 'Proposer', className: 'btn-primary', onClick: () => submit(null, false) });
  }
  Modal.open({ title: `🤝 Négocier avec ${q.npcName} — ${q.icon} ${q.itemName}`, bodyHTML: body, buttons });

  const root = document.getElementById('modal-body');
  const priceEl = root.querySelector('#neg-price');
  const qtyEl = root.querySelector('#neg-qty');
  const previewEl = root.querySelector('#neg-preview');
  const respEl = root.querySelector('#neg-response');
  wireQtyQuick(root);

  const updatePreview = () => {
    const price = Number(priceEl.value) || 0;
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    const total = r2(price * qty);
    const diff = r2((q.ask - price) * qty * (isBuy ? 1 : -1));
    const vsRef = q.ref > 0 ? (price - q.ref) / q.ref : 0;
    previewEl.innerHTML = isBuy
      ? `Total : <strong>${formatMoney(total)} €</strong> · économie vs prix demandé : <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(diff)} €</strong> · ${pctTxt(vsRef)} % vs référence`
      : `Total reçu : <strong class="text-money">${formatMoney(total)} €</strong> · gain vs son offre : <strong class="${diff >= 0 ? 'text-success' : 'text-danger'}">${formatMoney(diff)} €</strong> · ${pctTxt(vsRef)} % vs référence`;
  };
  priceEl.addEventListener('input', updatePreview);
  qtyEl.addEventListener('input', updatePreview);
  root.querySelectorAll('[data-neg-pct]').forEach(b => b.addEventListener('click', () => {
    priceEl.value = r2(q.ask * (1 + sign * Number(b.dataset.negPct))).toFixed(2);
    updatePreview();
  }));
  updatePreview();

  const wireAccept = () => {
    respEl.querySelector('[data-neg-accept]')?.addEventListener('click', (e) => submit(Number(e.currentTarget.dataset.negAccept), true));
  };
  wireAccept();

  function submit(forcedPrice, acceptCounter, direct = false) {
    const price = forcedPrice != null ? forcedPrice : Number(priceEl.value);
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    const res = game.negotiate(offerId, price, qty, { acceptCounter });
    if (!res.success) {
      respEl.hidden = false;
      respEl.className = 'neg-response neg-error';
      respEl.textContent = res.error;
      return;
    }
    if (res.outcome === 'accepted') {
      Modal.close();
      const gain = res.gain > 0 ? ` · ${isBuy ? 'économie' : 'gain'} ${formatMoney(res.gain)} €` : '';
      setStatus(`${res.message}${direct ? '' : gain}`);
      refresh();
      return;
    }
    respEl.hidden = false;
    respEl.className = `neg-response ${res.outcome === 'counter' ? 'neg-counter' : res.insulted ? 'neg-error' : 'neg-refused'}`;
    respEl.innerHTML = `${res.message}${res.outcome === 'counter' ? ` <button class="btn btn-small btn-success" data-neg-accept="${res.counter}">Accepter ${formatMoney(res.counter)} €</button>` : ''}`;
    wireAccept();
    const triesEl = root.querySelector('#neg-tries');
    if (triesEl && res.triesLeft != null) triesEl.textContent = String(res.triesLeft);
    refresh();
  }
}

/** Achat immédiat partiel : choisir la quantité d'une annonce. */
export function openBuyQtyModal({ game, Modal, setStatus, refresh, offerId, onNegotiate }) {
  const offer = game.offers.find(o => o.id === offerId);
  if (!offer || offer.status !== 'active' || offer.buyoutPrice == null) { setStatus('Annonce indisponible'); return; }
  const insight = game.getItemInsight(offer.itemId, offer.quality, offer.perfection);
  const item = getItemById(offer.itemId);
  const affordable = Math.max(0, Math.min(offer.quantity, Math.floor(game.player.money / offer.buyoutPrice)));
  const maxQty = Math.max(1, affordable);
  Modal.open({
    title: `Acheter — ${item?.icon || ''} ${item?.name || offer.itemId}`,
    bodyHTML: `
      <p>Prix : <strong class="text-money">${formatMoney(offer.buyoutPrice)} €</strong> l'unité · ${offer.quantity} disponible(s) · vendeur ${game.getNpcName(offer.ownerId)}</p>
      <p class="text-muted">Vous pouvez en payer ${affordable}. Moyenne du marché : ${insight?.average != null ? formatMoney(insight.average) + ' €' : '—'}${insight?.bestBuy != null ? ` · meilleure offre d'achat : ${formatMoney(insight.bestBuy)} €` : ''}</p>
      <div class="form-group"><label>Quantité</label><input type="number" id="bq-qty" class="input" value="${maxQty}" min="1" max="${maxQty}" style="width:100%" />${qtyQuickButtons('bq-qty', maxQty)}</div>
      <p class="text-muted" id="bq-total"></p>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      ...(onNegotiate && offer.ownerId !== 'city' ? [{ label: '🤝 Négocier', className: 'btn-ghost', onClick: () => { Modal.close(); onNegotiate(offerId); } }] : []),
      { label: 'Acheter', className: 'btn-primary', onClick: () => {
        const qty = Math.floor(Number(document.getElementById('bq-qty').value) || 0);
        if (qty < 1 || qty > offer.quantity) { setStatus('Quantité invalide'); return; }
        const res = game.buyout(offerId, qty);
        if (res.success) { Modal.close(); setStatus(`Acheté ×${qty} pour ${formatMoney(offer.buyoutPrice * qty)} €`); refresh(); }
        else setStatus(res.error || "Échec de l'achat");
      } }
    ]
  });
  const root = document.getElementById('modal-body');
  wireQtyQuick(root);
  const qtyEl = root.querySelector('#bq-qty');
  const totalEl = root.querySelector('#bq-total');
  const upd = () => {
    const qty = Math.floor(Number(qtyEl.value) || 0);
    const total = r2(offer.buyoutPrice * qty);
    let line = `Total : <strong>${formatMoney(total)} €</strong>`;
    if (insight?.bestBuy != null) {
      const m = r2((insight.bestBuy - offer.buyoutPrice) * qty);
      line += ` · revente immédiate à la meilleure offre : <strong class="${m >= 0 ? 'text-success' : 'text-danger'}">${m >= 0 ? '+' : ''}${formatMoney(m)} €</strong>`;
    }
    totalEl.innerHTML = line;
  };
  qtyEl.addEventListener('input', upd);
  root.querySelectorAll('.qty-quick button').forEach(b => b.addEventListener('click', () => setTimeout(upd, 0)));
  upd();
}

/** Vente groupée : vend tout un stock aux offres d'achat au-dessus d'un prix minimum. */
export function openBulkSellModal({ game, Modal, setStatus, refresh, itemId }) {
  const insight = game.getItemInsight(itemId);
  const item = getItemById(itemId);
  const avgCost = insight?.avgCost ?? null;
  const defaultMin = avgCost != null ? r2(avgCost) : 0;
  Modal.open({
    title: `Tout vendre — ${item?.icon || ''} ${item?.name || itemId}`,
    bodyHTML: `
      <p class="text-muted">Vend votre stock aux offres d'achat des marchands et du Comptoir, de la mieux payée à la moins bien payée, sans descendre sous votre prix minimum.</p>
      <div class="form-group"><label title="Les offres en dessous sont ignorées. Par défaut : votre coût d'achat moyen (aucune vente à perte).">Prix minimum par unité (€)</label>
        <input type="number" id="bulk-min" class="input" step="0.01" min="0" value="${defaultMin.toFixed(2)}" style="width:100%" /></div>
      <div id="bulk-plan"></div>`,
    buttons: [
      { label: 'Annuler', className: 'btn-ghost', onClick: () => Modal.close() },
      { label: 'Tout vendre', className: 'btn-success', onClick: () => {
        const min = Number(document.getElementById('bulk-min').value) || 0;
        const res = game.bulkSell(itemId, min);
        if (res.success) { Modal.close(); setStatus(`Vente groupée : ${res.name} ×${res.sold} pour ${formatMoney(res.total)} € (${res.offers} offre${res.offers > 1 ? 's' : ''})`); refresh(); }
        else setStatus(res.error);
      } }
    ]
  });
  const root = document.getElementById('modal-body');
  const minEl = root.querySelector('#bulk-min');
  const planEl = root.querySelector('#bulk-plan');
  const upd = () => {
    const plan = game.getBulkSellPlan(itemId, Number(minEl.value) || 0);
    if (!plan.sold) { planEl.innerHTML = '<p class="neg-note neg-warn">Aucune offre d\'achat à ce prix.</p>'; return; }
    const rows = plan.lines.map(l => `<tr><td>${l.buyer}</td><td>${l.qty}</td><td class="text-money">${formatMoney(l.price)} €</td></tr>`).join('');
    planEl.innerHTML = `
      <table class="data-table compact-table"><thead><tr><th>Acheteur</th><th>Qté</th><th>Prix</th></tr></thead><tbody>${rows}</tbody></table>
      <p>Vendu : <strong>${plan.sold}</strong> / ${plan.owned} · total <strong class="text-money">${formatMoney(plan.total)} €</strong> · prix moyen ${formatMoney(plan.avgPrice)} €${plan.margin != null ? ` · marge <strong class="${plan.margin >= 0 ? 'text-success' : 'text-danger'}">${plan.margin >= 0 ? '+' : ''}${formatMoney(plan.margin)} €</strong>` : ''}${plan.remaining ? ` · ${plan.remaining} restent dans le sac` : ''}</p>`;
  };
  minEl.addEventListener('input', upd);
  upd();
}
