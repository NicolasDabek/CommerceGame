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

function moodFace(mood) {
  if (mood > 0.35) return { icon: '😄', label: 'de bonne humeur' };
  if (mood < -0.35) return { icon: '😠', label: 'tendu' };
  if (mood < -0.1) return { icon: '😕', label: 'un peu tendu' };
  return { icon: '🙂', label: 'calme' };
}

function patienceBar(q) {
  const max = Math.max(1, q.patienceMax || 1);
  const left = Math.max(0, q.patience ?? max);
  const dots = Array.from({ length: max }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
  return `<span class="patience-bar" title="Patience : chaque proposition refusée ou contre-offre en consomme 1, une offre vexante 2. À zéro, il coupe court pour la journée (sa dernière contre-offre reste valable).">${dots}</span> <small class="text-muted">${left}/${max}</small>`;
}

const OUTCOME_ICON = { counter: '🔁', refused: '✋', insult: '😤', accepted: '✅' };

function roundsHtml(q) {
  if (!q.rounds?.length) return '<p class="text-muted neg-rounds-empty">Aucune proposition pour l\'instant.</p>';
  return `<ol class="neg-rounds">${q.rounds.map((r, i) => {
    const npcPart = r.outcome === 'counter'
      ? `→ il propose <strong>${formatMoney(r.counter)} €</strong> <small class="text-muted">(concession ${formatMoney(r.concession)} €)</small>`
      : r.outcome === 'accepted' ? '→ <strong class="text-success">accord</strong>'
        : r.outcome === 'insult' ? '→ <strong class="text-danger">vexé</strong>' : '→ refus';
    return `<li><span class="neg-round-n">${i + 1}</span> ${OUTCOME_ICON[r.outcome] || ''} vous : ${formatMoney(r.price)} € ${npcPart}</li>`;
  }).join('')}</ol>`;
}

/**
 * Fenêtre de marchandage (plusieurs tours). Rouverte après chaque réponse pour afficher
 * l'historique, la patience et la nouvelle estimation.
 * @param {{game:object, Modal:object, setStatus:Function, refresh:Function, offerId:string, last?:object, keep?:{price:number, qty:number}, notify?:Function}} ctx
 */
export function openNegotiationModal(ctx) {
  const { game, Modal, setStatus, refresh, offerId, last = null, keep = null, notify = null } = ctx;
  const q = game.getNegotiationQuote(offerId);
  if (!q.ok) { setStatus(q.error); return; }
  const isBuy = q.kind === 'buy';
  const sign = isBuy ? -1 : 1;
  const supply = game.getSupplyView?.(q.itemId);
  const defaultPrice = keep?.price ?? q.counter ?? q.suggested ?? r2(q.ask * (1 + sign * 0.04));
  const lo = isBuy ? r2(q.ask * 0.78) : q.ask;
  const hi = isBuy ? q.ask : r2(q.ask * 1.15);
  const reasons = q.reasons.length ? q.reasons.join(' · ') : 'rien de particulier';
  const blockedMsg = q.blocked || q.haggleBlocked;
  const face = moodFace(q.mood);
  const memo = q.memory?.bluffs >= 1 ? `<span class="mini-chip chip-warn" title="Il se souvient de vos offres trop basses (oubli progressif, environ −30 % par jour) : sa marge est réduite.">🧠 Se souvient de ${Math.round(q.memory.bluffs)} offre(s) trop basse(s)</span>`
    : q.memory?.deals >= 1 ? `<span class="mini-chip chip-good" title="Accords passés avec lui : un peu plus de marge et de patience.">🧠 Bon client (${q.memory.deals} accord${q.memory.deals > 1 ? 's' : ''})</span>` : '';
  const offer = game.offers.find(o => o.id === offerId);
  const lastHtml = last ? `<div id="neg-response" class="neg-response ${last.error ? 'neg-error' : last.outcome === 'counter' ? 'neg-counter' : last.insulted ? 'neg-error' : 'neg-refused'}" role="status" aria-live="polite">
      <span class="neg-result-icon">${last.error ? '⚠️' : OUTCOME_ICON[last.insulted ? 'insult' : last.outcome] || ''}</span> ${last.error || last.message}
      ${!last.error && q.counter ? ` <button class="btn btn-small btn-success" data-neg-accept="${q.counter}">Accepter ${formatMoney(q.counter)} €</button>` : ''}</div>`
    : `<div id="neg-response" class="neg-response neg-counter" ${q.counter ? '' : 'hidden'} role="status" aria-live="polite">${q.counter ? `${q.npcName} vous a proposé <strong>${formatMoney(q.counter)} €</strong> aujourd'hui. <button class="btn btn-small btn-success" data-neg-accept="${q.counter}">Accepter ${formatMoney(q.counter)} €</button>` : ''}</div>`;
  const body = `
    <div class="neg-merchant">
      <div class="neg-face" aria-hidden="true">${face.icon}</div>
      <div class="neg-merchant-info">
        <strong>${q.npcName}</strong> <span class="mini-chip" title="${q.style.text}">${q.style.icon} ${q.style.label}</span> ${memo}
        <div class="neg-bars">
          <span>Humeur : ${face.label}</span>
          <span>Confiance ${trustBar(q.trust)}</span>
          <span>Patience ${patienceBar(q)}</span>
        </div>
      </div>
    </div>
    <p class="neg-tell" title="Langage corporel : un indice sur son humeur cachée du jour, jamais le prix exact">${q.tell.icon} <em>${q.tell.text}</em></p>
    <div class="insight-card compact neg-card">
      <div class="neg-grid">
        <span>${isBuy ? 'Prix demandé' : 'Son offre'}</span><strong class="text-money">${formatMoney(q.ask)} € <small class="text-muted">· ${isBuy ? `${q.quantity} en vente` : `${q.maxQty} éligible(s) chez vous`}</small></strong>
        <span title="Prix que le marchand juge normal pour cet objet dans cet état.">Valeur de référence</span><strong>${formatMoney(q.ref)} € <small class="text-muted">· moyenne ${formatMoney(q.average)} €</small></strong>
        <span>Offre / demande</span><span>${supply ? supplyChipHtml(supply) : '—'}</span>
        <span title="Ce que le marchand peut lâcher. Facteurs : ${reasons}.">Marge de manœuvre</span><span><strong class="neg-flex neg-flex-${q.flexLabel.replace(/\s/g, '-')}">${q.flexLabel}</strong> <small class="text-muted">(≈ ${q.flexPct} % · ${reasons})</small></span>
        <span title="Propositions possibles aujourd'hui avec ce marchand (selon votre rang).">Essais</span><span><strong id="neg-tries">${q.triesLeft}</strong> / ${q.triesPerDay} · accords restants ${q.dealsLeft}</span>
      </div>
    </div>
    ${q.noRoom ? `<p class="neg-note">${isBuy ? 'Déjà au plancher du marchand : pas de rabais possible, mais vous pouvez acheter au prix demandé.' : 'Déjà au maximum de ce qu\'il peut payer.'}</p>` : ''}
    ${blockedMsg ? `<p class="neg-note neg-warn">${blockedMsg}</p>` : ''}
    <div class="neg-advice">
      <button type="button" class="btn btn-small btn-ghost" data-neg-set="${q.fair}" title="Prix juste : ${q.fairReasons.join(' · ')}">⚖️ Prix juste ${formatMoney(q.fair)} €</button>
      ${q.suggested != null && !q.noRoom ? `<button type="button" class="btn btn-small btn-ghost" data-neg-set="${q.suggested}" title="Prix qui a environ 70 % de chances d'être accepté d'après la marge estimée">🎯 Conseillé ${formatMoney(q.suggested)} €</button>` : ''}
      ${[0.03, 0.06, 0.1].map(p => `<button type="button" class="btn btn-small btn-ghost" data-neg-set="${r2(q.ask * (1 + sign * p))}">${isBuy ? '−' : '+'}${Math.round(p * 100)} %</button>`).join('')}
    </div>
    <div class="form-row">
      <div class="form-group neg-price-group"><label for="neg-price">${isBuy ? 'Votre prix unitaire (€)' : 'Prix unitaire demandé (€)'}</label>
        <div class="neg-price-line">
          <input type="range" id="neg-slider" min="${lo}" max="${hi}" step="0.01" value="${Math.min(hi, Math.max(lo, defaultPrice))}" aria-label="Ajuster le prix" />
          <input type="number" id="neg-price" class="input" step="0.01" min="0.01" value="${Number(defaultPrice).toFixed(2)}" />
        </div>
      </div>
      <div class="form-group"><label for="neg-qty">Quantité</label>
        <input type="number" id="neg-qty" class="input" value="${keep?.qty ?? 1}" min="1" max="${Math.max(1, q.maxQty)}" style="width:100%" />${qtyQuickButtons('neg-qty', Math.max(1, q.maxQty))}
        ${q.bundleQty && q.bundleQty <= q.maxQty ? `<button type="button" class="btn btn-small btn-ghost" id="neg-bundle" title="Prendre tout le lot donne ${q.bundleFlexPct} % de marge en plus au marchand">📦 Lot entier ×${q.bundleQty} (+${q.bundleFlexPct} %)</button>` : ''}
      </div>
    </div>
    <div class="neg-tactics" role="group" aria-label="Arguments">
      <span class="text-muted">Argument (1 par discussion, coûte 1 de patience) :</span>
      ${q.tacticUsed ? `<span class="mini-chip ${q.tacticUsed.valid ? 'chip-good' : 'chip-bad'}">${q.tacticUsed.valid ? '✓' : '✗'} ${q.tacticUsed.label}${q.tacticUsed.valid ? ` +${(q.tacticUsed.bonus * 100).toFixed(1).replace('.', ',')} %` : ''}</span>`
        : q.tactics.map(t => `<button type="button" class="btn btn-small btn-ghost" data-neg-tactic="${t.id}" title="${t.text} Risque : ${t.risk}." ${q.haggleBlocked || q.blocked ? 'disabled' : ''}>${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div class="chance-meter" id="neg-chance" title="Estimation d'après la marge du marchand (son humeur exacte du jour reste inconnue, ± 1,5 %).">
      <div class="chance-track"><span id="neg-chance-fill"></span></div>
      <span id="neg-chance-label"></span>
    </div>
    <p class="text-muted neg-preview" id="neg-preview"></p>
    ${lastHtml}
    <details class="neg-history" ${q.rounds?.length ? 'open' : ''}><summary>Historique des tours (${q.rounds?.length || 0})</summary>${roundsHtml(q)}</details>
    ${q.history?.length ? `<details class="neg-history"><summary>Vos dernières affaires avec ${q.npcName} (${q.history.length})</summary><ul class="neg-journal">${q.history.map(h => `<li>J${h.day} · ${h.icon} ${h.itemName} · <strong>${h.outcome}</strong>${h.price != null ? ` à ${formatMoney(h.price)} €` : ''}${h.gain ? ` <small class="text-success">(${formatMoney(h.gain)} € gagnés)</small>` : ''}</li>`).join('')}</ul></details>` : ''}
    <p class="text-muted neg-help">Chaque contre-offre est plus petite que la précédente. Une offre trop basse le vexe, et il s'en souviendra quelques jours.${offer?.buyoutPrice == null && isBuy ? ' Annonce sans achat immédiat : prix demandé pour une vente tout de suite.' : ''}</p>`;

  const buttons = [{ label: 'Fermer', className: 'btn-ghost', onClick: () => Modal.close() }];
  if (!q.blocked) {
    buttons.push({ label: `${isBuy ? 'Acheter' : 'Vendre'} au prix ${isBuy ? 'demandé' : 'offert'} (${formatMoney(q.ask)} €)`, className: 'btn-ghost', onClick: () => submit(q.ask, false, true) });
    if (!q.haggleBlocked && !q.noRoom) buttons.push({ label: 'Proposer', className: 'btn-primary', onClick: () => submit(null, false) });
  }
  Modal.open({ title: `🤝 Négocier avec ${q.npcName} — ${q.icon} ${q.itemName}`, bodyHTML: body, buttons });

  const root = document.getElementById('modal-body');
  const priceEl = root.querySelector('#neg-price');
  const sliderEl = root.querySelector('#neg-slider');
  const qtyEl = root.querySelector('#neg-qty');
  const previewEl = root.querySelector('#neg-preview');
  const fillEl = root.querySelector('#neg-chance-fill');
  const chanceLabel = root.querySelector('#neg-chance-label');
  const chanceBox = root.querySelector('#neg-chance');
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
    const est = game.getNegotiationChance ? game.getNegotiationChance(offerId, price, qty) : null;
    if (est && fillEl) {
      const pct = Math.round(est.chance * 100);
      fillEl.style.width = `${pct}%`;
      chanceBox.dataset.zone = est.zone;
      chanceLabel.innerHTML = `<strong>${pct} %</strong> · ${est.label}`;
    }
  };
  priceEl.addEventListener('input', () => { if (sliderEl) sliderEl.value = priceEl.value; updatePreview(); });
  sliderEl?.addEventListener('input', () => { priceEl.value = Number(sliderEl.value).toFixed(2); updatePreview(); });
  qtyEl.addEventListener('input', updatePreview);
  root.querySelectorAll('[data-neg-set]').forEach(b => b.addEventListener('click', () => {
    priceEl.value = Number(b.dataset.negSet).toFixed(2);
    if (sliderEl) sliderEl.value = priceEl.value;
    updatePreview();
  }));
  root.querySelector('#neg-bundle')?.addEventListener('click', () => { qtyEl.value = String(q.bundleQty); updatePreview(); });
  root.querySelectorAll('.qty-quick button').forEach(b => b.addEventListener('click', () => setTimeout(updatePreview, 0)));
  priceEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !q.haggleBlocked && !q.noRoom && !q.blocked) submit(null, false); });
  updatePreview();
  root.querySelectorAll('[data-neg-tactic]').forEach(b => b.addEventListener('click', () => {
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    const res = game.useHaggleTactic(offerId, b.dataset.negTactic, qty);
    refresh();
    openNegotiationModal({ ...ctx, last: res.success ? { outcome: res.valid ? 'counter' : 'refused', insulted: !res.valid, message: res.message, tactic: true } : { error: res.error }, keep: { price: Number(priceEl.value), qty } });
  }));
    root.querySelector('[data-neg-accept]')?.addEventListener('click', (e) => submit(Number(e.currentTarget.dataset.negAccept), true));

  function submit(forcedPrice, acceptCounter, direct = false) {
    const price = forcedPrice != null ? forcedPrice : Number(priceEl.value);
    const qty = Math.max(1, Math.floor(Number(qtyEl.value) || 1));
    const res = game.negotiate(offerId, price, qty, { acceptCounter });
    if (res.success && res.outcome === 'accepted') {
      Modal.close();
      const gain = res.gain > 0 ? ` · ${isBuy ? 'économie' : 'gain'} ${formatMoney(res.gain)} €` : '';
      const msg = `${res.message}${direct ? '' : gain}`;
      setStatus(msg);
      notify?.({ icon: '🤝', text: msg, kind: 'deal' });
      refresh();
      return;
    }
    if (res.success) refresh();
    openNegotiationModal({ ...ctx, last: res.success ? res : { error: res.error }, keep: { price, qty } });
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
