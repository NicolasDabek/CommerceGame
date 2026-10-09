/**
 * Interface — Suivi & ordres : liste de suivi + alertes, ordres d'achat permanents, bilan (P&L).
 */
import { ITEMS } from '../data/items.js';
import { formatMoney, formatPct, supplyChipHtml } from './TradeInsights.js';

const signed = (n) => {
  const v = Number(n || 0);
  const cls = v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-muted';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${formatMoney(v)} €</span>`;
};

function itemOptions(selected) {
  return ITEMS.map(i => `<option value="${i.id}" ${i.id === selected ? 'selected' : ''}>${i.icon} ${i.name}</option>`).join('');
}

function priceInput(value) {
  return value != null ? Number(value).toFixed(2) : '';
}

export class TradingUI {
  constructor(options = {}) {
    this.getView = options.getView || (() => null);
    this.getFair = options.getFair || (() => 0);
    this.getCreditView = options.getCreditView || null;
    this.getCreditQuote = options.getCreditQuote || null;
    this.actions = options.actions || {};
    this.root = document.getElementById('trading-root');
    this.badgeEl = document.getElementById('trading-badge');
    this.tab = 'watch';
  }

  updateBadge(view = this.getView()) {
    if (!this.badgeEl || !view) return;
    this.badgeEl.textContent = view.unread ? String(view.unread) : '';
    this.badgeEl.hidden = !view.unread;
  }

  render() {
    const view = this.getView();
    if (!view) return;
    this.updateBadge(view);
    if (!this.root) return;
    // Ne pas effacer une saisie en cours (rafraîchissement automatique)
    const active = document.activeElement;
    if (active && this.root.contains(active) && /^(INPUT|SELECT)$/.test(active.tagName)) return;
    const tabs = `
      <div class="tabs trading-tabs">
        <button class="tab ${this.tab === 'watch' ? 'active' : ''}" data-tr-tab="watch">Suivi &amp; alertes${view.unread ? ` <span class="dock-badge">${view.unread}</span>` : ''}</button>
        <button class="tab ${this.tab === 'orders' ? 'active' : ''}" data-tr-tab="orders">Ordres permanents (${view.activeOrders}/${view.orderSlots})</button>
        <button class="tab ${this.tab === 'journal' ? 'active' : ''}" data-tr-tab="journal">Bilan</button>
        ${this.getCreditView ? `<button class="tab ${this.tab === 'credit' ? 'active' : ''}" data-tr-tab="credit" title="Emprunter au Comptoir municipal">Crédit${this._loanBadge()}</button>` : ''}
      </div>`;
    let body = '';
    if (this.tab === 'orders') body = this._orders(view);
    else if (this.tab === 'journal') body = this._journal(view);
    else if (this.tab === 'credit' && this.getCreditView) body = this._credit(this.getCreditView());
    else body = this._watch(view);
    this.root.innerHTML = tabs + body;
    this._wire();
  }

  _watch(view) {
    const rows = view.watch.map(w => `
      <tr data-watch-row="${w.itemId}">
        <td>${w.item.icon} ${w.item.name}<br><small class="text-muted">${w.item.category}</small></td>
        <td class="text-money">${formatMoney(w.fair)} €<br><small class="${w.changePct >= 0 ? 'text-success' : 'text-danger'}" title="Évolution de la valeur normale depuis que vous suivez l'objet">${formatPct(w.changePct)} depuis l'ajout</small></td>
        <td><span title="Annonce la moins chère">vente ${w.bestSell != null ? `<strong>${formatMoney(w.bestSell)} €</strong>` : '—'}</span>${w.dealPct != null && w.dealPct >= 5 ? ` <small class="text-success">(−${w.dealPct} %)</small>` : ''}<br><small class="text-muted" title="Offre d'achat la mieux payée">achat ${w.bestBuy != null ? `${formatMoney(w.bestBuy)} €` : '—'}</small></td>
        <td>${supplyChipHtml(w.supply)}</td>
        <td class="alert-inputs">
          <label title="Prévenez-moi quand une annonce passe sous ce prix">achat ≤ <input class="input input-xs" type="number" step="0.01" min="0" data-alert-below placeholder="${formatMoney(w.fair * 0.9)}" value="${priceInput(w.alertBelow)}" /></label>
          <label title="Prévenez-moi quand une offre d'achat dépasse ce prix">vente ≥ <input class="input input-xs" type="number" step="0.01" min="0" data-alert-above placeholder="${formatMoney(w.fair * 1.1)}" value="${priceInput(w.alertAbove)}" /></label>
        </td>
        <td class="nowrap">
          <button class="btn btn-small btn-primary" data-tr="save-alert" data-item="${w.itemId}">Enregistrer</button>
          <button class="btn btn-small btn-ghost" data-tr="unwatch" data-item="${w.itemId}" title="Retirer de la liste">✕</button>
        </td>
      </tr>`).join('');
    const alerts = view.alerts.map(a => `
      <li class="alert-item ${a.read ? '' : 'unread'} alert-${a.kind}"><span class="text-muted">J${a.day}</span> ${a.text}</li>`).join('');
    return `
      <p class="trade-hint text-muted">Suivez jusqu'à ${view.watchMax} objets (★ dans la Halle des prix). Une alerte se déclenche une fois quand le seuil est franchi, et aussi quand un objet suivi tombe en pénurie.</p>
      <div class="trading-add">
        <select class="select" id="watch-item">${itemOptions()}</select>
        <button class="btn btn-small btn-primary" data-tr="watch">★ Suivre</button>
      </div>
      <div class="trading-layout">
        <div class="table-container">
          <table class="data-table" id="watch-table">
            <thead><tr><th>Objet</th><th>Valeur normale</th><th>Carnet</th><th>Offre / demande</th><th title="Une alerte quand une annonce passe sous votre prix d'achat, ou quand une offre d'achat dépasse votre prix de vente">Alertes</th><th></th></tr></thead>
            <tbody>${rows || '<tr class="empty-row"><td colspan="6">Aucun objet suivi — cliquez ★ Suivre</td></tr>'}</tbody>
          </table>
        </div>
        <aside class="alert-log">
          <div class="goal-head"><h3>🔔 Alertes</h3>${view.unread ? '<button class="btn btn-small btn-ghost" data-tr="read">Tout marquer lu</button>' : ''}</div>
          <ul>${alerts || '<li class="text-muted">Aucune alerte pour l\'instant.</li>'}</ul>
        </aside>
      </div>`;
  }

  _orders(view) {
    const firstFair = this.getFair(ITEMS[0].id);
    const rows = view.orders.map(o => {
      const status = !o.active ? '<span class="text-muted">En pause</span>'
        : o.live ? `<span class="text-success">Offre active · reste ${o.live.quantity}</span>`
          : o.lastError ? `<span class="text-danger" title="${o.lastError}">Non placée : fonds insuffisants</span>`
            : '<span class="text-muted">Rempli — renouvelé demain</span>';
      return `
        <tr data-order-row="${o.id}">
          <td>${o.item.icon} ${o.item.name}</td>
          <td class="text-money">${formatMoney(o.price)} €<br><small class="${o.vsFairPct <= 0 ? 'text-success' : 'text-warning'}">${o.vsFairPct > 0 ? '+' : ''}${o.vsFairPct} % vs normale</small></td>
          <td>${o.quantity} / jour${o.minQuality ? `<br><small class="text-muted">Q${o.minQuality}+</small>` : ''}</td>
          <td>${status}</td>
          <td>${o.filledTotal} reçus${o.avgPrice != null ? `<br><small class="text-muted">moy. ${formatMoney(o.avgPrice)} €</small>` : ''}</td>
          <td><small>bloqué ${formatMoney(o.locked)} €<br>frais ${formatMoney(o.dailyFee)} € / jour</small></td>
          <td class="nowrap">
            <button class="btn btn-small ${o.active ? 'btn-ghost' : 'btn-primary'}" data-tr="toggle-order" data-id="${o.id}">${o.active ? 'Pause' : 'Reprendre'}</button>
            <button class="btn btn-small btn-ghost" data-tr="remove-order" data-id="${o.id}" title="Supprimer (l'offre du jour est annulée et remboursée)">✕</button>
          </td>
        </tr>`;
    }).join('');
    return `
      <p class="trade-hint text-muted">Un ordre permanent place chaque jour une offre d'achat d'1 jour à votre prix (argent bloqué + frais d'annonce). Idéal pour constituer du stock pendant un surplus et revendre en pénurie. Places : ${view.orderSlots} (plus avec le métier Négociant et le rang de réputation).</p>
      <div class="trading-add order-form">
        <label>Objet <select class="select" id="so-item">${itemOptions()}</select></label>
        <label>Prix unitaire (€) <input class="input input-xs" type="number" id="so-price" step="0.01" min="0.01" value="${(firstFair * 0.95).toFixed(2)}" /></label>
        <label>Qté / jour <input class="input input-xs" type="number" id="so-qty" min="1" max="10" value="2" /></label>
        <label>État min. <input class="input input-xs" type="number" id="so-minq" min="0" max="90" value="0" /></label>
        <button class="btn btn-small btn-primary" data-tr="add-order" ${view.activeOrders >= view.orderSlots ? 'disabled' : ''}>Créer l'ordre</button>
        <small class="text-muted" id="so-hint"></small>
      </div>
      <div class="table-container">
        <table class="data-table" id="orders-table">
          <thead><tr><th>Objet</th><th>Prix</th><th>Quantité</th><th>Aujourd'hui</th><th>Rempli</th><th>Coût</th><th></th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="7">Aucun ordre permanent</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  _journal(view) {
    const j = view.journal;
    const max = Math.max(1, ...j.daily.map(d => Math.abs(d.net)));
    const bars = j.daily.map((d, i) => {
      const h = Math.round(Math.abs(d.net) / max * 40);
      const y = d.net >= 0 ? 44 - h : 44;
      return `<rect x="${i * 16 + 2}" y="${y}" width="12" height="${Math.max(1, h)}" class="${d.net >= 0 ? 'bar-up' : 'bar-down'}"><title>Jour ${d.day} : ${formatMoney(d.net)} €</title></rect>`;
    }).join('');
    const rows = j.rows.map(r => `
      <tr>
        <td>${r.item.icon} ${r.item.name}</td>
        <td>${r.bought}<br><small class="text-muted">${formatMoney(r.spent)} €</small></td>
        <td>${r.sold}<br><small class="text-muted">${formatMoney(r.earned)} €</small></td>
        <td>${signed(r.realized)}</td>
        <td>${r.held}</td>
        <td>${r.unrealized != null ? signed(r.unrealized) : '<span class="text-muted" title="Coût d\'achat inconnu (objets trouvés ou de départ)">—</span>'}</td>
      </tr>`).join('');
    return `
      <div class="eco-health journal-tiles">
        <div class="eco-tile" title="Ventes − coût d'achat moyen des objets vendus (hôtels de vente et d'achat)"><span class="eco-label">Marge réalisée</span><div class="eco-main"><strong>${signed(j.realized)}</strong></div><small class="text-muted">sur vos ventes</small></div>
        <div class="eco-tile" title="Contrats du Comptoir, commandes des marchands et services, moins le coût des objets livrés"><span class="eco-label">Contrats &amp; services</span><div class="eco-main"><strong>${signed(j.jobRealized)}</strong></div><small class="text-muted">encaissé ${formatMoney(j.jobIncome)} €</small></div>
        <div class="eco-tile" title="Fournitures et matériaux de l'établi, fournitures de fabrication"><span class="eco-label">Atelier</span><div class="eco-main"><strong>${signed(-j.workshop)}</strong></div><small class="text-muted">frais d'annonce ${formatMoney(j.fees)} €</small></div>
        <div class="eco-tile" title="Marge réalisée + contrats − atelier − frais d'annonce"><span class="eco-label">Résultat net</span><div class="eco-main"><strong>${signed(j.net)}</strong></div><small class="text-muted">latent en stock ${signed(j.unrealized)}</small></div>
        <div class="eco-tile"><span class="eco-label">14 derniers jours</span><svg class="journal-bars" viewBox="0 0 ${Math.max(1, j.daily.length) * 16 + 4} 88" aria-hidden="true"><line x1="0" y1="44" x2="1000" y2="44" class="bar-axis" />${bars}</svg></div>
      </div>
      <p class="trade-hint text-muted">Latent = valeur de marché actuelle (selon l'état) − votre coût d'achat, pour ce qui reste dans le sac. Une réparation ajoute son coût au prix de revient de l'objet.</p>
      <div class="table-container">
        <table class="data-table" id="journal-table">
          <thead><tr><th>Objet</th><th>Achetés</th><th>Vendus / livrés</th><th>Marge réalisée</th><th>En stock</th><th>Latent</th></tr></thead>
          <tbody>${rows || '<tr class="empty-row"><td colspan="6">Pas encore d\'opérations</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  _loanBadge() {
    const c = this.getCreditView?.();
    if (!c?.loan) return '';
    return c.loan.status === 'overdue' ? ' <span class="dock-badge">!</span>' : ' <span class="loan-dot" title="Crédit en cours">●</span>';
  }

  _credit(c) {
    const pct = (r) => `${String(Math.round(r * 1000) / 10).replace('.', ',')} %`;
    const ranks = c.ranks.map(r => `<tr class="${r.title === c.rank.title ? 'row-current' : ''}"><td>${r.icon} ${r.title}</td><td>${r.minRep}+</td><td>${formatMoney(r.limit)} €</td><td>${pct(r.rate)} / jour</td></tr>`).join('');
    const history = c.history.map(h => `<tr><td>J${h.takenDay} → J${h.closedDay}</td><td>${formatMoney(h.principal)} €</td><td>${formatMoney(h.interest)} €</td><td>${h.onTime ? '<span class="text-success">à temps</span>' : `<span class="text-danger">${h.overdueDays} j de retard</span>`}</td></tr>`).join('');
    let main;
    if (c.loan) {
      const l = c.loan;
      const overdue = l.status === 'overdue';
      main = `
        <div class="loan-card ${overdue ? 'loan-overdue' : ''}">
          <h3>${overdue ? '⚠️ Crédit en retard' : '💶 Crédit en cours'}</h3>
          <div class="neg-grid">
            <span>Emprunté le jour ${l.takenDay}</span><strong>${formatMoney(l.principal)} €</strong>
            <span title="Intérêts simples, au moins 1 jour facturé, au plus la durée prévue (+ pénalités de retard)">Intérêts à ce jour (${pct(l.rate)} / jour)</span><strong>${formatMoney(l.interest)} €</strong>
            <span>Déjà remboursé</span><strong>${formatMoney(l.paid || 0)} €</strong>
            <span>À payer maintenant pour solder</span><strong class="text-money">${formatMoney(l.outstanding)} €</strong>
            <span>Échéance</span><strong>${overdue ? `dépassée depuis ${l.overdueDays} j` : l.daysLeft > 0 ? `jour ${l.dueDay} (dans ${l.daysLeft} j) — ${formatMoney(l.fullTermTotal)} € si vous attendez` : 'aujourd\'hui'}</strong>
          </div>
          ${overdue ? '<p class="neg-note neg-warn">Retard : pénalité de 1 %/jour (plafonnée à 20 %), −1 réputation par jour, 50 % de vos ventes saisies ; au 3ᵉ jour, le Comptoir prélève votre solde.</p>' : '<p class="text-muted">À l\'échéance, le montant dû est prélevé automatiquement si votre solde suffit. Remboursé à temps : +2 réputation.</p>'}
          <button class="btn btn-primary" data-tr="repay">Rembourser ${formatMoney(l.outstanding)} €</button>
        </div>`;
    } else {
      const q = this.getCreditQuote?.(Math.min(c.limit, Math.max(c.minAmount, Math.round(c.limit / 2))), 7);
      main = `
        <div class="loan-card">
          <h3>💶 Emprunter au Comptoir</h3>
          <p>Votre rang <strong>${c.rank.icon} ${c.rank.title}</strong> : plafond <strong>${formatMoney(c.rankLimit)} €</strong> à <strong>${pct(c.rate)}</strong> par jour.
            <span class="text-muted" title="Le Comptoir prête sa trésorerie au-delà d'une réserve de 600 € et les dépôts des marchands les plus riches. Les intérêts leur reviennent.">Fonds prêtables aujourd'hui : ${formatMoney(c.pool)} € (${c.lenders} prêteur${c.lenders > 1 ? 's' : ''}).</span></p>
          ${c.limit < c.minAmount ? `<p class="neg-note neg-warn">${c.rankLimit <= 0 ? 'Réputation négative : pas de crédit.' : 'Le Comptoir n\'a pas assez de fonds à prêter pour le moment.'}</p>` : `
          <div class="trading-add order-form">
            <label>Montant (€) <input class="input input-xs" type="number" id="cr-amount" min="${c.minAmount}" max="${c.limit}" step="10" value="${q ? q.amount : c.minAmount}" /></label>
            <label>Durée <select class="select" id="cr-days">${c.durations.map(d => `<option value="${d}" ${d === 7 ? 'selected' : ''}>${d} jours</option>`).join('')}</select></label>
            <button class="btn btn-small btn-primary" data-tr="borrow">Emprunter</button>
            <small class="text-muted">max ${formatMoney(c.limit)} €</small>
          </div>
          <p class="text-muted" id="cr-quote"></p>`}
          <p class="trade-hint text-muted">Le crédit sert de levier : acheter un lot en surplus, livrer un gros contrat, profiter d'une alerte. Emprunter puis rembourser tout de suite coûte au moins un jour d'intérêts : il n'y a rien à gagner sans commercer.</p>
        </div>`;
    }
    return `
      <div class="credit-layout">
        <div>${main}</div>
        <aside class="alert-log">
          <h3>Plafonds par rang</h3>
          <table class="data-table compact-table"><thead><tr><th>Rang</th><th>Rép.</th><th>Plafond</th><th>Taux</th></tr></thead><tbody>${ranks}</tbody></table>
          <h3 style="margin-top:12px">Historique</h3>
          ${history ? `<table class="data-table compact-table"><thead><tr><th>Période</th><th>Capital</th><th>Intérêts</th><th>Statut</th></tr></thead><tbody>${history}</tbody></table>` : '<p class="text-muted">Aucun crédit remboursé.</p>'}
          <p class="text-muted" style="margin-top:8px">Remboursés à temps : ${c.stats.onTime} · en retard : ${c.stats.late} · intérêts payés : ${formatMoney(c.stats.interestPaid)} €</p>
        </aside>
      </div>`;
  }

  _wire() {
    const root = this.root;
    const crAmount = root.querySelector('#cr-amount');
    const crDays = root.querySelector('#cr-days');
    const crQuote = root.querySelector('#cr-quote');
    const updQuote = () => {
      if (!crAmount || !crQuote || !this.getCreditQuote) return;
      const q = this.getCreditQuote(Number(crAmount.value) || 0, Number(crDays.value) || 7);
      crQuote.innerHTML = `Intérêts : <strong>${formatMoney(q.interest)} €</strong> (${String(Math.round(q.rate * 1000) / 10).replace('.', ',')} % × ${q.days} j) · à rembourser au jour ${q.dueDay} : <strong class="text-money">${formatMoney(q.total)} €</strong> · remboursement anticipé possible (min. 1 jour d'intérêts).`;
    };
    crAmount?.addEventListener('input', updQuote);
    crDays?.addEventListener('change', updQuote);
    updQuote();
    root.querySelectorAll('[data-tr-tab]').forEach(b => b.addEventListener('click', () => { this.tab = b.dataset.trTab; this.render(); }));
    const soItem = root.querySelector('#so-item');
    const soPrice = root.querySelector('#so-price');
    const soHint = root.querySelector('#so-hint');
    const updateHint = () => {
      if (!soItem || !soHint) return;
      const fair = this.getFair(soItem.value);
      soHint.textContent = `Valeur normale : ${formatMoney(fair)} € — un prix 5 à 10 % en dessous se remplit surtout en période de surplus.`;
    };
    soItem?.addEventListener('change', () => { soPrice.value = (this.getFair(soItem.value) * 0.95).toFixed(2); updateHint(); });
    updateHint();
    root.querySelectorAll('[data-tr]').forEach(btn => btn.addEventListener('click', () => {
      const a = btn.dataset.tr;
      if (a === 'watch') this.actions.toggleWatch?.(root.querySelector('#watch-item').value, true);
      if (a === 'unwatch') this.actions.toggleWatch?.(btn.dataset.item, false);
      if (a === 'save-alert') {
        const row = btn.closest('tr');
        this.actions.setAlert?.(btn.dataset.item, row.querySelector('[data-alert-below]').value, row.querySelector('[data-alert-above]').value);
      }
      if (a === 'read') this.actions.markRead?.();
      if (a === 'add-order') {
        this.actions.addOrder?.({
          itemId: soItem.value,
          price: soPrice.value,
          quantity: root.querySelector('#so-qty').value,
          minQuality: root.querySelector('#so-minq').value
        });
      }
      if (a === 'toggle-order') this.actions.toggleOrder?.(btn.dataset.id);
      if (a === 'remove-order') this.actions.removeOrder?.(btn.dataset.id);
      if (a === 'borrow') this.actions.borrow?.(crAmount?.value, crDays?.value);
      if (a === 'repay') this.actions.repay?.();
    }));
  }
}
